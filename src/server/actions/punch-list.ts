"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  createPunchItem,
  deletePunchItem,
  setPunchStatus,
  updatePunchItem,
} from "@/server/services/punch-list";

import type { FormResult } from "./account";
import { asFormResult, idFrom, text } from "./helpers";

/** Server Actions for the punch list (ADR-047). The service checks the role and validates. */

const FIELDS = ["title", "notes", "roomId", "contractorId"] as const;

export async function savePunchItemAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  const input = Object.fromEntries(FIELDS.map((name) => [name, text(formData, name)]));
  try {
    if (id) await updatePunchItem(ctx, id, input);
    else await createPunchItem(ctx, idFrom(formData, "projectId"), input);
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function setPunchStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await setPunchStatus(ctx, idFrom(formData), text(formData, "status"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

export async function deletePunchItemAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  let projectId: string;
  try {
    ({ projectId } = await deletePunchItem(ctx, idFrom(formData)));
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(`/projects/${projectId}#punch-list`);
}
