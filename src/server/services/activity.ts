import "server-only";

import { assertCan } from "@/server/auth/permissions";
import {
  type ActivityInput,
  type ActivityItem,
  type FeedFilter,
  type FeedItem,
  findDeletedEntityIds,
  listActivityFor,
  listHouseholdActivity,
} from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";

/** Recent history for one record, for its detail page. */
export async function getActivity(
  ctx: WorkspaceContext,
  entityType: ActivityInput["entityType"],
  entityId: string,
): Promise<ActivityItem[]> {
  assertCan(ctx, "records:view");
  return listActivityFor(ctx, entityType, entityId);
}

export const ACTIVITY_TYPES = [
  "project",
  "room",
  "property",
  "expense",
  "contractor",
  "quote",
  "contract",
  "warranty",
  "material",
  "order",
  "appointment",
  "document",
  "board",
] as const satisfies readonly ActivityInput["entityType"][];

export const ACTIVITY_TYPE_LABELS: Record<(typeof ACTIVITY_TYPES)[number], string> = {
  project: "Projects",
  room: "Rooms",
  property: "Properties",
  expense: "Expenses",
  contractor: "Contractors",
  quote: "Quotes",
  contract: "Contracts",
  warranty: "Warranties",
  material: "Materials",
  order: "Orders",
  appointment: "Appointments",
  document: "Files",
  board: "Design boards",
};

const PATHS: Record<string, string> = {
  project: "/projects",
  room: "/rooms",
  property: "/properties",
  expense: "/budget/expenses",
  contractor: "/contractors",
  quote: "/quotes",
  contract: "/contracts",
  warranty: "/warranties",
  material: "/materials",
  order: "/orders",
  appointment: "/appointments",
  document: "/files",
  board: "/inspiration",
};

/**
 * Where an event's record lives. None when the event is the record being
 * deleted (there's nothing left to open) or for a kind with no page.
 */
export function activityHref(item: Pick<FeedItem, "action" | "entityType" | "entityId">) {
  const base = PATHS[item.entityType];
  if (!base || item.action === `${item.entityType}.deleted`) return null;
  return `${base}/${item.entityId}`;
}

export type FeedEntry = FeedItem & { href: string | null };

/** The household's history, newest first, each with a link to its record where it still exists. */
export async function getHouseholdActivity(
  ctx: WorkspaceContext,
  filter: FeedFilter = {},
): Promise<FeedEntry[]> {
  assertCan(ctx, "records:view");
  const items = await listHouseholdActivity(ctx, filter);
  const gone = await findDeletedEntityIds(ctx, [...new Set(items.map((i) => i.entityId))]);
  return items.map((item) => ({
    ...item,
    href: gone.has(item.entityId) ? null : activityHref(item),
  }));
}
