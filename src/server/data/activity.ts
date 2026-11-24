import "server-only";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

export type ActivityInput = {
  action: string;
  entityType:
    | "property"
    | "project"
    | "room"
    | "expense"
    | "contractor"
    | "warranty"
    | "quote"
    | "contract"
    | "material"
    | "order"
    | "appointment"
    | "document"
    | "board";
  entityId: string;
  summary: string;
};

/** Records who did what. Called by the services after a change succeeds. */
export async function recordActivity(ctx: WorkspaceContext, input: ActivityInput): Promise<void> {
  await getPrisma().activityEvent.create({
    data: { id: newId(), workspaceId: ctx.workspaceId, actorUserId: ctx.userId, ...input },
  });
}

export type ActivityItem = {
  id: string;
  summary: string;
  actorName: string | null;
  createdAt: Date;
};

/** The latest events for one record, newest first. */
export async function listActivityFor(
  ctx: WorkspaceContext,
  entityType: ActivityInput["entityType"],
  entityId: string,
  limit = 20,
): Promise<ActivityItem[]> {
  const rows = await getPrisma().activityEvent.findMany({
    where: { workspaceId: ctx.workspaceId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, summary: true, actorUserId: true, createdAt: true },
  });
  const actorIds = [...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))];
  const actors = await getPrisma().user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
    createdAt: r.createdAt,
  }));
}

export type FeedItem = ActivityItem & {
  action: string;
  entityType: string;
  entityId: string;
};

export type FeedFilter = {
  /** Only events older than this, for the next page. */
  before?: Date;
  entityType?: ActivityInput["entityType"];
  limit?: number;
};

/** The household's history, newest first (Milestone 9, part 1). */
export async function listHouseholdActivity(
  ctx: WorkspaceContext,
  filter: FeedFilter = {},
): Promise<FeedItem[]> {
  const rows = await getPrisma().activityEvent.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.before ? { createdAt: { lt: filter.before } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(filter.limit ?? 50, 200),
    select: {
      id: true,
      summary: true,
      actorUserId: true,
      createdAt: true,
      action: true,
      entityType: true,
      entityId: true,
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

/** Which of these records have a "deleted" event, so older events about them can drop their link. */
export async function findDeletedEntityIds(
  ctx: WorkspaceContext,
  entityIds: string[],
): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set();
  const rows = await getPrisma().activityEvent.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      entityId: { in: entityIds },
      action: { endsWith: ".deleted" },
    },
    select: { entityId: true, entityType: true, action: true },
  });
  return new Set(rows.filter((r) => r.action === `${r.entityType}.deleted`).map((r) => r.entityId));
}
