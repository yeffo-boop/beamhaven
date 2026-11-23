import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser clicking through the built app.
 * Run with `npm run test:e2e` (it builds and starts the app on port 3100).
 * First time on a new computer: `npx playwright install chromium`.
 */
const port = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
    // Lets a machine with a pre-installed Chromium use it instead of downloading one.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: "laptop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "ipad-portrait",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      APP_URL: "https://beamhaven.test",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://unused@127.0.0.1:5432/unused",
    },
  },
});
