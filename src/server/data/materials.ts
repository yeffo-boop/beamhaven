import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { unlinkWarranties } from "./contractors";
import { newId } from "./ids";

/** Materials: products being considered or bought for a project or room. */

export type MaterialFields = {
  name: string;
  category: string | null;
  projectId: string | null;
  roomId: string | null;
  supplierId: string | null;
  brand: string | null;
  modelNumber: string | null;
  sku: string | null;
  colorFinish: string | null;
  productUrl: string | null;
  quantityMilli: number | null;
  unit: string | null;
  unitPriceCents: bigint | null;
  status: string;
  specs: string | null;
  notes: string | null;
};

export type MaterialRecord = MaterialFields & {
  id: string;
  projectName: string | null;
  roomName: string | null;
  supplierName: string | null;
  statusChangedAt: Date;
  updatedAt: Date;
};

export type MaterialFilter = {
  id?: string;
  projectId?: string;
  roomId?: string;
  status?: string;
};

/** Whether the project and room are in this household. */
async function linksValid(ctx: WorkspaceContext, fields: MaterialFields): Promise<boolean> {
  const prisma = getPrisma();
  const ws = ctx.workspaceId;
  const [projects, rooms] = await Promise.all([
    fields.projectId
      ? prisma.project.count({ where: { id: fields.projectId, workspaceId: ws } })
      : 1,
    fields.roomId ? prisma.room.count({ where: { id: fields.roomId, workspaceId: ws } }) : 1,
  ]);
  return projects === 1 && rooms === 1;
}

export async function insertMaterial(
  ctx: WorkspaceContext,
  fields: MaterialFields,
): Promise<{ id: string } | null> {
  if (!(await linksValid(ctx, fields))) return null;
  const id = newId();
  await getPrisma().material.create({
    data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
  });
  return { id };
}

/** Saves the fields; the status date moves only when the status changes. */
export async function updateMaterialRow(
  ctx: WorkspaceContext,
  id: string,
  fields: MaterialFields,
): Promise<boolean> {
  if (!(await linksValid(ctx, fields))) return false;
  return setMaterial(ctx, id, fields);
}

export async function setMaterialStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<boolean> {
  return setMaterial(ctx, id, { status });
}

async function setMaterial(
  ctx: WorkspaceContext,
  id: string,
  data: Partial<MaterialFields>,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.material.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { status: true },
    });
    if (!before) return false;
    const moved = data.status !== undefined && data.status !== before.status;
    await tx.material.update({
      where: { id },
      data: { ...data, ...(moved ? { statusChangedAt: new Date() } : {}) },
    });
    return true;
  });
}

/**
 * Deletes it with its photos and documents. Its warranties let go of it
 * (one that was only on this material goes too). Returns the files to
 * remove, or null if it isn't in this household.
 */
export async function deleteMaterialRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<string[] | null> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.material.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { attachments: { select: { fileId: true } } },
    });
    if (!row) return null;
    const warrantyFiles = await unlinkWarranties(tx, ctx.workspaceId, { materialId: id });
    await tx.material.delete({ where: { id } });
    return [...warrantyFiles, ...row.attachments.map((a) => a.fileId)];
  });
}

export async function listMaterials(
  ctx: WorkspaceContext,
  where: MaterialFilter,
): Promise<MaterialRecord[]> {
  const rows = await getPrisma().material.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      name: true,
      category: true,
      projectId: true,
      roomId: true,
      supplierId: true,
      brand: true,
      modelNumber: true,
      sku: true,
      colorFinish: true,
      productUrl: true,
      quantityMilli: true,
      unit: true,
      unitPriceCents: true,
      status: true,
      statusChangedAt: true,
      specs: true,
      notes: true,
      updatedAt: true,
      project: { select: { name: true } },
      room: { select: { name: true } },
      supplier: { select: { name: true } },
    },
  });
  return rows.map(({ project, room, supplier, ...row }) => ({
    ...row,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
    supplierName: supplier?.name ?? null,
  }));
}

/** The categories already used in this household, for the form's suggestions. */
export async function listMaterialCategories(ctx: WorkspaceContext): Promise<string[]> {
  const rows = await getPrisma().material.findMany({
    where: { workspaceId: ctx.workspaceId, category: { not: null } },
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.flatMap((r) => (r.category ? [r.category] : []));
}
