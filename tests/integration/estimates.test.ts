import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { createQuote, getQuote } from "@/server/services/agreements";
import { adjustLine, getCategories, getProjectBudget, lockBudget } from "@/server/services/budget";
import { NotFoundError, RuleError } from "@/server/services/errors";
import {
  addTypedArea,
  createEstimate,
  createPriceItem,
  deleteEstimate,
  deletePriceItem,
  getEstimate,
  getEstimates,
  getPriceItems,
  removeTypedArea,
  setMaterialsTax,
  setQuoteEstimate,
  updateEstimate,
  updatePriceItem,
} from "@/server/services/estimates";
import { createContractor } from "@/server/services/contractors";
import { createProject, deleteProject, linkProjectRooms } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { addOpening, createRoom, deleteRoom, updateRoom } from "@/server/services/rooms";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

async function sql(text: string, values: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: process.env["DATABASE_URL"] });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

const notFound = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(NotFoundError);
const forbidden = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(PermissionError);

/**
 * A household with a project on two rooms: a 12′ × 10′ kitchen (8′ ceiling,
 * a door and a window) and a 10′ × 10′ den with no ceiling height.
 */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const kitchen = (
    await createRoom(ctx, {
      propertyId: property,
      name: "Kitchen",
      type: "kitchen",
      length: "12'",
      width: "10'",
      ceilingHeight: "8'",
    })
  ).id;
  await addOpening(ctx, kitchen, { kind: "door", width: `3'`, height: `6' 8"` });
  await addOpening(ctx, kitchen, { kind: "window", width: `3'`, height: `4'` });
  const den = (
    await createRoom(ctx, {
      propertyId: property,
      name: "Den",
      type: "living",
      length: "10'",
      width: "10'",
    })
  ).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Floors", status: "planning" })
  ).id;
  await linkProjectRooms(ctx, project, [{ roomId: kitchen }, { roomId: den }]);
  const categories = await getCategories(ctx);
  const category = (n: string) => categories.find((c) => c.name === n)?.id ?? "";
  const flooring = (
    await createPriceItem(ctx, {
      name: "White oak LVP",
      measure: "floor",
      unit: "sq_ft",
      price: "4.29",
      labor: "2.00",
      wastePercent: "10",
      taxable: "on",
    })
  ).id;
  return {
    user,
    workspaceId,
    ctx,
    property,
    kitchen,
    den,
    project,
    flooring,
    materials: category("Materials"),
    labor: category("Labor"),
  };
}

type Household = Awaited<ReturnType<typeof household>>;

async function budgetLines(h: Household) {
  const budget = await getProjectBudget(h.ctx, h.project);
  return budget.lines.map((l) => ({
    category: l.categoryName,
    room: l.roomName,
    name: l.name,
    estimate: l.facts.estimateCents,
  }));
}

async function flooringEstimate(h: Household, more: Record<string, unknown> = {}) {
  return (
    await createEstimate(h.ctx, h.project, {
      name: "Flooring",
      priceItemId: h.flooring,
      materialCategoryId: h.materials,
      laborCategoryId: h.labor,
      roomIds: [h.kitchen, h.den],
      ...more,
    })
  ).id;
}

describe("room estimates", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("prices flooring for the chosen rooms and puts it in the budget, line by line", async () => {
    const a = await household("Ana");
    await setMaterialsTax(a.ctx, { rate: "9.25" });
    const id = await flooringEstimate(a);
    const e = await getEstimate(a.ctx, id);
    // Kitchen 120.0 sq ft, den 100.0 sq ft (whole-millimetre sizes, so a hair over).
    const [kitchen, den] = e.result.rows;
    // Kitchen: 120.01 × 1.1 × $4.29 = $566.34, tax $52.39, labor $240.03.
    expect(kitchen).toMatchObject({
      materialCents: 56_634n,
      taxCents: 5_239n,
      laborCents: 24_003n,
    });
    // Den: 100.00 × 1.1 × $4.29 = $471.90 (to the cent), tax $43.65, labor $200.00.
    expect(den?.materialCents).toBe(47_190n);
    expect(den?.laborCents).toBe(20_000n);
    expect(e.result.totalCents).toBe(56_634n + 5_239n + 24_003n + 47_190n + 4_365n + 20_000n);

    // Material and tax on Materials, install on Labor, one line per room.
    expect(await budgetLines(a)).toEqual(
      expect.arrayContaining([
        { category: "Materials", room: "Kitchen", name: "Flooring", estimate: 61_873n },
        { category: "Labor", room: "Kitchen", name: "Flooring", estimate: 24_003n },
        { category: "Materials", room: "Den", name: "Flooring", estimate: 51_555n },
        { category: "Labor", room: "Den", name: "Flooring", estimate: 20_000n },
      ]),
    );
    expect(await budgetLines(a)).toHaveLength(4);
    const budget = await getProjectBudget(a.ctx, a.project);
    expect(budget.totals.estimate).toBe(e.result.totalCents);
  });

  it("follows price, room size, tax and room changes", async () => {
    const a = await household("Ana");
    const id = await flooringEstimate(a, { laborCategoryId: "", lineMode: "one_line" });
    const total = async () => (await getEstimate(a.ctx, id)).result.totalCents;
    const lineTotal = async () => (await budgetLines(a))[0]?.estimate;
    // One line for the whole project, labor included.
    expect(await budgetLines(a)).toHaveLength(1);
    expect(await lineTotal()).toBe(await total());
    const before = await total();

    await updatePriceItem(a.ctx, a.flooring, {
      name: "White oak LVP",
      measure: "floor",
      unit: "sq_ft",
      price: "5.00",
      wastePercent: "10",
      taxable: "on",
    });
    const afterPrice = await total();
    expect(afterPrice).not.toBe(before);
    expect(await lineTotal()).toBe(afterPrice);

    await updateRoom(a.ctx, a.den, { name: "Den", type: "living", length: "20'", width: "10'" });
    const afterRoom = await total();
    expect(afterRoom).toBeGreaterThan(afterPrice);
    expect(await lineTotal()).toBe(afterRoom);

    await setMaterialsTax(a.ctx, { rate: "10" });
    expect(await lineTotal()).toBe(await total());
    expect((await getEstimate(a.ctx, id)).result.taxCents).toBeGreaterThan(0n);

    // Taking the den off leaves just the kitchen.
    await updateEstimate(a.ctx, id, {
      name: "Flooring",
      priceItemId: a.flooring,
      materialCategoryId: a.materials,
      lineMode: "one_line",
      roomIds: [a.kitchen],
    });
    expect((await getEstimate(a.ctx, id)).areas.map((x) => x.roomName)).toEqual(["Kitchen"]);
    expect(await lineTotal()).toBe(await total());
  });

  it("prices paint by the gallon from wall areas, and asks for sizes it can't measure", async () => {
    const a = await household("Ana");
    const paint = (
      await createPriceItem(a.ctx, {
        name: "Eggshell, Swiss Coffee",
        measure: "walls",
        unit: "gallon",
        price: "78",
        coverage: "350",
        coats: "2",
      })
    ).id;
    const id = (
      await createEstimate(a.ctx, a.project, {
        name: "Paint",
        priceItemId: paint,
        materialCategoryId: a.materials,
        roomIds: [a.kitchen, a.den],
      })
    ).id;
    let e = await getEstimate(a.ctx, id);
    // The den has no ceiling height, so its walls can't be measured yet.
    expect(e.result.unmeasured).toBe(1);
    expect(e.result.cans).toBe(2); // kitchen: 320 sq ft × 2 coats / 350
    expect(e.result.materialCents).toBe(15_600n);

    // Typing the den's wall area in fills the gap; a shower wall gets its own row.
    await addTypedArea(a.ctx, id, { roomId: a.den, amount: "300" });
    await addTypedArea(a.ctx, id, { label: "Hall closet", amount: "60" });
    e = await getEstimate(a.ctx, id);
    expect(e.result.unmeasured).toBe(0);
    // 320 + 300 + 60 = 680 sq ft × 2 coats = 1,360 / 350 → 4 gallons.
    expect(e.result.cans).toBe(4);
    expect(e.result.materialCents).toBe(31_200n);
    // A hand-typed area with no room goes on a whole-project line.
    expect((await budgetLines(a)).map((l) => l.room)).toEqual(
      expect.arrayContaining(["Kitchen", "Den", null]),
    );
    await expect(addTypedArea(a.ctx, id, { amount: "60" })).rejects.toThrow(/Shower walls/);
    await expect(addTypedArea(a.ctx, id, { label: "X", amount: "lots" })).rejects.toThrow(
      /size like/,
    );

    // Clearing the den's typed size goes back to measuring it.
    const den = e.areas.find((x) => x.roomId === a.den)?.id ?? "";
    await removeTypedArea(a.ctx, den);
    expect((await getEstimate(a.ctx, id)).result.unmeasured).toBe(1);
  });

  it("lets go of its budget lines when deleted, keeping any with money on them", async () => {
    const a = await household("Ana");
    const id = await flooringEstimate(a);
    expect(await budgetLines(a)).toHaveLength(4);
    await lockBudget(a.ctx, a.project);
    const kitchenMaterials = (await getProjectBudget(a.ctx, a.project)).lines.find(
      (l) => l.roomName === "Kitchen" && l.categoryName === "Materials",
    );
    // Money moves onto one line (an adjustment, after locking in).
    await adjustLine(a.ctx, {
      lineId: kitchenMaterials?.id ?? "",
      direction: "increase",
      amount: "500",
      reason: "Flooring",
      effectiveDate: "2026-11-20",
    });

    // A room with estimate lines on it can't be deleted while they're there.
    await expect(deleteRoom(a.ctx, a.kitchen)).rejects.toBeInstanceOf(RuleError);
    await deleteEstimate(a.ctx, id);
    await notFound(getEstimate(a.ctx, id));
    // Only the line with an adjustment stays, now without an estimate.
    expect(await budgetLines(a)).toEqual([
      { category: "Materials", room: "Kitchen", name: "Flooring", estimate: null },
    ]);
  });

  it("keeps a price-list item that's in use, and compares a quote with an estimate", async () => {
    const a = await household("Ana");
    const id = await flooringEstimate(a, { laborCategoryId: "" });
    await expect(deletePriceItem(a.ctx, a.flooring)).rejects.toBeInstanceOf(RuleError);
    await expect(
      createPriceItem(a.ctx, {
        name: "white oak lvp",
        measure: "floor",
        unit: "sq_ft",
        price: "1",
      }),
    ).rejects.toThrow(/already/);
    await expect(
      createPriceItem(a.ctx, { name: "Trim", measure: "perimeter", unit: "sq_ft", price: "1" }),
    ).rejects.toThrow(/linear foot/);
    await expect(
      createPriceItem(a.ctx, { name: "Paint", measure: "walls", unit: "gallon", price: "40" }),
    ).rejects.toThrow(/gallon covers/);

    const contractor = (await createContractor(a.ctx, { name: "Floor Pros", status: "active" })).id;
    const quote = (
      await createQuote(a.ctx, {
        contractorId: contractor,
        projectId: a.project,
        title: "Floors installed",
        amount: "2000",
        receivedOn: "2026-11-01",
      })
    ).id;
    await setQuoteEstimate(a.ctx, quote, id);
    expect((await getQuote(a.ctx, quote)).estimateId).toBe(id);
    // Deleting the estimate stops the comparison, and keeps the quote.
    await deleteEstimate(a.ctx, id);
    expect((await getQuote(a.ctx, quote)).estimateId).toBeNull();
  });

  it("goes with its project", async () => {
    const a = await household("Ana");
    await flooringEstimate(a);
    await deleteProject(a.ctx, a.project);
    expect(await getPriceItems(a.ctx)).toHaveLength(1);
  });

  it("keeps every household's price list and estimates to itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const bEstimate = await flooringEstimate(b);
    expect((await getPriceItems(a.ctx)).map((p) => p.name)).toEqual(["White oak LVP"]);
    expect(await getEstimates(a.ctx, b.project)).toEqual([]);
    await notFound(getEstimate(a.ctx, bEstimate));
    await notFound(
      updatePriceItem(a.ctx, b.flooring, {
        name: "Mine",
        measure: "floor",
        unit: "sq_ft",
        price: "1",
      }),
    );
    await notFound(deletePriceItem(a.ctx, b.flooring));
    await notFound(deleteEstimate(a.ctx, bEstimate));
    await notFound(addTypedArea(a.ctx, bEstimate, { label: "X", amount: "10" }));
    const bArea = (await getEstimate(b.ctx, bEstimate)).areas[0]?.id ?? "";
    await notFound(removeTypedArea(a.ctx, bArea));
    // Someone else's project, price, category or room can't be used.
    const base = { name: "X", priceItemId: a.flooring, materialCategoryId: a.materials };
    await notFound(createEstimate(a.ctx, b.project, base));
    await notFound(createEstimate(a.ctx, a.project, { ...base, priceItemId: b.flooring }));
    await notFound(createEstimate(a.ctx, a.project, { ...base, materialCategoryId: b.materials }));
    await expect(
      createEstimate(a.ctx, a.project, { ...base, roomIds: [b.kitchen] }),
    ).rejects.toThrow(/part of this project/);
    await notFound(updateEstimate(a.ctx, bEstimate, { ...base, name: "Mine" }));
    // In the database itself, too.
    await flooringEstimate(a);
    await expect(
      sql(
        `INSERT INTO room_estimate_areas (id, workspace_id, estimate_id, room_id) VALUES ('x1', $1, $2, $3)`,
        [a.workspaceId, bEstimate, a.kitchen],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE budget_lines SET estimate_source_id = $1 WHERE workspace_id = $2`, [
        bEstimate,
        a.workspaceId,
      ]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE price_items SET unit = 'lin_ft' WHERE id = $1`, [a.flooring]),
    ).rejects.toThrow(/price_items_unit_check/);
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Ana");
    const id = await flooringEstimate(a);
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect((await getEstimate(viewer, id)).name).toBe("Flooring");
    expect(await getPriceItems(viewer)).toHaveLength(1);
    await forbidden(
      createPriceItem(viewer, { name: "X", measure: "floor", unit: "sq_ft", price: "1" }),
    );
    await forbidden(setMaterialsTax(viewer, { rate: "5" }));
    await forbidden(flooringEstimate({ ...a, ctx: viewer }));
    await forbidden(deleteEstimate(viewer, id));
    await forbidden(addTypedArea(viewer, id, { label: "X", amount: "1" }));
  });
});
