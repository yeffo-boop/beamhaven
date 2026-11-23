import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

import { e2eOrigin, e2ePort, e2eServerEnv } from "./tests/e2e/environment";
import { testDatabaseUrl } from "./tests/support/test-database";

/**
 * End-to-end tests: a real browser clicking through the built app.
 * Run with `npm run test:e2e` (it builds and starts the app on port 3100).
 * First time on a new computer: `npx playwright install chromium`.
 *
 * Like the integration tests, these use the separate "<name>_test" database,
 * which is emptied before each run.
 */
loadEnvConfig(process.cwd());
process.env["DATABASE_URL"] = testDatabaseUrl(process.env["DATABASE_URL"]);
const signedInState = "tests/e2e/.auth/signed-in.json";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eOrigin,
    trace: "off",
    // Lets a machine with a pre-installed Chromium use it instead of downloading one.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "laptop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: signedInState,
      },
    },
    {
      name: "ipad-portrait",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 },
        storageState: signedInState,
      },
    },
    {
      name: "phone",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], storageState: signedInState },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${e2ePort} -H localhost`,
    url: `${e2eOrigin}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { ...e2eServerEnv, DATABASE_URL: process.env["DATABASE_URL"] ?? "" },
  },
});
