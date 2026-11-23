import { createHash } from "node:crypto";

import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

/** The account the end-to-end tests sign in with (created in global-setup.ts). */
export const testAccount = {
  name: "Test Owner",
  household: "Test Household",
  email: "owner@beamhaven.test",
  password: "e2e-only-password-123",
};

/**
 * Each test pretends to come from its own IP address (X-Real-IP, the header
 * Nginx Proxy Manager sets in production). Sign-in is rate limited per
 * address, so without this, tests running side by side would trip the limit.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide, testInfo) => {
    const digest = createHash("sha256").update(`${testInfo.testId}:${testInfo.retry}`).digest();
    const ip = `10.${digest[0]}.${digest[1]}.${digest[2]}`;
    await provide({ ...extraHTTPHeaders, "x-real-ip": ip });
  },
});
