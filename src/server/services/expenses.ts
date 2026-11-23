import "server-only";

import { formatMoney, splitByWeights, splitEvenly, sumCents } from "@/lib/money";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import { commitmentAgreement } from "@/server/data/agreements";
import { findLine, lineTitle } from "@/server/data/budget";
import type { WorkspaceContext } from "@/server/data/context";
import {
  type AllocationInput,
  type CommitmentRecord,
  deleteCommitmentRow,
  deleteExpenseRow,
  deletePaymentRow,
  type ExpenseDetail,
  type ExpenseSummary,
  findExpense,
  findOrCreateVendor,
  insertCommitment,
  insertPaymentChecked,
  listCommitments,
  listExpenses,
  listVendors,
  refundedSoFar,
  saveExpenseRows,
  updateCommitmentRow,
  type VendorSummary,
} from "@/server/data/expenses";

import { removeFiles } from "./attachments";
import { commitmentInput, expenseInput, paymentInput, refundInput } from "./budget-inputs";
import { fieldError, NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";

export async function getVendors(ctx: WorkspaceContext): Promise<VendorSummary[]> {
  assertCan(ctx, "records:view");
  return listVendors(ctx);
}

// --- Commitments -----------------------------------------------------------

export type CommitmentInput = FormInput<typeof commitmentInput>;

export async function getCommitment(ctx: WorkspaceContext, id: string): Promise<CommitmentRecord> {
  assertCan(ctx, "records:view");
  const [commitment] = await listCommitments(ctx, { id });
  if (!commitment) throw new NotFoundError("commitment");
  return commitment;
}

export async function getAllCommitments(ctx: WorkspaceContext): Promise<CommitmentRecord[]> {
  assertCan(ctx, "records:view");
  return listCommitments(ctx);
}

async function commitmentFields(ctx: WorkspaceContext, input: CommitmentInput) {
  const { vendorName, amount, ...rest } = commitmentInput.parse(input);
  const vendorId = vendorName ? await findOrCreateVendor(ctx, vendorName) : null;
  return { ...rest, vendorId, amountCents: amount };
}

export async function createCommitment(
  ctx: WorkspaceContext,
  input: CommitmentInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = await commitmentFields(ctx, input);
  const created = await insertCommitment(ctx, fields);
  if (!created) throw new NotFoundError("budget line");
  await commitmentActivity(
    ctx,
    fields.lineId,
    `Committed ${formatMoney(fields.amountCents)}: ${fields.description}`,
  );
  return created;
}

export async function updateCommitment(
  ctx: WorkspaceContext,
  id: string,
  input: CommitmentInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  // A quote's, contract's or change order's money is changed on that page,
  // so the two never disagree.
  if (await commitmentAgreement(ctx, id)) throw new RuleError("agreement_commitment");
  const fields = await commitmentFields(ctx, input);
  if (!(await updateCommitmentRow(ctx, id, fields))) throw new NotFoundError("commitment");
  await commitmentActivity(ctx, fields.lineId, `Changed the commitment “${fields.description}”`);
}

export async function deleteCommitment(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ lineId: string }> {
  assertCan(ctx, "records:edit");
  const [commitment] = await listCommitments(ctx, { id });
  const agreement = await commitmentAgreement(ctx, id);
  if (agreement?.kind === "quote" || agreement?.kind === "contract") {
    throw new RuleError("agreement_commitment");
  }
  const result = await deleteCommitmentRow(ctx, id);
  if (result.status === "not_found" || !commitment) throw new NotFoundError("commitment");
  if (result.status === "in_use") {
    throw new RuleError("commitment_in_use");
  }
  await commitmentActivity(
    ctx,
    commitment.line.id,
    `Removed the commitment “${commitment.description}”`,
  );
  return { lineId: commitment.line.id };
}

async function commitmentActivity(ctx: WorkspaceContext, lineId: string, summary: string) {
  const line = await findLine(ctx, lineId);
  if (!line) return;
  await recordActivity(ctx, {
    action: "budget.commitment",
    entityType: "project",
    entityId: line.projectId,
    summary: `${summary} (${lineTitle(line, { withProject: false })})`,
  });
}

// --- Expenses --------------------------------------------------------------

export type ExpenseInput = Omit<FormInput<typeof expenseInput>, "allocations"> & {
  allocations?: { lineId?: string; amount?: string; kind?: string }[];
};

/** What's been agreed with and billed by one shop, supplier or contractor. */
export async function getVendorMoney(
  ctx: WorkspaceContext,
  vendorId: string,
): Promise<{ commitments: CommitmentRecord[]; expenses: ExpenseSummary[] }> {
  assertCan(ctx, "records:view");
  const [commitments, expenses] = await Promise.all([
    listCommitments(ctx, { vendorId }),
    listExpenses(ctx, { vendorId, limit: 100 }),
  ]);
  return { commitments, expenses };
}

/** The bills linked to a quote's or contract's commitments, oldest first. */
export async function getBillsFor(
  ctx: WorkspaceContext,
  commitmentIds: string[],
): Promise<ExpenseSummary[]> {
  assertCan(ctx, "records:view");
  if (commitmentIds.length === 0) return [];
  const bills = await listExpenses(ctx, { commitmentIds });
  return bills.reverse();
}

export async function getExpense(ctx: WorkspaceContext, id: string): Promise<ExpenseDetail> {
  assertCan(ctx, "records:view");
  const expense = await findExpense(ctx, id);
  if (!expense) throw new NotFoundError("expense");
  return expense;
}

/**
 * Turns the form's rows into allocations that add up to the total exactly
 * (rule 5). Rows left blank share whatever the typed rows don't cover,
 * split evenly to the cent.
 */
export function resolveAllocations(
  total: bigint,
  rows: { lineId: string; amount: bigint | null; kind: string }[],
): AllocationInput[] {
  const typed = sumCents(rows.flatMap((r) => (r.amount === null ? [] : [r.amount])));
  const blanks = rows.filter((r) => r.amount === null);
  const rest = total - typed;
  if (blanks.length === 0) {
    if (rest !== 0n) {
      throw fieldError(
        "allocations",
        rest > 0n
          ? `The lines add up to ${formatMoney(typed)}, ${formatMoney(rest)} less than the total. Fix an amount, or leave one blank to take the rest.`
          : `The lines add up to ${formatMoney(typed)}, ${formatMoney(-rest)} more than the total.`,
      );
    }
  } else if (rest <= 0n) {
    throw fieldError(
      "allocations",
      `The amounts you typed already reach ${formatMoney(typed)}, leaving nothing for the blank lines.`,
    );
  }
  const shares = blanks.length ? splitEvenly(rest, blanks.length) : [];
  let next = 0;
  return rows.map((r) => ({
    lineId: r.lineId,
    kind: r.kind,
    amountCents: r.amount ?? shares[next++] ?? 0n,
  }));
}

async function expenseFields(ctx: WorkspaceContext, input: ExpenseInput) {
  const parsed = expenseInput.parse(input);
  const allocations = resolveAllocations(parsed.total, parsed.allocations);
  const vendorId = parsed.vendorName ? await findOrCreateVendor(ctx, parsed.vendorName) : null;
  return {
    fields: {
      vendorId,
      commitmentId: parsed.commitmentId,
      description: parsed.description,
      expenseDate: parsed.expenseDate,
      dueDate: parsed.dueDate,
      totalCents: parsed.total,
      notes: parsed.notes,
      stage: parsed.stage,
    },
    allocations,
  };
}

export async function createExpense(
  ctx: WorkspaceContext,
  input: ExpenseInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { fields, allocations } = await expenseFields(ctx, input);
  const result = await saveExpenseRows(ctx, null, fields, allocations);
  if (result.status === "commitment_not_found") throw new NotFoundError("commitment");
  if (result.status !== "saved") throw new NotFoundError("budget line");
  await expenseActivity(
    ctx,
    result.id,
    `Recorded ${formatMoney(fields.totalCents)}: ${fields.description}`,
  );
  return { id: result.id };
}

export async function updateExpense(
  ctx: WorkspaceContext,
  id: string,
  input: ExpenseInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const existing = await findExpense(ctx, id);
  if (!existing) throw new NotFoundError("expense");
  if (existing.refundOfExpenseId) {
    throw new RuleError("refund_not_editable");
  }
  const { fields, allocations } = await expenseFields(ctx, input);
  if (fields.totalCents < existing.paidCents) {
    throw fieldError(
      "total",
      `${formatMoney(existing.paidCents)} has already been paid on this. Remove a payment first.`,
    );
  }
  const result = await saveExpenseRows(ctx, id, fields, allocations);
  if (result.status === "commitment_not_found") throw new NotFoundError("commitment");
  if (result.status !== "saved") throw new NotFoundError("expense");
  await expenseActivity(ctx, id, `Changed the expense “${fields.description}”`);
}

export async function deleteExpense(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const existing = await findExpense(ctx, id);
  if (!existing) throw new NotFoundError("expense");
  // `existing` still says which projects it touched, for the activity log.
  const result = await deleteExpenseRow(ctx, id);
  if (result.status === "not_found") throw new NotFoundError("expense");
  if (result.status === "has_refunds") {
    throw new RuleError("expense_has_refunds");
  }
  await removeFiles(ctx, result.fileIds);
  await logForProjects(
    ctx,
    existing.allocations.map((a) => a.line.projectId),
    `Deleted the expense “${existing.description}” (${formatMoney(existing.totalCents)})`,
  );
}

/**
 * Records a refund or return as a negative expense linked to the original
 * (rule 8). It's charged back to the original's lines in proportion, and
 * linked to the same commitment, so the original stays as it was.
 */
export async function refundExpense(
  ctx: WorkspaceContext,
  expenseId: string,
  input: FormInput<typeof refundInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { amount, description, expenseDate } = refundInput.parse(input);
  const original = await findExpense(ctx, expenseId);
  if (!original) throw new NotFoundError("expense");
  if (original.refundOfExpenseId) {
    throw new RuleError("already_refund");
  }
  const left = original.totalCents + (await refundedSoFar(ctx, expenseId));
  if (amount > left) {
    throw fieldError("amount", `Only ${formatMoney(left)} of this expense is left to refund.`);
  }
  const weights = original.allocations.map((a) => a.amountCents);
  const parts = splitByWeights(-amount, weights);
  const result = await saveExpenseRows(
    ctx,
    null,
    {
      vendorId: original.vendorId,
      commitmentId: original.commitmentId,
      refundOfExpenseId: original.id,
      description,
      expenseDate,
      dueDate: null,
      totalCents: -amount,
      notes: null,
      stage: null,
    },
    original.allocations.map((a, index) => ({
      lineId: a.line.id,
      kind: a.kind,
      amountCents: parts[index] ?? 0n,
    })),
  );
  if (result.status !== "saved") throw new NotFoundError("expense");
  await expenseActivity(
    ctx,
    result.id,
    `Recorded a refund of ${formatMoney(amount)}: ${description}`,
  );
  return { id: result.id };
}

// --- Payments --------------------------------------------------------------

export async function addPayment(
  ctx: WorkspaceContext,
  expenseId: string,
  input: FormInput<typeof paymentInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const { amount, ...rest } = paymentInput.parse(input);
  const expense = await findExpense(ctx, expenseId);
  if (!expense) throw new NotFoundError("expense");
  // A refund's "payment" is money coming back to us.
  const amountCents = expense.totalCents < 0n ? -amount : amount;
  const result = await insertPaymentChecked(ctx, expenseId, { ...rest, amountCents });
  if (result.status === "not_found") throw new NotFoundError("expense");
  if (result.status === "too_much") {
    const owed = expense.totalCents - expense.paidCents;
    throw fieldError(
      "amount",
      `That's more than is left: ${formatMoney(owed < 0n ? -owed : owed)}.`,
    );
  }
  await expenseActivity(
    ctx,
    expenseId,
    expense.totalCents < 0n
      ? `Got ${formatMoney(amount)} back for “${expense.description}”`
      : `Paid ${formatMoney(amount)} on “${expense.description}”`,
  );
}

export async function deletePayment(
  ctx: WorkspaceContext,
  expenseId: string,
  paymentId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const expense = await findExpense(ctx, expenseId);
  if (!expense) throw new NotFoundError("expense");
  const payment = expense.payments.find((p) => p.id === paymentId);
  if (!payment || !(await deletePaymentRow(ctx, expenseId, paymentId))) {
    throw new NotFoundError("payment");
  }
  await expenseActivity(
    ctx,
    expenseId,
    `Removed a payment of ${formatMoney(payment.amountCents)} on “${expense.description}”`,
  );
}

// --- Activity --------------------------------------------------------------

async function expenseActivity(ctx: WorkspaceContext, expenseId: string, summary: string) {
  await recordActivity(ctx, {
    action: "budget.expense",
    entityType: "expense",
    entityId: expenseId,
    summary,
  });
  const expense = await findExpense(ctx, expenseId);
  if (expense)
    await logForProjects(
      ctx,
      expense.allocations.map((a) => a.line.projectId),
      summary,
    );
}

async function logForProjects(ctx: WorkspaceContext, projectIds: string[], summary: string) {
  for (const projectId of new Set(projectIds)) {
    await recordActivity(ctx, {
      action: "budget.expense",
      entityType: "project",
      entityId: projectId,
      summary,
    });
  }
}
