import "server-only";

import { formatMoney } from "@/lib/money";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import {
  type AdjustmentRecord,
  type BudgetCategory,
  deleteLineRow,
  findLine,
  getLockState,
  insertAdjustment,
  insertCategory,
  insertLine,
  insertTransferChecked,
  type LineLabel,
  type LineWithFacts,
  lineTitle,
  listAdjustments,
  listCategories,
  listLineLabels,
  listLinesWithFacts,
  listTransfers,
  type LockState,
  lockProjectBudget,
  type TransferRecord,
  updateLineRow,
} from "@/server/data/budget";
import type { WorkspaceContext } from "@/server/data/context";
import {
  type CommitmentRecord,
  type ExpenseSummary,
  listCommitments,
  listExpenses,
} from "@/server/data/expenses";
import { listProjects } from "@/server/data/projects";

import {
  adjustmentInput,
  categoryInput,
  lineInput,
  lineUpdateInput,
  reverseTransferInput,
  transferInput,
} from "./budget-inputs";
import {
  type LineNumbers,
  lineNumbers,
  type Totals,
  totals,
  transferShortfall,
} from "./budget-math";
import { fieldError, NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";

export type LineView = LineWithFacts & { numbers: LineNumbers };

function withNumbers(lines: LineWithFacts[]): LineView[] {
  return lines.map((line) => ({ ...line, numbers: lineNumbers(line.facts) }));
}

export type GroupTotal = { key: string; label: string; totals: Totals };

function groupTotals(lines: LineView[], keyOf: (l: LineView) => [string, string]): GroupTotal[] {
  const groups = new Map<string, { label: string; lines: LineView[] }>();
  for (const line of lines) {
    const [key, label] = keyOf(line);
    const group = groups.get(key) ?? { label, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups].map(([key, g]) => ({
    key,
    label: g.label,
    totals: totals(g.lines.map((l) => l.facts)),
  }));
}

// --- Reading ---------------------------------------------------------------

export type ProjectBudget = {
  lock: LockState;
  lines: LineView[];
  totals: Totals;
  byCategory: GroupTotal[];
  byRoom: GroupTotal[];
  transfers: TransferRecord[];
  adjustments: AdjustmentRecord[];
  commitments: CommitmentRecord[];
  expenses: ExpenseSummary[];
};

export async function getProjectBudget(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<ProjectBudget> {
  assertCan(ctx, "records:view");
  const lock = await getLockState(ctx, projectId);
  if (!lock) throw new NotFoundError("project");
  const [lines, transfers, adjustments, commitments, expenses] = await Promise.all([
    listLinesWithFacts(ctx, { projectId }),
    listTransfers(ctx, { projectId }),
    listAdjustments(ctx, { projectId }),
    listCommitments(ctx, { projectId }),
    listExpenses(ctx, { projectId }),
  ]);
  const views = withNumbers(lines);
  return {
    lock,
    lines: views,
    totals: totals(lines.map((l) => l.facts)),
    byCategory: groupTotals(views, (l) => [l.categoryId, l.categoryName]),
    byRoom: groupTotals(views, (l) => [l.roomId ?? "", l.roomName ?? "Whole project"]),
    transfers,
    adjustments,
    commitments,
    expenses,
  };
}

export type HouseholdBudget = {
  totals: Totals;
  projects: {
    id: string;
    name: string;
    status: string;
    locked: boolean;
    lineCount: number;
    totals: Totals;
  }[];
  recentExpenses: ExpenseSummary[];
};

export async function getHouseholdBudget(ctx: WorkspaceContext): Promise<HouseholdBudget> {
  assertCan(ctx, "records:view");
  const [projects, lines, recentExpenses] = await Promise.all([
    listProjects(ctx),
    listLinesWithFacts(ctx),
    listExpenses(ctx, { limit: 10 }),
  ]);
  return {
    totals: totals(lines.map((l) => l.facts)),
    projects: projects.map((p) => {
      const own = lines.filter((l) => l.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        locked: p.budgetLockedAt !== null,
        lineCount: own.length,
        totals: totals(own.map((l) => l.facts)),
      };
    }),
    recentExpenses,
  };
}

export type LineDetail = {
  line: LineView;
  commitments: CommitmentRecord[];
  expenses: ExpenseSummary[];
  transfers: TransferRecord[];
  adjustments: AdjustmentRecord[];
};

export async function getLine(ctx: WorkspaceContext, id: string): Promise<LineDetail> {
  assertCan(ctx, "records:view");
  const line = await findLine(ctx, id);
  if (!line) throw new NotFoundError("budget line");
  const [commitments, expenses, transfers, adjustments] = await Promise.all([
    listCommitments(ctx, { lineId: id }),
    listExpenses(ctx, { lineId: id }),
    listTransfers(ctx, { lineId: id }),
    listAdjustments(ctx, { lineId: id }),
  ]);
  return {
    line: { ...line, numbers: lineNumbers(line.facts) },
    commitments,
    expenses,
    transfers,
    adjustments,
  };
}

export async function getCategories(ctx: WorkspaceContext): Promise<BudgetCategory[]> {
  assertCan(ctx, "records:view");
  return listCategories(ctx);
}

/** Every line in the household, for "charge this to" and transfer pickers. */
export async function getLineChoices(ctx: WorkspaceContext): Promise<LineLabel[]> {
  assertCan(ctx, "records:view");
  return listLineLabels(ctx);
}

// --- Changing --------------------------------------------------------------

export async function addCategory(
  ctx: WorkspaceContext,
  input: FormInput<typeof categoryInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = categoryInput.parse(input);
  await listCategories(ctx); // make sure the starting set exists first
  const created = await insertCategory(ctx, fields);
  if (!created) throw fieldError("name", "There's already a category with that name");
  return created;
}

export async function createLine(
  ctx: WorkspaceContext,
  input: FormInput<typeof lineInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { planned, estimate, ...rest } = lineInput.parse(input);
  const result = await insertLine(ctx, { ...rest, plannedCents: planned, estimateCents: estimate });
  switch (result.status) {
    case "not_found":
      throw new NotFoundError("project, category or room");
    case "room_not_in_property":
      throw fieldError("roomId", "That room is in a different property");
    case "duplicate":
      throw fieldError(
        "name",
        "This project already has that line. Give this one a label to tell them apart.",
      );
    case "created":
      break;
  }
  const line = await findLine(ctx, result.id);
  if (line) {
    await recordActivity(ctx, {
      action: "budget.line_added",
      entityType: "project",
      entityId: line.projectId,
      summary: `Added the budget line “${lineTitle(line, { withProject: false })}”`,
    });
  }
  return { id: result.id };
}

export async function updateLine(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof lineUpdateInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const fields = lineUpdateInput.parse(input);
  const result = await updateLineRow(ctx, id, {
    name: fields.name,
    plannedCents: fields.planned,
    estimateCents: fields.estimate,
    notes: fields.notes,
  });
  if (result === "not_found") throw new NotFoundError("budget line");
  if (result === "duplicate") {
    throw fieldError("name", "This project already has a line with that label");
  }
}

export async function deleteLine(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ projectId: string }> {
  assertCan(ctx, "records:edit");
  const line = await findLine(ctx, id);
  const result = await deleteLineRow(ctx, id);
  if (result.status === "not_found" || !line) throw new NotFoundError("budget line");
  if (result.status === "in_use") {
    throw new RuleError("line_in_use");
  }
  await recordActivity(ctx, {
    action: "budget.line_removed",
    entityType: "project",
    entityId: line.projectId,
    summary: `Removed the budget line “${lineTitle(line, { withProject: false })}”`,
  });
  return { projectId: line.projectId };
}

/** Locks in the original budget (a one-time action; BUDGET_DEFINITIONS). */
export async function lockBudget(ctx: WorkspaceContext, projectId: string): Promise<void> {
  assertCan(ctx, "budget:approve");
  const result = await lockProjectBudget(ctx, projectId);
  if (result === "not_found") throw new NotFoundError("project");
  if (result === "already_locked") return; // someone else just did it: nothing to do
  const lines = await listLinesWithFacts(ctx, { projectId });
  const original = totals(lines.map((l) => l.facts)).original ?? 0n;
  await recordActivity(ctx, {
    action: "budget.locked",
    entityType: "project",
    entityId: projectId,
    summary: `Locked in the original budget of ${formatMoney(original)}`,
  });
}

export async function adjustLine(
  ctx: WorkspaceContext,
  input: FormInput<typeof adjustmentInput>,
): Promise<void> {
  assertCan(ctx, "budget:approve");
  const { direction, amount, ...rest } = adjustmentInput.parse(input);
  const amountCents = direction === "decrease" ? -amount : amount;
  const result = await insertAdjustment(ctx, { ...rest, amountCents });
  if (result === "not_found") throw new NotFoundError("budget line");
  if (result === "not_locked") {
    throw fieldError(
      "amount",
      "Lock in the project's budget first. Until then, change the planned amount instead.",
    );
  }
  const line = await findLine(ctx, rest.lineId);
  if (line) {
    await recordActivity(ctx, {
      action: "budget.adjusted",
      entityType: "project",
      entityId: line.projectId,
      summary: `${direction === "increase" ? "Raised" : "Lowered"} “${lineTitle(line, { withProject: false })}” by ${formatMoney(amount)}: ${rest.reason}`,
    });
  }
}

/**
 * Moves money between two budget lines in this household (rule 6). Refused
 * if it would leave the source with less than nothing available, unless
 * the person ticks "allow over-allocation" (rule 7).
 */
export async function transferBudget(
  ctx: WorkspaceContext,
  input: FormInput<typeof transferInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "budget:approve");
  const t = transferInput.parse(input);
  const result = await insertTransferChecked<"not_found" | "not_locked" | "short">(
    ctx,
    t.fromLineId,
    async (source, db) => {
      const destination = await findLine(ctx, t.toLineId, db);
      if (!destination) return "not_found" as const;
      if (!source.projectLocked || !destination.projectLocked) return "not_locked" as const;
      const shortfall = transferShortfall(lineNumbers(source.facts).available, t.amount);
      if (shortfall > 0n && !t.allowOverAllocation) return "short" as const;
      return {
        fromLineId: t.fromLineId,
        toLineId: t.toLineId,
        amountCents: t.amount,
        reason: t.reason,
        effectiveDate: t.effectiveDate,
        allowOverAllocation: shortfall > 0n,
      };
    },
  );
  if (result === "not_found") throw new NotFoundError("budget line");
  if (result === "not_locked") {
    throw fieldError(
      "toLineId",
      "Both projects need their budget locked in first. Until then, change the planned amounts instead.",
    );
  }
  if (result === "short") {
    const source = await findLine(ctx, t.fromLineId);
    const available = source ? lineNumbers(source.facts).available : 0n;
    throw fieldError(
      "amount",
      `That line only has ${formatMoney(available)} available. Tick “Allow going over” to move it anyway.`,
    );
  }
  await recordTransferActivity(ctx, result.id, "Moved");
  return result;
}

/** Undoes a transfer by recording the opposite one (rule 7). */
export async function reverseTransfer(
  ctx: WorkspaceContext,
  input: FormInput<typeof reverseTransferInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "budget:approve");
  const { transferId, reason } = reverseTransferInput.parse(input);
  const [original] = await listTransfers(ctx, { id: transferId });
  if (!original) throw new NotFoundError("transfer");
  if (original.reversesTransferId) {
    throw fieldError("reason", "This is already a reversal. Make a new transfer instead.");
  }
  if (original.reversedById) throw fieldError("reason", "This transfer has already been reversed.");
  const result = await insertTransferChecked<never>(ctx, original.to.id, async (source) => {
    const shortfall = transferShortfall(lineNumbers(source.facts).available, original.amountCents);
    return {
      fromLineId: original.to.id,
      toLineId: original.from.id,
      amountCents: original.amountCents,
      reason,
      effectiveDate: new Date(new Date().toISOString().slice(0, 10)),
      // Undoing is always allowed; the record says if it went over.
      allowOverAllocation: shortfall > 0n,
      reversesTransferId: original.id,
    };
  }).catch((error: unknown) => {
    // Two people reversing at once: the unique index stops the second.
    if (String(error).includes("Unique constraint")) return "duplicate" as const;
    throw error;
  });
  if (result === "not_found") throw new NotFoundError("transfer");
  if (result === "duplicate")
    throw fieldError("reason", "This transfer has already been reversed.");
  await recordTransferActivity(ctx, result.id, "Reversed a transfer: moved");
  return result;
}

async function recordTransferActivity(ctx: WorkspaceContext, id: string, verb: string) {
  const [transfer] = await listTransfers(ctx, { id });
  if (!transfer) return;
  const summary = `${verb} ${formatMoney(transfer.amountCents)} from “${lineTitle(transfer.from)}” to “${lineTitle(transfer.to)}”: ${transfer.reason}`;
  const projects = new Set([transfer.from.projectId, transfer.to.projectId]);
  for (const projectId of projects) {
    await recordActivity(ctx, {
      action: "budget.transferred",
      entityType: "project",
      entityId: projectId,
      summary,
    });
  }
}
