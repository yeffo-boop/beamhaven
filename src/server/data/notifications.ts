import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** Notifications about what others did (Milestone 9, part 4, ADR-040). */

export const NOTIFICATION_KINDS = [
  "task_assigned",
  "task_done",
  "quote_decided",
  "board_item_approved",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NewNotification = {
  userId: string;
  kind: NotificationKind;
  summary: string;
  href: string;
};

/**
 * Writes notifications from the person in `ctx` to others. Never to the
 * person themselves, and only to people who are still members of this
 * household, so nothing leaks to someone who has left.
 */
export async function insertNotifications(
  ctx: WorkspaceContext,
  notes: NewNotification[],
): Promise<number> {
  const wanted = notes.filter((n) => n.userId !== ctx.userId);
  if (wanted.length === 0) return 0;
  const members = await getPrisma().membership.findMany({
    where: { workspaceId: ctx.workspaceId, userId: { in: wanted.map((n) => n.userId) } },
    select: { userId: true },
  });
  const allowed = new Set(members.map((m) => m.userId));
  const seen = new Set<string>();
  const rows = wanted.filter((n) => {
    // One per person for the same thing, even if they were both creator and assignee.
    const key = `${n.userId}|${n.kind}|${n.href}`;
    if (!allowed.has(n.userId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (rows.length === 0) return 0;
  const result = await getPrisma().notification.createMany({
    data: rows.map((n) => ({
      id: newId(),
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      ...n,
    })),
  });
  return result.count;
}

export type NotificationRecord = {
  id: string;
  kind: string;
  actorName: string | null;
  summary: string;
  href: string;
  createdAt: Date;
  readAt: Date | null;
};

/** The person's own notifications in this household, newest first. */
export async function listNotifications(
  ctx: WorkspaceContext,
  options: { take?: number } = {},
): Promise<NotificationRecord[]> {
  const rows = await getPrisma().notification.findMany({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.take ?? 100,
    select: {
      id: true,
      kind: true,
      actorUserId: true,
      summary: true,
      href: true,
      createdAt: true,
      readAt: true,
    },
  });
  const actorIds = [...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))];
  const actors = actorIds.length
    ? await getPrisma().user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map(({ actorUserId, ...r }) => ({
    ...r,
    actorName: actorUserId ? (names.get(actorUserId) ?? null) : null,
  }));
}

export async function countUnreadNotifications(ctx: WorkspaceContext): Promise<number> {
  return getPrisma().notification.count({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId, readAt: null },
  });
}

/** Marks one of the person's notifications read (or all of them, without an id). */
export async function markNotificationsRead(ctx: WorkspaceContext, id?: string): Promise<number> {
  const result = await getPrisma().notification.updateMany({
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

/** Who made a task and who it's for, to tell them about changes others make. */
export async function findTaskPeople(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ title: string; createdById: string | null; assigneeUserId: string | null } | null> {
  return getPrisma().task.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { title: true, createdById: true, assigneeUserId: true },
  });
}

/** Who entered a quote. */
export async function findQuoteCreator(ctx: WorkspaceContext, id: string): Promise<string | null> {
  const row = await getPrisma().quote.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { createdById: true },
  });
  return row?.createdById ?? null;
}

/** Who started a design board. */
export async function findBoardCreator(ctx: WorkspaceContext, id: string): Promise<string | null> {
  const row = await getPrisma().designBoard.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { createdById: true },
  });
  return row?.createdById ?? null;
}
