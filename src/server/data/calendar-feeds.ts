import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/** Private calendar links (ADR-045). Only a hash of each link's secret is kept. */

export type CalendarFeedInfo = { createdAt: Date; lastUsedAt: Date | null };

/** Saves a new link for this person in this household, replacing any old one. */
export async function saveCalendarFeed(ctx: WorkspaceContext, tokenHash: string): Promise<void> {
  await getPrisma().calendarFeed.upsert({
    where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: ctx.userId } },
    create: { id: newId(), workspaceId: ctx.workspaceId, userId: ctx.userId, tokenHash },
    update: { tokenHash, createdAt: new Date(), lastUsedAt: null },
  });
}

export async function deleteCalendarFeed(ctx: WorkspaceContext): Promise<void> {
  await getPrisma().calendarFeed.deleteMany({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId },
  });
}

export async function findCalendarFeedInfo(
  ctx: WorkspaceContext,
): Promise<CalendarFeedInfo | null> {
  return getPrisma().calendarFeed.findFirst({
    where: { workspaceId: ctx.workspaceId, userId: ctx.userId },
    select: { createdAt: true, lastUsedAt: true },
  });
}

/**
 * Looks a link up by its hash, for the feed route (which has no session).
 * The caller still checks the person belongs to the household before
 * reading anything, so a link stops working when they leave it.
 */
export async function findCalendarFeedByHash(
  tokenHash: string,
): Promise<{ id: string; workspaceId: string; userId: string } | null> {
  return getPrisma().calendarFeed.findUnique({
    where: { tokenHash },
    select: { id: true, workspaceId: true, userId: true },
  });
}

export async function touchCalendarFeed(id: string): Promise<void> {
  await getPrisma().calendarFeed.update({ where: { id }, data: { lastUsedAt: new Date() } });
}
