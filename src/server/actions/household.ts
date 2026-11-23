"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/server/auth/auth";
import { cancelInvitation, createInvitationLink, inviteSchema } from "@/server/auth/invitations";
import {
  createPasswordResetLinkForMember,
  ResetNotAllowedError,
} from "@/server/auth/password-reset";
import { fieldErrors } from "@/server/auth/validation";
import { ROLES } from "@/server/auth/roles";
import { assertCan, PermissionError, requireWorkspace } from "@/server/auth/workspace";
import { listMembers } from "@/server/data/workspaces";
import { createRateLimiter } from "@/server/security/rate-limit";

// Owners can make links freely, but not thousands of them.
const linkLimiter = createRateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });
const tooMany: LinkResult = {
  status: "error",
  message: "Too many links in a short time. Please wait a while and try again.",
};

export type LinkResult =
  | { status: "idle" }
  | { status: "done"; link: string }
  | { status: "error"; message: string; fields?: Record<string, string> };

const notAllowed: LinkResult = { status: "error", message: "Only household owners can do that." };

export async function inviteAction(_previous: LinkResult, formData: FormData): Promise<LinkResult> {
  const ctx = await requireWorkspace();
  if (!linkLimiter.attempt(ctx.userId)) return tooMany;
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fields: fieldErrors(parsed.error),
    };
  }
  try {
    const link = await createInvitationLink(ctx, await headers(), parsed.data);
    refresh();
    return { status: "done", link };
  } catch (error) {
    if (error instanceof PermissionError) return notAllowed;
    // Better Auth refuses, for example, inviting someone who's already a member.
    return {
      status: "error",
      message: errorMessage(error, "That invitation couldn't be created."),
    };
  }
}

export async function cancelInvitationAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const invitationId = z.string().min(1).parse(formData.get("invitationId"));
  await cancelInvitation(ctx, await headers(), invitationId);
  refresh();
}

export async function resetLinkAction(
  _previous: LinkResult,
  formData: FormData,
): Promise<LinkResult> {
  const ctx = await requireWorkspace();
  if (!linkLimiter.attempt(ctx.userId)) return tooMany;
  const userId = z.string().min(1).safeParse(formData.get("userId"));
  if (!userId.success) return { status: "error", message: "Something went wrong." };
  try {
    return { status: "done", link: await createPasswordResetLinkForMember(ctx, userId.data) };
  } catch (error) {
    if (error instanceof PermissionError) return notAllowed;
    if (error instanceof ResetNotAllowedError) return { status: "error", message: error.message };
    throw error;
  }
}

/**
 * Finds someone else's membership in the current household. Returns null for
 * yourself (so an owner can't demote or remove themselves and leave the
 * household without an owner) and for anyone not in this household.
 */
async function otherMember(formData: FormData) {
  const ctx = await requireWorkspace();
  assertCan(ctx, "members:manage");
  const userId = z.string().min(1).parse(formData.get("userId"));
  if (userId === ctx.userId) return null;
  const member = (await listMembers(ctx)).find((m) => m.userId === userId);
  return member ? { ctx, member } : null;
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const target = await otherMember(formData);
  if (!target) return;
  const role = z.enum(ROLES).parse(formData.get("role"));
  await getAuth().api.updateMemberRole({
    headers: await headers(),
    body: { organizationId: target.ctx.workspaceId, memberId: target.member.membershipId, role },
  });
  refresh();
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const target = await otherMember(formData);
  if (!target) return;
  await getAuth().api.removeMember({
    headers: await headers(),
    body: { organizationId: target.ctx.workspaceId, memberIdOrEmail: target.member.membershipId },
  });
  refresh();
}

/** Better Auth's errors carry a readable message; anything else gets a generic one. */
function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { message?: unknown } }).body;
    if (typeof body?.message === "string") return body.message;
  }
  return fallback;
}
