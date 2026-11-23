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

/** Ten days from now, as a date field wants it. */
function inDays(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

test("add a contractor, put them on a project, log a call, add a task and a warranty", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const stamp = Date.now();
  const projectName = `Contractor test ${stamp}`;
  const contractorName = `Ace Builders ${stamp}`;
  await ensureProperty(page);

  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  // The directory entry, with insurance running out soon.
  await page.goto("/contractors");
  await page.getByRole("link", { name: "Add contractor" }).click();
  await visible(page.getByLabel("Company or name", { exact: true })).fill(contractorName);
  await visible(page.getByLabel("Trade (optional)", { exact: true })).fill("General contractor");
  await visible(page.getByLabel("Email (optional)", { exact: true })).fill("not-an-email");
  await visible(page.getByLabel("Insurance expires (optional)", { exact: true })).fill(inDays(10));
  await page.getByRole("button", { name: "Add contractor" }).click();
  // A typo is explained, and what was typed stays.
  await expect(page.getByText("Enter an email like name@example.com")).toBeVisible();
  await expect(visible(page.getByLabel("Company or name", { exact: true }))).toHaveValue(
    contractorName,
  );
  await visible(page.getByLabel("Email (optional)", { exact: true })).fill("office@example.com");
  await page.getByRole("button", { name: "Add contractor" }).click();
  await expect(page.getByRole("heading", { level: 1, name: contractorName })).toBeVisible();
  await expect(visible(page.getByText(/Insurance expires in (9|10|11) days/))).toBeVisible();

  // On the project, doing cabinets.
  const projects = page.getByRole("region", { name: "Projects" });
  await open(projects, "Add to a project");
  await visible(projects.getByLabel("Project", { exact: true })).selectOption({
    label: projectName,
  });
  await visible(projects.getByLabel("Doing what (optional)", { exact: true })).fill("Cabinets");
  await projects.getByRole("button", { name: "Add to project" }).click();
  await expect(projects.getByRole("list", { name: "Projects" })).toContainText(projectName);

  // A call about it.
  const log = page.getByRole("region", { name: "Communication log" });
  await open(log, "Log a call, email or visit");
  await visible(log.getByLabel("About (optional)", { exact: true })).selectOption({
    label: projectName,
  });
  await visible(log.getByLabel("What was said or agreed", { exact: true })).fill(
    "Can start on the 3rd.",
  );
  await log.getByRole("button", { name: "Add to log" }).click();
  await expect(log.getByRole("list", { name: "Communication log" })).toContainText(
    "Can start on the 3rd.",
  );

  // Over on the project: the contractor, a task for them, and a warranty.
  await projects.getByRole("link", { name: projectName }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByRole("list", { name: "Contractors on this project" })).toContainText(
    contractorName,
  );

  const tasks = page.getByRole("region", { name: "Tasks" });
  await open(tasks, "Add a task");
  await visible(tasks.getByLabel("Task", { exact: true })).fill("Confirm the start date");
  await visible(tasks.getByLabel("Assigned to (optional)", { exact: true })).selectOption({
    label: contractorName,
  });
  await tasks.getByRole("button", { name: "Add task" }).click();
  const taskList = tasks.getByRole("list", { name: "Tasks" });
  await expect(taskList).toContainText("Confirm the start date");
  await expect(taskList).toContainText(contractorName);
  await taskList.getByRole("button", { name: "Mark “Confirm the start date” done" }).click();
  await expect(
    taskList.getByRole("button", { name: "Reopen “Confirm the start date”" }),
  ).toBeVisible();

  const warranties = page.getByRole("region", { name: "Warranties" });
  await open(warranties, "Add a warranty");
  await visible(warranties.getByLabel("What it covers", { exact: true })).fill("Cabinet install");
  await visible(warranties.getByLabel("Contractor (optional)", { exact: true })).selectOption({
    label: contractorName,
  });
  await visible(warranties.getByLabel("Expires (optional)", { exact: true })).fill("2030-01-01");
  await warranties.getByRole("button", { name: "Add warranty" }).click();
  await expect(warranties.getByRole("list", { name: "Warranties" })).toContainText(
    "Cabinet install",
  );

  // The warranty's own page takes its paperwork.
  await warranties.getByRole("link", { name: "Cabinet install" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cabinet install" })).toBeVisible();
  await page
    .getByRole("region", { name: "Documents" })
    .locator('input[type="file"]')
    .setInputFiles({
      name: "warranty.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n%test\n"),
    });
  await expect(page.getByRole("list", { name: "Documents" })).toContainText("warranty.pdf");

  // The directory shows the insurance warning too.
  await page.goto("/contractors");
  await expect(page.getByRole("listitem").filter({ hasText: contractorName })).toContainText(
    "Insurance expires in",
  );
});

test("contractor pages fit the screen", async ({ page }) => {
  await page.goto("/contractors");
  await expect(page.getByRole("heading", { level: 1, name: "Contractors" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "/contractors scrolls sideways").toBeLessThanOrEqual(0);
  const first = page.getByRole("list", { name: "Contractors" }).getByRole("link").first();
  if (await first.isVisible()) {
    await first.click();
    await expect(page.getByRole("region", { name: "Details" })).toBeVisible();
    const detailOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(detailOverflow, "a contractor's page scrolls sideways").toBeLessThanOrEqual(0);
  }
});

test("quote and contract pages fit the screen", async ({ page }) => {
  // Any contractor with a quote and a contract, if an earlier run made one.
  await page.goto("/contractors");
  const contractors = page.getByRole("list", { name: "Contractors" }).getByRole("link");
  const count = await contractors.count();
  for (let i = 0; i < count; i++) {
    await page.goto("/contractors");
    await contractors.nth(i).click();
    await expect(page.getByRole("region", { name: "Details" })).toBeVisible();
    const quote = visible(page.getByRole("list", { name: "Quotes" }).getByRole("link")).first();
    const contract = visible(
      page.getByRole("list", { name: "Contracts" }).getByRole("link"),
    ).first();
    if (!(await quote.isVisible()) || !(await contract.isVisible())) continue;
    const contractHref = await contract.getAttribute("href");
    for (const [link, what] of [
      [quote, "A quote's page"],
      [null, "A contract's page"],
    ] as const) {
      if (link) await link.click();
      else await page.goto(contractHref ?? "/contractors");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${what} scrolls sideways`).toBeLessThanOrEqual(0);
    }
    return;
  }
});

test("get a quote, revise it, approve it, sign a contract, add a change order and a deposit", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(120_000);
  const stamp = Date.now();
  const projectName = `Quote test ${stamp}`;
  const contractorName = `Bright Electric ${stamp}`;
  await ensureProperty(page);

  // A project with a $10,000 labor line.
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  const projectUrl = page.url();
  await page.getByRole("link", { name: "Open budget" }).click();
  const lines = page.getByRole("region", { name: "Budget lines" });
  await visible(lines.getByLabel("Category", { exact: true })).selectOption({ label: "Labor" });
  await visible(lines.getByLabel("Planned amount", { exact: true })).fill("10,000");
  await lines.getByRole("button", { name: "Add line" }).click();
  await expect(lines.getByRole("table", { name: "Budget lines" })).toContainText("Labor");

  await page.goto("/contractors/new");
  await visible(page.getByLabel("Company or name", { exact: true })).fill(contractorName);
  await page.getByRole("button", { name: "Add contractor" }).click();
  await expect(page.getByRole("heading", { level: 1, name: contractorName })).toBeVisible();

  // The quote, from the contractor's page.
  await page.getByRole("link", { name: "Add a quote" }).click();
  await visible(page.getByLabel("Project", { exact: true })).selectOption({ label: projectName });
  await visible(page.getByLabel("What it's for", { exact: true })).fill("Kitchen wiring");
  await visible(page.getByLabel("Amount", { exact: true })).fill("8,000");
  await page.getByRole("button", { name: "Add quote" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kitchen wiring" })).toBeVisible();

  // They come back with a better price.
  await open(page, "They sent a new price");
  await visible(page.getByLabel("New amount", { exact: true })).fill("7500");
  await page.getByRole("button", { name: "Add revision" }).click();
  const versions = page.getByRole("list", { name: "Versions" });
  await expect(versions).toContainText("Revision 1");
  await expect(versions).toContainText("$8,000.00");
  const decision = page.getByRole("region", { name: "Price and decision" });
  await expect(decision).toContainText("$7,500.00");

  // Approve it onto the labor line: now it's in the budget.
  await open(page, "Approve");
  await visible(page.getByLabel("Comes out of budget line", { exact: true })).selectOption({
    index: 1,
  });
  await page.getByRole("button", { name: "Approve quote" }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(decision).toContainText("Labor");

  // The contract takes over the quote's place in the budget.
  await page.getByRole("link", { name: "Make a contract from it" }).click();
  await expect(visible(page.getByLabel("Contract amount", { exact: true }))).toHaveValue("7500.00");
  await page.getByRole("button", { name: "Add contract" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kitchen wiring" })).toBeVisible();
  const contractUrl = page.url();
  expect(contractUrl).toMatch(/\/contracts\//);

  await open(page, "Add a change order");
  await visible(page.getByLabel("What changed", { exact: true })).fill("Two extra outlets");
  await visible(page.getByLabel("Amount", { exact: true })).fill("400");
  await page.getByRole("button", { name: "Add change order" }).click();
  await expect(page.getByRole("list", { name: "Change orders" })).toContainText(
    "Two extra outlets",
  );
  const money = page.getByRole("region", { name: "Money" });
  await expect(money).toContainText("$7,900.00");

  // The deposit bill, linked to the contract, with its stage.
  await page.getByRole("link", { name: "Add a bill" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New expense" })).toBeVisible();
  await visible(page.getByLabel("What it was", { exact: true })).fill("Deposit");
  await visible(page.getByLabel("Total", { exact: true })).fill("2000");
  await visible(page.getByLabel("Payment stage (optional)", { exact: true })).selectOption(
    "deposit",
  );
  await page.getByRole("button", { name: "Record expense" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Deposit" })).toBeVisible();

  await page.goto(contractUrl);
  await expect(page.getByRole("list", { name: "Bills" })).toContainText("Deposit");
  await expect(page.getByRole("list", { name: "Bills" })).toContainText("Unpaid");
  await expect(money).toContainText("$2,000.00");

  // The project lists both, and the budget counts the money once.
  await page.goto(projectUrl);
  const agreements = page.getByRole("region", { name: "Quotes and contracts" });
  await expect(agreements.getByRole("list", { name: "Quotes" })).toContainText("Has a contract");
  await expect(agreements.getByRole("list", { name: "Contracts" })).toContainText("$7,900.00");
});
