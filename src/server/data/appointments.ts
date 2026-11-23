import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** Appointments and inspections (Milestone 7, part 2, ADR-032). */

export type AppointmentFields = {
  title: string;
  kind: string;
  day: Date;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  projectId: string | null;
  roomId: string | null;
  contractorId: string | null;
  outcome: string | null;
  notes: string | null;
};

export type AppointmentRecord = AppointmentFields & {
  id: string;
  projectName: string | null;
  roomName: string | null;
  contractorName: string | null;
};

async function linksInHousehold(ws: string, f: AppointmentFields): Promise<boolean> {
  const prisma = getPrisma();
  const counts = await Promise.all([
    f.projectId ? prisma.project.count({ where: { id: f.projectId, workspaceId: ws } }) : 1,
    f.roomId ? prisma.room.count({ where: { id: f.roomId, workspaceId: ws } }) : 1,
    f.contractorId
      ? prisma.contractor.count({ where: { id: f.contractorId, workspaceId: ws } })
      : 1,
  ]);
  return counts.every((n) => n === 1);
}

export async function insertAppointment(
  ctx: WorkspaceContext,
  fields: AppointmentFields,
): Promise<{ id: string } | null> {
  if (!(await linksInHousehold(ctx.workspaceId, fields))) return null;
  const id = newId();
  await getPrisma().appointment.create({
    data: { id, workspaceId: ctx.workspaceId, createdById: ctx.userId, ...fields },
  });
  return { id };
}

export async function updateAppointmentRow(
  ctx: WorkspaceContext,
  id: string,
  fields: AppointmentFields,
): Promise<boolean> {
  if (!(await linksInHousehold(ctx.workspaceId, fields))) return false;
  const result = await getPrisma().appointment.updateMany({
    where: { id, workspaceId: ctx.workspaceId },
    data: fields,
  });
  return result.count === 1;
}

export async function deleteAppointmentRow(ctx: WorkspaceContext, id: string): Promise<boolean> {
  const result = await getPrisma().appointment.deleteMany({
    where: { id, workspaceId: ctx.workspaceId },
  });
  return result.count === 1;
}

export async function listAppointments(
  ctx: WorkspaceContext,
  where: {
    id?: string;
    projectId?: string;
    roomId?: string;
    contractorId?: string;
    from?: Date;
    to?: Date;
  },
): Promise<AppointmentRecord[]> {
  const { from, to, ...links } = where;
  const rows = await getPrisma().appointment.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...links,
      ...(from || to
        ? { day: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: [{ day: "asc" }, { startTime: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      title: true,
      kind: true,
      day: true,
      startTime: true,
      endTime: true,
      location: true,
      projectId: true,
      roomId: true,
      contractorId: true,
      outcome: true,
      notes: true,
      project: { select: { name: true } },
      room: { select: { name: true } },
      contractor: { select: { vendor: { select: { name: true } } } },
    },
  });
  return rows.map(({ project, room, contractor, ...row }) => ({
    ...row,
    projectName: project?.name ?? null,
    roomName: room?.name ?? null,
    contractorName: contractor?.vendor.name ?? null,
  }));
}
