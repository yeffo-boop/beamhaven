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

test("work through a punch list item with a photo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const projectName = `Hallway ${Date.now()}`;
  await ensureProperty(page);
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();

  const punch = page.getByRole("region", { name: "Punch list" });
  await expect(punch).toContainText("Nothing on the punch list.");
  await punch.locator("summary", { hasText: "Add to the punch list" }).click();
  await punch.getByLabel("What needs fixing").fill("Touch up paint by the door");
  await punch.getByRole("button", { name: "Add to punch list" }).click();
  await expect(punch).toContainText("1 open · 0 fixed · 0 signed off");

  await punch.getByRole("button", { name: "Mark fixed: “Touch up paint by the door”" }).click();
  await expect(punch).toContainText("0 open · 1 fixed · 0 signed off");

  await punch.getByRole("link", { name: "Touch up paint by the door" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Touch up paint by the door" }),
  ).toBeVisible();
  const files = page.getByRole("region", { name: "Photos and files" });
  await files.locator('input[type="file"]').setInputFiles({
    name: "scuff.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(files.getByRole("list", { name: "Documents" })).toContainText("scuff.png");

  await page.getByRole("button", { name: "Sign off: “Touch up paint by the door”" }).click();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("by Test Owner");
});

test("turn on a private calendar link and read the feed", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Calendar on your phone" });
  await section.getByRole("button", { name: /Turn on calendar link|Make a new link/ }).click();
  const link = await section.getByLabel("Your calendar link").inputValue();
  expect(link).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{43}$/);

  const feed = await request.get(new URL(link).pathname);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  expect(await feed.text()).toContain("BEGIN:VCALENDAR");

  await section.getByRole("button", { name: "Turn off" }).click();
  await expect(section).toContainText("This makes a private link");
  expect((await request.get(new URL(link).pathname)).status()).toBe(404);
});

test("the app can be added to a home screen", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as { display: string; icons: { src: string }[] };
  expect(body.display).toBe("standalone");
  for (const icon of body.icons) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
});
