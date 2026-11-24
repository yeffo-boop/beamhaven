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

/** A few days back, so the task is overdue in any time zone. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

test("Home shows an overdue task, the active project and recent activity", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const projectName = `Hall ${Date.now()}`;
  const taskTitle = `Patch drywall ${Date.now()}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const tasks = page.getByRole("region", { name: "Tasks" });
  await open(tasks, "Add a task");
  await visible(tasks.getByLabel("Task", { exact: true })).fill(taskTitle);
  await visible(tasks.getByLabel("Due (optional)", { exact: true })).fill(daysAgo(3));
  await tasks.getByRole("button", { name: "Add task" }).click();
  await expect(tasks.getByRole("list", { name: "Tasks" })).toContainText(taskTitle);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  const attention = page.getByRole("list", { name: "Needs attention" });
  const overdue = attention.getByRole("listitem").filter({ hasText: taskTitle });
  await expect(overdue).toContainText("overdue");

  // A new project starts in planning, which counts as active.
  await expect(page.getByRole("region", { name: "Active projects" })).toContainText(projectName);
  await expect(page.getByRole("region", { name: "Recent activity" })).toContainText(projectName);
  await expect(page.getByRole("region", { name: "Budget" })).toBeVisible();

  // The overdue task links to itself.
  await overdue.getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: taskTitle })).toBeVisible();

  // The full history, filtered to projects.
  await page.goto("/");
  await page.getByRole("link", { name: "All activity" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await page.getByLabel("Show").selectOption("project");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page).toHaveURL(/type=project/);
  const feed = page.getByRole("list", { name: "Activity" });
  await expect(feed).toContainText(projectName);
  await feed
    .getByRole("link", { name: new RegExp(projectName) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
});

test("Home and Activity fit the screen", async ({ page }) => {
  for (const path of ["/", "/activity"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
