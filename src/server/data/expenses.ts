import "server-only";

import { paymentState, type PaymentState } from "@/server/services/budget-math";

import { invoicedByCommitment, type LineLabel, lineSelect, toLabel, userNames } from "./budget";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

// --- Vendors ---------------------------------------------------------------

export type VendorSummary = { id: string; name: string; kind: string };

export async function listVendors(ctx: WorkspaceContext): Promise<VendorSummary[]> {
  return getPrisma().vendor.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, name: true, kind: true },
    orderBy: { name: "asc" },
  });
}

/** Finds a vendor by name (ignoring capitals), or adds it. */
export async function findOrCreateVendor(ctx: WorkspaceContext, name: string): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.vendor.findFirst({
    where: { workspaceId: ctx.workspaceId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const id = newId();
  // Two people adding the same new shop at once: the unique index catches
  // the second, and we use the first.
  try {
    await prisma.vendor.create({ data: { id, workspaceId: ctx.workspaceId, name } });
    return id;
  } catch {
    const again = await prisma.vendor.findFirst({
      where: { workspaceId: ctx.workspaceId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (again) return again.id;
    throw new Error("Couldn't save the vendor.");
  }
}

// --- Commitments -----------------------------------------------------------

export type CommitmentFields = {
  lineId: string;
  vendorId: string | null;
  source: string;
  description: string;
  amountCents: bigint;
  committedOn: Date;
  notes: string | null;
};

export type CommitmentRecord = Omit<CommitmentFields, "lineId"> & {
  id: string;
  line: LineLabel;
  vendorName: string | null;
  invoicedCents: bigint;
  expenseCount: number;
};

async function lineInHousehold(ctx: WorkspaceContext, lineId: string): Promise<boolean> {
  return (
    (await getPrisma().budgetLine.count({
      where: { id: lineId, workspaceId: ctx.workspaceId },
    })) === 1
  );
}

export async function insertCommitment(
  ctx: WorkspaceContext,
  fields: CommitmentFields,
): Promise<{ id: string } | null> {
  if (!(await lineInHousehold(ctx, fields.lineId))) return null;
  const id = newId();
  await getPrisma().commitment.create({
    data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
  });
  return { id };
}

export async function updateCommitmentRow(
  ctx: WorkspaceContext,
  id: string,
  fields: CommitmentFields,
): Promise<boolean> {
  if (!(await lineInHousehold(ctx, fields.lineId))) return false;
  const result = await getPrisma().commitment.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}

/** Refuses ("in_use") while expenses are linked to it. */
export async function deleteCommitmentRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ status: "deleted" | "not_found" | "in_use"; lineId?: string }> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.commitment.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { lineId: true, _count: { select: { expenses: true } } },
    });
    if (!row) return { status: "not_found" };
    if (row._count.expenses > 0) return { status: "in_use", lineId: row.lineId };
    await tx.commitment.delete({ where: { id } });
    return { status: "deleted", lineId: row.lineId };
  });
}

export async function listCommitments(
  ctx: WorkspaceContext,
  where: { projectId?: string; lineId?: string; id?: string; vendorId?: string } = {},
): Promise<CommitmentRecord[]> {
  const prisma = getPrisma();
  const rows = await prisma.commitment.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(where.id ? { id: where.id } : {}),
      ...(where.lineId ? { lineId: where.lineId } : {}),
      ...(where.vendorId ? { vendorId: where.vendorId } : {}),
      ...(where.projectId ? { line: { projectId: where.projectId } } : {}),
    },
    orderBy: [{ committedOn: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      vendorId: true,
      source: true,
      description: true,
      amountCents: true,
      committedOn: true,
      notes: true,
      vendor: { select: { name: true } },
      line: { select: lineSelect },
      _count: { select: { expenses: true, allocations: true } },
    },
  });
  const invoicedBy = await invoicedByCommitment(
    ctx.workspaceId,
    rows.map((r) => r.id),
  );
  return rows.map(({ vendor, line, _count, ...row }) => ({
    ...row,
    line: toLabel(line),
    vendorName: vendor?.name ?? null,
    invoicedCents: invoicedBy.get(row.id) ?? 0n,
    expenseCount: _count.expenses + _count.allocations,
  }));
}

// --- Expenses --------------------------------------------------------------

export type AllocationInput = { lineId: string; amountCents: bigint; kind: string };

export type ExpenseFields = {
  vendorId: string | null;
  commitmentId: string | null;
  description: string;
  expenseDate: Date;
  dueDate: Date | null;
  totalCents: bigint;
  notes: string | null;
  /** For a contractor's bill: deposit, progress or final. */
  stage: string | null;
};

export type SaveExpenseResult =
  { status: "saved"; id: string } | { status: "not_found" } | { status: "commitment_not_found" };

/**
 * Saves an expense and its allocations in one transaction (creating it
 * when `id` is null). The service has already checked that the
 * allocations add up; the database checks again when the transaction
 * commits.
 */
export async function saveExpenseRows(
  ctx: WorkspaceContext,
  id: string | null,
  fields: ExpenseFields & { refundOfExpenseId?: string | null },
  allocations: AllocationInput[],
): Promise<SaveExpenseResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const lineIds = [...new Set(allocations.map((a) => a.lineId))];
    const lines = await tx.budgetLine.count({ where: { workspaceId: ws, id: { in: lineIds } } });
    if (lines !== lineIds.length) return { status: "not_found" };
    if (fields.commitmentId) {
      const found = await tx.commitment.count({
        where: { id: fields.commitmentId, workspaceId: ws },
      });
      if (!found) return { status: "commitment_not_found" };
    }
    if (fields.vendorId) {
      const found = await tx.vendor.count({ where: { id: fields.vendorId, workspaceId: ws } });
      if (!found) return { status: "not_found" };
    }
    let expenseId = id;
    if (expenseId) {
      const updated = await tx.expense.updateMany({
        where: { id: expenseId, workspaceId: ws },
        data: fields,
      });
      if (updated.count !== 1) return { status: "not_found" };
      await tx.expenseAllocation.deleteMany({ where: { expenseId, workspaceId: ws } });
    } else {
      expenseId = newId();
      await tx.expense.create({
        data: { id: expenseId, workspaceId: ws, createdById: ctx.userId, ...fields },
      });
    }
    await tx.expenseAllocation.createMany({
      data: allocations.map((a, position) => ({
        id: newId(),
        workspaceId: ws,
        expenseId: expenseId ?? "",
        position,
        ...a,
      })),
    });
    return { status: "saved", id: expenseId };
  });
}

export type ExpenseSummary = {
  id: string;
  description: string;
  vendorName: string | null;
  expenseDate: Date;
  dueDate: Date | null;
  totalCents: bigint;
  paidCents: bigint;
  state: PaymentState;
  isRefund: boolean;
  stage: string | null;
  /** How much of it falls on the project asked about (all of it otherwise). */
  shareCents: bigint;
};

export async function listExpenses(
  ctx: WorkspaceContext,
  where: {
    projectId?: string;
    lineId?: string;
    vendorId?: string;
    commitmentIds?: string[];
    limit?: number;
  } = {},
): Promise<ExpenseSummary[]> {
  const prisma = getPrisma();
  const allocationFilter = where.lineId
    ? { lineId: where.lineId }
    : where.projectId
      ? { line: { projectId: where.projectId } }
      : undefined;
  const rows = await prisma.expense.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(where.vendorId ? { vendorId: where.vendorId } : {}),
      ...(where.commitmentIds ? { commitmentId: { in: where.commitmentIds } } : {}),
      ...(allocationFilter ? { allocations: { some: allocationFilter } } : {}),
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    take: where.limit ?? 200,
    select: {
      id: true,
      description: true,
      expenseDate: true,
      dueDate: true,
      totalCents: true,
      refundOfExpenseId: true,
      stage: true,
      vendor: { select: { name: true } },
      allocations: {
        ...(allocationFilter ? { where: allocationFilter } : {}),
        select: { amountCents: true },
      },
    },
  });
  const paid = await prisma.payment.groupBy({
    by: ["expenseId"],
    where: { workspaceId: ctx.workspaceId, expenseId: { in: rows.map((r) => r.id) } },
    _sum: { amountCents: true },
  });
  const paidBy = new Map(paid.map((p) => [p.expenseId, p._sum.amountCents ?? 0n]));
  return rows.map((r) => {
    const paidCents = paidBy.get(r.id) ?? 0n;
    return {
      id: r.id,
      description: r.description,
      vendorName: r.vendor?.name ?? null,
      expenseDate: r.expenseDate,
      dueDate: r.dueDate,
      totalCents: r.totalCents,
      paidCents,
      state: paymentState(r.totalCents, paidCents),
      isRefund: r.refundOfExpenseId !== null,
      stage: r.stage,
      shareCents: r.allocations.reduce((sum, a) => sum + a.amountCents, 0n),
    };
  });
}

export type PaymentRecord = {
  id: string;
  amountCents: bigint;
  paidOn: Date;
  method: string;
  reference: string | null;
  notes: string | null;
  createdByName: string | null;
};

export type ExpenseDetail = ExpenseFields & {
  id: string;
  vendorName: string | null;
  commitmentDescription: string | null;
  refundOfExpenseId: string | null;
  refundOfDescription: string | null;
  refunds: { id: string; description: string; totalCents: bigint; expenseDate: Date }[];
  /** Set for an order's bill or a return's refund: those change only from the order. */
  orderId: string | null;
  allocations: { id: string; line: LineLabel; amountCents: bigint; kind: string }[];
  payments: PaymentRecord[];
  paidCents: bigint;
  state: PaymentState;
  createdByName: string | null;
};

export async function findExpense(
  ctx: WorkspaceContext,
  id: string,
): Promise<ExpenseDetail | null> {
  const row = await getPrisma().expense.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      vendorId: true,
      commitmentId: true,
      description: true,
      expenseDate: true,
      dueDate: true,
      totalCents: true,
      notes: true,
      stage: true,
      refundOfExpenseId: true,
      createdById: true,
      vendor: { select: { name: true } },
      commitment: { select: { description: true } },
      refundOf: { select: { description: true } },
      billFor: { select: { id: true } },
      returnFor: { select: { orderId: true } },
      refunds: {
        select: { id: true, description: true, totalCents: true, expenseDate: true },
        orderBy: { expenseDate: "asc" },
      },
      allocations: {
        select: { id: true, amountCents: true, kind: true, line: { select: lineSelect } },
        orderBy: { position: "asc" },
      },
      payments: {
        select: {
          id: true,
          amountCents: true,
          paidOn: true,
          method: true,
          reference: true,
          notes: true,
          createdById: true,
        },
        orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!row) return null;
  const names = await userNames([row.createdById, ...row.payments.map((p) => p.createdById)]);
  const paidCents = row.payments.reduce((sum, p) => sum + p.amountCents, 0n);
  return {
    id: row.id,
    vendorId: row.vendorId,
    commitmentId: row.commitmentId,
    description: row.description,
    expenseDate: row.expenseDate,
    dueDate: row.dueDate,
    totalCents: row.totalCents,
    notes: row.notes,
    stage: row.stage,
    vendorName: row.vendor?.name ?? null,
    commitmentDescription: row.commitment?.description ?? null,
    refundOfExpenseId: row.refundOfExpenseId,
    refundOfDescription: row.refundOf?.description ?? null,
    refunds: row.refunds,
    // An order's bill, or the refund for one of its returns: both are
    // changed only from the order.
    orderId: row.billFor?.id ?? row.returnFor?.orderId ?? null,
    allocations: row.allocations.map((a) => ({
      id: a.id,
      amountCents: a.amountCents,
      kind: a.kind,
      line: toLabel(a.line),
    })),
    payments: row.payments.map(({ createdById, ...p }) => ({
      ...p,
      createdByName: createdById ? (names.get(createdById) ?? null) : null,
    })),
    paidCents,
    state: paymentState(row.totalCents, paidCents),
    createdByName: row.createdById ? (names.get(row.createdById) ?? null) : null,
  };
}

/**
 * Deletes an expense with its allocations and payments. Refuses while
 * refunds point at it. Returns the receipt file ids so their bytes can be
 * removed too.
 */
export async function deleteExpenseRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ status: "deleted" | "not_found" | "has_refunds"; fileIds: string[] }> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.expense.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { _count: { select: { refunds: true } } },
    });
    if (!row) return { status: "not_found", fileIds: [] };
    if (row._count.refunds > 0) return { status: "has_refunds", fileIds: [] };
    const attachments = await tx.attachment.findMany({
      where: { expenseId: id, workspaceId: ctx.workspaceId },
      select: { fileId: true },
    });
    await tx.expense.delete({ where: { id } });
    return { status: "deleted", fileIds: attachments.map((a) => a.fileId) };
  });
}

// --- Payments --------------------------------------------------------------

export type PaymentFields = {
  amountCents: bigint;
  paidOn: Date;
  method: string;
  reference: string | null;
  notes: string | null;
};

/**
 * Records a payment, checking inside the transaction (with the expense row
 * locked) that it doesn't pay more than is owed.
 */
export async function insertPaymentChecked(
  ctx: WorkspaceContext,
  expenseId: string,
  payment: PaymentFields,
): Promise<{ status: "created"; id: string } | { status: "not_found" | "too_much" }> {
  return getPrisma().$transaction(async (tx) => {
    const expense = await tx.$queryRaw<{ total_cents: bigint }[]>`
      SELECT "total_cents" FROM "expenses"
      WHERE "id" = ${expenseId} AND "workspace_id" = ${ctx.workspaceId}
      FOR UPDATE`;
    const total = expense[0]?.total_cents;
    if (total === undefined) return { status: "not_found" };
    const paid = await tx.payment.aggregate({
      where: { expenseId, workspaceId: ctx.workspaceId },
      _sum: { amountCents: true },
    });
    const after = (paid._sum.amountCents ?? 0n) + payment.amountCents;
    // Same sign as the expense (a refund's payments are money coming back),
    // and never more than the total.
    const sameSign = total > 0n ? payment.amountCents > 0n : payment.amountCents < 0n;
    const withinTotal = total > 0n ? after <= total : after >= total;
    if (!sameSign || !withinTotal) return { status: "too_much" };
    const id = newId();
    await tx.payment.create({
      data: { id, workspaceId: ctx.workspaceId, expenseId, createdById: ctx.userId, ...payment },
    });
    return { status: "created", id };
  });
}

export async function deletePaymentRow(
  ctx: WorkspaceContext,
  expenseId: string,
  paymentId: string,
): Promise<boolean> {
  const result = await getPrisma().payment.deleteMany({
    where: { id: paymentId, expenseId, workspaceId: ctx.workspaceId },
  });
  return result.count === 1;
}

/** What's already been refunded against an expense (a negative number). */
export async function refundedSoFar(ctx: WorkspaceContext, expenseId: string): Promise<bigint> {
  const sum = await getPrisma().expense.aggregate({
    where: { workspaceId: ctx.workspaceId, refundOfExpenseId: expenseId },
    _sum: { totalCents: true },
  });
  return sum._sum.totalCents ?? 0n;
}
