import { expect, test, testAccount } from "./fixtures";

// These tests start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("a signed-out visitor is sent to sign in, then back to where they were going", async ({
  page,
}) => {
  await page.goto("/budget");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fbudget$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill(testAccount.email);
  await page.getByLabel("Password").fill(testAccount.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.getByRole("heading", { level: 1, name: "Budget" })).toBeVisible();
});

test("a wrong password shows a message and doesn't sign in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(testAccount.email);
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/don't match/);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("repeated attempts are slowed down", async ({ page }) => {
  // Sign-in allows 5 attempts per minute from one address (auth.ts).
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(testAccount.email);
  await page.getByLabel("Password").fill("not-the-right-password");
  const alert = page.getByRole("main").getByRole("alert");
  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert).toHaveText(/don't match/);
  }
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alert).toHaveText(/Too many attempts/);
});

test("there is no way to sign up", async ({ page, request }) => {
  await page.goto("/sign-in");
  await expect(page.getByText(/sign up/i)).toHaveCount(0);

  const response = await request.post("/api/auth/sign-up/email", {
    data: { name: "Stranger", email: "stranger@example.com", password: "a long password here" },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.ok()).toBe(false);
});

test("signing out from Settings ends the session", async ({ page }) => {
  await page.goto("/sign-in?next=/settings");
  await page.getByLabel("Email").fill(testAccount.email);
  await page.getByLabel("Password").fill(testAccount.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Account" }).getByText(testAccount.email),
  ).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in/);
});
