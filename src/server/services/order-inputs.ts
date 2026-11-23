import { z } from "zod";

import { parseMoney } from "@/lib/money";
import { parseQuantity } from "@/lib/quantity";

import { optionalMoney, PAYMENT_METHODS } from "./budget-inputs";
import { optionalDate, optionalText, requiredDate, requiredText } from "./inputs";

/** Form rules for orders, their bills and deliveries (Milestone 6, part 2). */

/** One row of the order form, as typed. Blank rows are dropped. */
export type OrderItemRow = {
  id: string;
  materialId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineId: string;
};

export type OrderItemValues = {
  id: string | null;
  materialId: string | null;
  description: string | null;
  quantityMilli: number;
  unitPriceCents: bigint;
  lineId: string;
};

const MAX_ITEMS = 50;

/** Checks each row, naming the row in the message ("Item 2: …"). */
const itemsInput = z
  .array(
    z.object({
      id: z.string().trim().max(64).default(""),
      materialId: z.string().trim().max(64).default(""),
      description: z.string().trim().max(200, "A description is too long").default(""),
      quantity: z.string().trim().default(""),
      unitPrice: z.string().trim().default(""),
      lineId: z.string().trim().max(64).default(""),
    }),
  )
  .max(MAX_ITEMS, `An order can hold up to ${MAX_ITEMS} items`)
  .transform((rows, context): OrderItemValues[] => {
    const filled = rows.filter(
      (r) => r.id || r.materialId || r.description || r.quantity || r.unitPrice,
    );
    if (filled.length === 0) {
      context.addIssue({ code: "custom", message: "Add at least one item" });
      return z.NEVER;
    }
    const result: OrderItemValues[] = [];
    filled.forEach((row, index) => {
      const problem = (message: string) =>
        context.addIssue({ code: "custom", message: `Item ${index + 1}: ${message}` });
      if (!row.materialId && !row.description) return problem("say what it is");
      const quantityMilli = parseQuantity(row.quantity);
      if (quantityMilli === null) return problem("enter a quantity above zero, like 3 or 2.5");
      const unitPriceCents = row.unitPrice === "" ? null : parseMoney(row.unitPrice);
      if (unitPriceCents === null || unitPriceCents < 0n) {
        return problem("enter the price paid for one, like 54.99 (0 if it was free)");
      }
      if (!row.lineId) return problem("choose the budget line that pays for it");
      result.push({
        id: row.id || null,
        materialId: row.materialId || null,
        description: row.description || null,
        quantityMilli,
        unitPriceCents,
        lineId: row.lineId,
      });
    });
    return result;
  });

export const orderInput = z.object({
  supplier: requiredText(150, "Say where it was ordered from", "The supplier"),
  orderNumber: optionalText(100, "The order number"),
  orderedOn: requiredDate,
  shipping: optionalMoney.transform((v) => v ?? 0n),
  tax: optionalMoney.transform((v) => v ?? 0n),
  notes: optionalText(5000, "The notes"),
  items: itemsInput,
});

export type OrderInput = Omit<
  { [K in keyof z.input<typeof orderInput>]?: string | null },
  "items"
> & {
  items?: Partial<OrderItemRow>[];
};

export const billInput = z
  .object({
    billDate: requiredDate,
    dueDate: optionalDate,
    // A checkbox: "on" when ticked.
    paid: z
      .string()
      .default("")
      .transform((v) => v === "on"),
    method: z.enum(PAYMENT_METHODS, { message: "Choose how it was paid" }).default("card"),
  })
  .refine((b) => !b.dueDate || b.dueDate >= b.billDate, {
    message: "The due date is before the bill's date",
    path: ["dueDate"],
  });

export const deliveryInput = z.object({
  deliveredOn: requiredDate,
  notes: optionalText(2000, "The notes"),
});
