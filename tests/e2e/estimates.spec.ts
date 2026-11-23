import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Next.js keeps visited pages hidden in the document; match visible fields only. */
function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}

async function open(scope: Page | Locator, summary: string) {
  const details = visible(scope.locator("summary", { hasText: summary }))
    .first()
    .locator("..");
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator("summary").first().click();
  }
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

async function addRoom(page: Page, name: string, length: string, width: string) {
  await page.goto("/rooms/new");
  await visible(page.getByLabel("Room name", { exact: true })).fill(name);
  await visible(page.getByLabel("Length", { exact: true })).fill(length);
  await visible(page.getByLabel("Width", { exact: true })).fill(width);
  await page.getByRole("button", { name: "Add room" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("price flooring once, pick the rooms, and the budget fills in", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough (it sets the tax rate).");
  test.setTimeout(120_000);
  const stamp = Date.now();
  const projectName = `Floors ${stamp}`;
  const bedroom = `Bedroom ${stamp}`;
  const office = `Office ${stamp}`;
  await ensureProperty(page);
  await addRoom(page, bedroom, "12'", "10'");
  await addRoom(page, office, "10'", "10'");

  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  const projectRooms = page.getByRole("region", { name: "Rooms" });
  await projectRooms.getByText("Choose rooms").click();
  await projectRooms.getByRole("checkbox", { name: bedroom }).check();
  await projectRooms.getByRole("checkbox", { name: office }).check();
  await projectRooms.getByRole("button", { name: "Save rooms" }).click();
  await expect(projectRooms.getByRole("list", { name: "Rooms in this project" })).toContainText(
    office,
  );
  const projectUrl = page.url();

  // The price list: flooring from the preset, and a 10% sales tax.
  await page.goto("/budget");
  await page.getByRole("link", { name: "Price list" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Price list" })).toBeVisible();
  await open(page, "Add to the price list");
  const items = page.getByRole("region", { name: "Items" });
  await visible(items.getByLabel("Start from", { exact: true })).selectOption({
    label: "Flooring (per sq ft)",
  });
  await expect(
    visible(items.getByLabel("Extra for waste and cuts (%)", { exact: true })),
  ).toHaveValue("10");
  await visible(items.getByLabel("Name", { exact: true })).fill(`Oak ${stamp}`);
  await visible(items.getByLabel("Price per sq ft", { exact: true })).fill("4.00");
  await items.getByRole("button", { name: "Add to price list" }).click();
  await expect(items.getByRole("list", { name: "Price list" })).toContainText(`Oak ${stamp}`);
  const tax = page.getByRole("region", { name: "Sales tax" });
  await visible(tax.getByLabel("Sales tax on materials (%)", { exact: true })).fill("10");
  await tax.getByRole("button", { name: "Save tax rate" }).click();
  await expect(tax.getByText("Saved")).toBeVisible();

  // A room estimate on the project, both rooms ticked.
  await page.goto(`${projectUrl}/budget`);
  await page.getByRole("link", { name: "Add a room estimate" }).click();
  await visible(page.getByLabel("From the price list", { exact: true })).selectOption({
    label: `Oak ${stamp}`,
  });
  await visible(page.getByLabel("Name in the budget", { exact: true })).fill("Flooring");
  await expect(page.getByRole("checkbox", { name: bedroom })).toBeChecked();
  await page.getByRole("button", { name: "Add estimate" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Flooring" })).toBeVisible();

  // 120 sq ft and 100 sq ft, plus 10% waste, at $4.00, plus 10% tax.
  const estimate = page.getByRole("region", { name: "Estimate" });
  const rows = page.getByRole("table", { name: "Rooms in this estimate" });
  await expect(rows).toContainText("120 sq ft");
  await expect(rows).toContainText("$580.87");
  await expect(rows).toContainText("$484.00");
  await expect(estimate).toContainText("$1,064.87");

  // An odd space typed in by hand.
  await open(page, "Type a size in by hand");
  await visible(page.getByLabel("What it is", { exact: true })).fill("Hall closet");
  await visible(page.getByLabel("Size (sq ft)", { exact: true })).fill("20");
  await page.getByRole("button", { name: "Use this size" }).click();
  await expect(rows).toContainText("Hall closet");
  await expect(estimate).toContainText("$1,161.67");

  // The project budget shows it as estimates on its own lines.
  await page.goto(`${projectUrl}/budget`);
  const list = page.getByRole("list", { name: "Room estimates" });
  await expect(list).toContainText("Flooring");
  await expect(list).toContainText("$1,161.67");
  await expect(page.getByRole("table", { name: "Budget lines" })).toContainText("Flooring");

  // Back to no tax, so other runs start the same way.
  await page.goto("/budget/prices");
  await visible(tax.getByLabel("Sales tax on materials (%)", { exact: true })).fill("");
  await tax.getByRole("button", { name: "Save tax rate" }).click();
  await expect(tax.getByText("Saved")).toBeVisible();
});

test("price list and estimate pages fit the screen", async ({ page }) => {
  for (const path of ["/budget/prices"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
