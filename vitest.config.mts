import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const resolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    // "server-only" throws outside a Next.js server; tests run in plain Node.
    "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
  },
};

/**
 * Two groups of tests (ADR-013):
 * - unit:        fast, no database. `npm test`
 * - integration: talk to a real PostgreSQL database. `npm run test:integration`
 *                (start the database first with `npm run db:up`). They use a
 *                separate "<name>_test" database, so your own data is safe.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["./tests/support/prepare-test-database.ts"],
          setupFiles: ["./tests/support/load-env.ts"],
          // One file at a time, so tests never fight over the same rows.
          fileParallelism: false,
        },
      },
    ],
  },
});
