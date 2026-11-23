import { expect, test, testAccount } from "./fixtures";

test("Settings shows your household and the people in it", async ({ page }) => {
  await page.goto("/settings");
  const household = page.getByRole("region", { name: "Household" });
  await expect(household.getByText(testAccount.household)).toBeVisible();
  await expect(household.getByText("Your role: Owner")).toBeVisible();
  const people = household.getByRole("list", { name: "People in this household" });
  // (Other tests running at the same time may add people, so don't count them.)
  await expect(people.getByText(testAccount.email)).toBeVisible();
});
