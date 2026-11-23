import "server-only";

import { z } from "zod";

import { getEnv } from "@/config/env";
import { absoluteUrl } from "@/lib/url";
import type { WorkspaceContext } from "@/server/data/context";
import { claimInvitation, findInvitation, type InvitationDetails } from "@/server/data/invitations";
import { findUserIdByEmail } from "@/server/data/users";

import { getAuth } from "./auth";
import { ROLES } from "./roles";
import { emailSchema, passwordSchema, personNameSchema } from "./validation";
import { assertCan } from "./workspace";

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES, { message: "Choose a role" }),
});

/** The link someone opens to join. Built from APP_URL, never a fixed domain. */
export function invitationLink(invitationId: string): string {
  return absoluteUrl(getEnv().APP_URL, `/invite/${invitationId}`);
}

/**
 * Creates an invitation and returns its link for the owner to send.
 * Better Auth checks again that the person asking is an owner of this
 * household (requestHeaders carry their login).
 */
export async function createInvitationLink(
  ctx: WorkspaceContext,
  requestHeaders: Headers,
  input: z.input<typeof inviteSchema>,
): Promise<string> {
  assertCan(ctx, "members:manage");
  const { email, role } = inviteSchema.parse(input);
  const invitation = await getAuth().api.createInvitation({
    headers: requestHeaders,
    body: { organizationId: ctx.workspaceId, email, role },
  });
  return invitationLink(invitation.id);
}

export async function cancelInvitation(
  ctx: WorkspaceContext,
  requestHeaders: Headers,
  invitationId: string,
): Promise<void> {
  assertCan(ctx, "members:manage");
  const invitation = await findInvitation(invitationId);
  // Another household's invitation is treated as if it doesn't exist.
  if (!invitation || invitation.workspaceId !== ctx.workspaceId) return;
  await getAuth().api.cancelInvitation({ headers: requestHeaders, body: { invitationId } });
}

export type InvitationState =
  { kind: "usable"; invitation: InvitationDetails; hasAccount: boolean } | { kind: "unusable" };

/**
 * What the invitation page should show. Used, cancelled, expired and
 * made-up links all look the same, so the page reveals nothing about them.
 */
export async function getInvitationState(invitationId: string): Promise<InvitationState> {
  const invitation = await findInvitation(invitationId);
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date()) {
    return { kind: "unusable" };
  }
  const hasAccount = (await findUserIdByEmail(invitation.email)) !== null;
  return { kind: "usable", invitation, hasAccount };
}

export const newMemberSchema = z
  .object({
    name: personNameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords don't match",
    path: ["confirmPassword"],
  });

export class InvitationError extends Error {}

/**
 * Someone without an account accepts an invitation: creates their login
 * with the invited email, then adds them to the household.
 * Returns their email so the caller can sign them in.
 */
export async function acceptInvitationAsNewUser(
  invitationId: string,
  input: z.input<typeof newMemberSchema>,
): Promise<{ email: string }> {
  const data = newMemberSchema.parse(input);
  const state = await getInvitationState(invitationId);
  if (state.kind !== "usable" || state.hasAccount) {
    throw new InvitationError("This invitation link can't be used to create an account.");
  }

  const ctx = await getAuth().$context;
  const user = await ctx.internalAdapter.createUser(
    // The owner chose this email when inviting; the person proved they got
    // the link, which is as much checking as we can do without email.
    { name: data.name, email: state.invitation.email, emailVerified: false },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(data.password),
  });

  if (!(await claimInvitation(invitationId, user.id))) {
    // Someone used the link a split second earlier. Remove the half-made
    // account so the email isn't left stuck.
    await ctx.internalAdapter.deleteUser(user.id);
    throw new InvitationError("This invitation link has already been used.");
  }
  return { email: state.invitation.email };
}

/**
 * Someone who already has an account (and is signed in as the invited email)
 * joins another household.
 */
export async function acceptInvitationAsExistingUser(
  invitationId: string,
  user: { id: string; email: string },
): Promise<{ workspaceId: string }> {
  const state = await getInvitationState(invitationId);
  if (state.kind !== "usable" || state.invitation.email !== user.email.toLowerCase()) {
    throw new InvitationError("This invitation is for a different email address.");
  }
  const claimed = await claimInvitation(invitationId, user.id);
  if (!claimed) throw new InvitationError("This invitation link has already been used.");
  return claimed;
}
