import "server-only";

import { assertCan } from "@/server/auth/permissions";
import { type ActivityInput, type ActivityItem, listActivityFor } from "@/server/data/activity";
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
