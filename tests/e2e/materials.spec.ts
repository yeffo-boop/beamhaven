import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Next.js keeps visited pages hidden in the document; match visible fields only. */
function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}

async function ensureProperty(page: Page) {
  await page.goto("/projects");
  const firstProperty = page.getByRole("region", { name: "Start with your home" });
  const newProject = page.getByRole("link", { name: "New project" });
  await expect(firstProperty.or(newProject)).toBeVisible();
  if (await firstProperty.isVisible()) {
    await firstProperty.getByLabel("Name").fill("Our house");
    await firstProperty.getByLabel("City").fill("Portland");
    await firstProperty.getByRole("button", { name: "Add property" }).click();
    await expect(newProject).toBeVisible();
  }
}

test("add a material from a project, move it along, and find it again", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const stamp = Date.now();
  const projectName = `Bath ${stamp}`;
  const materialName = `Floor tile ${stamp}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const panel = page.getByRole("region", { name: "Materials" });
  await expect(panel).toContainText("No materials on this project yet.");
  await panel.getByRole("link", { name: "Add material" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New material" })).toBeVisible();
  await expect(visible(page.getByLabel("Project (optional)", { exact: true }))).toHaveValue(/.+/);
  await visible(page.getByLabel("Name", { exact: true })).fill(materialName);
  await visible(page.getByLabel("Kind (optional)", { exact: true })).fill("Tile");
  await visible(page.getByLabel("Brand (optional)", { exact: true })).fill("Daltile");
  await visible(page.getByLabel("Supplier (optional)", { exact: true })).fill(`Tile Shop ${stamp}`);
  await visible(page.getByLabel("Product link (optional)", { exact: true })).fill(
    "https://example.com/tile",
  );
  await visible(page.getByLabel("Quantity (optional)", { exact: true })).fill("2.5");
  await visible(page.getByLabel("Unit (optional)", { exact: true })).fill("box");
  await visible(page.getByLabel("Expected price per unit (optional)", { exact: true })).fill(
    "54.99",
  );
  await page.getByRole("button", { name: "Add material" }).click();

  await expect(page.getByRole("heading", { level: 1, name: materialName })).toBeVisible();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details).toContainText("2.5 box at $54.99 per box = $137.48");
  await expect(details).toContainText(`Tile Shop ${stamp}`);
  await expect(details.getByRole("link", { name: /example\.com/ })).toBeVisible();
  const badge = (status: string) =>
    visible(page.locator("span", { hasText: new RegExp(`^${status}$`) }));
  await expect(badge("Considering")).toBeVisible();

  await visible(details.getByLabel("Status", { exact: true })).selectOption({ label: "Selected" });
  await details.getByRole("button", { name: "Update status" }).click();
  await expect(badge("Selected").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity" })).toContainText("marked as selected");

  // It shows on its project and in the materials list, which can filter.
  await page.getByRole("link", { name: `← ${projectName}` }).click();
  await expect(page.getByRole("region", { name: "Materials" })).toContainText(materialName);
  await page.goto("/materials");
  await expect(page.getByRole("list", { name: "Materials" })).toContainText(materialName);
  await page.getByLabel("Status").selectOption({ label: "Installed" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/status=installed/);
  await expect(visible(page.getByRole("link", { name: materialName }))).toHaveCount(0);
  await page.getByLabel("Status").selectOption({ label: "Selected" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("list", { name: "Materials" })).toContainText(materialName);
});

test("materials pages fit the screen", async ({ page }) => {
  for (const path of ["/materials", "/materials/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
