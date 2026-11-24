import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** Punch list items: things to fix before a project is finished (ADR-047). */

export type PunchFields = {
  title: string;
  notes: string | null;
  roomId: string | null;
  contractorId: string | null;
};

export type PunchItemRecord = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  notes: string | null;
  status: string;
  roomId: string | null;
  roomName: string | null;
  contractorId: string | null;
  contractorName: string | null;
  fixedAt: Date | null;
  signedOffAt: Date | null;
  signedOffByName: string | null;
  photoCount: number;
  createdAt: Date;
};

/** The room and contractor, when given, must be in this household. */
async function linksInHousehold(ctx: WorkspaceContext, fields: PunchFields): Promise<boolean> {
  const prisma = getPrisma();
  const ws = ctx.workspaceId;
  const [rooms, contractors] = await Promise.all([
    fields.roomId ? prisma.room.count({ where: { id: fields.roomId, workspaceId: ws } }) : 1,
    fields.contractorId
      ? prisma.contractor.count({ where: { id: fields.contractorId, workspaceId: ws } })
      : 1,
  ]);
  return rooms === 1 && contractors === 1;
}

export async function insertPunchItem(
  ctx: WorkspaceContext,
  projectId: string,
  fields: PunchFields,
): Promise<{ id: string } | null> {
  const project = await getPrisma().project.count({
    where: { id: projectId, workspaceId: ctx.workspaceId },
  });
  if (project !== 1 || !(await linksInHousehold(ctx, fields))) return null;
  const id = newId();
  await getPrisma().punchItem.create({
    data: { id, workspaceId: ctx.workspaceId, projectId, createdById: ctx.userId, ...fields },
  });
  return { id };
}

export async function updatePunchItemRow(
  ctx: WorkspaceContext,
  id: string,
  fields: PunchFields,
): Promise<boolean> {
  if (!(await linksInHousehold(ctx, fields))) return false;
  const result = await getPrisma().punchItem.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}

/** Moves an item to a new status, recording when (and who signed it off). */
export async function setPunchStatusRow(
  ctx: WorkspaceContext,
  id: string,
  status: "open" | "fixed" | "signed_off",
  now = new Date(),
): Promise<boolean> {
  const data =
    status === "open"
      ? { status, fixedAt: null, signedOffAt: null, signedOffById: null }
      : status === "fixed"
        ? { status, fixedAt: now, signedOffAt: null, signedOffById: null }
        : { status, signedOffAt: now, signedOffById: ctx.userId };
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.punchItem.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { fixedAt: true },
    });
    if (!row) return false;
    // Signing off something never marked fixed counts as fixed now too.
    const extra = status === "signed_off" && !row.fixedAt ? { fixedAt: now } : {};
    await tx.punchItem.update({ where: { id }, data: { ...data, ...extra } });
    return true;
  });
}

/** Deletes it and returns its photos' files (null if it wasn't found here). */
export async function deletePunchItemRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<string[] | null> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.punchItem.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { attachments: { select: { fileId: true } } },
    });
    if (!row) return null;
    await tx.punchItem.delete({ where: { id } });
    return row.attachments.map((a) => a.fileId);
  });
}

export async function listPunchItems(
  ctx: WorkspaceContext,
  where: { id?: string; projectId?: string },
): Promise<PunchItemRecord[]> {
  const rows = await getPrisma().punchItem.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      projectId: true,
      title: true,
      notes: true,
      status: true,
      roomId: true,
      contractorId: true,
      fixedAt: true,
      signedOffAt: true,
      signedOffById: true,
      createdAt: true,
      project: { select: { name: true } },
      room: { select: { name: true } },
      contractor: { select: { vendor: { select: { name: true } } } },
      _count: { select: { attachments: true } },
    },
  });
  const signerIds = [...new Set(rows.flatMap((r) => (r.signedOffById ? [r.signedOffById] : [])))];
  const signers = signerIds.length
    ? await getPrisma().user.findMany({
        where: { id: { in: signerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameOf = new Map(signers.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectName: r.project.name,
    title: r.title,
    notes: r.notes,
    status: r.status,
    roomId: r.roomId,
    roomName: r.room?.name ?? null,
    contractorId: r.contractorId,
    contractorName: r.contractor?.vendor.name ?? null,
    fixedAt: r.fixedAt,
    signedOffAt: r.signedOffAt,
    signedOffByName: r.signedOffById ? (nameOf.get(r.signedOffById) ?? null) : null,
    photoCount: r._count.attachments,
    createdAt: r.createdAt,
  }));
}
