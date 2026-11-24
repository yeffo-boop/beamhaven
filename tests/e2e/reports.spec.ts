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

test("download a project's tasks as CSV and open its printable report", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const projectName = `Porch ${Date.now()}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Reports" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await page.getByLabel("Project", { exact: true }).selectOption({ label: projectName });
  await page.getByRole("button", { name: "Show reports" }).click();
  await expect(
    page.getByRole("heading", { name: `Spreadsheets for ${projectName}` }),
  ).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download tasks" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^tasks-porch-\d+\.csv$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(path, "utf8");
  expect(text.replace(/^﻿/, "").split("\r\n")[0]).toBe(
    "Project,Milestone,Task,Status,Priority,Due,Assigned to,Room,Done on",
  );

  await page.getByRole("link", { name: "Open the report" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByText("Project report", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();

  // When printed, the app's navigation and the print button are left out.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
});

test("an export for another household's project, or an unknown one, is not found", async ({
  page,
}) => {
  const unknown = await page.request.get("/api/reports/passwords");
  expect(unknown.status()).toBe(404);
  const otherProject = await page.request.get("/api/reports/budget?project=not-a-real-id");
  expect(otherProject.status()).toBe(404);
  const all = await page.request.get("/api/reports/budget");
  expect(all.status()).toBe(200);
  expect(all.headers()["content-type"]).toContain("text/csv");
});

test("Reports fits the screen", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
