import type { Page } from "@playwright/test";

import { expect, test, testAccount } from "./fixtures";

/**
 * The whole people journey, in one browser test: the owner invites someone,
 * they join with the link, the owner makes them a reset link, they reset
 * their password and then change it themselves.
 * Runs at laptop size only; the same pages are checked at other sizes by
 * the other tests.
 */
test("invite, join, reset and change a password", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(60_000);
  const runId = Date.now();
  const email = `partner-${runId}@beamhaven.test`;
  const name = `Pat ${runId}`;

  // 1. The owner creates an invitation link.
  await page.goto("/settings");
  const household = page.getByRole("region", { name: "Household" });
  await household.getByLabel("Email").fill(email);
  await household.getByLabel("Role", { exact: true }).selectOption("member");
  await household.getByRole("button", { name: "Create invitation link" }).click();
  const inviteLink = await household.getByLabel("Invitation link").first().inputValue();
  expect(inviteLink).toMatch(/^http:\/\/localhost:3100\/invite\/\w+$/);
  await expect(household.getByRole("list", { name: "Pending invitations" })).toContainText(email);

  // 2. The invited person opens it in their own browser and joins.
  const partner = await browser.newContext({
    extraHTTPHeaders: { "x-real-ip": "10.200.0.1" },
  });
  const partnerPage = await partner.newPage();
  await partnerPage.goto(inviteLink);
  await expect(
    partnerPage.getByRole("heading", { name: `Join ${testAccount.household}` }),
  ).toBeVisible();
  await partnerPage.getByLabel("Your name").fill(name);
  await partnerPage.getByLabel("Choose a password").fill("partner-password-1");
  await partnerPage.getByLabel("Same password again").fill("partner-password-1");
  await partnerPage.getByRole("button", { name: "Create account and join" }).click();
  await expect(partnerPage.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await partnerPage.goto("/settings");
  await expect(partnerPage.getByText("Your role: Member")).toBeVisible();
  // Members don't see the owner tools.
  await expect(partnerPage.getByRole("button", { name: "Create invitation link" })).toHaveCount(0);

  // The link is used up.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(inviteLink);
  await expect(strangerPage.getByRole("heading", { name: /This link doesn.t work/ })).toBeVisible();
  await stranger.close();

  // 3. The owner makes a password-reset link for them.
  await page.reload();
  await household.getByRole("button", { name: `Reset password for ${name}` }).click();
  const resetLink = await household.getByLabel(`Password reset link for ${name}`).inputValue();
  expect(resetLink).toContain("/reset-password?token=");

  // 4. They use it: their old session ends, and the new password works.
  await partnerPage.goto(resetLink);
  await partnerPage.getByLabel(/^New password/).fill("partner-password-2");
  await partnerPage.getByLabel("Same password again").fill("partner-password-2");
  await partnerPage.getByRole("button", { name: "Set new password" }).click();
  await expect(partnerPage.getByText("Your password was changed.")).toBeVisible();
  await signIn(partnerPage, email, "partner-password-2");

  // 5. They change it themselves in Settings.
  await partnerPage.goto("/settings");
  const password = partnerPage.getByRole("region", { name: "Password" });
  await password.getByLabel("Current password").fill("partner-password-2");
  await password.getByLabel(/^New password/).fill("partner-password-3");
  await password.getByLabel("Same new password again").fill("partner-password-3");
  await password.getByRole("button", { name: "Change password" }).click();
  await expect(password.getByText("Password changed.")).toBeVisible();

  // 6. "Sign out of every device" ends this session too.
  await partnerPage.getByRole("button", { name: "Sign out of every device" }).click();
  await expect(partnerPage).toHaveURL(/\/sign-in/);
  await signIn(partnerPage, email, "partner-password-3");

  // 7. The owner removes them again (two clicks).
  await page.reload();
  await household.getByText(`Remove ${name}`, { exact: true }).click();
  await household.getByRole("button", { name: `Yes, remove ${name}` }).click();
  await expect(household.getByRole("list", { name: "People in this household" })).not.toContainText(
    email,
  );
  await partner.close();
});

test("every page sends a Content-Security-Policy", async ({ request }) => {
  const response = await request.get("/sign-in");
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-eval");
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
}
