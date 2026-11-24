import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { paidShares, type LineFacts } from "@/server/services/budget-math";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

type Db = Prisma.TransactionClient;

// --- Categories ------------------------------------------------------------

export type BudgetCategory = { id: string; name: string; kind: string; sortOrder: number };

/** The starting set; a household can add its own. */
const DEFAULT_CATEGORIES: { name: string; kind: "standard" | "contingency" }[] = [
  { name: "Labor", kind: "standard" },
  { name: "Materials", kind: "standard" },
  { name: "Fixtures", kind: "standard" },
  { name: "Appliances", kind: "standard" },
  { name: "Permits and fees", kind: "standard" },
  { name: "Design", kind: "standard" },
  { name: "Other", kind: "standard" },
  { name: "Contingency", kind: "contingency" },
];

/** The household's categories, creating the starting set the first time. */
export async function listCategories(ctx: WorkspaceContext): Promise<BudgetCategory[]> {
  const prisma = getPrisma();
  const select = { id: true, name: true, kind: true, sortOrder: true } as const;
  const orderBy = [{ sortOrder: "asc" as const }, { name: "asc" as const }];
  const existing = await prisma.budgetCategory.findMany({
    where: { workspaceId: ctx.workspaceId },
    select,
    orderBy,
  });
  if (existing.length > 0) return existing;
  await prisma.budgetCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, index) => ({
      id: newId(),
      workspaceId: ctx.workspaceId,
      name: c.name,
      kind: c.kind,
      sortOrder: (index + 1) * 10,
    })),
    skipDuplicates: true,
  });
  return prisma.budgetCategory.findMany({
    where: { workspaceId: ctx.workspaceId },
    select,
    orderBy,
  });
}

/** Returns null if a category with that name already exists. */
export async function insertCategory(
  ctx: WorkspaceContext,
  fields: { name: string; kind: "standard" | "contingency" },
): Promise<{ id: string } | null> {
  const prisma = getPrisma();
  const clash = await prisma.budgetCategory.count({
    where: {
      workspaceId: ctx.workspaceId,
      name: { equals: fields.name, mode: "insensitive" },
    },
  });
  if (clash) return null;
  const max = await prisma.budgetCategory.aggregate({
    where: { workspaceId: ctx.workspaceId },
    _max: { sortOrder: true },
  });
  const id = newId();
  await prisma.budgetCategory.create({
    data: {
      id,
      workspaceId: ctx.workspaceId,
      ...fields,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
    },
  });
  return { id };
}

// --- Lines -----------------------------------------------------------------

export type LineLabel = {
  id: string;
  projectId: string;
  projectName: string;
  projectLocked: boolean;
  categoryId: string;
  categoryName: string;
  roomId: string | null;
  roomName: string | null;
  name: string;
  notes: string | null;
};

export type LineWithFacts = LineLabel & { facts: LineFacts };

const lineSelect = {
  id: true,
  projectId: true,
  categoryId: true,
  roomId: true,
  name: true,
  notes: true,
  plannedCents: true,
  originalCents: true,
  estimateCents: true,
  project: { select: { name: true, budgetLockedAt: true } },
  category: { select: { name: true, kind: true, sortOrder: true } },
  room: { select: { name: true } },
} as const;

type LineRow = Prisma.BudgetLineGetPayload<{ select: typeof lineSelect }>;

function toLabel(row: LineRow): LineLabel {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    projectLocked: row.project.budgetLockedAt !== null,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    roomId: row.roomId,
    roomName: row.room?.name ?? null,
    name: row.name,
    notes: row.notes,
  };
}

/** A short name for a line: "Kitchen remodel · Labor · Kitchen". */
export function lineTitle(line: LineLabel, { withProject = true } = {}): string {
  return [
    withProject ? line.projectName : null,
    line.categoryName,
    line.roomName ?? "Whole project",
    line.name || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Budget lines with everything recorded against them, ready for
 * budget-math. `where` narrows it to a project or to particular lines; it is
 * always limited to this household.
 */
export async function listLinesWithFacts(
  ctx: WorkspaceContext,
  where: { projectId?: string; lineIds?: string[] } = {},
  db: Db = getPrisma(),
): Promise<LineWithFacts[]> {
  const ws = ctx.workspaceId;
  const rows = await db.budgetLine.findMany({
    where: {
      workspaceId: ws,
      ...(where.projectId ? { projectId: where.projectId } : {}),
      ...(where.lineIds ? { id: { in: where.lineIds } } : {}),
    },
    select: lineSelect,
  });
  rows.sort(
    (a, b) =>
      a.project.name.localeCompare(b.project.name) ||
      a.category.sortOrder - b.category.sortOrder ||
      (a.room?.name ?? "").localeCompare(b.room?.name ?? "") ||
      a.name.localeCompare(b.name),
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [adjustments, outs, ins, commitments, allocations] = await Promise.all([
    db.budgetAdjustment.groupBy({
      by: ["lineId"],
      where: { workspaceId: ws, lineId: { in: ids } },
      _sum: { amountCents: true },
    }),
    db.budgetTransfer.groupBy({
      by: ["fromLineId"],
      where: { workspaceId: ws, fromLineId: { in: ids } },
      _sum: { amountCents: true },
    }),
    db.budgetTransfer.groupBy({
      by: ["toLineId"],
      where: { workspaceId: ws, toLineId: { in: ids } },
      _sum: { amountCents: true },
    }),
    db.commitment.findMany({
      where: { workspaceId: ws, lineId: { in: ids } },
      select: { id: true, lineId: true, amountCents: true },
    }),
    db.expenseAllocation.findMany({
      where: { workspaceId: ws, lineId: { in: ids } },
      select: { id: true, lineId: true, expenseId: true, commitmentId: true },
    }),
  ]);

  const invoicedBy = await invoicedByCommitment(
    ws,
    commitments.map((c) => c.id),
    db,
  );

  // Each allocation's share of its expense's payments. That needs every
  // allocation of those expenses, including ones on other lines.
  const expenseIds = [...new Set(allocations.map((a) => a.expenseId))];
  const [siblings, payments, expenses] = await Promise.all([
    db.expenseAllocation.findMany({
      where: { workspaceId: ws, expenseId: { in: expenseIds } },
      select: { id: true, expenseId: true, amountCents: true },
      orderBy: { position: "asc" },
    }),
    db.payment.groupBy({
      by: ["expenseId"],
      where: { workspaceId: ws, expenseId: { in: expenseIds } },
      _sum: { amountCents: true },
    }),
    db.expense.findMany({
      where: { workspaceId: ws, id: { in: expenseIds } },
      select: { id: true, commitmentId: true },
    }),
  ]);
  const paidByExpense = new Map(payments.map((p) => [p.expenseId, p._sum.amountCents ?? 0n]));
  const shareByAllocation = new Map<string, { amount: bigint; paid: bigint }>();
  const byExpense = Map.groupBy(siblings, (s) => s.expenseId);
  for (const [expenseId, list] of byExpense) {
    const shares = paidShares(
      list.map((s) => s.amountCents),
      paidByExpense.get(expenseId) ?? 0n,
    );
    list.forEach((s, index) =>
      shareByAllocation.set(s.id, { amount: s.amountCents, paid: shares[index] ?? 0n }),
    );
  }
  const commitmentOf = new Map(expenses.map((e) => [e.id, e.commitmentId]));
  const adjustmentBy = new Map(adjustments.map((a) => [a.lineId, a._sum.amountCents ?? 0n]));
  const outBy = new Map(outs.map((t) => [t.fromLineId, t._sum.amountCents ?? 0n]));
  const inBy = new Map(ins.map((t) => [t.toLineId, t._sum.amountCents ?? 0n]));

  return rows.map((row) => ({
    ...toLabel(row),
    facts: {
      id: row.id,
      isContingency: row.category.kind === "contingency",
      plannedCents: row.plannedCents,
      originalCents: row.originalCents,
      adjustmentsCents: adjustmentBy.get(row.id) ?? 0n,
      transfersInCents: inBy.get(row.id) ?? 0n,
      transfersOutCents: outBy.get(row.id) ?? 0n,
      estimateCents: row.estimateCents,
      commitments: commitments
        .filter((c) => c.lineId === row.id)
        .map((c) => ({
          id: c.id,
          amountCents: c.amountCents,
          invoicedCents: invoicedBy.get(c.id) ?? 0n,
        })),
      allocations: allocations
        .filter((a) => a.lineId === row.id)
        .map((a) => ({
          amountCents: shareByAllocation.get(a.id)?.amount ?? 0n,
          paidCents: shareByAllocation.get(a.id)?.paid ?? 0n,
          commitmentId: a.commitmentId ?? commitmentOf.get(a.expenseId) ?? null,
        })),
    },
  }));
}

/**
 * What's been invoiced against each commitment: every expense linked to it,
 * plus the parts of an order's bill that use it up (those are linked part
 * by part, because one bill can cover several lines, ADR-029).
 */
export async function invoicedByCommitment(
  ws: string,
  commitmentIds: string[],
  db: Db = getPrisma(),
): Promise<Map<string, bigint>> {
  if (commitmentIds.length === 0) return new Map();
  const [whole, parts] = await Promise.all([
    db.expense.groupBy({
      by: ["commitmentId"],
      where: { workspaceId: ws, commitmentId: { in: commitmentIds } },
      _sum: { totalCents: true },
    }),
    db.expenseAllocation.groupBy({
      by: ["commitmentId"],
      where: { workspaceId: ws, commitmentId: { in: commitmentIds } },
      _sum: { amountCents: true },
    }),
  ]);
  const result = new Map<string, bigint>();
  for (const row of whole) {
    if (row.commitmentId) result.set(row.commitmentId, row._sum.totalCents ?? 0n);
  }
  for (const row of parts) {
    if (!row.commitmentId) continue;
    result.set(
      row.commitmentId,
      (result.get(row.commitmentId) ?? 0n) + (row._sum.amountCents ?? 0n),
    );
  }
  return result;
}

export async function findLine(
  ctx: WorkspaceContext,
  id: string,
  db: Db = getPrisma(),
): Promise<LineWithFacts | null> {
  const [line] = await listLinesWithFacts(ctx, { lineIds: [id] }, db);
  return line ?? null;
}

/** Labels only (no money), for pickers. */
export async function listLineLabels(ctx: WorkspaceContext): Promise<LineLabel[]> {
  const rows = await getPrisma().budgetLine.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: lineSelect,
  });
  return rows.map(toLabel).sort((a, b) => lineTitle(a).localeCompare(lineTitle(b)));
}

export type NewLine = {
  projectId: string;
  categoryId: string;
  roomId: string | null;
  name: string;
  plannedCents: bigint;
  estimateCents: bigint | null;
  notes: string | null;
};

export type InsertLineResult =
  | { status: "created"; id: string }
  | { status: "not_found" }
  | { status: "room_not_in_property" }
  | { status: "duplicate" };

/**
 * Adds a line. After the project budget is locked in, a new line starts
 * with an original budget of 0: money reaches it by a transfer or an
 * adjustment, so the locked-in total never changes.
 */
export async function insertLine(ctx: WorkspaceContext, line: NewLine): Promise<InsertLineResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const [project, category, room] = await Promise.all([
      tx.project.findFirst({
        where: { id: line.projectId, workspaceId: ws },
        select: { propertyId: true, budgetLockedAt: true },
      }),
      tx.budgetCategory.count({ where: { id: line.categoryId, workspaceId: ws } }),
      line.roomId
        ? tx.room.findFirst({
            where: { id: line.roomId, workspaceId: ws },
            select: { propertyId: true },
          })
        : Promise.resolve(null),
    ]);
    if (!project || !category || (line.roomId && !room)) return { status: "not_found" };
    if (room && room.propertyId !== project.propertyId) return { status: "room_not_in_property" };
    const duplicate = await tx.budgetLine.count({
      where: {
        workspaceId: ws,
        projectId: line.projectId,
        categoryId: line.categoryId,
        roomId: line.roomId,
        name: line.name,
      },
    });
    if (duplicate) return { status: "duplicate" };
    const locked = project.budgetLockedAt !== null;
    const id = newId();
    await tx.budgetLine.create({
      data: {
        id,
        workspaceId: ws,
        ...line,
        plannedCents: locked ? 0n : line.plannedCents,
        originalCents: locked ? 0n : null,
      },
    });
    return { status: "created", id };
  });
}

/**
 * Changes a line's plan, estimate and notes. The planned amount is only
 * changed while the project budget isn't locked in.
 */
export async function updateLineRow(
  ctx: WorkspaceContext,
  id: string,
  fields: {
    plannedCents: bigint;
    estimateCents: bigint | null;
    notes: string | null;
    name: string;
  },
): Promise<"updated" | "not_found" | "duplicate"> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const line = await tx.budgetLine.findFirst({
      where: { id, workspaceId: ws },
      select: {
        projectId: true,
        categoryId: true,
        roomId: true,
        project: { select: { budgetLockedAt: true } },
      },
    });
    if (!line) return "not_found";
    const duplicate = await tx.budgetLine.count({
      where: {
        workspaceId: ws,
        projectId: line.projectId,
        categoryId: line.categoryId,
        roomId: line.roomId,
        name: fields.name,
        id: { not: id },
      },
    });
    if (duplicate) return "duplicate";
    const locked = line.project.budgetLockedAt !== null;
    await tx.budgetLine.update({
      where: { id },
      data: {
        name: fields.name,
        estimateCents: fields.estimateCents,
        notes: fields.notes,
        ...(locked ? {} : { plannedCents: fields.plannedCents }),
      },
    });
    return "updated";
  });
}

/**
 * Deletes a line, but only if nothing has been recorded against it and
 * deleting it wouldn't change a locked-in original budget.
 */
export async function deleteLineRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ status: "deleted" | "not_found" | "in_use"; projectId?: string }> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const line = await tx.budgetLine.findFirst({
      where: { id, workspaceId: ws },
      select: {
        projectId: true,
        originalCents: true,
        _count: {
          select: {
            adjustments: true,
            transfersIn: true,
            transfersOut: true,
            commitments: true,
            allocations: true,
            orderItems: true,
          },
        },
      },
    });
    if (!line) return { status: "not_found" };
    const used = Object.values(line._count).some((n) => n > 0);
    if (used || (line.originalCents ?? 0n) > 0n) {
      return { status: "in_use", projectId: line.projectId };
    }
    // Materials chosen against it as an allowance just lose the link (ADR-046).
    await tx.material.updateMany({
      where: { workspaceId: ws, budgetLineId: id },
      data: { budgetLineId: null },
    });
    await tx.budgetLine.delete({ where: { id } });
    return { status: "deleted", projectId: line.projectId };
  });
}

// --- Locking in ("baselining") ---------------------------------------------

export type LockState = { lockedAt: Date | null; lockedByName: string | null };

export async function getLockState(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<LockState | null> {
  const project = await getPrisma().project.findFirst({
    where: { id: projectId, workspaceId: ctx.workspaceId },
    select: { budgetLockedAt: true, budgetLockedById: true },
  });
  if (!project) return null;
  const user = project.budgetLockedById
    ? await getPrisma().user.findUnique({
        where: { id: project.budgetLockedById },
        select: { name: true },
      })
    : null;
  return { lockedAt: project.budgetLockedAt, lockedByName: user?.name ?? null };
}

/**
 * Copies every line's plan into its original budget, once. Returns
 * "already_locked" if someone else got there first.
 */
export async function lockProjectBudget(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<"locked" | "not_found" | "already_locked"> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const exists = await tx.project.count({ where: { id: projectId, workspaceId: ws } });
    if (!exists) return "not_found";
    const claimed = await tx.project.updateMany({
      where: { id: projectId, workspaceId: ws, budgetLockedAt: null },
      data: { budgetLockedAt: new Date(), budgetLockedById: ctx.userId },
    });
    if (claimed.count === 0) return "already_locked";
    await tx.$executeRaw`
      UPDATE "budget_lines" SET "original_cents" = "planned_cents", "updated_at" = now()
      WHERE "project_id" = ${projectId} AND "workspace_id" = ${ws}`;
    return "locked";
  });
}

// --- Adjustments and transfers ---------------------------------------------

export type NewAdjustment = {
  lineId: string;
  amountCents: bigint;
  reason: string;
  effectiveDate: Date;
};

export async function insertAdjustment(
  ctx: WorkspaceContext,
  adjustment: NewAdjustment,
): Promise<"created" | "not_found" | "not_locked"> {
  const line = await getPrisma().budgetLine.findFirst({
    where: { id: adjustment.lineId, workspaceId: ctx.workspaceId },
    select: { project: { select: { budgetLockedAt: true } } },
  });
  if (!line) return "not_found";
  if (!line.project.budgetLockedAt) return "not_locked";
  await getPrisma().budgetAdjustment.create({
    data: { id: newId(), workspaceId: ctx.workspaceId, createdById: ctx.userId, ...adjustment },
  });
  return "created";
}

export type NewTransfer = {
  fromLineId: string;
  toLineId: string;
  amountCents: bigint;
  reason: string;
  effectiveDate: Date;
  allowOverAllocation: boolean;
  reversesTransferId?: string;
};

/**
 * Runs `decide` with the source line's current numbers while holding a
 * lock on that line, so two transfers out of it can't both pass the
 * "enough available" check. `decide` returns the transfer to record, or a
 * reason to refuse.
 */
export async function insertTransferChecked<R extends string>(
  ctx: WorkspaceContext,
  fromLineId: string,
  decide: (source: LineWithFacts, db: Db) => Promise<NewTransfer | R>,
): Promise<{ id: string } | R | "not_found"> {
  return getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "budget_lines"
      WHERE "id" = ${fromLineId} AND "workspace_id" = ${ctx.workspaceId}
      FOR UPDATE`;
    if (locked.length === 0) return "not_found";
    const source = await findLine(ctx, fromLineId, tx);
    if (!source) return "not_found";
    const decision = await decide(source, tx);
    if (typeof decision === "string") return decision;
    const id = newId();
    await tx.budgetTransfer.create({
      data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...decision },
    });
    return { id };
  });
}

export type TransferRecord = {
  id: string;
  from: LineLabel;
  to: LineLabel;
  amountCents: bigint;
  reason: string;
  effectiveDate: Date;
  allowOverAllocation: boolean;
  reversesTransferId: string | null;
  reversedById: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export async function listTransfers(
  ctx: WorkspaceContext,
  where: { projectId?: string; lineId?: string; id?: string } = {},
  db: Db = getPrisma(),
): Promise<TransferRecord[]> {
  const touching = where.projectId
    ? [{ fromLine: { projectId: where.projectId } }, { toLine: { projectId: where.projectId } }]
    : where.lineId
      ? [{ fromLineId: where.lineId }, { toLineId: where.lineId }]
      : undefined;
  const rows = await db.budgetTransfer.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(where.id ? { id: where.id } : {}),
      ...(touching ? { OR: touching } : {}),
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amountCents: true,
      reason: true,
      effectiveDate: true,
      allowOverAllocation: true,
      reversesTransferId: true,
      createdById: true,
      createdAt: true,
      reversedBy: { select: { id: true } },
      fromLine: { select: lineSelect },
      toLine: { select: lineSelect },
    },
  });
  const names = await userNames(rows.map((r) => r.createdById));
  return rows.map((r) => ({
    id: r.id,
    from: toLabel(r.fromLine),
    to: toLabel(r.toLine),
    amountCents: r.amountCents,
    reason: r.reason,
    effectiveDate: r.effectiveDate,
    allowOverAllocation: r.allowOverAllocation,
    reversesTransferId: r.reversesTransferId,
    reversedById: r.reversedBy?.id ?? null,
    createdByName: r.createdById ? (names.get(r.createdById) ?? null) : null,
    createdAt: r.createdAt,
  }));
}

export type AdjustmentRecord = {
  id: string;
  line: LineLabel;
  amountCents: bigint;
  reason: string;
  effectiveDate: Date;
  createdByName: string | null;
};

export async function listAdjustments(
  ctx: WorkspaceContext,
  where: { projectId?: string; lineId?: string } = {},
): Promise<AdjustmentRecord[]> {
  const rows = await getPrisma().budgetAdjustment.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(where.lineId ? { lineId: where.lineId } : {}),
      ...(where.projectId ? { line: { projectId: where.projectId } } : {}),
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      amountCents: true,
      reason: true,
      effectiveDate: true,
      createdById: true,
      line: { select: lineSelect },
    },
  });
  const names = await userNames(rows.map((r) => r.createdById));
  return rows.map((r) => ({
    id: r.id,
    line: toLabel(r.line),
    amountCents: r.amountCents,
    reason: r.reason,
    effectiveDate: r.effectiveDate,
    createdByName: r.createdById ? (names.get(r.createdById) ?? null) : null,
  }));
}

/** Display names for the people who recorded things (users aren't household-scoped). */
async function userNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const users = await getPrisma().user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export { lineSelect, toLabel, userNames };
