import { beforeEach, describe, expect, it } from "vitest";

import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { createQuote } from "@/server/services/agreements";
import { addBoardItem, createBoard } from "@/server/services/boards";
import { createLine, getCategories } from "@/server/services/budget";
import { createContractor } from "@/server/services/contractors";
import { createExpense } from "@/server/services/expenses";
import { createMaterial } from "@/server/services/materials";
import { createOrder } from "@/server/services/orders";
import { createProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";
import { createRoom } from "@/server/services/rooms";
import { search, searchWords } from "@/server/services/search";
import { createTask } from "@/server/services/tasks";

import { addMember, createHousehold, createUser } from "../support/households";
import { resetDatabase } from "../support/reset-database";

async function contextFor(userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const ctx = await resolveWorkspaceContext(userId, workspaceId);
  if (!ctx) throw new Error("setup failed");
  return ctx;
}

/** A household with one of most kinds of record, all mentioning walnut somewhere. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "Walnut Street house" })).id;
  const room = (
    await createRoom(ctx, {
      propertyId: property,
      name: "Den",
      type: "other",
      notes: "walnut trim",
    })
  ).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Kitchen", status: "in_progress" })
  ).id;
  const task = (await createTask(ctx, { title: "Oil the walnut counters", projectId: project })).id;
  const contractor = (
    await createContractor(ctx, { name: `${name} Woodworks`, status: "active", trade: "Carpentry" })
  ).id;
  const quote = (
    await createQuote(ctx, {
      contractorId: contractor,
      projectId: project,
      title: "Walnut shelves",
      amount: "900",
      receivedOn: "2026-11-01",
    })
  ).id;
  const material = (
    await createMaterial(ctx, { name: "Butcher block", brand: "Walnut Co", status: "considering" })
  ).id;
  const categories = await getCategories(ctx);
  const line = (
    await createLine(ctx, {
      projectId: project,
      categoryId: categories.find((c) => c.name === "Materials")?.id ?? "",
      planned: "2000",
    })
  ).id;
  const expense = (
    await createExpense(ctx, {
      description: "Walnut slab deposit",
      total: "300",
      expenseDate: "2026-11-02",
      allocations: [{ lineId: line, amount: "", kind: "item" }],
    })
  ).id;
  const order = (
    await createOrder(ctx, project, {
      supplier: "Lumber Yard",
      orderNumber: "W-42",
      orderedOn: "2026-11-03",
      notes: "walnut boards",
      items: [{ description: "Boards", quantity: "4", unitPrice: "50", lineId: line }],
    })
  ).id;
  const board = (await createBoard(ctx, { name: "Kitchen look", roomId: "", projectId: "" })).id;
  const item = (
    await addBoardItem(
      ctx,
      board,
      {
        kind: "color",
        title: "Dark walnut stain",
        notes: "",
        colorHex: "#5c4033",
        brand: "",
        code: "",
        productUrl: "",
        materialId: "",
      },
      null,
    )
  ).id;
  return {
    user,
    workspaceId,
    ctx,
    property,
    room,
    project,
    task,
    contractor,
    quote,
    material,
    expense,
    order,
    board,
    item,
  };
}

describe("search", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("splits a query into words", () => {
    expect(searchWords("  Oak  floor oak ")).toEqual(["oak", "floor"]);
    expect(searchWords("a")).toEqual([]);
    expect(searchWords("a tile")).toEqual(["tile"]);
  });

  it("finds a word in names, notes and related names across kinds", async () => {
    const a = await household("Ana");
    const found = await search(a.ctx, "WALNUT");
    expect(found.searched).toBe(true);
    const byKind = Object.fromEntries(
      found.groups.map((g) => [g.kind, g.results.map((r) => r.href)]),
    );
    expect(byKind).toMatchObject({
      property: [`/properties/${a.property}`],
      room: [`/rooms/${a.room}`],
      task: [`/tasks/${a.task}`],
      quote: [`/quotes/${a.quote}`],
      material: [`/materials/${a.material}`],
      expense: [`/budget/expenses/${a.expense}`],
      order: [`/orders/${a.order}`],
      // A board item opens its board.
      board_item: [`/inspiration/${a.board}`],
    });
    // The kitchen project doesn't mention walnut.
    expect(byKind["project"]).toBeUndefined();

    // A contractor is found by its business name, kept on its vendor.
    const woodworks = await search(a.ctx, "woodworks");
    expect(woodworks.groups.find((g) => g.kind === "contractor")?.results[0]).toMatchObject({
      id: a.contractor,
      title: "Ana Woodworks",
      context: "Carpentry",
    });
    // So is a quote, through its contractor.
    expect(woodworks.groups.find((g) => g.kind === "quote")?.results[0]?.id).toBe(a.quote);
  });

  it("needs every word, in any field and any order", async () => {
    const a = await household("Ana");
    const both = await search(a.ctx, "counters walnut");
    expect(both.groups.map((g) => g.kind)).toEqual(["task"]);
    expect((await search(a.ctx, "walnut zebra")).total).toBe(0);
  });

  it("does nothing for an empty or one-letter query, and treats symbols as text", async () => {
    const a = await household("Ana");
    expect(await search(a.ctx, "")).toMatchObject({ searched: false, total: 0 });
    expect(await search(a.ctx, "w")).toMatchObject({ searched: false, total: 0 });
    expect(await search(a.ctx, undefined)).toMatchObject({ searched: false });
    expect(await search(a.ctx, ["walnut"])).toMatchObject({ searched: false });
    expect((await search(a.ctx, "%_' OR 1=1 --")).total).toBe(0);
    expect((await search(a.ctx, "W-42")).groups[0]?.kind).toBe("order");
  });

  it("never shows another household's records, and works for viewers", async () => {
    const a = await household("Ana");
    const b = await household("Ben");
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);

    const found = await search(viewer, "walnut");
    const ids = found.groups.flatMap((g) => g.results.map((r) => r.id));
    expect(ids).toContain(a.task);
    const theirs = new Set(Object.values(b).filter((v): v is string => typeof v === "string"));
    expect(ids.some((id) => theirs.has(id))).toBe(false);
    expect((await search(a.ctx, "Ben Woodworks")).total).toBe(0);
  });
});
