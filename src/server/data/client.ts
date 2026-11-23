import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The single shared database client (ADR-007).
 *
 * Only files in src/server/data/ may import this; an ESLint rule enforces it.
 * During development, Next.js reloads modules on every save, so the client is
 * kept on globalThis to avoid opening a new connection pool each time.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}
