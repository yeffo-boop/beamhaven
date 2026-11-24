import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** In-app reminders (Milestone 7, part 3, ADR-033). */

export type ReminderFields = {
  workspaceId: string;
  userId: string;
  entryKey: string;
  kind: string;
  title: string;
  href: string;
  day: Date;
};

export type ReminderRecord = Omit<ReminderFields, "workspaceId" | "userId"> & {
  id: string;
  createdAt: Date;
  readAt: Date | null;
};

/** Every household and where it is. For the worker only. */
export async function listHouseholdZones(): Promise<{ id: string; timeZone: string }[]> {
  return getPrisma().workspace.findMany({ select: { id: true, timeZone: true } });
}

/** Who in a household gets reminders. For the worker only. */
export async function listMembersWithRoles(
  workspaceId: string,
): Promise<{ userId: string; role: string }[]> {
  return getPrisma().membership.findMany({
    where: { workspaceId },
    select: { userId: true, role: true },
  });
}

/** Saves new reminders, skipping any already there. Returns how many were new. */
export async function insertReminders(rows: ReminderFields[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await getPrisma().reminder.createMany({
    data: rows.map((r) => ({ id: newId(), ...r })),
    skipDuplicates: true,
  });
  return result.count;
}

/** The signed-in person's reminders in this household, newest first. */
export async function listReminders(
  ctx: WorkspaceContext,
  options: { unreadOnly?: boolean; take?: number } = {},
): Promise<ReminderRecord[]> {
  return getPrisma().reminder.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      ...(options.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { day: "asc" }],
    take: options.take ?? 100,
    select: {
      id: true,
      entryKey: true,
      kind: true,
      title: true,
      href: true,
      day: true,
      createdAt: true,
      readAt: true,
    },
  });
}

export async function countUnreadReminders(ctx: WorkspaceContext): Promise<number> {
  return getPrisma().reminder.count({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId, readAt: null },
  });
}

/** Marks one of the person's reminders read (or all of them, without an id). */
export async function markRemindersRead(ctx: WorkspaceContext, id?: string): Promise<number> {
  const result = await getPrisma().reminder.updateMany({
    where: {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      readAt: null,
      ...(id ? { id } : {}),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}
