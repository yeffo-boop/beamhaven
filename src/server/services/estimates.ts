import "server-only";

import {
  estimate as calculate,
  type EstimateResult,
  laborUnit,
  measureRoom,
  typedToBase,
} from "@/lib/room-estimate";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import {
  applyEstimateLines,
  clearTypedArea,
  deleteEstimateRow,
  deletePriceItemRow,
  type EstimateDetail,
  findEstimate,
  findPriceItem,
  getMaterialsTaxBp,
  insertEstimate,
  insertPriceItem,
  listEstimates,
  listPriceItems,
  type PriceItemRecord,
  setMaterialsTaxBp,
  setQuoteEstimateRow,
  setTypedArea,
  updateEstimateRow,
  updatePriceItemRow,
  type WantedLine,
} from "@/server/data/estimates";

import { fieldError, NotFoundError, RuleError } from "./errors";
import { estimateInput, priceItemInput, taxInput, typedAreaInput } from "./estimate-inputs";
import type { FormInput } from "./inputs";

/**
 * The price list, the household's sales tax rate, and room estimates.
 * Every change that can move an estimate's numbers (its rooms, a room's
 * size, a price, the tax rate) recalculates it and updates its budget lines
 * straight away, so the budget never shows an old figure.
 */

// --- Price list ------------------------------------------------------------

export async function getPriceItems(ctx: WorkspaceContext): Promise<PriceItemRecord[]> {
  assertCan(ctx, "records:view");
  return listPriceItems(ctx);
}

export async function getPriceItem(ctx: WorkspaceContext, id: string): Promise<PriceItemRecord> {
  assertCan(ctx, "records:view");
  const item = await findPriceItem(ctx, id);
  if (!item) throw new NotFoundError("price item");
  return item;
}

const NAME_TAKEN = "There's already an item with this name.";

export async function createPriceItem(
  ctx: WorkspaceContext,
  input: FormInput<typeof priceItemInput>,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const result = await insertPriceItem(ctx, priceItemInput.parse(input));
  if (result.status === "name_taken") throw fieldError("name", NAME_TAKEN);
  return { id: result.id };
}

export async function updatePriceItem(
  ctx: WorkspaceContext,
  id: string,
  input: FormInput<typeof priceItemInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await updatePriceItemRow(ctx, id, priceItemInput.parse(input));
  if (result === "not_found") throw new NotFoundError("price item");
  if (result === "name_taken") throw fieldError("name", NAME_TAKEN);
  await refreshWhere(ctx, { priceItemId: id });
}

export async function deletePriceItem(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await deletePriceItemRow(ctx, id);
  if (result === "not_found") throw new NotFoundError("price item");
  if (result === "in_use") throw new RuleError("price_item_in_use");
}

export async function getMaterialsTax(ctx: WorkspaceContext): Promise<number> {
  assertCan(ctx, "records:view");
  return getMaterialsTaxBp(ctx);
}

export async function setMaterialsTax(
  ctx: WorkspaceContext,
  input: FormInput<typeof taxInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const { rate } = taxInput.parse(input);
  await setMaterialsTaxBp(ctx, rate);
  await refreshWhere(ctx, {});
}

// --- Working an estimate out -----------------------------------------------

export type EstimateView = EstimateDetail & { result: EstimateResult; taxBp: number };

function work(detail: EstimateDetail, taxBp: number): EstimateView {
  const p = detail.priceItem;
  const result = calculate(
    p,
    detail.areas.map((a) => ({
      key: a.id,
      amount: a.typedAmount ?? (a.room ? measureRoom(p.measure, a.room) : null),
    })),
    taxBp,
  );
  return { ...detail, result, taxBp };
}

/** Which budget line each row's money goes on (tax counts with the material). */
function wantedLines(view: EstimateView): WantedLine[] {
  const wanted = new Map<string, WantedLine>();
  const add = (categoryId: string, roomId: string | null, cents: bigint) => {
    const key = `${categoryId}:${roomId ?? ""}`;
    const line = wanted.get(key) ?? { categoryId, roomId, cents: 0n };
    line.cents += cents;
    wanted.set(key, line);
  };
  view.result.rows.forEach((row, i) => {
    const area = view.areas[i];
    if (!area || row.amount === null) return;
    const roomId = view.lineMode === "per_room" ? area.roomId : null;
    const labor = view.laborCategoryId;
    add(
      view.materialCategoryId,
      roomId,
      row.materialCents + row.taxCents + (labor ? 0n : row.laborCents),
    );
    if (labor && row.laborCents > 0n) add(labor, roomId, row.laborCents);
  });
  return [...wanted.values()];
}

async function refresh(ctx: WorkspaceContext, id: string, taxBp?: number): Promise<void> {
  const detail = await findEstimate(ctx, id);
  if (!detail) return;
  const view = work(detail, taxBp ?? (await getMaterialsTaxBp(ctx)));
  await applyEstimateLines(ctx, id, wantedLines(view));
}

/** Recalculates the estimates a change could have moved. */
async function refreshWhere(
  ctx: WorkspaceContext,
  where: { priceItemId?: string; roomId?: string },
): Promise<void> {
  const [estimates, taxBp] = await Promise.all([listEstimates(ctx, where), getMaterialsTaxBp(ctx)]);
  for (const e of estimates) await refresh(ctx, e.id, taxBp);
}

/** For the rooms service: a room's size or openings changed, or it's gone. */
export async function refreshEstimatesForRoom(ctx: WorkspaceContext, roomId: string) {
  await refreshWhere(ctx, { roomId });
}

export async function refreshEstimates(ctx: WorkspaceContext, ids: string[]) {
  const taxBp = await getMaterialsTaxBp(ctx);
  for (const id of ids) await refresh(ctx, id, taxBp);
}

// --- Estimates -------------------------------------------------------------

/** What the estimate form sends: text fields, and the ticked rooms. */
export type EstimateInput = Omit<FormInput<typeof estimateInput>, "roomIds"> & {
  roomIds?: string[];
};

export async function getEstimates(
  ctx: WorkspaceContext,
  projectId: string,
): Promise<EstimateView[]> {
  assertCan(ctx, "records:view");
  const [list, taxBp] = await Promise.all([
    listEstimates(ctx, { projectId }),
    getMaterialsTaxBp(ctx),
  ]);
  return list.map((e) => work(e, taxBp));
}

export async function getEstimate(ctx: WorkspaceContext, id: string): Promise<EstimateView> {
  assertCan(ctx, "records:view");
  const [detail, taxBp] = await Promise.all([findEstimate(ctx, id), getMaterialsTaxBp(ctx)]);
  if (!detail) throw new NotFoundError("estimate");
  return work(detail, taxBp);
}

function saved(
  result: Awaited<ReturnType<typeof insertEstimate>>,
): asserts result is { status: "saved"; id: string } {
  if (result.status === "not_found") throw new NotFoundError("project, item, category or room");
  if (result.status === "name_taken") {
    throw fieldError("name", "This project already has an estimate with this name.");
  }
  if (result.status === "room_not_on_project") {
    throw fieldError("roomIds", "Choose rooms that are part of this project.");
  }
}

export async function createEstimate(
  ctx: WorkspaceContext,
  projectId: string,
  input: EstimateInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { roomIds, ...fields } = estimateInput.parse(input);
  const result = await insertEstimate(ctx, projectId, fields, [...new Set(roomIds)]);
  saved(result);
  await refresh(ctx, result.id);
  await recordActivity(ctx, {
    action: "project.estimate_added",
    entityType: "project",
    entityId: projectId,
    summary: `Added the room estimate “${fields.name}”`,
  });
  return { id: result.id };
}

export async function updateEstimate(
  ctx: WorkspaceContext,
  id: string,
  input: EstimateInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const { roomIds, ...fields } = estimateInput.parse(input);
  saved(await updateEstimateRow(ctx, id, fields, [...new Set(roomIds)]));
  await refresh(ctx, id);
}

export async function addTypedArea(
  ctx: WorkspaceContext,
  estimateId: string,
  input: FormInput<typeof typedAreaInput>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const area = typedAreaInput.parse(input);
  const detail = await findEstimate(ctx, estimateId);
  if (!detail) throw new NotFoundError("estimate");
  if (!area.roomId && !area.label)
    throw fieldError("label", "Say what the area is, like Shower walls");
  const unit = laborUnit(detail.priceItem.measure, detail.priceItem.unit);
  const amount = typedToBase(area.amount, unit);
  if (amount === null || amount > 2_000_000_000) {
    throw fieldError("amount", "Enter a size like 45 or 12.5");
  }
  const result = await setTypedArea(ctx, estimateId, {
    roomId: area.roomId,
    label: area.label,
    amount,
    enteredUnit: unit === "sq_m" || unit === "lin_m" ? "metric" : "imperial",
  });
  if (result === "not_found") throw new NotFoundError("estimate");
  if (result === "room_not_in_estimate") {
    throw fieldError("roomId", "Add the room to the estimate first.");
  }
  await refresh(ctx, estimateId);
}

export async function removeTypedArea(
  ctx: WorkspaceContext,
  areaId: string,
): Promise<{ estimateId: string }> {
  assertCan(ctx, "records:edit");
  const result = await clearTypedArea(ctx, areaId);
  if (!result) throw new NotFoundError("area");
  await refresh(ctx, result.estimateId);
  return result;
}

export async function deleteEstimate(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ projectId: string }> {
  assertCan(ctx, "records:edit");
  const detail = await findEstimate(ctx, id);
  if (!detail || !(await deleteEstimateRow(ctx, id))) throw new NotFoundError("estimate");
  await recordActivity(ctx, {
    action: "project.estimate_deleted",
    entityType: "project",
    entityId: detail.projectId,
    summary: `Deleted the room estimate “${detail.name}”`,
  });
  return { projectId: detail.projectId };
}

/** Compare a quote with one of its project's estimates, or "" to stop. */
export async function setQuoteEstimate(
  ctx: WorkspaceContext,
  quoteId: string,
  estimateId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await setQuoteEstimateRow(ctx, quoteId, estimateId || null))) {
    throw new NotFoundError("quote or estimate");
  }
}
