import { Client } from "pg";

import { getAuth } from "@/server/auth/auth";
import type { Role } from "@/server/auth/roles";
import { createWorkspaceWithOwner } from "@/server/data/workspaces";

export const TEST_PASSWORD = "integration-test-password";

/**
 * Test helpers for households. Real people can only join by invitation;
 * these shortcuts set up the same rows directly, so the tests can focus on
 * what each person is then allowed to see and do.
 */
export async function createUser(name: string): Promise<{ id: string; email: string }> {
  const ctx = await getAuth().$context;
  const email = `${name.toLowerCase()}@example.com`;
  const user = await ctx.internalAdapter.createUser(
    { name, email, emailVerified: true },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(TEST_PASSWORD),
  });
  return { id: user.id, email };
}

export async function createHousehold(name: string, ownerId: string): Promise<string> {
  return (await createWorkspaceWithOwner({ userId: ownerId, name })).id;
}

export async function addMember(workspaceId: string, userId: string, role: Role): Promise<void> {
  await getAuth().api.addMember({ body: { organizationId: workspaceId, userId, role } });
}

/** Signs in and returns request headers carrying that person's login cookie. */
export async function signedInHeaders(email: string): Promise<Headers> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password: TEST_PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers.get("set-cookie")?.split(";")[0] ?? "";
  return new Headers({ cookie });
}

/** The membership row's id (Better Auth's member endpoints take this, not the user id). */
export async function membershipId(workspaceId: string, userId: string): Promise<string> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM memberships WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("No such membership");
    return id;
  } finally {
    await client.end();
  }
}
