import "server-only";

import type { WorkspaceContext } from "@/server/data/context";

/**
 * A read-only context for the background worker (ADR-033), which acts for no
 * person. It has the viewer role, so every service that changes something
 * refuses it; the worker only reads the calendar through it. Never use it to
 * answer a request from a browser.
 */
export function systemWorkspaceContext(workspaceId: string): WorkspaceContext {
  return { workspaceId, userId: "system", role: "viewer" };
}
