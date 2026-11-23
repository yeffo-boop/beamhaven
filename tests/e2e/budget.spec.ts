import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/** Next.js keeps visited pages hidden in the document; match visible fields only. */
function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}

/** Opens a <details> section by its summary text, if it isn't open already. */
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

/**
 * The Milestone 4 journey: plan a budget, lock it in, agree a contract,
 * pay a deposit with a receipt, and move money between lines. The numbers
 * follow the worked example in docs/BUDGET_DEFINITIONS.md.
 */
test("plan, lock in, commit, spend, pay and transfer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const projectName = `Budget test ${Date.now()}`;
  await ensureProperty(page);

  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await visible(page.getByLabel("Status", { exact: true })).selectOption("in_progress");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await page.getByRole("link", { name: "Open budget" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: `${projectName} budget` }),
  ).toBeVisible();

  // Two lines: Labor $20,000 and a $2,000 contingency.
  const lines = page.getByRole("region", { name: "Budget lines" });
  const addLine = async (category: string, planned: string) => {
    await visible(lines.getByLabel("Category", { exact: true })).selectOption({ label: category });
    await visible(lines.getByLabel("Planned amount", { exact: true })).fill(planned);
    await lines.getByRole("button", { name: "Add line" }).click();
    await expect(lines.getByRole("table", { name: "Budget lines" })).toContainText(category);
  };
  await addLine("Labor", "20,000");
  await open(lines, "Add a budget line");
  await addLine("Contingency", "2000");

  // Work has started, so the page asks for the budget to be locked in.
  await expect(
    page.getByText("Work has started, but the original budget isn't locked in yet"),
  ).toBeVisible();
  await page.getByText("Lock in budget").click();
  await page.getByRole("button", { name: "Yes, lock it in" }).click();
  await expect(page.getByText(/Original budget locked in on/)).toBeVisible();
  const summary = page.getByRole("definition").filter({ hasText: "$22,000.00" }).first();
  await expect(summary).toBeVisible();

  // The Labor line: an estimate, then a contract.
  await lines.getByRole("table", { name: "Budget lines" }).getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Labor · Whole project" }),
  ).toBeVisible();
  await visible(page.getByLabel("Estimate (optional)", { exact: true })).fill("18500");
  await page.getByRole("button", { name: "Save line" }).click();
  const lineTotals = page.locator('dl[aria-label="Line totals"]');
  await expect(lineTotals).toContainText("$1,500.00"); // available

  const commitments = page.getByRole("region", { name: "Commitments" });
  await open(commitments, "Add an approved quote, contract or order");
  await visible(commitments.getByLabel("What was agreed", { exact: true })).fill("Cabinet install");
  await visible(commitments.getByLabel("Who with (optional)", { exact: true })).fill(
    "Ace Builders",
  );
  await visible(commitments.getByLabel("Amount", { exact: true })).fill("18,500");
  await commitments.getByRole("button", { name: "Add commitment" }).click();
  await expect(commitments.getByRole("list", { name: "Commitments" })).toContainText(
    "Cabinet install",
  );

  // A $5,000 deposit invoice, linked to the contract.
  await page.getByRole("link", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New expense" })).toBeVisible();
  await visible(page.getByLabel("What it was", { exact: true })).fill("Deposit");
  await visible(page.getByLabel("Total", { exact: true })).fill("5000");
  await visible(page.getByLabel("Bill for an agreement (optional)", { exact: true })).selectOption({
    index: 1,
  });
  await expect(page.getByText("$5,000.00 will be shared by the blank line.")).toBeVisible();
  await page.getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Deposit" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("Unpaid");

  // Pay it, and add the receipt.
  const payments = page.getByRole("region", { name: "Payments" });
  await visible(payments.getByLabel("How", { exact: true })).selectOption("check");
  await payments.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("Paid");
  await page
    .getByRole("region", { name: "Receipts" })
    .locator('input[type="file"]')
    .setInputFiles({
      name: "deposit.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n%test\n"),
    });
  await expect(page.getByRole("list", { name: "Receipts" })).toContainText("deposit.pdf");

  // Back on the line: committed $18,500, $13,500 not yet billed, nothing unpaid.
  await page.getByRole("region", { name: "Charged to" }).getByRole("link").click();
  await expect(page.locator('dl[aria-label="Line totals"]')).toContainText("$18,500.00");
  await expect(page.getByRole("list", { name: "Commitments" })).toContainText(
    "$13,500.00 not yet billed",
  );

  // A $2,000 change order puts the line $500 over...
  await open(page, "Add an approved quote, contract or order");
  await visible(page.getByLabel("What was agreed", { exact: true })).fill("Extra wall");
  await visible(page.getByLabel("Kind", { exact: true })).selectOption("change_order");
  await visible(page.getByLabel("Amount", { exact: true }).first()).fill("2000");
  await page.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.locator('dl[aria-label="Line totals"]')).toContainText("Over by $500.00");

  // ...and $1,000 from the contingency fixes what's available, not the variance.
  const changes = page.getByRole("region", { name: "Transfers and adjustments" });
  await open(changes, "Move money to or from this line");
  await visible(changes.getByLabel("From", { exact: true })).selectOption({ index: 2 });
  await visible(changes.getByLabel("Amount", { exact: true })).fill("1000");
  await visible(changes.getByLabel("Reason", { exact: true })).fill("Cover the extra wall");
  await changes.getByRole("button", { name: "Move money" }).click();
  await expect(page.locator('dl[aria-label="Line totals"]')).toContainText("$500.00");
  await expect(page.locator('dl[aria-label="Line totals"]')).toContainText("+$500.00 over");
  await expect(changes.getByRole("list", { name: "Transfers" })).toContainText(
    "Cover the extra wall",
  );

  // The household overview lists the project; totals didn't change with the transfer.
  await page.goto("/budget");
  const row = page.getByRole("row").filter({ hasText: projectName });
  await expect(row).toContainText("$22,000.00");
  await expect(row).toContainText("$5,000.00");
});

test("budget pages fit the screen", async ({ page }) => {
  await page.goto("/budget");
  await expect(page.getByRole("heading", { level: 1, name: "Budget" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "/budget scrolls sideways").toBeLessThanOrEqual(0);
});
