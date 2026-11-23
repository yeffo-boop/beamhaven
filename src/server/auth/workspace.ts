import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { WorkspaceContext } from "@/server/data/context";
import { listMembershipsForUser } from "@/server/data/workspaces";

import { can, type Action } from "./permissions";
import { getSessionData } from "./session";

/**
 * Works out which household someone is acting in, and checks they belong to
 * it. This is the only place a WorkspaceContext is made.
 *
 * - With `requestedWorkspaceId`, it returns that household only if the person
 *   is a member, and null otherwise. Callers turn null into a 404, so nobody
 *   can tell whether another household's record exists (CLAUDE.md).
 * - Without it, it uses their oldest household.
 */
export async function resolveWorkspaceContext(
  userId: string,
  requestedWorkspaceId?: string | null,
): Promise<WorkspaceContext | null> {
  const memberships = await listMembershipsForUser(userId);
  const chosen = requestedWorkspaceId
    ? memberships.find((m) => m.workspaceId === requestedWorkspaceId)
    : memberships[0];
  return chosen ? { workspaceId: chosen.workspaceId, userId, role: chosen.role } : null;
}

/**
 * The signed-in person's current household, or null if they're signed out
 * or don't belong to any. Uses the household chosen for this browser, if it
 * is still one of theirs. Must sit inside <Suspense>, like getCurrentUser().
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await getSessionData();
  if (!session) return null;
  const { user, activeWorkspaceId } = session;
  return (
    (activeWorkspaceId && (await resolveWorkspaceContext(user.id, activeWorkspaceId))) ||
    resolveWorkspaceContext(user.id)
  );
});

/** For Server Actions and route handlers: the household, or back to the start. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/");
  return ctx;
}

export class PermissionError extends Error {
  constructor(action: Action) {
    super(`Not allowed: ${action}`);
  }
}

/** Throws unless the person's role allows the action (see permissions.ts). */
export function assertCan(ctx: WorkspaceContext, action: Action): void {
  if (!can(ctx, action)) throw new PermissionError(action);
}
