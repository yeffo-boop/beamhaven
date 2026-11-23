import "server-only";

import { z } from "zod";

import { countUsers } from "@/server/data/users";
import { createWorkspaceWithOwner } from "@/server/data/workspaces";

import { getAuth, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./auth";

export const firstAccountSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100, "That name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: "Enter a valid email address" })),
  householdName: z
    .string()
    .trim()
    .min(1, "Enter a household name")
    .max(100, "That household name is too long"),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
});

export type FirstAccountInput = z.input<typeof firstAccountSchema>;

export class FirstAccountError extends Error {}

/**
 * Creates the very first login, and a household with that person as its
 * owner. Public sign-up is switched off, so this is
 * the only way in until invitations exist (Milestone 2, step 3).
 *
 * It refuses to run once any account exists, so it can't be used later to
 * slip an extra account in.
 */
export async function createFirstAccount(
  input: FirstAccountInput,
): Promise<{ id: string; email: string; workspaceId: string }> {
  const data = firstAccountSchema.parse(input);

  if ((await countUsers()) > 0) {
    throw new FirstAccountError(
      "An account already exists, so this one-time setup has already been done. " +
        "Further people join by invitation.",
    );
  }

  // Use Better Auth's own internals, so the password is hashed and stored
  // exactly the way its sign-in expects (scrypt, in the accounts table).
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(data.password);
  const user = await ctx.internalAdapter.createUser(
    {
      name: data.name,
      email: data.email,
      // Set by the server owner directly, so there is nothing to verify.
      emailVerified: true,
    },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hash,
  });
  const workspace = await createWorkspaceWithOwner({ userId: user.id, name: data.householdName });
  return { id: user.id, email: user.email, workspaceId: workspace.id };
}
