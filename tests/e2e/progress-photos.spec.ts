import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

test("sort progress photos into before and after, and compare them", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const projectName = `Bathroom ${Date.now()}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const photos = page.getByRole("region", { name: "Photos" });
  await expect(photos).toContainText("Take some before the work starts");
  await photos.getByLabel("Stage for new photos").selectOption("before");
  await photos.locator('input[type="file"]').setInputFiles({
    name: "old-tub.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(photos.getByRole("list", { name: "Before photos" })).toBeVisible();
  // One phase isn't enough to compare.
  await expect(photos.getByRole("heading", { name: "Before and after" })).toHaveCount(0);

  await photos.getByLabel("Stage for new photos").selectOption("");
  await photos.locator('input[type="file"]').setInputFiles({
    name: "new-shower.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const unsorted = photos.getByRole("list", { name: "Not sorted photos" });
  await expect(unsorted).toBeVisible();

  // Sort it afterwards, with a caption and the day it was taken.
  await unsorted.locator("summary", { hasText: "Details" }).click();
  await unsorted.getByLabel("Caption (optional)").fill("New shower");
  await unsorted.getByLabel("Stage", { exact: true }).selectOption("after");
  await unsorted.getByLabel("Taken on (optional)").fill("2026-11-20");
  await unsorted.getByRole("button", { name: "Save" }).click();

  const after = photos.getByRole("list", { name: "After photos" });
  await expect(after).toContainText("New shower · Nov 20, 2026");
  await expect(unsorted).toHaveCount(0);

  // Now there's a before and an after: the comparison appears.
  await expect(photos.getByRole("heading", { name: "Before and after" })).toBeVisible();
  await expect(photos.getByRole("img", { name: "Before: old-tub.png" })).toBeVisible();
  await expect(photos.getByRole("img", { name: "After: New shower (Nov 20, 2026)" })).toBeVisible();
  const slider = photos.getByRole("slider", { name: "How much of the before photo to show" });
  await slider.fill("20");
  await expect(slider).toHaveAttribute("aria-valuetext", "20% before");
  await expect(photos.getByRole("img", { name: "Before: old-tub.png" })).toHaveAttribute(
    "style",
    /inset\(0px 80% 0px 0px\)|inset\(0 80% 0 0\)/,
  );
});
