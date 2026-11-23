import "server-only";

import { randomUUID } from "node:crypto";

import { isRole, type Role } from "@/server/auth/roles";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";

export type MembershipSummary = { workspaceId: string; workspaceName: string; role: Role };

/**
 * The households a person belongs to, oldest first. Used to decide which
 * household they're working in, so it's keyed by user rather than workspace.
 */
export async function listMembershipsForUser(userId: string): Promise<MembershipSummary[]> {
  const rows = await getPrisma().membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true, workspace: { select: { name: true } } },
  });
  return rows.flatMap((row) =>
    isRole(row.role)
      ? [{ workspaceId: row.workspaceId, workspaceName: row.workspace.name, role: row.role }]
      : [],
  );
}

export type WorkspaceSummary = { id: string; name: string; kind: string };

export async function getWorkspace(ctx: WorkspaceContext): Promise<WorkspaceSummary> {
  return getPrisma().workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { id: true, name: true, kind: true },
  });
}

export type MemberSummary = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

/** Everyone in the current household. */
export async function listMembers(ctx: WorkspaceContext): Promise<MemberSummary[]> {
  const rows = await getPrisma().membership.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map(({ id, role, user }) => ({
    membershipId: id,
    userId: user.id,
    name: user.name,
    email: user.email,
    role,
  }));
}

/**
 * Creates a household with one owner, in a single step, so a household can
 * never exist without an owner. Only called by trusted server code (the
 * setup command), never directly from a browser request.
 */
export async function createWorkspaceWithOwner(input: {
  userId: string;
  name: string;
}): Promise<{ id: string }> {
  const id = randomId();
  await getPrisma().workspace.create({
    data: {
      id,
      name: input.name,
      // Better Auth needs a unique slug; we don't use it in addresses.
      slug: `household-${id}`,
      kind: "household",
      memberships: { create: { id: randomId(), userId: input.userId, role: "owner" } },
    },
  });
  return { id };
}

function randomId(): string {
  return randomUUID().replaceAll("-", "");
}

/** Whether someone belongs to the current household, and how many households they're in. */
export async function getMemberStanding(
  ctx: WorkspaceContext,
  userId: string,
): Promise<{ isMember: boolean; householdCount: number }> {
  const memberships = await getPrisma().membership.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return {
    isMember: memberships.some((m) => m.workspaceId === ctx.workspaceId),
    householdCount: memberships.length,
  };
}

/** Renames the current household. Callers check the role first (workspace:manage). */
export async function renameWorkspace(ctx: WorkspaceContext, name: string): Promise<void> {
  await getPrisma().workspace.update({ where: { id: ctx.workspaceId }, data: { name } });
}
