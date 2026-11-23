import "server-only";

import { formatMoney } from "@/lib/money";
import { formatQuantity, parseQuantity } from "@/lib/quantity";
import { assertCan } from "@/server/auth/permissions";
import { recordActivity } from "@/server/data/activity";
import type { WorkspaceContext } from "@/server/data/context";
import { findOrCreateVendor } from "@/server/data/expenses";
import { listMaterials, setMaterialStatus } from "@/server/data/materials";
import {
  deleteBillRow,
  deleteDeliveryRow,
  deleteOrderRow,
  deleteReturnRow,
  findOrder,
  insertBill,
  insertDelivery,
  insertReturn,
  listOrders,
  materialProgress,
  type OrderDetail,
  type OrderSummary,
  saveOrderRows,
} from "@/server/data/orders";

import { removeFiles } from "./attachments";
import { fieldError, NotFoundError, RuleError } from "./errors";
import type { FormInput } from "./inputs";
import { billInput, deliveryInput, orderInput, type OrderInput, returnInput } from "./order-inputs";

/**
 * Orders (Milestone 6, part 2): what was bought, at what price, on which
 * budget lines, what has arrived, and the bill (ADR-029).
 */

export type { OrderInput };

export async function getOrders(
  ctx: WorkspaceContext,
  where: { projectId?: string; materialId?: string } = {},
): Promise<OrderSummary[]> {
  assertCan(ctx, "records:view");
  return listOrders(ctx, where);
}

export async function getOrder(ctx: WorkspaceContext, id: string): Promise<OrderDetail> {
  assertCan(ctx, "records:view");
  const order = await findOrder(ctx, id);
  if (!order) throw new NotFoundError("order");
  return order;
}

async function orderActivity(
  ctx: WorkspaceContext,
  order: { id: string; projectId: string },
  summary: string,
) {
  await recordActivity(ctx, {
    action: "order.changed",
    entityType: "order",
    entityId: order.id,
    summary,
  });
  await recordActivity(ctx, {
    action: "project.order_changed",
    entityType: "project",
    entityId: order.projectId,
    summary,
  });
}

/**
 * Validates the form and saves the order. An item picked from the
 * materials list takes the material's name when no description is typed.
 */
async function saveOrder(
  ctx: WorkspaceContext,
  id: string | null,
  projectId: string,
  input: OrderInput,
): Promise<{ id: string }> {
  assertCan(ctx, "records:edit");
  const parsed = orderInput.parse(input);
  const materialNames = new Map((await listMaterials(ctx, {})).map((m) => [m.id, m.name] as const));
  const items = parsed.items.map((item) => {
    const name = item.materialId ? materialNames.get(item.materialId) : undefined;
    if (item.materialId && name === undefined) throw new NotFoundError("material");
    return { ...item, description: item.description ?? name ?? "" };
  });
  const supplierId = await findOrCreateVendor(ctx, parsed.supplier);
  const result = await saveOrderRows(
    ctx,
    id,
    {
      projectId,
      supplierId,
      orderNumber: parsed.orderNumber,
      orderedOn: parsed.orderedOn,
      expectedOn: parsed.expectedOn,
      shippingCents: parsed.shipping,
      taxCents: parsed.tax,
      notes: parsed.notes,
    },
    items,
  );
  if (result.status === "not_found")
    throw new NotFoundError("order, project, budget line or material");
  if (result.status === "billed") throw new RuleError("order_billed");
  if (result.status === "wrong_line") {
    throw fieldError(
      "items",
      "Every item must be charged to a budget line of this order's project",
    );
  }
  if (result.status === "below_delivered") {
    throw fieldError(
      "items",
      `More of “${result.description}” has already arrived than that. Remove a delivery first.`,
    );
  }
  await moveMaterialsAlong(ctx, result.materialIds);
  return { id: result.id };
}

export async function createOrder(
  ctx: WorkspaceContext,
  projectId: string,
  input: OrderInput,
): Promise<{ id: string }> {
  const created = await saveOrder(ctx, null, projectId, input);
  const order = await getOrder(ctx, created.id);
  await orderActivity(ctx, order, `Placed ${order.title} for ${formatMoney(order.totalCents)}`);
  return created;
}

export async function updateOrder(
  ctx: WorkspaceContext,
  id: string,
  input: OrderInput,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const before = await getOrder(ctx, id);
  await saveOrder(ctx, id, before.projectId, input);
  const after = await getOrder(ctx, id);
  await orderActivity(ctx, after, `Changed ${after.title} (now ${formatMoney(after.totalCents)})`);
}

export async function deleteOrder(
  ctx: WorkspaceContext,
  id: string,
): Promise<{ projectId: string }> {
  assertCan(ctx, "records:edit");
  const before = await getOrder(ctx, id);
  const result = await deleteOrderRow(ctx, id);
  if (result.status === "not_found") throw new NotFoundError("order");
  if (result.status === "billed") throw new RuleError("order_has_bill");
  await removeFiles(ctx, result.fileIds);
  await recordActivity(ctx, {
    action: "project.order_deleted",
    entityType: "project",
    entityId: result.projectId,
    summary: `Deleted ${before.title}`,
  });
  return { projectId: result.projectId };
}

/**
 * Moves materials along with their orders: one that's on an order becomes
 * Ordered (if it was still being considered or chosen), Delivered once
 * every bit ordered has arrived, and Returned once every bit has gone
 * back. Statuses set by hand further along are left alone. `undoReturn`
 * (after a return is removed) moves a Returned material back again.
 */
async function moveMaterialsAlong(
  ctx: WorkspaceContext,
  materialIds: string[],
  { undoReturn = false } = {},
): Promise<void> {
  const progress = await materialProgress(ctx, materialIds);
  for (const [id, p] of progress) {
    if (p.orderedMilli === 0) continue;
    let current = p.status;
    if (undoReturn && current === "returned" && p.returnedMilli < p.orderedMilli) {
      current = "ordered";
    }
    if (current === "considering" || current === "selected") current = "ordered";
    if (current === "ordered" && p.deliveredMilli >= p.orderedMilli) current = "delivered";
    if ((current === "ordered" || current === "delivered") && p.returnedMilli >= p.orderedMilli) {
      current = "returned";
    }
    if (current !== p.status) {
      await setMaterialStatus(ctx, id, current);
      await recordActivity(ctx, {
        action: "material.status_changed",
        entityType: "material",
        entityId: id,
        summary: STATUS_NOTES[current] ?? `Marked as ${current}`,
      });
    }
  }
}

const STATUS_NOTES: Record<string, string> = {
  ordered: "Marked as ordered (from an order)",
  delivered: "Marked as delivered (everything ordered has arrived)",
  returned: "Marked as returned (everything ordered has gone back)",
};

// --- Deliveries ------------------------------------------------------------

/** `quantities` maps an order item's id to how much of it arrived, as typed. */
export async function recordDelivery(
  ctx: WorkspaceContext,
  orderId: string,
  input: FormInput<typeof deliveryInput>,
  quantities: Record<string, string>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const parsed = deliveryInput.parse(input);
  const amounts = new Map<string, number>();
  for (const [itemId, typed] of Object.entries(quantities)) {
    if (typed.trim() === "" || typed.trim() === "0") continue;
    const milli = parseQuantity(typed);
    if (milli === null) throw fieldError("items", "Enter how many arrived, like 3 or 2.5");
    amounts.set(itemId, milli);
  }
  const result = await insertDelivery(ctx, orderId, parsed, amounts);
  if (result.status === "not_found") throw new NotFoundError("order");
  if (result.status === "nothing") throw fieldError("items", "Enter how much of something arrived");
  if (result.status === "too_much") {
    throw fieldError("items", `That's more of “${result.description}” than is still to come`);
  }
  const count = [...amounts.values()].reduce((sum, n) => sum + n, 0);
  await recordActivity(ctx, {
    action: "order.delivered",
    entityType: "order",
    entityId: orderId,
    summary: `Recorded a delivery (${formatQuantity(count)} ${count === 1000 ? "item" : "items"})`,
  });
  await moveMaterialsAlong(ctx, result.materialIds);
}

export async function deleteDelivery(
  ctx: WorkspaceContext,
  orderId: string,
  deliveryId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await deleteDeliveryRow(ctx, orderId, deliveryId);
  if (result.status === "not_found") throw new NotFoundError("delivery");
  if (result.status === "returned") throw new RuleError("delivery_returned");
  await recordActivity(ctx, {
    action: "order.delivery_removed",
    entityType: "order",
    entityId: orderId,
    summary: "Removed a delivery",
  });
}

// --- The bill --------------------------------------------------------------

export async function recordBill(
  ctx: WorkspaceContext,
  orderId: string,
  input: FormInput<typeof billInput>,
): Promise<{ expenseId: string }> {
  assertCan(ctx, "records:edit");
  const parsed = billInput.parse(input);
  const result = await insertBill(ctx, orderId, {
    billDate: parsed.billDate,
    dueDate: parsed.dueDate,
    payment: parsed.paid ? { method: parsed.method } : null,
  });
  if (result.status === "not_found") throw new NotFoundError("order");
  if (result.status === "billed") throw new RuleError("order_has_bill");
  if (result.status === "zero") {
    throw fieldError("billDate", "This order comes to $0, so there's no bill to record");
  }
  const order = await getOrder(ctx, orderId);
  await orderActivity(
    ctx,
    order,
    `Recorded the bill for ${result.title}: ${formatMoney(result.totalCents)}${parsed.paid ? ", paid" : ""}`,
  );
  return { expenseId: result.expenseId };
}

export async function removeBill(ctx: WorkspaceContext, orderId: string): Promise<void> {
  assertCan(ctx, "records:edit");
  const order = await getOrder(ctx, orderId);
  const result = await deleteBillRow(ctx, orderId);
  if (result.status === "not_found") throw new NotFoundError("bill");
  if (result.status === "has_refunds") throw new RuleError("order_has_returns");
  await removeFiles(ctx, result.fileIds);
  await orderActivity(ctx, order, `Removed the bill for ${order.title}`);
}

// --- Returns (ADR-030) -----------------------------------------------------

/** `quantities` maps an order item's id to how much of it went back, as typed. */
export async function recordReturn(
  ctx: WorkspaceContext,
  orderId: string,
  input: FormInput<typeof returnInput>,
  quantities: Record<string, string>,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const parsed = returnInput.parse(input);
  const amounts = new Map<string, number>();
  for (const [itemId, typed] of Object.entries(quantities)) {
    if (typed.trim() === "" || typed.trim() === "0") continue;
    const milli = parseQuantity(typed);
    if (milli === null) throw fieldError("items", "Enter how many went back, like 3 or 2.5");
    amounts.set(itemId, milli);
  }
  const result = await insertReturn(
    ctx,
    orderId,
    {
      returnedOn: parsed.returnedOn,
      notes: parsed.notes,
      refundCents: parsed.refund,
      received: parsed.received ? { method: parsed.method } : null,
    },
    amounts,
  );
  if (result.status === "not_found") throw new NotFoundError("order");
  if (result.status === "not_billed") throw new RuleError("return_needs_bill");
  if (result.status === "nothing")
    throw fieldError("items", "Enter how much of something went back");
  if (result.status === "too_much") {
    throw fieldError(
      "items",
      `That's more of “${result.description}” than has arrived and is still here`,
    );
  }
  if (result.status === "refund_too_big") {
    throw fieldError(
      "refund",
      `The most this return can get back is ${formatMoney(result.largestCents)} (the items, their tax and shipping)`,
    );
  }
  const order = await getOrder(ctx, orderId);
  await orderActivity(
    ctx,
    order,
    result.refundCents > 0n
      ? `Recorded a return from ${result.title}: ${formatMoney(result.refundCents)} back${parsed.received ? ", received" : ""}`
      : `Recorded a return from ${result.title}, with nothing back`,
  );
  await moveMaterialsAlong(ctx, result.materialIds);
}

export async function deleteReturn(
  ctx: WorkspaceContext,
  orderId: string,
  returnId: string,
): Promise<void> {
  assertCan(ctx, "records:edit");
  const result = await deleteReturnRow(ctx, orderId, returnId);
  if (result.status === "not_found") throw new NotFoundError("return");
  await removeFiles(ctx, result.fileIds);
  const order = await getOrder(ctx, orderId);
  await orderActivity(ctx, order, `Removed a return from ${order.title}`);
  await moveMaterialsAlong(ctx, result.materialIds, { undoReturn: true });
}
