// Runs once before the integration tests: creates the test database if it
// doesn't exist yet, then brings its tables up to date with the migrations.
import { execFileSync } from "node:child_process";

import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

import { databaseName, testDatabaseUrl } from "./test-database";

export default async function prepareTestDatabase() {
  loadEnvConfig(process.cwd());
  const mainUrl = process.env["DATABASE_URL"];
  const testUrl = testDatabaseUrl(mainUrl);
  const name = databaseName(testUrl);

  if (testUrl !== mainUrl) {
    const client = new Client({ connectionString: mainUrl });
    await client.connect();
    try {
      const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      // The name was checked against [a-z0-9_]+ in testDatabaseUrl(), so it
      // is safe to place in this statement (CREATE DATABASE can't take $1).
      if (existing.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
    } finally {
      await client.end();
    }
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "ignore",
  });
}
