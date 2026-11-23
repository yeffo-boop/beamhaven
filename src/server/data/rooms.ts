import "server-only";

import { getPrisma } from "./client";
import { unlinkProjectOrRoom } from "./contractors";
import type { WorkspaceContext } from "./context";
import { dropRoomFromEstimates } from "./estimates";
import { newId } from "./ids";

export type RoomFields = {
  name: string;
  type: string;
  floorLevel: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  ceilingHeightMm: number | null;
  enteredUnit: string;
  description: string | null;
  notes: string | null;
};

export type OpeningSummary = {
  id: string;
  kind: string;
  label: string | null;
  widthMm: number;
  heightMm: number;
  sillHeightMm: number | null;
  enteredUnit: string;
};

export type RoomSummary = RoomFields & {
  id: string;
  propertyId: string;
  propertyName: string;
  openings: OpeningSummary[];
  projectCount: number;
};

const openingSelect = {
  id: true,
  kind: true,
  label: true,
  widthMm: true,
  heightMm: true,
  sillHeightMm: true,
  enteredUnit: true,
} as const;

const summarySelect = {
  id: true,
  propertyId: true,
  name: true,
  type: true,
  floorLevel: true,
  lengthMm: true,
  widthMm: true,
  ceilingHeightMm: true,
  enteredUnit: true,
  description: true,
  notes: true,
  property: { select: { name: true } },
  openings: { orderBy: { createdAt: "asc" }, select: openingSelect },
  _count: { select: { projects: true } },
} as const;

type SummaryRow = {
  property: { name: string };
  _count: { projects: number };
} & Omit<RoomSummary, "propertyName" | "projectCount">;

function toSummary({ property, _count, ...row }: SummaryRow): RoomSummary {
  return { ...row, propertyName: property.name, projectCount: _count.projects };
}

export async function listRooms(ctx: WorkspaceContext): Promise<RoomSummary[]> {
  const rows = await getPrisma().room.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ floorLevel: "asc" }, { name: "asc" }],
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export type RoomProjectLink = {
  projectId: string;
  projectName: string;
  status: string;
  plannedImprovements: string | null;
};

export type RoomDetail = RoomSummary & { projects: RoomProjectLink[] };

/** Null when it doesn't exist or belongs to another household (callers answer 404). */
export async function findRoom(ctx: WorkspaceContext, id: string): Promise<RoomDetail | null> {
  const row = await getPrisma().room.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      ...summarySelect,
      projects: {
        orderBy: { project: { updatedAt: "desc" } },
        select: {
          projectId: true,
          plannedImprovements: true,
          project: { select: { name: true, status: true } },
        },
      },
    },
  });
  if (!row) return null;
  const { projects, ...summary } = row;
  return {
    ...toSummary(summary),
    projects: projects.map((p) => ({
      projectId: p.projectId,
      projectName: p.project.name,
      status: p.project.status,
      plannedImprovements: p.plannedImprovements,
    })),
  };
}

export async function insertRoom(
  ctx: WorkspaceContext,
  propertyId: string,
  fields: RoomFields,
): Promise<{ id: string }> {
  return getPrisma().room.create({
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

export async function updateRoomRow(
  ctx: WorkspaceContext,
  id: string,
  fields: RoomFields,
): Promise<boolean> {
  const result = await getPrisma().room.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}

/** Deletes the room, its openings, links and attachments. Returns the files it used. */
export async function deleteRoomRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ deleted: boolean; hasBudget: boolean; fileIds: string[]; estimateIds: string[] }> {
  return getPrisma().$transaction(async (tx) => {
    const lines = await tx.budgetLine.count({
      where: { roomId: id, workspaceId: ctx.workspaceId },
    });
    if (lines > 0) return { deleted: false, hasBudget: true, fileIds: [], estimateIds: [] };
    // Room estimates that measured it carry on without it.
    const estimateIds = await dropRoomFromEstimates(tx, ctx.workspaceId, id);
    const warrantyFiles = await unlinkProjectOrRoom(tx, ctx.workspaceId, { roomId: id });
    const attachments = await tx.attachment.findMany({
      where: { roomId: id, workspaceId: ctx.workspaceId },
      select: { fileId: true },
    });
    const result = await tx.room.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
    return {
      deleted: result.count === 1,
      hasBudget: false,
      fileIds: [...warrantyFiles, ...attachments.map((a) => a.fileId)],
      estimateIds,
    };
  });
}

export type OpeningFields = Omit<OpeningSummary, "id"> & { notes: string | null };

export async function insertOpening(
  ctx: WorkspaceContext,
  roomId: string,
  fields: OpeningFields,
): Promise<{ id: string } | null> {
  const room = await getPrisma().room.findFirst({
    where: { id: roomId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!room) return null;
  return getPrisma().opening.create({
    data: { id: newId(), workspaceId: ctx.workspaceId, roomId, ...fields },
    select: { id: true },
  });
}

/** Removes an opening from a room in this household. */
export async function deleteOpeningRow(
  ctx: WorkspaceContext,
  roomId: string,
  openingId: string,
): Promise<boolean> {
  const result = await getPrisma().opening.deleteMany({
    where: { id: openingId, roomId, workspaceId: ctx.workspaceId },
  });
  return result.count === 1;
}
