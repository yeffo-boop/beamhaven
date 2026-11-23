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

test("plan a project in milestones, and see a task blocked until the one before is done", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const projectName = `Kitchen ${Date.now()}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const milestones = page.getByRole("region", { name: "Milestones" });
  await open(milestones, "Add a milestone");
  await visible(milestones.getByLabel("Milestone", { exact: true })).fill("Demolition");
  await milestones.getByRole("button", { name: "Add milestone" }).click();
  await expect(milestones.getByRole("list", { name: "Milestones" })).toContainText("No tasks yet");

  const tasks = page.getByRole("region", { name: "Tasks" });
  await open(tasks, "Add a task");
  await visible(tasks.getByLabel("Task", { exact: true })).fill("Tear out cabinets");
  await visible(tasks.getByLabel("Milestone (optional)", { exact: true })).selectOption({
    label: "Demolition",
  });
  await tasks.getByRole("button", { name: "Add task" }).click();
  const taskList = tasks.getByRole("list", { name: "Tasks" });
  await expect(taskList).toContainText("Tear out cabinets");
  await open(tasks, "Add a task");
  await visible(tasks.getByLabel("Task", { exact: true })).fill("Hang cabinets");
  await tasks.getByRole("button", { name: "Add task" }).click();
  await expect(taskList).toContainText("Hang cabinets");

  // Hanging waits on tearing out.
  await taskList.getByRole("link", { name: "Hang cabinets" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hang cabinets" })).toBeVisible();
  const waits = page.getByRole("region", { name: "Waits on" });
  await open(waits, "Make it wait on another task");
  await visible(waits.getByLabel("Waits on", { exact: true })).selectOption({
    label: `${projectName}: Tear out cabinets`,
  });
  await waits.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/Blocked: waits on “Tear out cabinets”/)).toBeVisible();

  // On the project it shows as blocked, with no way to finish it yet.
  await page.getByRole("link", { name: `← ${projectName}` }).click();
  await expect(taskList).toContainText("Blocked: waits on “Tear out cabinets”");
  await expect(taskList.getByRole("button", { name: "Mark “Hang cabinets” done" })).toHaveCount(0);
  await taskList.getByRole("button", { name: "Mark “Tear out cabinets” done" }).click();
  await expect(taskList.getByRole("button", { name: "Mark “Hang cabinets” done" })).toBeVisible();
  await expect(milestones).toContainText("1 of 1 task done");
  await expect(milestones).toContainText("Done");

  // The schedule shows it across projects.
  await page.goto("/schedule?view=tasks");
  await expect(page.getByRole("region", { name: "Milestones" })).toContainText(projectName);
  await expect(page.getByRole("region", { name: "Still to do" })).toContainText("Hang cabinets");
});

test("schedule pages fit the screen", async ({ page }) => {
  for (const path of [
    "/schedule",
    "/schedule?view=week",
    "/schedule?view=agenda",
    "/schedule?view=tasks",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
