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

test("order a material, take delivery in two parts, and record the bill", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(120_000);
  const stamp = Date.now();
  const projectName = `Laundry ${stamp}`;
  const tile = `Floor tile ${stamp}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  const projectUrl = page.url();

  // A Materials budget line, and tile on the materials list.
  await page.goto(`${projectUrl}/budget`);
  const lines = page.getByRole("region", { name: "Budget lines" });
  await visible(lines.getByLabel("Category", { exact: true })).selectOption({ label: "Materials" });
  await visible(lines.getByLabel("Planned amount", { exact: true })).fill("1000");
  await lines.getByRole("button", { name: "Add line" }).click();
  await expect(lines.getByRole("table", { name: "Budget lines" })).toContainText("Materials");
  await page.goto(projectUrl);
  await page
    .getByRole("region", { name: "Materials" })
    .getByRole("link", { name: "Add material" })
    .click();
  await visible(page.getByLabel("Name", { exact: true })).fill(tile);
  await visible(page.getByLabel("Quantity (optional)", { exact: true })).fill("10");
  await visible(page.getByLabel("Unit (optional)", { exact: true })).fill("box");
  await visible(page.getByLabel("Expected price per unit (optional)", { exact: true })).fill("55");
  await page.getByRole("button", { name: "Add material" }).click();
  await expect(page.getByRole("heading", { level: 1, name: tile })).toBeVisible();

  // Order it from the material's page: the expected quantity and price come along.
  await page
    .getByRole("region", { name: "Orders" })
    .getByRole("link", { name: "Order it" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "New order" })).toBeVisible();
  await expect(visible(page.getByLabel("Quantity", { exact: true }))).toHaveValue("10");
  await visible(page.getByLabel("Ordered from", { exact: true })).fill(`Tile Shop ${stamp}`);
  await visible(page.getByLabel("Order number (optional)", { exact: true })).fill("A123");
  // Paid less than expected.
  await visible(page.getByLabel("Price paid for one", { exact: true })).fill("49.99");
  await page.getByRole("button", { name: "Add an item" }).click();
  await visible(page.getByLabel("Item 2: description", { exact: true })).fill("Grout");
  await visible(page.getByLabel("Quantity", { exact: true }))
    .nth(1)
    .fill("2");
  await visible(page.getByLabel("Price paid for one", { exact: true }))
    .nth(1)
    .fill("18.50");
  await visible(page.getByLabel("Tax (optional)", { exact: true })).fill("42.50");
  await expect(page.getByText("$579.40")).toBeVisible(); // 499.90 + 37.00 + 42.50
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: /Order from Tile Shop .* \(#A123\)/ }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Summary" })).toContainText("$579.40");
  await expect(page.getByText("Not delivered yet")).toBeVisible();

  // Six boxes and the grout arrive, then the rest.
  await open(page, "Record a delivery");
  const deliveries = page.getByRole("region", { name: "Deliveries" });
  await visible(deliveries.getByLabel(/^Floor tile/)).fill("6");
  await deliveries.getByRole("button", { name: "Record delivery" }).click();
  await expect(visible(page.getByText("Partly delivered"))).toBeVisible();
  await open(page, "Record a delivery");
  await expect(visible(deliveries.getByLabel(/^Floor tile/))).toHaveValue("4");
  await deliveries.getByRole("button", { name: "Record delivery" }).click();
  await expect(visible(page.getByText("Delivered", { exact: true }))).toBeVisible();

  // The bill, paid by card.
  const bill = page.getByRole("region", { name: "Bill" });
  await bill.getByRole("button", { name: "Record the bill" }).click();
  await expect(bill).toContainText("Paid");
  await expect(bill.getByRole("link", { name: /Open the bill/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);

  // The material is delivered, and the budget shows the money spent.
  await page.getByRole("link", { name: tile }).click();
  await expect(visible(page.locator("span", { hasText: /^Delivered$/ })).first()).toBeVisible();
  await page.goto(`${projectUrl}/budget`);
  await expect(page.getByRole("table", { name: "Budget lines" })).toContainText("$579.40");
});

test("orders pages fit the screen", async ({ page }) => {
  for (const path of ["/orders"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
