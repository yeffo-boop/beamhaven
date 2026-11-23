import "server-only";

import { prismaAdapter } from "better-auth/adapters/prisma";

import { getPrisma } from "./client";

/**
 * Gives Better Auth access to its four tables (users, sessions, accounts,
 * verifications). It lives here because only src/server/data/ may touch the
 * database client (ADR-007).
 */
export function getAuthDatabase() {
  return prismaAdapter(getPrisma(), { provider: "postgresql", transaction: true });
}
