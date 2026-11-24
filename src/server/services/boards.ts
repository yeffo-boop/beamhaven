import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import {
  type BoardDetail,
  type BoardFilter,
  type BoardSummary,
  deleteBoardItemRow,
  deleteBoardRow,
  findBoard,
  findBoardItemKind,
  insertBoard,
  insertBoardItem,
  listBoardItemIds,
  listBoards,
  reorderBoardItemRows,
  setBoardItemFlag,
  updateBoardItemRow,
  updateBoardRow,
} from "@/server/data/boards";
import type { WorkspaceContext } from "@/server/data/context";

import { removeFiles, storeUploadedFile, type Upload, UploadError } from "./attachments";
import { boardInput, boardItemInput, reorderInput } from "./board-inputs";
import { NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";

/** Design boards (Milestone 8, part 2, ADR-035). */

export type BoardInput = FormInput<typeof boardInput>;
export type BoardItemInput = FormInput<typeof boardItemInput>;

export async function getBoards(
  ctx: WorkspaceContext,
  filter: BoardFilter = {},
): Promise<BoardSummary[]> {
  assertCan(ctx, "records:view");
  return listBoards(ctx, filter);
}

export async function getBoard(ctx: WorkspaceContext, id: string): Promise<BoardDetail> {
  assertCan(ctx, "records:view");
  const board = await findBoard(ctx, id);
  if (!board) throw new NotFoundError("board");
  return board;
}

export async function createBoard(
  ctx: WorkspaceContext,
  input: BoardInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = boardInput.parse(input);
  const created = await insertBoard(ctx, fields);
  if (!created) throw new NotFoundError("room or project");
  await recordActivity(ctx, {
    action: "board.created",
    entityType: "board",
    entityId: created.id,
    summary: `Started the design board “${fields.name}”`,
  });
  return created;
}

export async function updateBoard(
  ctx: WorkspaceContext,
  id: string,
  input: BoardInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  if (!(await updateBoardRow(ctx, id, boardInput.parse(input)))) {
    throw new NotFoundError("board");
  }
}

/** Deletes the board, its items and their pictures. */
export async function deleteBoard(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const deleted = await deleteBoardRow(ctx, id);
  if (!deleted) throw new NotFoundError("board");
  await removeFiles(ctx, deleted.fileIds);
  await recordActivity(ctx, {
    action: "board.deleted",
    entityType: "board",
    entityId: id,
    summary: `Deleted the design board “${deleted.name}”`,
  });
}

/**
 * Adds an item at the end of a board. An image needs a picture; a product
 * or finish may have one. Pictures are photos only (no PDFs, no SVG).
 */
export async function addBoardItem(
  ctx: WorkspaceContext,
  boardId: string,
  input: BoardItemInput,
  upload: Upload | null,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const { kind, ...fields } = boardItemInput.parse(input);
  if (kind === "image" && !upload) throw new UploadError("Choose a picture for this image.");
  // A color is just the color.
  const picture = kind === "color" ? null : upload;
  const stored = picture ? await storeUploadedFile(ctx, picture, "photo") : null;
  try {
    const created = await insertBoardItem(ctx, boardId, kind, fields, stored?.file ?? null);
    if (!created) throw new NotFoundError("board or material");
    await recordActivity(ctx, {
      action: "board.item_added",
      entityType: "board",
      entityId: boardId,
      summary: `Added “${fields.title}” to “${created.boardName}”`,
    });
    return { id: created.id };
  } catch (error) {
    await stored?.discard();
    throw error;
  }
}

/** Changes an item's words, color, link or material. Its kind and picture stay. */
export async function updateBoardItem(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
  input: Omit<BoardItemInput, "kind">,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const kind = await findBoardItemKind(ctx, boardId, itemId);
  if (!kind) throw new NotFoundError("board item");
  const parsed = boardItemInput.parse({ ...input, kind });
  const fields = {
    title: parsed.title,
    notes: parsed.notes,
    colorHex: parsed.colorHex,
    brand: parsed.brand,
    code: parsed.code,
    productUrl: parsed.productUrl,
    materialId: parsed.materialId,
  };
  if (!(await updateBoardItemRow(ctx, boardId, itemId, fields))) {
    throw new NotFoundError("board item");
  }
}

/** Preferred: a favourite among the options. Approved: the decision, with who and when. */
export async function markBoardItem(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
  flag: "preferred" | "approved",
  on: boolean,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const item = await setBoardItemFlag(ctx, boardId, itemId, flag, on);
  if (!item) throw new NotFoundError("board item");
  if (flag === "approved") {
    await recordActivity(ctx, {
      action: on ? "board.item_approved" : "board.item_unapproved",
      entityType: "board",
      entityId: boardId,
      summary: on ? `Approved “${item.title}”` : `Took back the approval of “${item.title}”`,
    });
  }
}

export async function deleteBoardItem(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const deleted = await deleteBoardItemRow(ctx, boardId, itemId);
  if (!deleted) throw new NotFoundError("board item");
  if (deleted.fileId) await removeFiles(ctx, [deleted.fileId]);
  await recordActivity(ctx, {
    action: "board.item_removed",
    entityType: "board",
    entityId: boardId,
    summary: `Removed “${deleted.title}”`,
  });
}

/** Puts the items in this order (from dragging). It must name every item once. */
export async function reorderBoardItems(
  ctx: WorkspaceContext,
  boardId: string,
  ids: unknown,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await reorderBoardItemRows(ctx, boardId, reorderInput.parse(ids));
  if (result === "not_found") throw new NotFoundError("board");
  if (result === "mismatch") throw new RuleError("board_order_changed");
}

/** Moves one item a place earlier or later (the buttons, for keyboards and screen readers). */
export async function moveBoardItem(
  ctx: WorkspaceContext,
  boardId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<void> {
  assertCan(ctx, "records:edit");
  const ids = await listBoardItemIds(ctx, boardId);
  const at = ids?.indexOf(itemId) ?? -1;
  if (!ids || at < 0) throw new NotFoundError("board item");
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= ids.length) return;
  const swapped = [...ids];
  [swapped[at], swapped[to]] = [swapped[to] ?? itemId, swapped[at] ?? itemId];
  await reorderBoardItems(ctx, boardId, swapped);
}
