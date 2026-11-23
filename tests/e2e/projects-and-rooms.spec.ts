import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// A real 1×1 pixel PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Next.js keeps recently visited pages in the document, hidden, so going
 * back is instant. Form fields are matched among the visible ones only.
 */
function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}

/** Adds the household's first property if the tests haven't made one yet. */
async function ensureProperty(page: Page) {
  await page.goto("/projects");
  const firstProperty = page.getByRole("region", { name: "Start with your home" });
  const newProject = page.getByRole("link", { name: "New project" });
  // The page streams in; wait until it shows one or the other.
  await expect(firstProperty.or(newProject)).toBeVisible();
  if (await firstProperty.isVisible()) {
    await firstProperty.getByLabel("Name").fill("Our house");
    await firstProperty.getByLabel("City").fill("Portland");
    await firstProperty.getByRole("button", { name: "Add property" }).click();
    await expect(page.getByRole("link", { name: "New project" })).toBeVisible();
  }
}

/**
 * The Milestone 3 journey in one run: a room with measurements, a project
 * that works on it, and photos that only the household can see.
 */
test("rooms, projects and photos", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(60_000);
  const runId = Date.now();
  const roomName = `Kitchen ${runId}`;
  const projectName = `Kitchen remodel ${runId}`;

  await ensureProperty(page);

  // A room, measured in feet and inches.
  await page.goto("/rooms/new");
  await visible(page.getByLabel("Room name", { exact: true })).fill(roomName);
  await visible(page.getByLabel("Type", { exact: true })).selectOption("kitchen");
  await visible(page.getByLabel("Length", { exact: true })).fill(`12' 4 1/2"`);
  await visible(page.getByLabel("Width", { exact: true })).fill("10ft");
  await visible(page.getByLabel("Ceiling height", { exact: true })).fill(`8'`);
  await page.getByRole("button", { name: "Add room" }).click();
  await expect(page.getByRole("heading", { level: 1, name: roomName })).toBeVisible();
  const size = page.getByRole("region", { name: "Size" });
  await expect(size).toContainText("12′ 4½″");
  await expect(size).toContainText("10′");
  await expect(size).toContainText("Floor area (estimate)");
  await expect(size).toContainText("≈ 124 sq ft");

  // A typo is explained next to the field, not silently saved.
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Edit ${roomName}` })).toBeVisible();
  await visible(page.getByLabel("Width", { exact: true })).fill("ten feet");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`Enter a length like 12' 4" or 12' 4 1/2"`)).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: roomName })).toBeVisible();

  // A window, which comes off the wall area.
  const openings = page.getByRole("region", { name: "Windows and doors" });
  await openings.getByText("Add a window or door").click();
  await visible(openings.getByLabel("Label (optional)", { exact: true })).fill("Over the sink");
  await visible(openings.getByLabel("Width", { exact: true })).fill(`36"`);
  await visible(openings.getByLabel("Height", { exact: true })).fill(`48"`);
  await openings.getByRole("button", { name: "Add" }).click();
  await expect(openings.getByRole("list", { name: "Windows and doors" })).toContainText(
    "Window: Over the sink",
  );

  // A project that works on the room.
  await page.goto("/projects/new");
  await visible(page.getByLabel("Project name", { exact: true })).fill(projectName);
  await visible(page.getByLabel("Status", { exact: true })).selectOption("in_progress");
  await visible(page.getByLabel("Planned start", { exact: true })).fill("2027-03-01");
  await visible(page.getByLabel("Planned finish", { exact: true })).fill("2027-02-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("The planned end is before the start")).toBeVisible();
  await visible(page.getByLabel("Planned finish", { exact: true })).fill("2027-05-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByText("In progress").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Details" })).toContainText("Mar 1, 2027");

  const rooms = page.getByRole("region", { name: "Rooms" });
  await rooms.getByText("Choose rooms").click();
  await rooms.getByRole("checkbox", { name: roomName }).check();
  await visible(rooms.getByLabel(`Planned work in ${roomName}`, { exact: true })).fill(
    "New cabinets and counters",
  );
  await rooms.getByRole("button", { name: "Save rooms" }).click();
  await expect(rooms.getByRole("list", { name: "Rooms in this project" })).toContainText(
    "New cabinets and counters",
  );

  // A photo on the project.
  const photos = page.getByRole("region", { name: "Photos" });
  await photos.locator('input[type="file"]').setInputFiles({
    name: "before.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const image = photos.getByRole("img", { name: "before.png" });
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^\/api\/files\/\w+$/);

  // The household sees it; someone who isn't signed in gets a plain 404.
  const own = await page.request.get(src ?? "");
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("image/png");
  const stranger = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const strangerResponse = await stranger.request.get(new URL(src ?? "", page.url()).toString());
  expect(strangerResponse.status()).toBe(404);
  await stranger.close();

  // A file that isn't a photo is refused, whatever its name says.
  await photos.locator('input[type="file"]').setInputFiles({
    name: "sneaky.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"),
  });
  await expect(photos.getByText(/That isn.t a photo we can use/)).toBeVisible();

  // The activity history records what happened.
  await expect(page.getByRole("list", { name: "Recent activity" })).toContainText(
    "Test Owner added a photo",
  );

  // The room page lists the project.
  await rooms.getByRole("link", { name: roomName }).click();
  await expect(page.getByRole("region", { name: "Projects" })).toContainText(projectName);
});

test("projects and rooms pages fit the screen", async ({ page }) => {
  for (const path of ["/projects", "/rooms"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});
