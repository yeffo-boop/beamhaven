import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import { findOrCreateVendor, listVendors } from "@/server/data/expenses";
import {
  deleteMaterialRow,
  insertMaterial,
  listMaterialCategories,
  listMaterials,
  type MaterialFields,
  type MaterialFilter,
  type MaterialRecord,
  setMaterialStatus,
  updateMaterialRow,
} from "@/server/data/materials";

import { removeFiles } from "./attachments";
import { getRecordChoices } from "./choices";
import { NotFoundError } from "./errors";
import type { FormInput } from "./inputs";
import {
  MATERIAL_CATEGORY_SUGGESTIONS,
  MATERIAL_STATUS_LABELS,
  materialInput,
  materialStatusInput,
} from "./material-inputs";

/** Materials (Milestone 6, part 1): the products for a project or room. */

export type MaterialInput = FormInput<typeof materialInput>;

export async function getMaterials(
  ctx: WorkspaceContext,
  where: Omit<MaterialFilter, "id"> = {},
): Promise<MaterialRecord[]> {
  assertCan(ctx, "records:view");
  return listMaterials(ctx, where);
}

export async function getMaterial(ctx: WorkspaceContext, id: string): Promise<MaterialRecord> {
  assertCan(ctx, "records:view");
  const [material] = await listMaterials(ctx, { id });
  if (!material) throw new NotFoundError("material");
  return material;
}

/** Suggestions for the "kind" box: the usual ones plus any this household typed. */
export async function getMaterialCategories(ctx: WorkspaceContext): Promise<string[]> {
  assertCan(ctx, "records:view");
  const used = await listMaterialCategories(ctx);
  const all = new Map<string, string>();
  for (const name of [...MATERIAL_CATEGORY_SUGGESTIONS, ...used]) {
    if (!all.has(name.toLowerCase())) all.set(name.toLowerCase(), name);
  }
  return [...all.values()].sort((a, b) => a.localeCompare(b));
}

/** Validates the form, and finds or adds the supplier by the name typed. */
async function materialFields(
  ctx: WorkspaceContext,
  input: MaterialInput,
): Promise<MaterialFields> {
  const { supplier, quantity, unitPrice, ...rest } = materialInput.parse(input);
  return {
    ...rest,
    supplierId: supplier ? await findOrCreateVendor(ctx, supplier) : null,
    quantityMilli: quantity,
    unitPriceCents: unitPrice,
  };
}

export async function createMaterial(
  ctx: WorkspaceContext,
  input: MaterialInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const fields = await materialFields(ctx, input);
  const created = await insertMaterial(ctx, fields);
  if (!created) throw new NotFoundError("project or room");
  await recordActivity(ctx, {
    action: "material.created",
    entityType: "material",
    entityId: created.id,
    summary: `Added the material “${fields.name}”`,
  });
  if (fields.projectId) {
    await recordActivity(ctx, {
      action: "project.material_added",
      entityType: "project",
      entityId: fields.projectId,
      summary: `Added the material “${fields.name}”`,
    });
  }
  return created;
}

export async function updateMaterial(
  ctx: WorkspaceContext,
  id: string,
  input: MaterialInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await getMaterial(ctx, id);
  const fields = await materialFields(ctx, input);
  if (!(await updateMaterialRow(ctx, id, fields))) throw new NotFoundError("material");
  await noteStatusChange(ctx, id, before.status, fields.status);
}

export async function changeMaterialStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const parsed = materialStatusInput.parse(status);
  const before = await getMaterial(ctx, id);
  if (!(await setMaterialStatus(ctx, id, parsed))) throw new NotFoundError("material");
  await noteStatusChange(ctx, id, before.status, parsed);
}

async function noteStatusChange(
  ctx: WorkspaceContext,
  id: string,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return;
  const label = MATERIAL_STATUS_LABELS[materialStatusInput.parse(to)];
  await recordActivity(ctx, {
    action: "material.status_changed",
    entityType: "material",
    entityId: id,
    summary: `Marked as ${label.toLowerCase()}`,
  });
}

export async function deleteMaterial(ctx: WorkspaceContext, id: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const fileIds = await deleteMaterialRow(ctx, id);
  if (!fileIds) throw new NotFoundError("material");
  await removeFiles(ctx, fileIds);
}

export type MaterialFormChoices = {
  projects: { value: string; label: string }[];
  rooms: { value: string; label: string }[];
  categories: string[];
  suppliers: string[];
};

/** What the material form offers: projects, rooms, kinds and suppliers. */
export async function getMaterialFormChoices(ctx: WorkspaceContext): Promise<MaterialFormChoices> {
  assertCan(ctx, "records:edit");
  const [choices, categories, vendors] = await Promise.all([
    getRecordChoices(ctx),
    getMaterialCategories(ctx),
    listVendors(ctx),
  ]);
  return {
    projects: choices.projects,
    rooms: choices.rooms,
    categories,
    suppliers: vendors.map((v) => v.name),
  };
}
