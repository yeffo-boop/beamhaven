import type { Locator } from "@playwright/test";

import { expect, test } from "./fixtures";

// The first bytes of a real PNG, padded: enough for the server's type check.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);

async function itemTitles(list: Locator): Promise<string[]> {
  return list.getByRole("heading", { level: 3 }).allInnerTexts();
}

test("make a design board, add things, reorder them, approve one, then delete it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "laptop", "One full run is enough.");
  test.setTimeout(90_000);
  const name = `Kitchen finishes ${Date.now()}`;

  await page.goto("/inspiration");
  const start = page.getByRole("region", { name: "Start a board" });
  await start.getByLabel("Board name").fill(name);
  await start.getByRole("button", { name: "Start board" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("Nothing on this board yet.")).toBeVisible();

  const add = page.getByRole("region", { name: "Add to the board" });
  // A color: the picture field goes away.
  await add.getByLabel("What is it?").selectOption("color");
  await expect(add.getByLabel("Picture (optional)")).toHaveCount(0);
  await add.getByLabel("Name", { exact: true }).fill("Sage");
  await add.getByLabel("Color", { exact: true }).fill("#9caf88");
  await add.getByRole("button", { name: "Add to board" }).click();
  const list = page.getByRole("list", { name: "Board items" });
  await expect(list).toContainText("Sage");

  // An image needs its picture.
  await add.getByLabel("What is it?").selectOption("image");
  await add.getByLabel("Name", { exact: true }).fill("Open shelving");
  await add.getByRole("button", { name: "Add to board" }).click();
  await expect(add).toContainText("Choose a picture");
  await add.getByLabel("Picture").setInputFiles({
    name: "shelves.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await add.getByRole("button", { name: "Add to board" }).click();
  await expect(list).toContainText("Open shelving");

  await add.getByLabel("What is it?").selectOption("product");
  await add.getByLabel("Name", { exact: true }).fill("Brass pendant");
  await add.getByLabel("Link (optional)").fill("example.com/pendant");
  await add.getByRole("button", { name: "Add to board" }).click();
  await expect(list.getByRole("link", { name: /example\.com/ })).toBeVisible();
  expect(await itemTitles(list)).toEqual(["Sage", "Open shelving", "Brass pendant"]);

  // The buttons move things one place.
  await list.getByRole("button", { name: "Move Sage later" }).click();
  await expect.poll(() => itemTitles(list)).toEqual(["Open shelving", "Sage", "Brass pendant"]);

  // Dragging the pendant by its handle onto the first item puts it first, and it's saved.
  const handle = list.getByRole("button", { name: "Drag Brass pendant to reorder" });
  const target = list.getByRole("listitem").filter({ hasText: "Open shelving" });
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("the board isn't laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => itemTitles(list)).toEqual(["Brass pendant", "Open shelving", "Sage"]);
  await expect(page.getByText("Saving the new order…")).toHaveCount(0);
  await page.reload();
  await expect.poll(() => itemTitles(list)).toEqual(["Brass pendant", "Open shelving", "Sage"]);

  // Prefer one, approve another.
  await list.getByRole("button", { name: "Prefer: Sage" }).click();
  await expect(list.getByRole("button", { name: "Not preferred: Sage" })).toBeVisible();
  await list.getByRole("button", { name: "Approve: Brass pendant" }).click();
  const pendant = list.getByRole("listitem").filter({ hasText: "Brass pendant" });
  await expect(pendant).toContainText("Approved by Test Owner");
  await expect(page.getByText("1 approved")).toBeVisible();

  // Remove one.
  const shelving = list.getByRole("listitem").filter({ hasText: "Open shelving" });
  await shelving.locator("summary", { hasText: "Remove" }).click();
  await shelving.getByRole("button", { name: "Yes, remove it" }).click();
  await expect.poll(() => itemTitles(list)).toEqual(["Brass pendant", "Sage"]);

  // The board shows on Inspiration with its count, then goes.
  await page.goto("/inspiration");
  const card = page.getByRole("list", { name: "Design boards" }).getByRole("listitem").filter({
    hasText: name,
  });
  await expect(card).toContainText("2 items");
  await card.getByRole("link", { name }).click();
  await page.locator("summary", { hasText: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(page).toHaveURL(/\/inspiration$/);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("design board pages fit the screen", async ({ page }) => {
  await page.goto("/inspiration");
  await expect(page.getByRole("heading", { level: 1, name: "Inspiration" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "/inspiration scrolls sideways").toBeLessThanOrEqual(0);
  const first = page.getByRole("list", { name: "Design boards" }).getByRole("link").first();
  if (await first.isVisible()) {
    await first.click();
    // Another test running alongside may have just deleted it.
    const gone = page.getByText("This page could not be found.");
    await expect(page.getByRole("link", { name: "← Inspiration" }).or(gone)).toBeVisible();
    if (await gone.isVisible()) return;
    const detailOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(detailOverflow, "a board's page scrolls sideways").toBeLessThanOrEqual(0);
  }
});
