import "server-only";

import { userNames } from "./budget";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** Tasks and warranties: records that hang off a project, a room or a contractor. */

type Ws = string;

async function linksInHousehold(
  ws: Ws,
  links: { projectId?: string | null; roomId?: string | null; contractorId?: string | null },
): Promise<boolean> {
  const prisma = getPrisma();
  const checks = await Promise.all([
    links.projectId ? prisma.project.count({ where: { id: links.projectId, workspaceId: ws } }) : 1,
    links.roomId ? prisma.room.count({ where: { id: links.roomId, workspaceId: ws } }) : 1,
    links.contractorId
      ? prisma.contractor.count({ where: { id: links.contractorId, workspaceId: ws } })
      : 1,
  ]);
  return checks.every((n) => n === 1);
}

// --- Tasks -----------------------------------------------------------------

export type TaskFields = {
  title: string;
  description: string | null;
  projectId: string | null;
  roomId: string | null;
  status: string;
  priority: string;
  assigneeUserId: string | null;
  assigneeContractorId: string | null;
  dueDate: Date | null;
};

export type TaskRecord = TaskFields & {
  id: string;
  projectName: string | null;
  roomName: string | null;
  assigneeName: string | null;
  completedAt: Date | null;
};

/** Whether the user is in this household (only members can be assigned). */
async function isMember(ws: Ws, userId: string): Promise<boolean> {
  return (await getPrisma().membership.count({ where: { workspaceId: ws, userId } })) === 1;
}

async function taskLinksValid(ws: Ws, fields: TaskFields): Promise<boolean> {
  if (fields.assigneeUserId && !(await isMember(ws, fields.assigneeUserId))) return false;
  return linksInHousehold(ws, {
    projectId: fields.projectId,
    roomId: fields.roomId,
    contractorId: fields.assigneeContractorId,
  });
}

export async function insertTask(
  ctx: WorkspaceContext,
  fields: TaskFields,
): Promise<{ id: string } | null> {
  if (!(await taskLinksValid(ctx.workspaceId, fields))) return null;
  const id = newId();
  await getPrisma().task.create({
    data: {
      id,
      workspaceId: ctx.workspaceId,
      createdById: ctx.userId,
      completedAt: fields.status === "done" ? new Date() : null,
      ...fields,
    },
  });
  return { id };
}

export async function findTask(ctx: WorkspaceContext, id: string): Promise<TaskRecord | null> {
  const [task] = await listTasks(ctx, { id });
  return task ?? null;
}

export async function updateTaskRow(
  ctx: WorkspaceContext,
  id: string,
  fields: TaskFields,
): Promise<boolean> {
  if (!(await taskLinksValid(ctx.workspaceId, fields))) return false;
  return setTask(ctx, id, fields);
}

/** Changes the fields, stamping or clearing when it was finished. */
async function setTask(
  ctx: WorkspaceContext,
  id: string,
  data: Partial<TaskFields>,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.task.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { status: true, completedAt: true },
    });
    if (!before) return false;
    const status = data.status ?? before.status;
    const completedAt = status === "done" ? (before.completedAt ?? new Date()) : null;
    await tx.task.update({ where: { id }, data: { ...data, completedAt } });
    return true;
  });
}

export async function setTaskStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<boolean> {
  return setTask(ctx, id, { status });
}

export async function deleteTaskRow(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const result = await getPrisma().task.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  return result.count === 1;
}

export async function listTasks(
  ctx: WorkspaceContext,
  where: { id?: string; projectId?: string; roomId?: string; assigneeContractorId?: string },
): Promise<TaskRecord[]> {
  const rows = await getPrisma().task.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    // Open tasks first, then by due date (none last), newest first.
    orderBy: [
      { completedAt: { sort: "desc", nulls: "first" } },
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 300,
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      roomId: true,
      status: true,
      priority: true,
      assigneeUserId: true,
      assigneeContractorId: true,
      dueDate: true,
      completedAt: true,
      project: { select: { name: true } },
      room: { select: { name: true } },
      assigneeContractor: { select: { vendor: { select: { name: true } } } },
    },
  });
  const names = await userNames(rows.map((r) => r.assigneeUserId));
  return rows.map(({ project, room, assigneeContractor, ...row }) => ({
    ...row,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
    assigneeName: row.assigneeUserId
      ? (names.get(row.assigneeUserId) ?? null)
      : (assigneeContractor?.vendor.name ?? null),
  }));
}

// --- Warranties ------------------------------------------------------------

export type WarrantyFields = {
  coverage: string;
  provider: string | null;
  contractorId: string | null;
  projectId: string | null;
  roomId: string | null;
  startsOn: Date | null;
  expiresOn: Date | null;
  notes: string | null;
};

export type WarrantyRecord = WarrantyFields & {
  id: string;
  contractorName: string | null;
  projectName: string | null;
  roomName: string | null;
};

export async function insertWarranty(
  ctx: WorkspaceContext,
  fields: WarrantyFields,
): Promise<{ id: string } | null> {
  if (!(await linksInHousehold(ctx.workspaceId, fields))) return null;
  const id = newId();
  await getPrisma().warranty.create({
    data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
  });
  return { id };
}

export async function updateWarrantyRow(
  ctx: WorkspaceContext,
  id: string,
  fields: WarrantyFields,
): Promise<boolean> {
  if (!(await linksInHousehold(ctx.workspaceId, fields))) return false;
  const result = await getPrisma().warranty.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}

/** Deletes it and returns its documents' files (null if it wasn't found here). */
export async function deleteWarrantyRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<string[] | null> {
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.warranty.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: { attachments: { select: { fileId: true } } },
    });
    if (!row) return null;
    await tx.warranty.delete({ where: { id } });
    return row.attachments.map((a) => a.fileId);
  });
}

export async function listWarranties(
  ctx: WorkspaceContext,
  where: { id?: string; contractorId?: string; projectId?: string; roomId?: string },
): Promise<WarrantyRecord[]> {
  const rows = await getPrisma().warranty.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: [{ expiresOn: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select: {
      id: true,
      coverage: true,
      provider: true,
      contractorId: true,
      projectId: true,
      roomId: true,
      startsOn: true,
      expiresOn: true,
      notes: true,
      contractor: { select: { vendor: { select: { name: true } } } },
      project: { select: { name: true } },
      room: { select: { name: true } },
    },
  });
  return rows.map(({ contractor, project, room, ...row }) => ({
    ...row,
    contractorName: contractor?.vendor.name ?? null,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
  }));
}
