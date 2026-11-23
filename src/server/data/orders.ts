import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { itemTotal, orderTotal, shareByLine } from "@/lib/order-math";
import { paymentState, type PaymentState } from "@/server/services/budget-math";

import { type LineLabel, lineSelect, toLabel } from "./budget";
import { getPrisma } from "./client";
import type { WorkspaceContext } from "./context";
import { newId } from "./ids";

/**
 * Orders, their items, deliveries and bills (Milestone 6, part 2, ADR-029).
 *
 * Until its bill is recorded, an order is a **commitment** on each budget
 * line its items are charged to (items, plus a share of tax and shipping).
 * Its bill is one expense, split the same way, each part using up the
 * order's commitment on its own line. After that the order's items and
 * prices are kept as they were paid.
 */

type Tx = Prisma.TransactionClient;

export type OrderFields = {
  projectId: string;
  supplierId: string;
  orderNumber: string | null;
  orderedOn: Date;
  shippingCents: bigint;
  taxCents: bigint;
  notes: string | null;
};

export type OrderItemFields = {
  id: string | null;
  materialId: string | null;
  description: string;
  quantityMilli: number;
  unitPriceCents: bigint;
  lineId: string;
};

export type SaveOrderResult =
  | { status: "saved"; id: string; materialIds: string[] }
  | { status: "not_found" }
  | { status: "billed" }
  | { status: "wrong_line" }
  | { status: "below_delivered"; description: string };

/** "Order from Tile Shop (#A123)", the commitment's and bill's description. */
function orderTitle(supplier: string, orderNumber: string | null): string {
  return `Order from ${supplier}${orderNumber ? ` (#${orderNumber})` : ""}`;
}

/**
 * Creates or changes an order and its items, then brings its commitments
 * up to date. Items keep their ids, so deliveries stay attached to them.
 */
export async function saveOrderRows(
  ctx: WorkspaceContext,
  id: string | null,
  fields: OrderFields,
  items: OrderItemFields[],
): Promise<SaveOrderResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const [project, supplier] = await Promise.all([
      tx.project.count({ where: { id: fields.projectId, workspaceId: ws } }),
      tx.vendor.count({ where: { id: fields.supplierId, workspaceId: ws } }),
    ]);
    if (project !== 1 || supplier !== 1) return { status: "not_found" };
    const lineIds = [...new Set(items.map((i) => i.lineId))];
    const lines = await tx.budgetLine.findMany({
      where: { id: { in: lineIds }, workspaceId: ws },
      select: { projectId: true },
    });
    if (lines.length !== lineIds.length) return { status: "not_found" };
    if (lines.some((l) => l.projectId !== fields.projectId)) return { status: "wrong_line" };
    const materialIds = [...new Set(items.flatMap((i) => (i.materialId ? [i.materialId] : [])))];
    const materials = await tx.material.count({
      where: { id: { in: materialIds }, workspaceId: ws },
    });
    if (materials !== materialIds.length) return { status: "not_found" };

    let orderId = id;
    const before = new Set<string>();
    if (orderId) {
      // Locked, so two people saving at once can't both pass the checks.
      const locked = await tx.$queryRaw<{ bill_id: string | null }[]>`
        SELECT "bill_id" FROM "orders"
        WHERE "id" = ${orderId} AND "workspace_id" = ${ws}
        FOR UPDATE`;
      const row = locked[0];
      if (!row) return { status: "not_found" };
      if (row.bill_id) return { status: "billed" };
      const existing = await tx.orderItem.findMany({
        where: { orderId, workspaceId: ws },
        select: {
          id: true,
          description: true,
          materialId: true,
          deliveryItems: { select: { quantityMilli: true } },
        },
      });
      const keep = new Map(items.flatMap((i) => (i.id ? [[i.id, i] as const] : [])));
      for (const item of existing) {
        before.add(item.materialId ?? "");
        const delivered = item.deliveryItems.reduce((sum, d) => sum + d.quantityMilli, 0);
        const wanted = keep.get(item.id)?.quantityMilli ?? 0;
        if (delivered > wanted) return { status: "below_delivered", description: item.description };
      }
      if ([...keep.keys()].some((itemId) => !existing.some((e) => e.id === itemId))) {
        return { status: "not_found" };
      }
      await tx.order.update({ where: { id: orderId }, data: fields });
      await tx.orderItem.deleteMany({
        where: { orderId, workspaceId: ws, id: { notIn: [...keep.keys()] } },
      });
    } else {
      orderId = newId();
      await tx.order.create({
        data: { id: orderId, workspaceId: ws, createdById: ctx.userId, ...fields },
      });
    }
    for (const [position, item] of items.entries()) {
      const { id: itemId, ...data } = item;
      if (itemId) {
        await tx.orderItem.update({ where: { id: itemId }, data: { ...data, position } });
      } else {
        await tx.orderItem.create({
          data: { id: newId(), workspaceId: ws, orderId, position, ...data },
        });
      }
    }
    await syncCommitments(tx, ws, orderId);
    before.delete("");
    return {
      status: "saved",
      id: orderId,
      materialIds: [...new Set([...materialIds, ...before])],
    };
  });
}

/**
 * Makes the order's commitments match its items: one per budget line, for
 * that line's share; none where the share is $0 (a commitment is never 0).
 * Only for an order with no bill yet, so nothing uses these commitments.
 */
async function syncCommitments(tx: Tx, ws: string, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      orderedOn: true,
      supplierId: true,
      taxCents: true,
      shippingCents: true,
      supplier: { select: { name: true } },
      items: { select: { lineId: true, quantityMilli: true, unitPriceCents: true } },
    },
  });
  const shares = shareByLine(order.items, order.taxCents, order.shippingCents).filter(
    (s) => s.totalCents !== 0n,
  );
  await tx.commitment.deleteMany({
    where: { orderId, workspaceId: ws, lineId: { notIn: shares.map((s) => s.lineId) } },
  });
  const description = orderTitle(order.supplier.name, order.orderNumber);
  for (const share of shares) {
    const data = {
      vendorId: order.supplierId,
      description,
      amountCents: share.totalCents,
      committedOn: order.orderedOn,
    };
    await tx.commitment.upsert({
      where: { orderId_lineId: { orderId, lineId: share.lineId } },
      update: data,
      create: {
        id: newId(),
        workspaceId: ws,
        lineId: share.lineId,
        orderId,
        source: "order",
        ...data,
      },
    });
  }
}

// --- Reading ---------------------------------------------------------------

export type OrderItemRecord = {
  id: string;
  materialId: string | null;
  materialName: string | null;
  description: string;
  quantityMilli: number;
  unitPriceCents: bigint;
  totalCents: bigint;
  deliveredMilli: number;
  line: LineLabel;
};

export type DeliveryRecord = {
  id: string;
  deliveredOn: Date;
  notes: string | null;
  items: { orderItemId: string; description: string; quantityMilli: number }[];
};

export type OrderBill = {
  id: string;
  expenseDate: Date;
  dueDate: Date | null;
  totalCents: bigint;
  paidCents: bigint;
  state: PaymentState;
};

export type OrderDetail = OrderFields & {
  id: string;
  title: string;
  projectName: string;
  supplierName: string;
  items: OrderItemRecord[];
  itemsCents: bigint;
  totalCents: bigint;
  deliveries: DeliveryRecord[];
  bill: OrderBill | null;
  /** "none", "partly" or "all" of what was ordered has arrived. */
  delivered: DeliveryState;
};

export type DeliveryState = "none" | "partly" | "all";

function deliveryState(items: { quantityMilli: number; deliveredMilli: number }[]): DeliveryState {
  const ordered = items.reduce((sum, i) => sum + i.quantityMilli, 0);
  const arrived = items.reduce((sum, i) => sum + Math.min(i.deliveredMilli, i.quantityMilli), 0);
  if (arrived === 0) return "none";
  return arrived >= ordered ? "all" : "partly";
}

export async function findOrder(ctx: WorkspaceContext, id: string): Promise<OrderDetail | null> {
  const row = await getPrisma().order.findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      projectId: true,
      supplierId: true,
      orderNumber: true,
      orderedOn: true,
      shippingCents: true,
      taxCents: true,
      notes: true,
      project: { select: { name: true } },
      supplier: { select: { name: true } },
      items: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          materialId: true,
          description: true,
          quantityMilli: true,
          unitPriceCents: true,
          material: { select: { name: true } },
          line: { select: lineSelect },
          deliveryItems: { select: { quantityMilli: true } },
        },
      },
      deliveries: {
        orderBy: [{ deliveredOn: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          deliveredOn: true,
          notes: true,
          items: {
            select: {
              orderItemId: true,
              quantityMilli: true,
              orderItem: { select: { description: true, position: true } },
            },
          },
        },
      },
      bill: {
        select: {
          id: true,
          expenseDate: true,
          dueDate: true,
          totalCents: true,
          payments: { select: { amountCents: true } },
        },
      },
    },
  });
  if (!row) return null;
  const items: OrderItemRecord[] = row.items.map((i) => ({
    id: i.id,
    materialId: i.materialId,
    materialName: i.material?.name ?? null,
    description: i.description,
    quantityMilli: i.quantityMilli,
    unitPriceCents: i.unitPriceCents,
    totalCents: itemTotal(i),
    deliveredMilli: i.deliveryItems.reduce((sum, d) => sum + d.quantityMilli, 0),
    line: toLabel(i.line),
  }));
  const bill = row.bill
    ? (() => {
        const paidCents = row.bill.payments.reduce((sum, p) => sum + p.amountCents, 0n);
        return {
          id: row.bill.id,
          expenseDate: row.bill.expenseDate,
          dueDate: row.bill.dueDate,
          totalCents: row.bill.totalCents,
          paidCents,
          state: paymentState(row.bill.totalCents, paidCents),
        };
      })()
    : null;
  return {
    id: row.id,
    projectId: row.projectId,
    supplierId: row.supplierId,
    orderNumber: row.orderNumber,
    orderedOn: row.orderedOn,
    shippingCents: row.shippingCents,
    taxCents: row.taxCents,
    notes: row.notes,
    title: orderTitle(row.supplier.name, row.orderNumber),
    projectName: row.project.name,
    supplierName: row.supplier.name,
    items,
    itemsCents: items.reduce((sum, i) => sum + i.totalCents, 0n),
    totalCents: orderTotal(row.items, row.taxCents, row.shippingCents),
    deliveries: row.deliveries.map((d) => ({
      id: d.id,
      deliveredOn: d.deliveredOn,
      notes: d.notes,
      items: d.items
        .toSorted((a, b) => a.orderItem.position - b.orderItem.position)
        .map((di) => ({
          orderItemId: di.orderItemId,
          description: di.orderItem.description,
          quantityMilli: di.quantityMilli,
        })),
    })),
    bill,
    delivered: deliveryState(items),
  };
}

export type OrderSummary = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  orderedOn: Date;
  totalCents: bigint;
  itemCount: number;
  delivered: DeliveryState;
  billed: boolean;
};

export async function listOrders(
  ctx: WorkspaceContext,
  where: { projectId?: string; materialId?: string },
): Promise<OrderSummary[]> {
  const rows = await getPrisma().order.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      ...(where.projectId ? { projectId: where.projectId } : {}),
      ...(where.materialId ? { items: { some: { materialId: where.materialId } } } : {}),
    },
    orderBy: [{ orderedOn: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      projectId: true,
      orderNumber: true,
      orderedOn: true,
      taxCents: true,
      shippingCents: true,
      billId: true,
      project: { select: { name: true } },
      supplier: { select: { name: true } },
      items: {
        select: {
          quantityMilli: true,
          unitPriceCents: true,
          deliveryItems: { select: { quantityMilli: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: orderTitle(r.supplier.name, r.orderNumber),
    projectId: r.projectId,
    projectName: r.project.name,
    orderedOn: r.orderedOn,
    totalCents: orderTotal(r.items, r.taxCents, r.shippingCents),
    itemCount: r.items.length,
    delivered: deliveryState(
      r.items.map((i) => ({
        quantityMilli: i.quantityMilli,
        deliveredMilli: i.deliveryItems.reduce((sum, d) => sum + d.quantityMilli, 0),
      })),
    ),
    billed: r.billId !== null,
  }));
}

/**
 * How much of each material has been ordered and delivered, over every
 * order it's on. Used to move a material along to Ordered and Delivered.
 */
export async function materialProgress(
  ctx: WorkspaceContext,
  materialIds: string[],
): Promise<Map<string, { orderedMilli: number; deliveredMilli: number; status: string }>> {
  if (materialIds.length === 0) return new Map();
  const rows = await getPrisma().material.findMany({
    where: { id: { in: materialIds }, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      status: true,
      orderItems: {
        select: { quantityMilli: true, deliveryItems: { select: { quantityMilli: true } } },
      },
    },
  });
  return new Map(
    rows.map((m) => [
      m.id,
      {
        status: m.status,
        orderedMilli: m.orderItems.reduce((sum, i) => sum + i.quantityMilli, 0),
        deliveredMilli: m.orderItems.reduce(
          (sum, i) => sum + i.deliveryItems.reduce((s, d) => s + d.quantityMilli, 0),
          0,
        ),
      },
    ]),
  );
}

/** Deletes an order with no bill, and its commitments. Returns its documents' files. */
export async function deleteOrderRow(
  ctx: WorkspaceContext,
  id: string,
): Promise<
  | { status: "deleted"; fileIds: string[]; materialIds: string[]; projectId: string }
  | { status: "not_found" }
  | { status: "billed" }
> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const row = await tx.order.findFirst({
      where: { id, workspaceId: ws },
      select: {
        billId: true,
        projectId: true,
        attachments: { select: { fileId: true } },
        items: { select: { materialId: true } },
      },
    });
    if (!row) return { status: "not_found" };
    if (row.billId) return { status: "billed" };
    await tx.commitment.deleteMany({ where: { orderId: id, workspaceId: ws } });
    await tx.order.delete({ where: { id } });
    return {
      status: "deleted",
      projectId: row.projectId,
      fileIds: row.attachments.map((a) => a.fileId),
      materialIds: [...new Set(row.items.flatMap((i) => (i.materialId ? [i.materialId] : [])))],
    };
  });
}

// --- Deliveries ------------------------------------------------------------

export type DeliveryResult =
  | { status: "saved"; id: string; materialIds: string[] }
  | { status: "not_found" }
  | { status: "nothing" }
  | { status: "too_much"; description: string };

/** Records what arrived: never more of an item than is still to come. */
export async function insertDelivery(
  ctx: WorkspaceContext,
  orderId: string,
  delivery: { deliveredOn: Date; notes: string | null },
  quantities: Map<string, number>,
): Promise<DeliveryResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "orders" WHERE "id" = ${orderId} AND "workspace_id" = ${ws} FOR UPDATE`;
    if (locked.length === 0) return { status: "not_found" };
    const items = await tx.orderItem.findMany({
      where: { orderId, workspaceId: ws },
      select: {
        id: true,
        description: true,
        materialId: true,
        quantityMilli: true,
        deliveryItems: { select: { quantityMilli: true } },
      },
    });
    const rows: { orderItemId: string; quantityMilli: number }[] = [];
    for (const [itemId, quantityMilli] of quantities) {
      if (quantityMilli <= 0) continue;
      const item = items.find((i) => i.id === itemId);
      if (!item) return { status: "not_found" };
      const arrived = item.deliveryItems.reduce((sum, d) => sum + d.quantityMilli, 0);
      if (arrived + quantityMilli > item.quantityMilli) {
        return { status: "too_much", description: item.description };
      }
      rows.push({ orderItemId: itemId, quantityMilli });
    }
    if (rows.length === 0) return { status: "nothing" };
    const id = newId();
    await tx.delivery.create({
      data: { id, workspaceId: ws, orderId, createdById: ctx.userId, ...delivery },
    });
    await tx.deliveryItem.createMany({
      data: rows.map((r) => ({ id: newId(), workspaceId: ws, deliveryId: id, ...r })),
    });
    const materialIds = items.flatMap((i) =>
      i.materialId && rows.some((r) => r.orderItemId === i.id) ? [i.materialId] : [],
    );
    return { status: "saved", id, materialIds: [...new Set(materialIds)] };
  });
}

export async function deleteDeliveryRow(
  ctx: WorkspaceContext,
  orderId: string,
  deliveryId: string,
): Promise<boolean> {
  const result = await getPrisma().delivery.deleteMany({
    where: { id: deliveryId, orderId, workspaceId: ctx.workspaceId },
  });
  return result.count === 1;
}

// --- The bill --------------------------------------------------------------

export type BillResult =
  | { status: "saved"; expenseId: string; totalCents: bigint; title: string }
  | { status: "not_found" }
  | { status: "billed" }
  | { status: "zero" };

/**
 * Records the order's bill: one expense for the order's total, split onto
 * each budget line as items, tax and shipping, each part using up the
 * order's commitment on that line (ADR-029). Optionally paid in full.
 */
export async function insertBill(
  ctx: WorkspaceContext,
  orderId: string,
  bill: {
    billDate: Date;
    dueDate: Date | null;
    payment: { method: string } | null;
  },
): Promise<BillResult> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ bill_id: string | null }[]>`
      SELECT "bill_id" FROM "orders" WHERE "id" = ${orderId} AND "workspace_id" = ${ws} FOR UPDATE`;
    const row = locked[0];
    if (!row) return { status: "not_found" };
    if (row.bill_id) return { status: "billed" };
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        supplierId: true,
        orderNumber: true,
        taxCents: true,
        shippingCents: true,
        supplier: { select: { name: true } },
        items: { select: { lineId: true, quantityMilli: true, unitPriceCents: true } },
        commitments: { select: { id: true, lineId: true } },
      },
    });
    const total = orderTotal(order.items, order.taxCents, order.shippingCents);
    if (total === 0n) return { status: "zero" };
    const title = orderTitle(order.supplier.name, order.orderNumber);
    const commitmentOn = new Map(order.commitments.map((c) => [c.lineId, c.id]));
    const parts = shareByLine(order.items, order.taxCents, order.shippingCents).flatMap((s) =>
      (
        [
          ["item", s.itemsCents],
          ["tax", s.taxCents],
          ["shipping", s.shippingCents],
        ] as const
      )
        .filter(([, cents]) => cents !== 0n)
        .map(([kind, amountCents]) => ({
          lineId: s.lineId,
          kind,
          amountCents,
          commitmentId: commitmentOn.get(s.lineId) ?? null,
        })),
    );
    const expenseId = newId();
    await tx.expense.create({
      data: {
        id: expenseId,
        workspaceId: ws,
        vendorId: order.supplierId,
        description: title,
        expenseDate: bill.billDate,
        dueDate: bill.dueDate,
        totalCents: total,
        createdById: ctx.userId,
      },
    });
    await tx.expenseAllocation.createMany({
      data: parts.map((p, position) => ({
        id: newId(),
        workspaceId: ws,
        expenseId,
        position,
        ...p,
      })),
    });
    if (bill.payment) {
      await tx.payment.create({
        data: {
          id: newId(),
          workspaceId: ws,
          expenseId,
          amountCents: total,
          paidOn: bill.billDate,
          method: bill.payment.method,
          createdById: ctx.userId,
        },
      });
    }
    await tx.order.update({ where: { id: orderId }, data: { billId: expenseId } });
    return { status: "saved", expenseId, totalCents: total, title };
  });
}

/**
 * Takes the bill off again (its payments and receipts go with it), so the
 * order can be changed. Refused once a refund points at the bill.
 */
export async function deleteBillRow(
  ctx: WorkspaceContext,
  orderId: string,
): Promise<
  { status: "deleted"; fileIds: string[] } | { status: "not_found" } | { status: "has_refunds" }
> {
  const ws = ctx.workspaceId;
  return getPrisma().$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, workspaceId: ws },
      select: { billId: true, bill: { select: { _count: { select: { refunds: true } } } } },
    });
    if (!order?.billId) return { status: "not_found" };
    if ((order.bill?._count.refunds ?? 0) > 0) return { status: "has_refunds" };
    const attachments = await tx.attachment.findMany({
      where: { expenseId: order.billId, workspaceId: ws },
      select: { fileId: true },
    });
    await tx.order.update({ where: { id: orderId }, data: { billId: null } });
    await tx.expense.delete({ where: { id: order.billId } });
    return { status: "deleted", fileIds: attachments.map((a) => a.fileId) };
  });
}
