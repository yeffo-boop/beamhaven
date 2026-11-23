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

/** A day a few days from now, as "YYYY-MM-DD" (UTC, like the household's starting time zone). */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

test("put an inspection on a project, see it coming up and on the calendar, then record the result", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const stamp = Date.now();
  const projectName = `Basement ${stamp}`;
  const title = `Electrical rough-in ${stamp}`;
  const day = daysFromNow(3);
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const comingUp = page.getByRole("region", { name: "Coming up" });
  await expect(comingUp).toContainText("Nothing on the calendar");
  await open(comingUp, "Add an appointment or inspection");
  await visible(comingUp.getByLabel("What", { exact: true })).fill(title);
  await visible(comingUp.getByLabel("Kind", { exact: true })).selectOption("inspection");
  // The result only shows for an inspection.
  await expect(visible(comingUp.getByLabel("Result", { exact: true }))).toBeVisible();
  await visible(comingUp.getByLabel("Day", { exact: true })).fill(day);
  await visible(comingUp.getByLabel("Starts (optional)", { exact: true })).fill("09:30");
  await visible(comingUp.getByLabel("Ends (optional)", { exact: true })).fill("08:00");
  await comingUp.getByRole("button", { name: "Add to calendar" }).click();
  await expect(comingUp.getByText("The end is before the start")).toBeVisible();
  await visible(comingUp.getByLabel("Ends (optional)", { exact: true })).fill("11:00");
  await comingUp.getByRole("button", { name: "Add to calendar" }).click();
  await expect(comingUp.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await expect(comingUp).toContainText("9:30 AM – 11:00 AM · Inspection");

  // The week view of that day shows it, and so does the agenda.
  await page.goto(`/schedule?view=week&date=${day}`);
  await expect(
    page.getByRole("region", { name: /Week of/ }).getByRole("link", { name: new RegExp(title) }),
  ).toBeVisible();
  await page.goto(`/schedule?view=agenda&date=${day}`);
  const agenda = page.getByRole("list", { name: "Agenda" });
  await expect(agenda).toContainText(title);

  // It passed.
  await agenda.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  const edit = page.getByRole("region", { name: "Edit" });
  await visible(edit.getByLabel("Result", { exact: true })).selectOption("passed");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByText("Saved.")).toBeVisible();
  await expect(page.getByText("Passed", { exact: true }).first()).toBeVisible();
  const url = page.url();

  // Gone from the calendar once deleted.
  await page.locator("summary", { hasText: `Delete ${title}` }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByRole("region", { name: "Coming up" })).toContainText(
    "Nothing on the calendar",
  );
  // The page streams, so the status is already sent; the not-found page shows instead.
  await page.goto(url);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("calendar pages fit the screen", async ({ page }) => {
  for (const path of [`/schedule?date=${daysFromNow(0)}`, "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
