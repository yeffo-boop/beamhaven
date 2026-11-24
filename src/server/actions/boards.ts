"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  createBoard,
  deleteBoard,
  deleteBoardItem,
  markBoardItem,
  moveBoardItem,
  reorderBoardItems,
  updateBoard,
  updateBoardItem,
} from "@/server/services/boards";
import { RuleError } from "@/server/services/errors";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/** Server Actions for design boards (Milestone 8, part 2). New items go through /api/boards/items. */

const BOARD_FIELDS = ["name", "roomId", "projectId", "notes"] as const;
const ITEM_FIELDS = [
  "title",
  "notes",
  "colorHex",
  "brand",
  "code",
  "productUrl",
  "materialId",
] as const;

const pick = (formData: FormData, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, text(formData, name)]));

export async function saveBoardAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  let created: string | null = null;
  try {
    if (id) await updateBoard(ctx, id, pick(formData, BOARD_FIELDS));
    else created = (await createBoard(ctx, pick(formData, BOARD_FIELDS))).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  if (created) redirect(`/inspiration/${created}`);
  refresh();
  return { status: "saved" };
}

export async function deleteBoardAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deleteBoard(ctx, idFrom(formData));
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect("/inspiration");
}

export async function saveBoardItemAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await updateBoardItem(
      ctx,
      idFrom(formData, "boardId"),
      idFrom(formData),
      pick(formData, ITEM_FIELDS),
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function deleteBoardItemAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deleteBoardItem(ctx, idFrom(formData, "boardId"), idFrom(formData));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

/** The Preferred and Approved toggles: "flag" is which, "on" is "1" to set it. */
export async function markBoardItemAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const flag = text(formData, "flag") === "approved" ? "approved" : "preferred";
  try {
    await markBoardItem(
      ctx,
      idFrom(formData, "boardId"),
      idFrom(formData),
      flag,
      text(formData, "on") === "1",
    );
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

export async function moveBoardItemAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const boardId = idFrom(formData, "boardId");
  try {
    await moveBoardItem(
      ctx,
      boardId,
      idFrom(formData),
      text(formData, "direction") === "up" ? "up" : "down",
    );
  } catch (error) {
    problemRedirect(`/inspiration/${boardId}`, error);
    asFormResult(error);
    return;
  }
  refresh();
}

/** Saves the order after a drag. Returns a message if the board changed meanwhile. */
export async function reorderBoardItemsAction(
  boardId: string,
  ids: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireWorkspace();
  try {
    await reorderBoardItems(ctx, String(boardId).slice(0, 64), ids);
  } catch (error) {
    if (error instanceof RuleError) {
      refresh();
      return { ok: false, message: error.message };
    }
    asFormResult(error);
    return { ok: false, message: "That didn't work." };
  }
  refresh();
  return { ok: true };
}
