import type { Role } from "@/server/auth/roles";

/**
 * Who is asking, and in which household. Every function in src/server/data/
 * that reads or changes household records takes one of these, and filters by
 * `workspaceId` (ADR-007).
 *
 * Only resolveWorkspaceContext() in src/server/auth/workspace.ts creates
 * them, after checking the person really is a member of that household.
 */
export type WorkspaceContext = {
  readonly workspaceId: string;
  readonly userId: string;
  readonly role: Role;
};
