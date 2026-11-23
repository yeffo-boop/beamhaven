import { expect, test } from "./fixtures";

test("every section opens and is marked as the current page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "The phone uses the tab bar; tested below.");

  await page.goto("/");
  await expect(page).toHaveTitle("BeamHaven");
  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "Budget" }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.getByRole("heading", { level: 1, name: "Budget" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Budget" })).toHaveAttribute("aria-current", "page");

  // Sections that aren't built yet say which milestone builds them.
  await nav.getByRole("link", { name: "Schedule" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByText("Coming in Milestone 7")).toBeVisible();

  await nav.getByRole("link", { name: "Contractors" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contractors" })).toBeVisible();
});

test("the sidebar shows labels on a laptop and icons only on an iPad in portrait", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone");
  await page.goto("/");
  // Labels are kept for screen readers either way, so check the sidebar's width.
  const box = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  if (testInfo.project.name === "laptop") expect(box?.width).toBe(240);
  else expect(box?.width).toBe(72);
});

test("the appearance choice applies and survives a reload", async ({ page }) => {
  await page.goto("/settings");
  const appearance = page.getByRole("main").getByRole("radiogroup", { name: "Appearance" });

  await appearance.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await appearance.getByRole("radio", { name: "Match device" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
});

test("on a phone, the tab bar and the More sheet reach every section", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone layout only.");

  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" });
  await tabs.getByRole("link", { name: "Schedule" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();

  await tabs.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "More" });
  await sheet.getByRole("link", { name: "Inspiration" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Inspiration" })).toBeVisible();
});
