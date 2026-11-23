"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/server/auth/auth";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  InvitationError,
  newMemberSchema,
} from "@/server/auth/invitations";
import { requireUser } from "@/server/auth/session";
import { fieldErrors } from "@/server/auth/validation";
import { clientAddress, createRateLimiter } from "@/server/security/rate-limit";

export type JoinResult = { message?: string; fields?: Record<string, string> };

// Accepting invitations is public, so it is limited per visitor.
const joinLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

/** Creates the invited person's account, adds them to the household and signs them in. */
export async function joinAsNewUserAction(
  invitationId: string,
  _previous: JoinResult,
  formData: FormData,
): Promise<JoinResult> {
  if (!joinLimiter.attempt(await clientAddress())) {
    return { message: "Too many attempts. Please wait a few minutes and try again." };
  }
  const input = {
    name: formData.get("name"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };
  const parsed = newMemberSchema.safeParse(input);
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  let email: string;
  try {
    ({ email } = await acceptInvitationAsNewUser(invitationId, parsed.data));
  } catch (error) {
    if (error instanceof InvitationError) return { message: error.message };
    throw error;
  }
  // Sign straight in. nextCookies() puts the login cookie on this response.
  await getAuth().api.signInEmail({
    body: { email, password: parsed.data.password },
    headers: await headers(),
  });
  redirect("/");
}

/** Someone already signed in as the invited email joins the household. */
export async function joinAsExistingUserAction(invitationId: string): Promise<JoinResult> {
  const user = await requireUser();
  let workspaceId: string;
  try {
    ({ workspaceId } = await acceptInvitationAsExistingUser(invitationId, user));
  } catch (error) {
    if (error instanceof InvitationError) return { message: error.message };
    throw error;
  }
  // Switch this browser to the household they just joined.
  await getAuth().api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId: workspaceId },
  });
  redirect("/settings");
}
