import { expect, test, testAccount } from "./fixtures";

export const signedInState = "tests/e2e/.auth/signed-in.json";

// Signs in once and saves the login cookie, so the other tests start signed in.
test("sign in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(testAccount.email);
  await page.getByLabel("Password").fill(testAccount.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await page.context().storageState({ path: signedInState });
});
