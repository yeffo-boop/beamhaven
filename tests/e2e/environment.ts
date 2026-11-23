/** Settings for the app server the end-to-end tests start (see playwright.config.ts). */
export const e2ePort = 3100;
export const e2eOrigin = `http://localhost:${e2ePort}`;

export const e2eServerEnv = {
  APP_URL: e2eOrigin,
  // Test-only value; it signs sessions in the throwaway test database.
  BETTER_AUTH_SECRET: "e2e-tests-only-secret-0123456789abcdef",
  // Read the per-test X-Real-IP header (see fixtures.ts), as in production.
  TRUST_PROXY: "true",
  // Uploaded files from the tests stay in the (Git-ignored) test-results folder.
  STORAGE_LOCAL_PATH: "test-results/e2e-uploads",
};
