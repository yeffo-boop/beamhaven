import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";

import { PermissionError } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import type { WorkspaceContext } from "@/server/data/context";
import { createLine, getCategories, getProjectBudget } from "@/server/services/budget";
import { NotFoundError, RuleError } from "@/server/services/errors";
import { deleteExpense, getExpense, updateExpense } from "@/server/services/expenses";
import { createMaterial, getMaterial } from "@/server/services/materials";
import {
  createOrder,
  deleteDelivery,
  deleteReturn,
  getOrder,
  type OrderInput,
  recordBill,
  recordDelivery,
  recordReturn,
  removeBill,
} from "@/server/services/orders";
import { createProject } from "@/server/services/projects";
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

/** The bathroom order, all delivered, with its bill recorded and paid by card. */
async function deliveredAndBilled(h: Household) {
  const id = (await createOrder(h.ctx, h.project, bathroomOrder(h))).id;
  const items = (await getOrder(h.ctx, id)).items;
  const [tile, grout, faucet] = items.map((i) => i.id);
  await recordDelivery(
    h.ctx,
    id,
    { deliveredOn: "2026-11-22" },
    Object.fromEntries(items.map((i) => [i.id, String(i.quantityMilli / 1000)])),
  );
  const { expenseId } = await recordBill(h.ctx, id, {
    billDate: "2026-11-22",
    paid: "on",
    method: "card",
  });
  return { id, tile: tile ?? "", grout: grout ?? "", faucet: faucet ?? "", billId: expenseId };
}

describe("order returns", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("gives back the items and their tax, and lowers what the order cost", async () => {
    const a = await household("Ana");
    const o = await deliveredAndBilled(a);
    // 4 of the 12 boxes go back: $199.96, and $16.49 of the Materials line's tax.
    await recordReturn(
      a.ctx,
      o.id,
      { returnedOn: "2026-11-25", received: "on", method: "card", notes: "Wrong color" },
      { [o.tile]: "4" },
    );
    const order = await getOrder(a.ctx, o.id);
    expect(order.refundedCents).toBe(21_645n);
    expect(order.returns).toMatchObject([
      { refundCents: 21_645n, refundReceived: true, notes: "Wrong color" },
    ]);
    expect(order.items[0]).toMatchObject({ deliveredMilli: 12_000, returnedMilli: 4_000 });
    // The Materials line now counts $737.21 − $216.45, all of it spent and paid.
    const l = await lines(a);
    expect(l.materials).toMatchObject({
      commitments: 52_076n,
      committed: 52_076n,
      notYetInvoiced: 0n,
      expenses: 52_076n,
      paid: 52_076n,
      forecast: 52_076n,
    });
    expect(l.fixtures).toMatchObject({ commitments: 32_508n, expenses: 32_508n });
    // The refund is a negative expense against the bill, changed only from the order.
    const refundId = order.returns[0]?.refundId ?? "";
    const refund = await getExpense(a.ctx, refundId);
    expect(refund).toMatchObject({
      totalCents: -21_645n,
      refundOfExpenseId: o.billId,
      orderId: o.id,
      state: "paid",
    });
    expect(refund.allocations.map((x) => [x.kind, x.amountCents])).toEqual([
      ["item", -19_996n],
      ["tax", -1_649n],
    ]);
    await rule(deleteExpense(a.ctx, refundId), "order_bill");
    await rule(
      updateExpense(a.ctx, refundId, {
        description: "X",
        total: "1",
        expenseDate: "2026-11-21",
        allocations: [{ lineId: a.materials, amount: "", kind: "item" }],
      }),
      "order_bill",
    );
    // The bill and the delivery the boxes came in now stay.
    await rule(removeBill(a.ctx, o.id), "order_has_returns");
    await rule(deleteDelivery(a.ctx, o.id, order.deliveries[0]?.id ?? ""), "delivery_returned");
    // Some tile is still here, so it isn't Returned.
    expect((await getMaterial(a.ctx, a.tile)).status).toBe("delivered");
  });

  it("keeps a restocking fee, refunds shipping, and marks a material returned", async () => {
    const a = await household("Ana");
    const o = await deliveredAndBilled(a);
    // The store kept a fee: $200.00 back for 4 boxes, not yet received.
    await recordReturn(a.ctx, o.id, { returnedOn: "2026-11-25", refund: "200" }, { [o.tile]: "4" });
    let l = await lines(a);
    expect(l.materials).toMatchObject({ commitments: 53_721n, expenses: 53_721n });
    // Paid is the bill; the $200 is still owed back to us.
    expect(l.materials?.paid).toBe(73_721n);
    // Then the faucet goes back with its shipping refunded too: the Fixtures line's whole share.
    await expect(
      recordReturn(
        a.ctx,
        o.id,
        { returnedOn: "2026-11-26", refund: "325.09" },
        { [o.faucet]: "1" },
      ),
    ).rejects.toThrow(/most this return can get back is \$325\.08/);
    await recordReturn(
      a.ctx,
      o.id,
      { returnedOn: "2026-11-26", refund: "325.08", received: "on" },
      { [o.faucet]: "1" },
    );
    l = await lines(a);
    expect(l.fixtures).toMatchObject({
      commitments: 0n,
      committed: 0n,
      notYetInvoiced: 0n,
      expenses: 0n,
      paid: 0n,
      forecast: 0n,
    });
    // The rest of the tile and all the grout: whatever the fee left can still come back.
    await recordReturn(
      a.ctx,
      o.id,
      { returnedOn: "2026-11-27", received: "on" },
      { [o.tile]: "8", [o.grout]: "3" },
    );
    l = await lines(a);
    // Items $655.38 and tax $54.07 back, less the $16.45 fee, so the fee and shipping are left.
    expect(l.materials).toMatchObject({ commitments: 1_645n + 2_776n, expenses: 4_421n });
    expect((await getMaterial(a.ctx, a.tile)).status).toBe("returned");
    // Nothing more can go back.
    await expect(
      recordReturn(a.ctx, o.id, { returnedOn: "2026-11-27" }, { [o.tile]: "1" }),
    ).rejects.toThrow(/more of “Floor tile” than has arrived/);

    // Taking the last return off puts the tile back, and the budget with it.
    const last = (await getOrder(a.ctx, o.id)).returns.at(-1)?.id ?? "";
    await deleteReturn(a.ctx, o.id, last);
    expect((await getMaterial(a.ctx, a.tile)).status).toBe("delivered");
    l = await lines(a);
    expect(l.materials).toMatchObject({ commitments: 53_721n, expenses: 53_721n });
    expect((await getOrder(a.ctx, o.id)).returns).toHaveLength(2);
  });

  it("needs the bill and the delivery, and allows nothing back", async () => {
    const a = await household("Ana");
    const id = (await createOrder(a.ctx, a.project, bathroomOrder(a))).id;
    const tile = (await getOrder(a.ctx, id)).items[0]?.id ?? "";
    await rule(
      recordReturn(a.ctx, id, { returnedOn: "2026-11-25" }, { [tile]: "1" }),
      "return_needs_bill",
    );
    await recordBill(a.ctx, id, { billDate: "2026-11-21" });
    await expect(
      recordReturn(a.ctx, id, { returnedOn: "2026-11-25" }, { [tile]: "1" }),
    ).rejects.toThrow(/than has arrived/);
    await recordDelivery(a.ctx, id, { deliveredOn: "2026-11-22" }, { [tile]: "2" });
    await expect(
      recordReturn(a.ctx, id, { returnedOn: "2026-11-25" }, { [tile]: "" }),
    ).rejects.toThrow(/how much of something went back/);
    // Sent back, but the store gave nothing: the budget doesn't change.
    await recordReturn(a.ctx, id, { returnedOn: "2026-11-25", refund: "0" }, { [tile]: "1" });
    const order = await getOrder(a.ctx, id);
    expect(order.returns).toMatchObject([{ refundCents: 0n, refundId: null }]);
    expect((await lines(a)).materials).toMatchObject({ commitments: 73_721n, expenses: 73_721n });
    // Even so, the bill stays while there's a return.
    await rule(removeBill(a.ctx, id), "order_has_returns");
  });

  it("keeps every household's returns to itself, and viewers out", async () => {
    const a = await household("Ana");
    const b = await household("Bo");
    const ao = await deliveredAndBilled(a);
    const bo = await deliveredAndBilled(b);
    await recordReturn(b.ctx, bo.id, { returnedOn: "2026-11-25" }, { [bo.tile]: "1" });
    const bReturn = (await getOrder(b.ctx, bo.id)).returns[0]?.id ?? "";
    await notFound(recordReturn(a.ctx, bo.id, { returnedOn: "2026-11-25" }, { [bo.tile]: "1" }));
    await notFound(recordReturn(a.ctx, ao.id, { returnedOn: "2026-11-25" }, { [bo.tile]: "1" }));
    await notFound(deleteReturn(a.ctx, bo.id, bReturn));
    await notFound(deleteReturn(a.ctx, ao.id, bReturn));
    expect((await getOrder(b.ctx, bo.id)).returns).toHaveLength(1);

    const vera = await createUser("Vera");
    await addMember(a.workspaceId, vera.id, "viewer");
    const viewer = await contextFor(vera.id, a.workspaceId);
    await forbidden(recordReturn(viewer, ao.id, { returnedOn: "2026-11-25" }, { [ao.tile]: "1" }));
    await recordReturn(a.ctx, ao.id, { returnedOn: "2026-11-25" }, { [ao.tile]: "1" });
    const aReturn = (await getOrder(viewer, ao.id)).returns[0]?.id ?? "";
    await forbidden(deleteReturn(viewer, ao.id, aReturn));

    // The database refuses crossing households, and nonsense amounts.
    await expect(
      sql(`UPDATE return_items SET order_item_id = $1 WHERE return_id = $2`, [bo.tile, aReturn]),
    ).rejects.toThrow(/foreign key/);
    await expect(
      sql(`UPDATE return_items SET quantity_milli = 0 WHERE return_id = $1`, [aReturn]),
    ).rejects.toThrow(/return_items_quantity_check/);
    await expect(
      sql(`UPDATE order_returns SET refund_cents = 0 WHERE id = $1`, [aReturn]),
    ).rejects.toThrow(/order_returns_refund_check/);
    // Only an order's commitment can come down to $0.
    await expect(
      sql(
        `UPDATE commitments SET amount_cents = 0, order_id = NULL, source = 'manual' WHERE order_id = $1`,
        [ao.id],
      ),
    ).rejects.toThrow(/commitments_amount_check/);
  });
});
