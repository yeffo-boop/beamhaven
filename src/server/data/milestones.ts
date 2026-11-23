import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/**
 * A project's milestones (Milestone 7, ADR-031). A milestone's progress is
 * worked out from its tasks, never stored.
 */

export type MilestoneFields = { name: string; targetDate: Date | null; notes: string | null };

export type MilestoneRecord = MilestoneFields & {
  id: string;
  projectId: string;
  projectName: string;
  taskCount: number;
  doneCount: number;
};

const select = {
  id: true,
  projectId: true,
  name: true,
  targetDate: true,
  notes: true,
  project: { select: { name: true } },
  tasks: { select: { status: true } },
} as const;

type Row = {
  id: string;
  projectId: string;
  name: string;
  targetDate: Date | null;
  notes: string | null;
  project: { name: string };
  tasks: { status: string }[];
};

function toRecord({ project, tasks, ...row }: Row): MilestoneRecord {
  return {
    ...row,
    projectName: project.name,
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === "done").length,
  };
}

export async function listMilestones(
  ctx: WorkspaceContext,
  where: { projectId?: string } = {},
): Promise<MilestoneRecord[]> {
  const rows = await getPrisma().milestone.findMany({
    where: { workspaceId: ctx.workspaceId, ...where },
    orderBy: [
      { targetDate: { sort: "asc", nulls: "last" } },
      { position: "asc" },
      { createdAt: "asc" },
    ],
    take: 300,
    select,
  });
  return rows.map(toRecord);
}

export async function findMilestone(
  ctx: WorkspaceContext,
  id: string,
): Promise<MilestoneRecord | null> {
  const row = await getPrisma().milestone.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select,
  });
  return row ? toRecord(row) : null;
}

export type SaveMilestoneResult =
  { status: "saved"; id: string } | { status: "not_found" } | { status: "duplicate" };

export async function insertMilestone(
  ctx: WorkspaceContext,
  projectId: string,
  fields: MilestoneFields,
): Promise<SaveMilestoneResult> {
  const ws = ctx.workspaceId;
  const prisma = getPrisma();
  if ((await prisma.project.count({ where: { id: projectId, workspaceId: ws } })) !== 1) {
    return { status: "not_found" };
  }
  if ((await prisma.milestone.count({ where: { projectId, name: fields.name } })) > 0) {
    return { status: "duplicate" };
  }
  const id = newId();
  const position = await prisma.milestone.count({ where: { projectId } });
  await prisma.milestone.create({
    data: { id, workspaceId: ws, projectId, position, createdById: ctx.userId, ...fields },
  });
  return { status: "saved", id };
}

export async function updateMilestoneRow(
  ctx: WorkspaceContext,
  id: string,
  fields: MilestoneFields,
): Promise<SaveMilestoneResult> {
  const prisma = getPrisma();
  const row = await prisma.milestone.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { projectId: true },
  });
  if (!row) return { status: "not_found" };
  const clash = await prisma.milestone.count({
    where: { projectId: row.projectId, name: fields.name, id: { not: id } },
  });
  if (clash > 0) return { status: "duplicate" };
  await prisma.milestone.update({ where: { id }, data: fields });
  return { status: "saved", id };
}

/** Deletes it; its tasks stay on the project, with no milestone. */
export async function deleteMilestoneRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ projectId: string } | null> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.milestone.findFirst({
      where: { id, workspaceId: ws },
      select: { projectId: true },
    });
    if (!row) return null;
    await tx.task.updateMany({
      where: { milestoneId: id, workspaceId: ws },
      data: { milestoneId: null },
    });
    await tx.milestone.delete({ where: { id } });
    return row;
  });
}
