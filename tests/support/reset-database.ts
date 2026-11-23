import { Client } from "pg";

import { databaseName } from "./test-database";

/**
 * Empties the tables between tests. Refuses to touch any database whose
 * name doesn't end in "_test", as a last safety net for real data.
 */
export async function resetDatabase(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!databaseName(url).endsWith("_test")) {
    throw new Error("Refusing to empty a database whose name doesn't end in _test");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("TRUNCATE users, sessions, accounts, verifications CASCADE");
  } finally {
    await client.end();
  }
}
