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

const pdf = (name: string, text: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.7\n%${text}\n`),
});

test("add a plan to a project, upload a revision, find it in Files, then delete it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const stamp = Date.now();
  const projectName = `Attic ${stamp}`;
  const title = `Attic floor plan ${stamp}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  // Add it from the project's Documents panel.
  const panel = page.getByRole("region", { name: "Documents" });
  await expect(panel).toContainText("No plans, permits or other documents");
  await panel.locator("summary", { hasText: "Add a document" }).click();
  await panel.getByLabel("Name", { exact: true }).fill(title);
  await panel.getByLabel("Category", { exact: true }).selectOption("plan");
  // A file that isn't a photo or a PDF is refused, and what was typed stays.
  await panel.locator('input[type="file"]').setInputFiles({
    name: "plan.html",
    mimeType: "text/html",
    buffer: Buffer.from("<html></html>"),
  });
  await panel.getByRole("button", { name: "Add document" }).click();
  await expect(panel).toContainText("Upload a photo or a PDF");
  await expect(panel.getByLabel("Name", { exact: true })).toHaveValue(title);
  await panel.locator('input[type="file"]').setInputFiles(pdf("attic-v1.pdf", "first"));
  await panel.getByRole("button", { name: "Add document" }).click();
  await expect(panel.getByRole("list", { name: "Documents" })).toContainText(title);

  // Its own page: upload version 2.
  await panel.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole("region", { name: "Details" })).toContainText(projectName);
  const versions = page.getByRole("region", { name: "Versions" });
  await versions.locator('input[type="file"]').setInputFiles(pdf("attic-v2.pdf", "second"));
  await versions.getByLabel("What changed (optional)").fill("Moved the stairs");
  await versions.getByRole("button", { name: "Upload new version" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Current version (2)" })).toBeVisible();
  const list = versions.getByRole("list", { name: "Versions" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Moved the stairs");
  await expect(page.getByRole("region", { name: "Current version (2)" })).toContainText(
    "attic-v2.pdf",
  );

  // The download is the file itself.
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download version 1" }).click();
  expect((await download).suggestedFilename()).toBe("attic-v1.pdf");

  // Remove version 1; the last one can't be removed.
  await list.locator("summary", { hasText: "Remove" }).last().click();
  await list.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.locator("summary", { hasText: "Remove" })).toHaveCount(0);

  // Files finds it by a file name.
  await page.goto("/files");
  await page.getByRole("searchbox", { name: "Search" }).fill(`attic-v2`);
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("region", { name: "Library" })).toContainText(title);
  await expect(page.getByRole("region", { name: "On other records" })).toBeVisible();

  // Delete it.
  await page.getByRole("region", { name: "Library" }).getByRole("link", { name: title }).click();
  await page.locator("summary", { hasText: `Delete ${title}` }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await page.goto(`/files?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("region", { name: "Library" })).toContainText("No documents match.");
});

test("the Files pages fit the screen", async ({ page }) => {
  await page.goto("/files");
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "/files scrolls sideways").toBeLessThanOrEqual(0);
  const first = page.getByRole("list", { name: "Documents" }).getByRole("link").first();
  if (await first.isVisible()) {
    await first.click();
    await expect(page.getByRole("region", { name: "Versions" })).toBeVisible();
    const detailOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(detailOverflow, "a document's page scrolls sideways").toBeLessThanOrEqual(0);
  }
});
