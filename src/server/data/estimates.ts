import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Measure, PriceUnit } from "@/lib/room-estimate";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/**
 * The price list and room estimates (Milestone 5, part 3). An estimate
 * keeps the `estimate_cents` of its own budget lines up to date; see
 * docs/BUDGET_DEFINITIONS.md, "Room estimates".
 */

type Tx = Prisma.TransactionClient;

// --- Price list ------------------------------------------------------------

export type PriceItemFields = {
  name: string;
  measure: Measure;
  unit: PriceUnit;
  priceCents: bigint;
  coverageMm2: number | null;
  coats: number;
  laborCents: bigint | null;
  wastePercent: number;
  taxable: boolean;
  notes: string | null;
};

export type PriceItemRecord = PriceItemFields & { id: string; estimateCount: number };

const priceSelect = {
  id: true,
  name: true,
  measure: true,
  unit: true,
  priceCents: true,
  coverageMm2: true,
  coats: true,
  laborCents: true,
  wastePercent: true,
  taxable: true,
  notes: true,
  _count: { select: { estimates: true } },
} as const;

type PriceRow = Prisma.PriceItemGetPayload<{ select: typeof priceSelect }>;

function toPriceItem({ _count, measure, unit, ...row }: PriceRow): PriceItemRecord {
  return {
    ...row,
    measure: measure as Measure,
    unit: unit as PriceUnit,
    estimateCount: _count.estimates,
  };
}

export async function listPriceItems(ctx: WorkspaceContext): Promise<PriceItemRecord[]> {
  const rows = await getPrisma().priceItem.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { name: "asc" },
    select: priceSelect,
  });
  return rows.map(toPriceItem);
}

export async function findPriceItem(
  ctx: WorkspaceContext,
  id: string,
): Promise<PriceItemRecord | null> {
  const row = await getPrisma().priceItem.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: priceSelect,
  });
  return row ? toPriceItem(row) : null;
}

async function nameTaken(tx: Tx, ws: string, name: string, except?: string) {
  const rows = await tx.priceItem.findMany({
    where: { workspaceId: ws, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return rows.some((r) => r.id !== except);
}

export async function insertPriceItem(
  ctx: WorkspaceContext,
  fields: PriceItemFields,
): Promise<{ status: "created"; id: string } | { status: "name_taken" }> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if (await nameTaken(tx, ws, fields.name)) return { status: "name_taken" };
    const id = newId();
    await tx.priceItem.create({ data: { id, workspaceId: ws, ...fields } });
    return { status: "created", id };
  });
}

export async function updatePriceItemRow(
  ctx: WorkspaceContext,
  id: string,
  fields: PriceItemFields,
): Promise<"saved" | "not_found" | "name_taken"> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if ((await tx.priceItem.count({ where: { id, workspaceId: ws } })) !== 1) return "not_found";
    if (await nameTaken(tx, ws, fields.name, id)) return "name_taken";
    await tx.priceItem.update({ where: { id }, data: fields });
    return "saved";
  });
}

export async function deletePriceItemRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<"deleted" | "not_found" | "in_use"> {
  const row = await getPrisma().priceItem.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { _count: { select: { estimates: true } } },
  });
  if (!row) return "not_found";
  if (row._count.estimates > 0) return "in_use";
  await getPrisma().priceItem.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  return "deleted";
}

/** Sales tax on materials, in hundredths of a percent. */
export async function getMaterialsTaxBp(ctx: WorkspaceContext): Promise<number> {
  const row = await getPrisma().workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { materialsTaxBp: true },
  });
  return row.materialsTaxBp;
}

export async function setMaterialsTaxBp(ctx: WorkspaceContext, bp: number): Promise<void> {
  await getPrisma().workspace.update({
    where: { id: ctx.workspaceId },
    data: { materialsTaxBp: bp },
  });
}

// --- Estimates -------------------------------------------------------------

export type EstimateFields = {
  name: string;
  priceItemId: string;
  materialCategoryId: string;
  laborCategoryId: string | null;
  lineMode: "per_room" | "one_line";
  notes: string | null;
};

export type EstimateArea = {
  id: string;
  roomId: string | null;
  roomName: string | null;
  label: string | null;
  typedAmount: number | null;
  room: {
    lengthMm: number | null;
    widthMm: number | null;
    ceilingHeightMm: number | null;
    openings: { kind: string; widthMm: number; heightMm: number }[];
  } | null;
};

export type EstimateDetail = EstimateFields & {
  id: string;
  projectId: string;
  projectName: string;
  propertyId: string;
  priceItem: PriceItemRecord;
  materialCategoryName: string;
  laborCategoryName: string | null;
  areas: EstimateArea[];
  /** The budget lines it keeps up to date. */
  lines: {
    id: string;
    categoryName: string;
    roomName: string | null;
    estimateCents: bigint | null;
  }[];
};

const estimateSelect = {
  id: true,
  projectId: true,
  name: true,
  priceItemId: true,
  materialCategoryId: true,
  laborCategoryId: true,
  lineMode: true,
  notes: true,
  project: { select: { name: true, propertyId: true } },
  priceItem: { select: priceSelect },
  materialCategory: { select: { name: true } },
  laborCategory: { select: { name: true } },
  areas: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      roomId: true,
      label: true,
      typedAmount: true,
      room: {
        select: {
          name: true,
          lengthMm: true,
          widthMm: true,
          ceilingHeightMm: true,
          openings: { select: { kind: true, widthMm: true, heightMm: true } },
        },
      },
    },
  },
  lines: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      estimateCents: true,
      category: { select: { name: true } },
      room: { select: { name: true } },
    },
  },
} as const;

type EstimateRow = Prisma.RoomEstimateGetPayload<{ select: typeof estimateSelect }>;

function toEstimate(row: EstimateRow): EstimateDetail {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    propertyId: row.project.propertyId,
    name: row.name,
    priceItemId: row.priceItemId,
    materialCategoryId: row.materialCategoryId,
    laborCategoryId: row.laborCategoryId,
    lineMode: row.lineMode === "one_line" ? "one_line" : "per_room",
    notes: row.notes,
    priceItem: toPriceItem(row.priceItem),
    materialCategoryName: row.materialCategory.name,
    laborCategoryName: row.laborCategory?.name ?? null,
    areas: row.areas.map((a) => ({
      id: a.id,
      roomId: a.roomId,
      roomName: a.room?.name ?? null,
      label: a.label,
      typedAmount: a.typedAmount,
      room: a.room
        ? {
            lengthMm: a.room.lengthMm,
            widthMm: a.room.widthMm,
            ceilingHeightMm: a.room.ceilingHeightMm,
            openings: a.room.openings,
          }
        : null,
    })),
    lines: row.lines.map((l) => ({
      id: l.id,
      categoryName: l.category.name,
      roomName: l.room?.name ?? null,
      estimateCents: l.estimateCents,
    })),
  };
}

export async function listEstimates(
  ctx: WorkspaceContext,
  where: { projectId?: string; priceItemId?: string; roomId?: string } = {},
): Promise<EstimateDetail[]> {
  const rows = await getPrisma().roomEstimate.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(where.projectId ? { projectId: where.projectId } : {}),
      ...(where.priceItemId ? { priceItemId: where.priceItemId } : {}),
      ...(where.roomId ? { areas: { some: { roomId: where.roomId } } } : {}),
    },
    orderBy: { name: "asc" },
    select: estimateSelect,
  });
  return rows.map(toEstimate);
}

export async function findEstimate(
  ctx: WorkspaceContext,
  id: string,
): Promise<EstimateDetail | null> {
  const row = await getPrisma().roomEstimate.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: estimateSelect,
  });
  return row ? toEstimate(row) : null;
}

type SaveResult =
  | { status: "saved"; id: string }
  | { status: "not_found" }
  | { status: "name_taken" }
  | { status: "room_not_on_project" };

/** Checks the price item, categories and rooms all belong here, and the rooms to the project. */
async function checkLinks(
  tx: Tx,
  ws: string,
  projectId: string,
  fields: EstimateFields,
  roomIds: string[],
): Promise<"ok" | "not_found" | "room_not_on_project"> {
  const categoryIds = [fields.materialCategoryId, fields.laborCategoryId].filter(
    (c): c is string => c !== null,
  );
  const [price, categories, rooms] = await Promise.all([
    tx.priceItem.count({ where: { id: fields.priceItemId, workspaceId: ws } }),
    tx.budgetCategory.count({ where: { id: { in: categoryIds }, workspaceId: ws } }),
    tx.projectRoom.count({ where: { projectId, workspaceId: ws, roomId: { in: roomIds } } }),
  ]);
  if (price !== 1 || categories !== new Set(categoryIds).size) return "not_found";
  if (rooms !== roomIds.length) return "room_not_on_project";
  return "ok";
}

export async function insertEstimate(
  ctx: WorkspaceContext,
  projectId: string,
  fields: EstimateFields,
  roomIds: string[],
): Promise<SaveResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if ((await tx.project.count({ where: { id: projectId, workspaceId: ws } })) !== 1) {
      return { status: "not_found" };
    }
    const links = await checkLinks(tx, ws, projectId, fields, roomIds);
    if (links !== "ok") return { status: links };
    if (await tx.roomEstimate.count({ where: { projectId, name: fields.name } })) {
      return { status: "name_taken" };
    }
    const id = newId();
    await tx.roomEstimate.create({
      data: { id, workspaceId: ws, projectId, createdById: ctx.userId, ...fields },
    });
    await tx.roomEstimateArea.createMany({
      data: roomIds.map((roomId) => ({ id: newId(), workspaceId: ws, estimateId: id, roomId })),
    });
    return { status: "saved", id };
  });
}

/**
 * Changes an estimate and which rooms it covers. Rooms taken off lose their
 * typed size too; areas typed by hand (with no room) stay.
 */
export async function updateEstimateRow(
  ctx: WorkspaceContext,
  id: string,
  fields: EstimateFields,
  roomIds: string[],
): Promise<SaveResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const current = await tx.roomEstimate.findFirst({
      where: { id, workspaceId: ws },
      select: { projectId: true, name: true, areas: { select: { roomId: true } } },
    });
    if (!current) return { status: "not_found" };
    const links = await checkLinks(tx, ws, current.projectId, fields, roomIds);
    if (links !== "ok") return { status: links };
    const clash = await tx.roomEstimate.count({
      where: { projectId: current.projectId, name: fields.name, id: { not: id } },
    });
    if (clash) return { status: "name_taken" };
    await tx.roomEstimate.update({ where: { id }, data: fields });
    await tx.roomEstimateArea.deleteMany({
      where: { estimateId: id, roomId: { not: null, notIn: roomIds } },
    });
    const have = new Set(current.areas.map((a) => a.roomId));
    const added = roomIds.filter((r) => !have.has(r));
    await tx.roomEstimateArea.createMany({
      data: added.map((roomId) => ({ id: newId(), workspaceId: ws, estimateId: id, roomId })),
    });
    // Its lines follow the new name, unless another line already has it.
    if (current.name !== fields.name) {
      const owned = await tx.budgetLine.findMany({
        where: { estimateSourceId: id, workspaceId: ws },
        select: { id: true, categoryId: true, roomId: true },
      });
      for (const line of owned) {
        const taken = await tx.budgetLine.count({
          where: {
            projectId: current.projectId,
            categoryId: line.categoryId,
            roomId: line.roomId,
            name: fields.name,
          },
        });
        if (!taken)
          await tx.budgetLine.update({ where: { id: line.id }, data: { name: fields.name } });
      }
    }
    return { status: "saved", id };
  });
}

/**
 * A size typed by hand: for one of the estimate's rooms (instead of
 * measuring it), or a labelled area of its own (a shower wall, a closet).
 */
export async function setTypedArea(
  ctx: WorkspaceContext,
  estimateId: string,
  area: { roomId: string | null; label: string | null; amount: number; enteredUnit: string },
): Promise<"saved" | "not_found" | "room_not_in_estimate"> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if ((await tx.roomEstimate.count({ where: { id: estimateId, workspaceId: ws } })) !== 1) {
      return "not_found";
    }
    if (area.roomId) {
      const row = await tx.roomEstimateArea.findFirst({
        where: { estimateId, roomId: area.roomId, workspaceId: ws },
        select: { id: true },
      });
      if (!row) return "room_not_in_estimate";
      await tx.roomEstimateArea.update({
        where: { id: row.id },
        data: { typedAmount: area.amount, label: area.label, enteredUnit: area.enteredUnit },
      });
      return "saved";
    }
    await tx.roomEstimateArea.create({
      data: {
        id: newId(),
        workspaceId: ws,
        estimateId,
        label: area.label,
        typedAmount: area.amount,
        enteredUnit: area.enteredUnit,
      },
    });
    return "saved";
  });
}

/** Removes a typed area, or puts a room back to being measured from its size. */
export async function clearTypedArea(
  ctx: WorkspaceContext,
  areaId: string,
): Promise<{ estimateId: string } | null> {
  const ws = ctx.workspaceId;
  const row = await getPrisma().roomEstimateArea.findFirst({
    where: { id: areaId, workspaceId: ws },
    select: { estimateId: true, roomId: true },
  });
  if (!row) return null;
  if (row.roomId) {
    await getPrisma().roomEstimateArea.update({
      where: { id: areaId },
      data: { typedAmount: null, label: null },
    });
  } else {
    await getPrisma().roomEstimateArea.delete({ where: { id: areaId } });
  }
  return { estimateId: row.estimateId };
}

/** A budget line an estimate wants, and the estimate it should carry. */
export type WantedLine = { categoryId: string; roomId: string | null; cents: bigint };

async function lineHasMoney(tx: Tx, id: string): Promise<boolean> {
  const line = await tx.budgetLine.findUniqueOrThrow({
    where: { id },
    select: {
      plannedCents: true,
      originalCents: true,
      _count: {
        select: {
          adjustments: true,
          transfersIn: true,
          transfersOut: true,
          commitments: true,
          allocations: true,
          quotes: true,
        },
      },
    },
  });
  const c = line._count;
  return (
    line.plannedCents !== 0n ||
    (line.originalCents ?? 0n) > 0n ||
    c.adjustments + c.transfersIn + c.transfersOut + c.commitments + c.allocations + c.quotes > 0
  );
}

/**
 * Puts the estimate's numbers on its budget lines: finds or makes each line
 * it wants (by category, room and the estimate's name), and lets go of the
 * ones it no longer wants. A line it made that has nothing else on it is
 * deleted again; any other line just loses the estimate.
 */
export async function applyEstimateLines(
  ctx: WorkspaceContext,
  estimateId: string,
  wanted: WantedLine[],
): Promise<void> {
  const ws = ctx.workspaceId;
  await getPrisma().$transaction(async (tx) => {
    const estimate = await tx.roomEstimate.findFirst({
      where: { id: estimateId, workspaceId: ws },
      select: { projectId: true, name: true, project: { select: { budgetLockedAt: true } } },
    });
    if (!estimate) return;
    const locked = estimate.project.budgetLockedAt !== null;
    const kept = new Set<string>();
    for (const want of wanted) {
      const existing = await tx.budgetLine.findFirst({
        where: {
          workspaceId: ws,
          projectId: estimate.projectId,
          categoryId: want.categoryId,
          roomId: want.roomId,
          name: estimate.name,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.budgetLine.update({
          where: { id: existing.id },
          data: { estimateCents: want.cents, estimateSourceId: estimateId },
        });
        kept.add(existing.id);
      } else {
        const id = newId();
        await tx.budgetLine.create({
          data: {
            id,
            workspaceId: ws,
            projectId: estimate.projectId,
            categoryId: want.categoryId,
            roomId: want.roomId,
            name: estimate.name,
            plannedCents: 0n,
            // After lock-in a new line starts at $0, so the locked-in total holds.
            originalCents: locked ? 0n : null,
            estimateCents: want.cents,
            estimateSourceId: estimateId,
          },
        });
        kept.add(id);
      }
    }
    await releaseLines(tx, ws, estimateId, kept);
  });
}

async function releaseLines(tx: Tx, ws: string, estimateId: string, keep: Set<string>) {
  const owned = await tx.budgetLine.findMany({
    where: { estimateSourceId: estimateId, workspaceId: ws },
    select: { id: true },
  });
  for (const line of owned.filter((l) => !keep.has(l.id))) {
    if (await lineHasMoney(tx, line.id)) {
      await tx.budgetLine.update({
        where: { id: line.id },
        data: { estimateCents: null, estimateSourceId: null },
      });
    } else {
      await tx.budgetLine.delete({ where: { id: line.id } });
    }
  }
}

export async function deleteEstimateRow(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    if ((await tx.roomEstimate.count({ where: { id, workspaceId: ws } })) !== 1) return false;
    await releaseLines(tx, ws, id, new Set());
    await tx.quote.updateMany({
      where: { estimateId: id, workspaceId: ws },
      data: { estimateId: null },
    });
    await tx.roomEstimate.delete({ where: { id } });
    return true;
  });
}

/** Compares a quote with one of its project's estimates (or stops comparing). */
export async function setQuoteEstimateRow(
  ctx: WorkspaceContext,
  quoteId: string,
  estimateId: string | null,
): Promise<boolean> {
  const ws = ctx.workspaceId;
  const quote = await getPrisma().quote.findFirst({
    where: { id: quoteId, workspaceId: ws },
    select: { projectId: true },
  });
  if (!quote) return false;
  if (estimateId) {
    const ok = await getPrisma().roomEstimate.count({
      where: { id: estimateId, workspaceId: ws, projectId: quote.projectId },
    });
    if (ok !== 1) return false;
  }
  await getPrisma().quote.update({ where: { id: quoteId }, data: { estimateId } });
  return true;
}

/** Room estimates that include a room; the room is about to be deleted. */
export async function dropRoomFromEstimates(tx: Tx, ws: string, roomId: string): Promise<string[]> {
  const rows = await tx.roomEstimateArea.findMany({
    where: { roomId, workspaceId: ws },
    select: { estimateId: true },
  });
  await tx.roomEstimateArea.deleteMany({ where: { roomId, workspaceId: ws } });
  return [...new Set(rows.map((r) => r.estimateId))];
}
