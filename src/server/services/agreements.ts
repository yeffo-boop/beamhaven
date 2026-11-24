import "server-only";

import { formatMoney } from "@/lib/money";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import {
  type AgreementLink,
  approveQuoteRow,
  commitmentAgreement,
  type ContractDetail,
  deleteChangeOrderRow,
  deleteContractRow,
  deleteQuoteRow,
  findContract,
  findQuote,
  insertChangeOrder,
  insertContract,
  insertQuote,
  insertRevision,
  listContracts,
  listQuotes,
  type QuoteChange,
  type QuoteDetail,
  type QuoteSummary,
  rejectQuoteRow,
  setQuoteOpenStatus,
  updateContractRow,
  updateQuoteDetailsRow,
  withdrawApprovalRow,
} from "@/server/data/agreements";
import type { WorkspaceContext } from "@/server/data/context";

import { removeFiles } from "./attachments";
import { fieldError, NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";
import {
  approveInput,
  changeOrderInput,
  contractInput,
  contractUpdateInput,
  quoteDetailsInput,
  quoteInput,
  rejectInput,
  revisionInput,
} from "./quote-inputs";
import { notifyQuoteDecided } from "./notifications";

/**
 * Quotes, contracts and change orders. Approving and turning down quotes
 * changes the budget, so it needs "budget:approve"; the rest is ordinary
 * record keeping ("records:edit"). The money always lives in a commitment
 * (see src/server/data/agreements.ts).
 */

async function log(
  ctx: WorkspaceContext,
  where: { contractorId: string; projectId: string },
  action: string,
  summary: string,
) {
  await recordActivity(ctx, {
    action: `contractor.${action}`,
    entityType: "contractor",
    entityId: where.contractorId,
    summary,
  });
  await recordActivity(ctx, {
    action: `project.${action}`,
    entityType: "project",
    entityId: where.projectId,
    summary,
  });
}

const CLOSED = "This quote has already been decided. Reopen it first.";

function changed(result: QuoteChange): void {
  if (result === "not_found") throw new NotFoundError("quote");
  if (result === "closed") throw fieldError("quote", CLOSED);
}

/** Where a budget commitment that belongs to a quote or contract is managed. */
export async function getCommitmentAgreement(
  ctx: WorkspaceContext,
  commitmentId: string,
): Promise<AgreementLink | null> {
  assertCan(ctx, "records:view");
  return commitmentAgreement(ctx, commitmentId);
}

// --- Quotes ----------------------------------------------------------------

export async function getQuotes(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string },
): Promise<QuoteSummary[]> {
  assertCan(ctx, "records:view");
  return listQuotes(ctx, where);
}

export async function getQuote(ctx: WorkspaceContext, id: string): Promise<QuoteDetail> {
  assertCan(ctx, "records:view");
  const quote = await findQuote(ctx, id);
  if (!quote) throw new NotFoundError("quote");
  return quote;
}

export async function createQuote(
  ctx: WorkspaceContext,
  input: FormInput<typeof quoteInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const q = quoteInput.parse(input);
  const created = await insertQuote(
    ctx,
    {
      contractorId: q.contractorId,
      projectId: q.projectId,
      title: q.title,
      validUntil: q.validUntil,
      notes: q.notes,
    },
    { amountCents: q.amount, receivedOn: q.receivedOn, summary: q.summary },
  );
  if (!created) throw new NotFoundError("contractor or project");
  await log(ctx, q, "quote_received", `Quote received: ${q.title}, ${formatMoney(q.amount)}`);
  return created;
}

export async function updateQuoteDetails(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof quoteDetailsInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await updateQuoteDetailsRow(ctx, id, quoteDetailsInput.parse(input)))) {
    throw new NotFoundError("quote");
  }
}

export async function reviseQuote(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof revisionInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const r = revisionInput.parse(input);
  const quote = await getQuote(ctx, id);
  changed(
    await insertRevision(ctx, id, {
      amountCents: r.amount,
      receivedOn: r.receivedOn,
      summary: r.summary,
    }),
  );
  await log(
    ctx,
    quote,
    "quote_revised",
    `Revised quote: ${quote.title}, now ${formatMoney(r.amount)}`,
  );
}

/** "Under review" (or back to "received"); also reopens a turned-down quote. */
export async function setQuoteReview(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<void> {
  if (status !== "received" && status !== "under_review") throw new NotFoundError("status");
  assertCan(
    ctx,
    (await getQuote(ctx, id)).status === "rejected" ? "budget:approve" : "records:edit",
  );
  const result = await setQuoteOpenStatus(ctx, id, status);
  if (result === "not_found") throw new NotFoundError("quote");
  if (result === "closed") throw new RuleError("quote_changed");
}

export async function approveQuote(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof approveInput>,
): Promise<void> {
  assertCan(ctx, "budget:approve");
  const decision = approveInput.parse(input);
  const quote = await getQuote(ctx, id);
  const result = await approveQuoteRow(ctx, id, decision);
  if (result.status === "not_found") throw new NotFoundError("quote");
  if (result.status === "closed") throw fieldError("lineId", CLOSED);
  if (result.status === "wrong_line") {
    throw fieldError("lineId", "Choose a budget line from this quote's project.");
  }
  await log(
    ctx,
    quote,
    "quote_approved",
    `Approved the quote “${quote.title}” for ${formatMoney(result.amountCents)}`,
  );
  await notifyQuoteDecided(ctx, id, quote.title, true);
}

export async function rejectQuote(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof rejectInput>,
): Promise<void> {
  assertCan(ctx, "budget:approve");
  const { note } = rejectInput.parse(input);
  const quote = await getQuote(ctx, id);
  changed(await rejectQuoteRow(ctx, id, note));
  await log(ctx, quote, "quote_rejected", `Turned down the quote “${quote.title}”`);
  await notifyQuoteDecided(ctx, id, quote.title, false);
}

export async function withdrawApproval(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "budget:approve");
  const quote = await getQuote(ctx, id);
  const result = await withdrawApprovalRow(ctx, id);
  if (result === "not_found") throw new NotFoundError("quote");
  if (result === "has_contract") throw new RuleError("quote_has_contract");
  if (result === "has_bills") throw new RuleError("quote_has_bills");
  if (result === "closed") throw new RuleError("quote_changed");
  await log(ctx, quote, "quote_approval_withdrawn", `Took back the approval of “${quote.title}”`);
}

export async function deleteQuote(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ contractorId: string }> {
  assertCan(ctx, "records:edit");
  const quote = await getQuote(ctx, id);
  const result = await deleteQuoteRow(ctx, id);
  if (result.status === "not_found") throw new NotFoundError("quote");
  if (result.status === "approved") throw new RuleError("quote_approved");
  await removeFiles(ctx, result.fileIds);
  return { contractorId: quote.contractorId };
}

// --- Contracts -------------------------------------------------------------

export async function getContracts(
  ctx: WorkspaceContext,
  where: { contractorId?: string; projectId?: string },
): Promise<ContractDetail[]> {
  assertCan(ctx, "records:view");
  return listContracts(ctx, where);
}

export async function getContract(ctx: WorkspaceContext, id: string): Promise<ContractDetail> {
  assertCan(ctx, "records:view");
  const contract = await findContract(ctx, id);
  if (!contract) throw new NotFoundError("contract");
  return contract;
}

export async function createContract(
  ctx: WorkspaceContext,
  input: FormInput<typeof contractInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { value, ...c } = contractInput.parse(input);
  const result = await insertContract(ctx, { ...c, valueCents: value });
  if (result.status === "not_found") throw new NotFoundError("quote, contractor or project");
  if (result.status === "quote_not_approved") {
    throw fieldError("quoteId", "Approve the quote first.");
  }
  if (result.status === "quote_has_contract") {
    throw fieldError("quoteId", "There's already a contract for this quote.");
  }
  if (result.status === "wrong_line") {
    throw fieldError("lineId", "Choose a budget line from the contract's project.");
  }
  await log(ctx, result, "contract_added", `Contract: ${c.title}, ${formatMoney(value)}`);
  return { id: result.id };
}

export async function updateContract(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof contractUpdateInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await getContract(ctx, id);
  const { value, ...fields } = contractUpdateInput.parse(input);
  if (!(await updateContractRow(ctx, id, { ...fields, valueCents: value }))) {
    throw new NotFoundError("contract");
  }
  if (before.valueCents !== value) {
    await log(
      ctx,
      before,
      "contract_changed",
      `Changed the contract “${fields.title}” from ${formatMoney(before.valueCents)} to ${formatMoney(value)}`,
    );
  }
}

export async function deleteContract(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ contractorId: string }> {
  assertCan(ctx, "records:edit");
  const contract = await getContract(ctx, id);
  const result = await deleteContractRow(ctx, id);
  if (result.status === "not_found") throw new NotFoundError("contract");
  if (result.status === "has_bills") throw new RuleError("contract_has_bills");
  await removeFiles(ctx, result.fileIds);
  await log(ctx, contract, "contract_deleted", `Deleted the contract “${contract.title}”`);
  return { contractorId: contract.contractorId };
}

export async function addChangeOrder(
  ctx: WorkspaceContext,
  contractId: string,
  input: FormInput<typeof changeOrderInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const co = changeOrderInput.parse(input);
  const contract = await getContract(ctx, contractId);
  const result = await insertChangeOrder(ctx, contractId, {
    description: co.description,
    amountCents: co.amount,
    committedOn: co.committedOn,
    lineId: co.lineId,
    notes: co.notes,
  });
  if (result.status === "not_found") throw new NotFoundError("contract");
  if (result.status === "wrong_line") {
    throw fieldError("lineId", "Choose a budget line from the contract's project.");
  }
  await log(
    ctx,
    contract,
    "change_order_added",
    `Change order on “${contract.title}”: ${co.description}, ${formatMoney(co.amount, { showPlus: true })}`,
  );
}

export async function deleteChangeOrder(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ contractId: string }> {
  assertCan(ctx, "records:edit");
  const result = await deleteChangeOrderRow(ctx, id);
  if (result.status === "not_found") throw new NotFoundError("change order");
  if (result.status === "in_use") throw new RuleError("commitment_in_use");
  return { contractId: result.contractId };
}
