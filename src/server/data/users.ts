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
