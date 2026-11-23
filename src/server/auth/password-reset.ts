import "server-only";

import { generateRandomString } from "better-auth/crypto";

import { getEnv } from "@/config/env";
import { absoluteUrl } from "@/lib/url";
import type { WorkspaceContext } from "@/server/data/context";
import { getMemberStanding } from "@/server/data/workspaces";

import { getAuth } from "./auth";
import { assertCan, PermissionError } from "./permissions";

/** Owner-made reset links last a day, because they're passed on by hand. */
const RESET_LINK_HOURS = 24;

/**
 * Makes a one-time password-reset link for an account.
 *
 * Until email is set up there is nowhere to send it, so the link is shown to
 * whoever asked (a household owner, or the server admin through the
 * Terminal command) to pass on. The token is stored exactly the way Better
 * Auth's own "forgot password" feature stores it, so Better Auth's
 * reset-password endpoint checks it, uses it up and signs the person out of
 * every device.
 */
export async function createPasswordResetLink(userId: string): Promise<string> {
  const ctx = await getAuth().$context;
  const token = generateRandomString(32, "a-z", "A-Z", "0-9");
  await ctx.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + RESET_LINK_HOURS * 60 * 60 * 1000),
  });
  return absoluteUrl(getEnv().APP_URL, `/reset-password?token=${token}`);
}

/**
 * An owner makes a reset link for someone in their household.
 *
 * Only for people whose only household is this one: otherwise an owner of
 * one household could take over the login of someone who also belongs to a
 * different household.
 */
export async function createPasswordResetLinkForMember(
  ctx: WorkspaceContext,
  userId: string,
): Promise<string> {
  assertCan(ctx, "members:manage");
  const standing = await getMemberStanding(ctx, userId);
  if (!standing.isMember) throw new PermissionError("members:manage");
  if (standing.householdCount > 1) {
    throw new ResetNotAllowedError(
      "This person also belongs to another household, so only the server admin can make a reset link for them (npm run password-reset-link).",
    );
  }
  return createPasswordResetLink(userId);
}

export class ResetNotAllowedError extends Error {}
