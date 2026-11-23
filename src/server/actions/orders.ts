"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireWorkspace } from "@/server/auth/workspace";
import {
  createOrder,
  deleteDelivery,
  deleteOrder,
  recordBill,
  recordDelivery,
  removeBill,
  updateOrder,
} from "@/server/services/orders";

import type { FormResult } from "./account";
import { asFormResult, idFrom, problemRedirect, text } from "./helpers";

/** Server Actions for orders, deliveries and their bills (Milestone 6, part 2). */

const ORDER_FIELDS = ["supplier", "orderNumber", "orderedOn", "shipping", "tax", "notes"] as const;

/** The item rows arrive as parallel lists, one entry per row. */
function orderInput(formData: FormData) {
  const list = (name: string) => formData.getAll(name).map((v) => (typeof v === "string" ? v : ""));
  const ids = list("itemId");
  const materials = list("itemMaterial");
  const descriptions = list("itemDescription");
  const quantities = list("itemQuantity");
  const prices = list("itemPrice");
  const lines = list("itemLine");
  return {
    ...Object.fromEntries(ORDER_FIELDS.map((name) => [name, text(formData, name)])),
    items: descriptions.map((description, index) => ({
      id: ids[index] ?? "",
      materialId: materials[index] ?? "",
      description,
      quantity: quantities[index] ?? "",
      unitPrice: prices[index] ?? "",
      lineId: lines[index] ?? "",
    })),
  };
}

export async function saveOrderAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const id = text(formData, "id");
  let target: string;
  try {
    if (id) {
      await updateOrder(ctx, id, orderInput(formData));
      target = id;
    } else {
      target = (await createOrder(ctx, idFrom(formData, "projectId"), orderInput(formData))).id;
    }
  } catch (error) {
    return asFormResult(error, formData);
  }
  redirect(`/orders/${target}`);
}

export async function deleteOrderAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const id = idFrom(formData);
  let projectId: string;
  try {
    ({ projectId } = await deleteOrder(ctx, id));
  } catch (error) {
    problemRedirect(`/orders/${id}`, error);
    asFormResult(error);
    return;
  }
  redirect(`/projects/${projectId}`);
}

export async function recordDeliveryAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  const quantities: Record<string, string> = {};
  for (const [name, value] of formData) {
    if (name.startsWith("deliver:") && typeof value === "string") {
      quantities[name.slice("deliver:".length)] = value;
    }
  }
  try {
    await recordDelivery(
      ctx,
      idFrom(formData, "orderId"),
      { deliveredOn: text(formData, "deliveredOn"), notes: text(formData, "notes") },
      quantities,
    );
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function deleteDeliveryAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  try {
    await deleteDelivery(ctx, idFrom(formData, "orderId"), idFrom(formData));
  } catch (error) {
    asFormResult(error);
    return;
  }
  refresh();
}

export async function recordBillAction(
  _previous: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const ctx = await requireWorkspace();
  try {
    await recordBill(ctx, idFrom(formData, "orderId"), {
      billDate: text(formData, "billDate"),
      dueDate: text(formData, "dueDate"),
      paid: text(formData, "paid"),
      method: text(formData, "method"),
    });
  } catch (error) {
    return asFormResult(error, formData);
  }
  refresh();
  return { status: "saved" };
}

export async function removeBillAction(formData: FormData): Promise<void> {
  const ctx = await requireWorkspace();
  const orderId = idFrom(formData, "orderId");
  try {
    await removeBill(ctx, orderId);
  } catch (error) {
    problemRedirect(`/orders/${orderId}`, error);
    asFormResult(error);
    return;
  }
  refresh();
}
