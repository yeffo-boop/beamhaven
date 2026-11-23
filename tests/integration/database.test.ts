import { afterAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/server/data/client";
import { checkDatabase } from "@/server/data/health";

// Needs a running PostgreSQL (docker-compose.dev.yml locally, a service in CI).
describe("database", () => {
  afterAll(async () => {
    await getPrisma().$disconnect();
  });

  it("answers the health check", async () => {
    const result = await checkDatabase();
    expect(result.ok).toBe(true);
  });

  it("runs parameterized raw queries safely", async () => {
    const input = "Robert'); DROP TABLE students;--";
    const rows = await getPrisma().$queryRaw<{ value: string }[]>`SELECT ${input}::text AS value`;
    expect(rows[0]?.value).toBe(input);
  });
});
