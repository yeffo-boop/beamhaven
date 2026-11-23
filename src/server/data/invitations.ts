import "server-only";

import { randomUUID } from "node:crypto";

import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";

export type InvitationDetails = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  workspaceId: string;
  workspaceName: string;
  inviterName: string;
};

/**
 * Looks up an invitation by its id, which is the secret part of the link.
 * Not scoped by household: the person opening the link isn't a member yet.
 * The id is long and random, so it can't be guessed.
 */
export async function findInvitation(invitationId: string): Promise<InvitationDetails | null> {
  const row = await getPrisma().invitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      workspaceId: true,
      workspace: { select: { name: true } },
      inviter: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role ?? "member",
    status: row.status,
    expiresAt: row.expiresAt,
    workspaceId: row.workspaceId,
    workspaceName: row.workspace.name,
    inviterName: row.inviter.name,
  };
}

export type PendingInvitation = { id: string; email: string; role: string; expiresAt: Date };

/** Invitations in the current household that haven't been used, cancelled or expired. */
export async function listPendingInvitations(ctx: WorkspaceContext): Promise<PendingInvitation[]> {
  const rows = await getPrisma().invitation.findMany({
    where: { workspaceId: ctx.workspaceId, status: "pending", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  return rows.map((row) => ({ ...row, role: row.role ?? "member" }));
}

/**
 * Uses up an invitation and adds the person to its household, as one step.
 * The status check inside the update means two people racing to use the
 * same link can't both succeed.
 */
export async function claimInvitation(
  invitationId: string,
  userId: string,
): Promise<{ workspaceId: string } | null> {
  return getPrisma().$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { id: invitationId },
      select: { workspaceId: true, role: true },
    });
    if (!invitation) return null;
    const claimed = await tx.invitation.updateMany({
      where: { id: invitationId, status: "pending", expiresAt: { gt: new Date() } },
      data: { status: "accepted" },
    });
    if (claimed.count !== 1) return null;
    await tx.membership.create({
      data: {
        id: randomUUID().replaceAll("-", ""),
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role ?? "member",
      },
    });
    return { workspaceId: invitation.workspaceId };
  });
}
