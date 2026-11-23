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
