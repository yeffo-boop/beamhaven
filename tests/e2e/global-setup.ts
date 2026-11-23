import { execFileSync } from "node:child_process";

import prepareTestDatabase from "../support/prepare-test-database";
import { resetDatabase } from "../support/reset-database";
import { e2eServerEnv } from "./environment";
import { testAccount } from "./fixtures";

/**
 * Before the browser tests: empty the test database and create the test
 * account with the same command a real install uses.
 * playwright.config.ts has already pointed DATABASE_URL at the test database.
 */
export default async function globalSetup() {
  await prepareTestDatabase();
  await resetDatabase();
  execFileSync("npm", ["run", "-s", "create-first-account"], {
    env: {
      ...process.env,
      ...e2eServerEnv,
      FIRST_ACCOUNT_NAME: testAccount.name,
      FIRST_ACCOUNT_HOUSEHOLD: testAccount.household,
      FIRST_ACCOUNT_EMAIL: testAccount.email,
      FIRST_ACCOUNT_PASSWORD: testAccount.password,
    },
    stdio: "inherit",
  });
}
