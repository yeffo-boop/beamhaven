import "server-only";

import { getPrisma } from "./client";
import { unlinkProjectOrRoom } from "./contractors";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

export type ProjectFields = {
  name: string;
  description: string | null;
  status: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
};

export type ProjectSummary = ProjectFields & {
  id: string;
  propertyId: string;
  propertyName: string;
  roomCount: number;
  budgetLockedAt: Date | null;
  updatedAt: Date;
};

const summarySelect = {
  id: true,
  propertyId: true,
  name: true,
  description: true,
  status: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  updatedAt: true,
  budgetLockedAt: true,
  property: { select: { name: true } },
  _count: { select: { rooms: true } },
} as const;

type SummaryRow = {
  property: { name: string };
  _count: { rooms: number };
} & Omit<ProjectSummary, "propertyName" | "roomCount">;

function toSummary({ property, _count, ...row }: SummaryRow): ProjectSummary {
  return { ...row, propertyName: property.name, roomCount: _count.rooms };
}

export async function listProjects(ctx: WorkspaceContext): Promise<ProjectSummary[]> {
  const rows = await getPrisma().project.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ updatedAt: "desc" }],
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export type ProjectRoomLink = {
  roomId: string;
  roomName: string;
  plannedImprovements: string | null;
};

export type ProjectDetail = ProjectSummary & { rooms: ProjectRoomLink[] };

/** Null when it doesn't exist or belongs to another household (callers answer 404). */
export async function findProject(
  ctx: WorkspaceContext,
  id: string,
): Promise<ProjectDetail | null> {
  const row = await getPrisma().project.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      ...summarySelect,
      rooms: {
        orderBy: { room: { name: "asc" } },
        select: { roomId: true, plannedImprovements: true, room: { select: { name: true } } },
      },
    },
  });
  if (!row) return null;
  const { rooms, ...summary } = row;
  return {
    ...toSummary(summary),
    rooms: rooms.map((r) => ({
      roomId: r.roomId,
      roomName: r.room.name,
      plannedImprovements: r.plannedImprovements,
    })),
  };
}

/**
 * The property must already be known to belong to this household; the
 * composite foreign key refuses it otherwise.
 */
export async function insertProject(
  ctx: WorkspaceContext,
  propertyId: string,
  fields: ProjectFields,
): Promise<{ id: string }> {
  return getPrisma().project.create({
    data: {
      id: newId(),
      workspaceId: ctx.workspaceId,
      propertyId,
      createdById: ctx.userId,
      ...fields,
    },
    select: { id: true },
  });
}

export async function updateProjectRow(
  ctx: WorkspaceContext,
  id: string,
  fields: ProjectFields,
): Promise<boolean> {
  const result = await getPrisma().project.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}

/** Deletes the project and its room links and attachments. Returns the files it used. */
export async function deleteProjectRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ deleted: boolean; hasBudget: boolean; fileIds: string[] }> {
  return getPrisma().$transaction(async (tx) => {
    // Empty budget lines go with the project; money recorded against them
    // (or transfers touching them) keeps the project.
    const recorded = await tx.budgetLine.count({
      where: {
        projectId: id,
        workspaceId: ctx.workspaceId,
        OR: [
          { adjustments: { some: {} } },
          { transfersIn: { some: {} } },
          { transfersOut: { some: {} } },
          { commitments: { some: {} } },
          { allocations: { some: {} } },
        ],
      },
    });
    if (recorded > 0) return { deleted: false, hasBudget: true, fileIds: [] };
    const warrantyFiles = await unlinkProjectOrRoom(tx, ctx.workspaceId, { projectId: id });
    // The project's photos, and the documents of its open or turned-down
    // quotes (which go with it). Contracts always hold budget money, so a
    // project with one never gets this far.
    const attachments = await tx.attachment.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        OR: [{ projectId: id }, { quote: { projectId: id } }],
      },
      select: { fileId: true },
    });
    const result = await tx.project.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
    return {
      deleted: result.count === 1,
      hasBudget: false,
      fileIds: [...warrantyFiles, ...attachments.map((a) => a.fileId)],
    };
  });
}

/**
 * Links rooms to a project, replacing the previous set. Both must belong to
 * this household (checked here, and by the composite foreign keys).
 */
export async function setProjectRooms(
  ctx: WorkspaceContext,
  projectId: string,
  links: { roomId: string; plannedImprovements: string | null }[],
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspaceId },
      select: { propertyId: true },
    });
    if (!project) return false;
    const roomIds = links.map((l) => l.roomId);
    const validRooms = await tx.room.count({
      where: { id: { in: roomIds }, workspaceId: ctx.workspaceId, propertyId: project.propertyId },
    });
    if (validRooms !== new Set(roomIds).size) return false;
    await tx.projectRoom.deleteMany({ where: { projectId, workspaceId: ctx.workspaceId } });
    if (links.length > 0) {
      await tx.projectRoom.createMany({
        data: links.map((l) => ({ ...l, projectId, workspaceId: ctx.workspaceId })),
      });
    }
    return true;
  });
}
