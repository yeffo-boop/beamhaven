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

test("search finds a project by a word in its name and opens it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  const word = `Zephyr${Date.now()}`;
  const projectName = `Attic ${word}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Search" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
  const box = page.getByRole("searchbox", { name: "Search for" });
  await box.fill(word.toLowerCase());
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 match");
  const projects = page.getByRole("region", { name: /Projects/ });
  await projects.getByRole("link", { name: new RegExp(projectName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent(`${word} nothing-like-this`)}`);
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});

test("search is reachable from the phone's top bar and fits the screen", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "Phone only.");
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Search" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
  await page.goto("/search?q=kitchen");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
