"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  changeMaterialStatus,
  createMaterial,
  deleteMaterial,
  getMaterial,
  updateMaterial,
} from "@/server/services/materials";

import type { FormResult } from "./account";
import { asFormResult, idFrom, text } from "./helpers";

/** Server Actions for materials (Milestone 6, part 1). */

const MATERIAL_FIELDS = [
  "name",
  "category",
  "projectId",
  "roomId",
  "supplier",
  "brand",
  "modelNumber",
  "sku",
  "colorFinish",
  "productUrl",
  "quantity",
  "unit",
  "unitPrice",
  "status",
  "specs",
  "notes",
] as const;

function fields(formData: FormData): Record<string, string> {
  return Object.fromEntries(MATERIAL_FIELDS.map((name) => [name, text(formData, name)]));
}

export async function saveMaterialAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  let created: string | null = null;
  try {
    if (id) await updateMaterial(ctx, id, fields(formData));
    else created = (await createMaterial(ctx, fields(formData))).id;
  } catch (error) {
    return asFormResult(error, formData);
  }
  // A new material opens its own page; an edit goes back to it.
  redirect(`/materials/${created ?? id}`);
}

export async function setMaterialStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await changeMaterialStatus(ctx, idFrom(formData), text(formData, "status"));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let back = "/materials";
  try {
    const m = await getMaterial(ctx, id);
    if (m.projectId) back = `/projects/${m.projectId}`;
    else if (m.roomId) back = `/rooms/${m.roomId}`;
    await deleteMaterial(ctx, id);
  } catch (error) {
    asFormResult(error);
    return;
  }
  redirect(back);
}
