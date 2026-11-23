import "server-only";

import { waitsOnEventually } from "@/lib/dependencies";

import { userNames } from "./budget";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** Tasks and warranties: records that hang off a project, a room or a contractor. */

type Ws = string;

async function linksInHousehold(
  ws: Ws,
  links: {
    projectId?: string | null;
    roomId?: string | null;
    contractorId?: string | null;
    materialId?: string | null;
  },
): Promise<boolean> {
  const prisma = getPrisma();
  const checks = await Promise.all([
    links.materialId
      ? prisma.material.count({ where: { id: links.materialId, workspaceId: ws } })
      : 1,
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
  milestoneId: string | null;
};

export type TaskLink = { id: string; title: string; status: string };

export type TaskRecord = TaskFields & {
  id: string;
  projectName: string | null;
  roomName: string | null;
  milestoneName: string | null;
  assigneeName: string | null;
  completedAt: Date | null;
  /** The tasks this one waits on, and those still open (it's blocked while any are). */
  waitsOn: TaskLink[];
  blockedBy: TaskLink[];
  /** The tasks waiting on this one. */
  neededFor: TaskLink[];
};

/** Whether the user is in this household (only members can be assigned). */
async function isMember(ws: Ws, userId: string): Promise<boolean> {
  return (await getPrisma().membership.count({ where: { workspaceId: ws, userId } })) === 1;
}

export type TaskLinksCheck = "ok" | "not_found" | "wrong_milestone";

async function taskLinksValid(ws: Ws, fields: TaskFields): Promise<TaskLinksCheck> {
  if (fields.assigneeUserId && !(await isMember(ws, fields.assigneeUserId))) return "not_found";
  if (fields.milestoneId) {
    const milestone = await getPrisma().milestone.findFirst({
      where: { id: fields.milestoneId, workspaceId: ws },
      select: { projectId: true },
    });
    if (!milestone) return "not_found";
    if (milestone.projectId !== fields.projectId) return "wrong_milestone";
  }
  const ok = await linksInHousehold(ws, {
    projectId: fields.projectId,
    roomId: fields.roomId,
    contractorId: fields.assigneeContractorId,
  });
  return ok ? "ok" : "not_found";
}

export async function insertTask(
  ctx: WorkspaceContext,
  fields: TaskFields,
): Promise<{ status: "saved"; id: string } | { status: Exclude<TaskLinksCheck, "ok"> }> {
  const check = await taskLinksValid(ctx.workspaceId, fields);
  if (check !== "ok") return { status: check };
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
  return { status: "saved", id };
}

export async function findTask(ctx: WorkspaceContext, id: string): Promise<TaskRecord | null> {
  const [task] = await listTasks(ctx, { id });
  return task ?? null;
}

export type SetTaskResult =
  | { status: "saved" }
  | { status: "not_found" }
  | { status: "wrong_milestone" }
  | { status: "blocked"; waitingOn: string };

export async function updateTaskRow(
  ctx: WorkspaceContext,
  id: string,
  fields: TaskFields,
): Promise<SetTaskResult> {
  const check = await taskLinksValid(ctx.workspaceId, fields);
  if (check !== "ok") return { status: check };
  return setTask(ctx, id, fields);
}

/**
 * Changes the fields, stamping or clearing when it was finished. A task
 * can't be finished while one it waits on is still open (ADR-031).
 */
async function setTask(
  ctx: WorkspaceContext,
  id: string,
  data: Partial<TaskFields>,
): Promise<SetTaskResult> {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.task.findFirst({
      where: { id, workspaceId: ctx.workspaceId },
      select: {
        status: true,
        completedAt: true,
        waitsOn: { select: { dependsOn: { select: { title: true, status: true } } } },
      },
    });
    if (!before) return { status: "not_found" };
    const status = data.status ?? before.status;
    if (status === "done" && before.status !== "done") {
      const open = before.waitsOn.find((w) => w.dependsOn.status !== "done");
      if (open) return { status: "blocked", waitingOn: open.dependsOn.title };
    }
    const completedAt = status === "done" ? (before.completedAt ?? new Date()) : null;
    await tx.task.update({ where: { id }, data: { ...data, completedAt } });
    return { status: "saved" };
  });
}

export async function setTaskStatus(
  ctx: WorkspaceContext,
  id: string,
  status: string,
): Promise<SetTaskResult> {
  return setTask(ctx, id, { status });
}

export async function deleteTaskRow(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const result = await getPrisma().task.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  return result.count === 1;
}

export async function listTasks(
  ctx: WorkspaceContext,
  where: {
    id?: string;
    projectId?: string;
    roomId?: string;
    assigneeContractorId?: string;
    milestoneId?: string;
  },
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
      milestoneId: true,
      completedAt: true,
      project: { select: { name: true } },
      room: { select: { name: true } },
      milestone: { select: { name: true } },
      assigneeContractor: { select: { vendor: { select: { name: true } } } },
      waitsOn: {
        orderBy: { createdAt: "asc" },
        select: { dependsOn: { select: { id: true, title: true, status: true } } },
      },
      neededFor: {
        orderBy: { createdAt: "asc" },
        select: { task: { select: { id: true, title: true, status: true } } },
      },
    },
  });
  const names = await userNames(rows.map((r) => r.assigneeUserId));
  return rows.map(
    ({ project, room, milestone, assigneeContractor, waitsOn, neededFor, ...row }) => ({
      ...row,
      projectName: project?.name ?? null,
      roomName: room?.name ?? null,
      milestoneName: milestone?.name ?? null,
      waitsOn: waitsOn.map((w) => w.dependsOn),
      blockedBy: waitsOn.map((w) => w.dependsOn).filter((t) => t.status !== "done"),
      neededFor: neededFor.map((n) => n.task),
      assigneeName: row.assigneeUserId
        ? (names.get(row.assigneeUserId) ?? null)
        : (assigneeContractor?.vendor.name ?? null),
    }),
  );
}

// --- Dependencies (Milestone 7, ADR-031) -----------------------------------

export type DependencyResult =
  | { status: "saved" }
  | { status: "not_found" }
  | { status: "self" }
  | { status: "exists" }
  | { status: "circular" };

/**
 * Makes `taskId` wait on `dependsOnId`. Refused if that would make a loop
 * (the other task already waits, however indirectly, on this one). The
 * household's dependencies are locked while checking, so two people can't
 * close a loop between them at the same moment.
 */
export async function insertDependency(
  ctx: WorkspaceContext,
  taskId: string,
  dependsOnId: string,
): Promise<DependencyResult> {
  const ws = ctx.workspaceId;
  if (taskId === dependsOnId) return { status: "self" };
  return getPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('task_dependencies'), hashtext(${ws}))`;
    const found = await tx.task.count({
      where: { id: { in: [taskId, dependsOnId] }, workspaceId: ws },
    });
    if (found !== 2) return { status: "not_found" };
    const edges = await tx.taskDependency.findMany({
      where: { workspaceId: ws },
      select: { taskId: true, dependsOnId: true },
    });
    if (edges.some((e) => e.taskId === taskId && e.dependsOnId === dependsOnId)) {
      return { status: "exists" };
    }
    if (waitsOnEventually(edges, dependsOnId, taskId)) return { status: "circular" };
    await tx.taskDependency.create({ data: { workspaceId: ws, taskId, dependsOnId } });
    return { status: "saved" };
  });
}

export async function deleteDependencyRow(
  ctx: WorkspaceContext,
  taskId: string,
  dependsOnId: string,
): Promise<boolean> {
  const result = await getPrisma().taskDependency.deleteMany({
    where: { taskId, dependsOnId, workspaceId: ctx.workspaceId },
  });
  return result.count === 1;
}

/** Every task in the household, for the "waits on" picker. */
export async function listTaskChoices(
  ctx: WorkspaceContext,
): Promise<{ id: string; title: string; projectName: string | null; status: string }[]> {
  const rows = await getPrisma().task.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ project: { name: "asc" } }, { createdAt: "asc" }],
    take: 500,
    select: { id: true, title: true, status: true, project: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    projectName: r.project?.name ?? null,
  }));
}

// --- Warranties ------------------------------------------------------------

export type WarrantyFields = {
  coverage: string;
  provider: string | null;
  contractorId: string | null;
  projectId: string | null;
  roomId: string | null;
  materialId: string | null;
  startsOn: Date | null;
  expiresOn: Date | null;
  notes: string | null;
};

export type WarrantyRecord = WarrantyFields & {
  id: string;
  contractorName: string | null;
  projectName: string | null;
  roomName: string | null;
  materialName: string | null;
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
  where: {
    id?: string;
    contractorId?: string;
    projectId?: string;
    roomId?: string;
    materialId?: string;
  },
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
      materialId: true,
      startsOn: true,
      expiresOn: true,
      notes: true,
      contractor: { select: { vendor: { select: { name: true } } } },
      project: { select: { name: true } },
      room: { select: { name: true } },
      material: { select: { name: true } },
    },
  });
  return rows.map(({ contractor, project, room, material, ...row }) => ({
    ...row,
    contractorName: contractor?.vendor.name ?? null,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
    materialName: material?.name ?? null,
  }));
}
