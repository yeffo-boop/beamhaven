import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { createLine, deleteLine, getCategories, getProjectBudget } from "@/server/services/budget";
import { NotFoundError, RuleError } from "@/server/services/errors";
import {
  deleteCommitment,
  deleteExpense,
  getAllCommitments,
  getExpense,
  refundExpense,
  updateExpense,
} from "@/server/services/expenses";
import { createMaterial, deleteMaterial, getMaterial } from "@/server/services/materials";
import {
  createOrder,
  deleteDelivery,
  deleteOrder,
  getOrder,
  getOrders,
  type OrderInput,
  recordBill,
  recordDelivery,
  removeBill,
  updateOrder,
} from "@/server/services/orders";
import { createProject, deleteProject } from "@/server/services/projects";
import { createProperty } from "@/server/services/properties";

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
const rule = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toSatisfy((e) => e instanceof RuleError && e.code === code);

/** A bathroom project with a Materials line and a Fixtures line, and tile on the materials list. */
async function household(name: string) {
  const user = await createUser(name);
  const workspaceId = await createHousehold(`${name}'s household`, user.id);
  const ctx = await contextFor(user.id, workspaceId);
  const property = (await createProperty(ctx, { name: "House" })).id;
  const project = (
    await createProject(ctx, { propertyId: property, name: "Bathroom", status: "planning" })
  ).id;
  const categories = await getCategories(ctx);
  const category = (n: string) => categories.find((c) => c.name === n)?.id ?? "";
  const materials = (
    await createLine(ctx, {
      projectId: project,
      categoryId: category("Materials"),
      planned: "2000",
    })
  ).id;
  const fixtures = (
    await createLine(ctx, { projectId: project, categoryId: category("Fixtures"), planned: "1000" })
  ).id;
  const tile = (
    await createMaterial(ctx, {
      name: "Floor tile",
      projectId: project,
      quantity: "12",
      unit: "box",
      unitPrice: "52.00",
      status: "selected",
    })
  ).id;
  return { user, workspaceId, ctx, property, project, materials, fixtures, tile, category };
}

type Household = Awaited<ReturnType<typeof household>>;

/** 12 boxes of tile at $49.99 and 3 bags of grout at $18.50 (Materials), a $289 faucet (Fixtures), $77.91 tax and $40 shipping. */
function bathroomOrder(h: Household, more: Partial<OrderInput> = {}): OrderInput {
  return {
    supplier: "Tile Shop",
    orderNumber: "A123",
    orderedOn: "2026-11-20",
    tax: "77.91",
    shipping: "40.00",
    items: [
      { materialId: h.tile, quantity: "12", unitPrice: "49.99", lineId: h.materials },
      { description: "Grout", quantity: "3", unitPrice: "18.50", lineId: h.materials },
      { description: "Faucet", quantity: "1", unitPrice: "289", lineId: h.fixtures },
    ],
    ...more,
  };
}

async function lines(h: Household) {
  const budget = await getProjectBudget(h.ctx, h.project);
  const pick = (id: string) => {
    const n = budget.lines.find((l) => l.id === id)?.numbers;
    return (
      n && {
        commitments: n.commitments,
        committed: n.committed,
        notYetInvoiced: n.notYetInvoiced,
        expenses: n.expenses,
        paid: n.paid,
        forecast: n.forecast,
      }
    );
  };
  return { materials: pick(h.materials), fixtures: pick(h.fixtures), totals: budget.totals };
}

describe("orders", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("puts a placed order in the budget as a commitment on each of its lines", async () => {
    const a = await household("Ana");
    const id = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    const order = await getOrder(a.ctx, id);
    expect(order).toMatchObject({
      title: "Order from Tile Shop (#A123)",
      itemsCents: 94_438n,
      totalCents: 106_229n,
      delivered: "none",
      bill: null,
    });
    // The material's name is used, and the price paid is kept on the item.
    expect(order.items.map((i) => [i.description, i.unitPriceCents, i.totalCents])).toEqual([
      ["Floor tile", 4_999n, 59_988n],
      ["Grout", 1_850n, 5_550n],
      ["Faucet", 28_900n, 28_900n],
    ]);
    // Materials $655.38 + tax $54.07 + shipping $27.76; Fixtures $289 + $23.84 + $12.24.
    const l = await lines(a);
    expect(l.materials).toMatchObject({
      commitments: 73_721n,
      notYetInvoiced: 73_721n,
      expenses: 0n,
    });
    expect(l.fixtures).toMatchObject({ commitments: 32_508n, notYetInvoiced: 32_508n });
    expect(l.totals.commitments).toBe(106_229n);
    // The tile was chosen, so it's now on order. Its own expected price is unchanged.
    expect(await getMaterial(a.ctx, a.tile)).toMatchObject({
      status: "ordered",
      unitPriceCents: 5_200n,
    });
    expect((await getOrders(a.ctx, { materialId: a.tile })).map((o) => o.id)).toEqual([id]);
  });

  it("follows changes until the bill is in, then keeps it as paid", async () => {
    const a = await household("Ana");
    const id = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    // The faucet comes off: the Fixtures commitment goes, tax and shipping move to Materials.
    const items = (await getOrder(a.ctx, id)).items;
    await updateOrder(a.ctx, id, {
      ...bathroomOrder(a),
      items: items.slice(0, 2).map((i) => ({
        id: i.id,
        materialId: i.materialId ?? "",
        description: i.materialId ? "" : i.description,
        quantity: "12",
        unitPrice: i.id === items[0]?.id ? "49.99" : "18.50",
        lineId: a.materials,
      })),
    });
    let l = await lines(a);
    expect(l.fixtures?.commitments).toBe(0n);
    expect(l.materials?.commitments).toBe(59_988n + 22_200n + 7_791n + 4_000n);

    // The bill, paid by card: committed stays the same, it's all spent and paid.
    await updateOrder(a.ctx, id, bathroomOrder(a));
    const { expenseId } = await recordBill(a.ctx, id, {
      billDate: "2026-11-21",
      paid: "on",
      method: "card",
    });
    l = await lines(a);
    expect(l.materials).toMatchObject({
      commitments: 73_721n,
      committed: 73_721n,
      notYetInvoiced: 0n,
      expenses: 73_721n,
      paid: 73_721n,
      forecast: 73_721n,
    });
    expect(l.fixtures).toMatchObject({ committed: 32_508n, expenses: 32_508n, notYetInvoiced: 0n });
    const bill = await getExpense(a.ctx, expenseId);
    expect(bill).toMatchObject({ totalCents: 106_229n, state: "paid", orderId: id });
    expect(bill.allocations.map((x) => [x.kind, x.amountCents])).toEqual([
      ["item", 65_538n],
      ["tax", 5_407n],
      ["shipping", 2_776n],
      ["item", 28_900n],
      ["tax", 2_384n],
      ["shipping", 1_224n],
    ]);

    // Now the order, its bill and its commitments stay as they were.
    await rule(updateOrder(a.ctx, id, bathroomOrder(a)), "order_billed");
    await rule(deleteOrder(a.ctx, id), "order_has_bill");
    await rule(recordBill(a.ctx, id, { billDate: "2026-11-21" }), "order_has_bill");
    await rule(
      updateExpense(a.ctx, expenseId, {
        description: "X",
        total: "1",
        expenseDate: "2026-11-21",
        allocations: [{ lineId: a.materials, amount: "", kind: "item" }],
      }),
      "order_bill",
    );
    await rule(deleteExpense(a.ctx, expenseId), "order_bill");
    await rule(
      refundExpense(a.ctx, expenseId, {
        amount: "10",
        description: "X",
        expenseDate: "2026-11-22",
      }),
      "order_bill",
    );

    // Taking the bill off makes it a commitment again, and editable.
    await removeBill(a.ctx, id);
    l = await lines(a);
    expect(l.materials).toMatchObject({ notYetInvoiced: 73_721n, expenses: 0n });
    await notFound(getExpense(a.ctx, expenseId));
    await deleteOrder(a.ctx, id);
    expect((await lines(a)).totals.commitments).toBe(0n);
  });

  it("records deliveries in parts, and moves the material along", async () => {
    const a = await household("Ana");
    const id = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    const [tileItem, grout, faucet] = (await getOrder(a.ctx, id)).items;
    if (!tileItem || !grout || !faucet) throw new Error("setup failed");
    await recordDelivery(
      a.ctx,
      id,
      { deliveredOn: "2026-11-24" },
      {
        [tileItem.id]: "8",
        [grout.id]: "3",
      },
    );
    let order = await getOrder(a.ctx, id);
    expect(order.delivered).toBe("partly");
    expect(order.items.map((i) => i.deliveredMilli)).toEqual([8_000, 3_000, 0]);
    expect((await getMaterial(a.ctx, a.tile)).status).toBe("ordered");
    // More than is still to come is refused, and so is nothing at all.
    await expect(
      recordDelivery(a.ctx, id, { deliveredOn: "2026-11-25" }, { [tileItem.id]: "5" }),
    ).rejects.toThrow(/more of “Floor tile” than is still to come/);
    await expect(
      recordDelivery(a.ctx, id, { deliveredOn: "2026-11-25" }, { [tileItem.id]: "" }),
    ).rejects.toThrow(/how much of something arrived/);
    // The rest arrives: the tile is delivered.
    await recordDelivery(
      a.ctx,
      id,
      { deliveredOn: "2026-11-26", notes: "Back-ordered boxes" },
      {
        [tileItem.id]: "4",
        [faucet.id]: "1",
      },
    );
    order = await getOrder(a.ctx, id);
    expect(order.delivered).toBe("all");
    expect(order.deliveries.map((d) => d.items.length)).toEqual([2, 2]);
    expect((await getMaterial(a.ctx, a.tile)).status).toBe("delivered");
    // The order can't be cut below what arrived.
    await expect(
      updateOrder(a.ctx, id, {
        ...bathroomOrder(a),
        items: [
          {
            id: tileItem.id,
            materialId: a.tile,
            quantity: "10",
            unitPrice: "49.99",
            lineId: a.materials,
          },
        ],
      }),
    ).rejects.toThrow(/already arrived/);
    // A delivery can be removed again.
    await deleteDelivery(a.ctx, id, order.deliveries[1]?.id ?? "");
    expect((await getOrder(a.ctx, id)).delivered).toBe("partly");
  });

  it("guards the lines, materials and projects an order uses", async () => {
    const a = await household("Ana");
    const id = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    await rule(deleteLine(a.ctx, a.fixtures), "line_in_use");
    await rule(deleteMaterial(a.ctx, a.tile), "material_on_order");
    // Its commitments can't be removed from the budget side.
    const fromOrder = (await getAllCommitments(a.ctx)).filter((c) => c.source === "order");
    expect(fromOrder).toHaveLength(2);
    await rule(deleteCommitment(a.ctx, fromOrder[0]?.id ?? ""), "agreement_commitment");
    // A line of another project can't pay for it.
    const other = (
      await createProject(a.ctx, { propertyId: a.property, name: "Den", status: "planning" })
    ).id;
    const otherLine = (
      await createLine(a.ctx, {
        projectId: other,
        categoryId: a.category("Materials"),
        planned: "1",
      })
    ).id;
    await expect(
      updateOrder(a.ctx, id, {
        ...bathroomOrder(a),
        items: [{ description: "Paint", quantity: "1", unitPrice: "40", lineId: otherLine }],
      }),
    ).rejects.toThrow(/budget line of this order's project/);
    // Form rules, by item.
    await expect(createOrder(a.ctx, a.project, { ...bathroomOrder(a), items: [] })).rejects.toThrow(
      /Add at least one item/,
    );
    await expect(
      createOrder(a.ctx, a.project, {
        ...bathroomOrder(a),
        items: [
          { description: "Grout", quantity: "1", unitPrice: "1", lineId: a.materials },
          { description: "Caulk", quantity: "0", unitPrice: "1", lineId: a.materials },
        ],
      }),
    ).rejects.toThrow(/Item 2: enter a quantity/);
    await expect(
      createOrder(a.ctx, a.project, {
        ...bathroomOrder(a),
        items: [{ description: "Caulk", quantity: "1", unitPrice: "1" }],
      }),
    ).rejects.toThrow(/Item 1: choose the budget line/);
    // A $0 order is allowed (a free sample) but adds nothing and has no bill.
    const free = (
      await createOrder(a.ctx, a.project, {
        supplier: "Tile Shop",
        orderedOn: "2026-11-20",
        items: [{ description: "Samples", quantity: "3", unitPrice: "0", lineId: a.materials }],
      })
    ).id;
    expect((await getOrder(a.ctx, free)).totalCents).toBe(0n);
    await expect(recordBill(a.ctx, free, { billDate: "2026-11-21" })).rejects.toThrow(/\$0/);
    // A project whose only order cost nothing can still be deleted, order and all.
    const den = (
      await createProject(a.ctx, { propertyId: a.property, name: "Closet", status: "planning" })
    ).id;
    const denLine = (
      await createLine(a.ctx, { projectId: den, categoryId: a.category("Materials"), planned: "0" })
    ).id;
    const sample = (
      await createOrder(a.ctx, den, {
        supplier: "Tile Shop",
        orderedOn: "2026-11-20",
        items: [{ description: "Sample", quantity: "1", unitPrice: "0", lineId: denLine }],
      })
    ).id;
    await deleteProject(a.ctx, den);
    await notFound(getOrder(a.ctx, sample));
  });

  it("keeps every household's orders to itself", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const bOrder = (await createOrder(b.ctx, b.project, bathroomOrder(b))).id;
    expect(await getOrders(a.ctx)).toEqual([]);
    await notFound(getOrder(a.ctx, bOrder));
    await notFound(updateOrder(a.ctx, bOrder, bathroomOrder(a)));
    await notFound(deleteOrder(a.ctx, bOrder));
    await notFound(recordBill(a.ctx, bOrder, { billDate: "2026-11-21" }));
    await notFound(removeBill(a.ctx, bOrder));
    const bItem = (await getOrder(b.ctx, bOrder)).items[0]?.id ?? "";
    await notFound(recordDelivery(a.ctx, bOrder, { deliveredOn: "2026-11-21" }, { [bItem]: "1" }));
    // Someone else's project, line or material can't be used.
    await notFound(createOrder(a.ctx, b.project, bathroomOrder(a)));
    await notFound(
      createOrder(a.ctx, a.project, {
        ...bathroomOrder(a),
        items: [{ description: "X", quantity: "1", unitPrice: "1", lineId: b.materials }],
      }),
    );
    await notFound(
      createOrder(a.ctx, a.project, {
        ...bathroomOrder(a),
        items: [{ materialId: b.tile, quantity: "1", unitPrice: "1", lineId: a.materials }],
      }),
    );
    // Nor someone else's order item, by its id.
    const aOrder = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    await notFound(
      updateOrder(a.ctx, aOrder, {
        ...bathroomOrder(a),
        items: [
          { id: bItem, description: "X", quantity: "1", unitPrice: "1", lineId: a.materials },
        ],
      }),
    );
    await notFound(recordDelivery(a.ctx, aOrder, { deliveredOn: "2026-11-21" }, { [bItem]: "1" }));
    // In the database itself, too.
    await expect(
      sql(`UPDATE order_items SET line_id = $1 WHERE order_id = $2`, [b.materials, aOrder]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE commitments SET order_id = $1 WHERE workspace_id = $2`, [bOrder, a.workspaceId]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE order_items SET quantity_milli = 0 WHERE order_id = $1`, [aOrder]),
    ).rejects.toThrow(/order_items_quantity_check/);
    await expect(
      sql(`UPDATE commitments SET source = 'manual' WHERE order_id = $1`, [aOrder]),
    ).rejects.toThrow(/commitments_order_source_check/);
  });

  it("lets viewers look but not change anything", async () => {
    const a = await household("Ana");
    const id = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    expect((await getOrder(viewer, id)).totalCents).toBe(106_229n);
    expect(await getOrders(viewer, { projectId: a.project })).toHaveLength(1);
    await forbidden(createOrder(viewer, a.project, bathroomOrder(a)));
    await forbidden(updateOrder(viewer, id, bathroomOrder(a)));
    await forbidden(deleteOrder(viewer, id));
    await forbidden(recordBill(viewer, id, { billDate: "2026-11-21" }));
    await forbidden(recordDelivery(viewer, id, { deliveredOn: "2026-11-21" }, {}));
  });
});
