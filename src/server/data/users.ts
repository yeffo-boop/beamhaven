import "server-only";

import { getPrisma } from "./client";

/**
 * How many login accounts exist. Users are not owned by a household (one
 * person can belong to several), so this is one of the few queries that is
 * not scoped by householdId. It returns a number and nothing else.
 */
export async function countUsers(): Promise<number> {
  return getPrisma().user.count();
}

/** Finds an account by email (emails are stored in lower case). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const user = await getPrisma().user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return user?.id ?? null;
}
