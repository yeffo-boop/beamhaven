import { z } from "zod";

import { parseMoney } from "@/lib/money";

import { optionalDate, optionalText, requiredDate, requiredText } from "./inputs";

/** Form rules for the budget. Amounts are typed as text and kept as cents. */

const MONEY_HINT = "Enter an amount like 1250 or 1,250.00";

function money(options: { allowNegative?: boolean; allowZero?: boolean } = {}) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === "") {
        context.addIssue({ code: "custom", message: "Enter an amount" });
        return z.NEVER;
      }
      const cents = parseMoney(value);
      if (cents === null) {
        context.addIssue({ code: "custom", message: MONEY_HINT });
        return z.NEVER;
      }
      if (cents < 0n && !options.allowNegative) {
        context.addIssue({ code: "custom", message: "Enter an amount above zero" });
        return z.NEVER;
      }
      if (cents === 0n && !options.allowZero) {
        context.addIssue({ code: "custom", message: "Enter an amount above zero" });
        return z.NEVER;
      }
      return cents;
    });
}

/** A required amount above zero. */
export const requiredMoney = z.string({ message: "Enter an amount" }).pipe(money());

/** A required amount that may be negative (a change order that lowers the price), but not zero. */
export const signedMoney = z
  .string({ message: "Enter an amount" })
  .pipe(money({ allowNegative: true }));

/** An optional amount of zero or more: "" is null. */
export const optionalMoney = z
  .string()
  .trim()
  .default("")
  .pipe(z.union([z.literal("").transform(() => null), money({ allowZero: true })]));

/** "" counts as 0 (the planned amount of a new line). */
export const plannedMoney = optionalMoney.transform((value) => value ?? 0n);

export const CATEGORY_KINDS = ["standard", "contingency"] as const;

export const categoryInput = z.object({
  name: requiredText(60, "Give the category a name", "The name"),
  kind: z.enum(CATEGORY_KINDS, { message: "Choose a kind" }).default("standard"),
});

export const lineInput = z.object({
  projectId: z.string().trim().min(1),
  categoryId: z.string().trim().min(1, "Choose a category"),
  roomId: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value === "" ? null : value)),
  name: z.string().trim().max(80, "The label is too long").default(""),
  planned: plannedMoney,
  estimate: optionalMoney,
  notes: optionalText(2000, "The notes"),
});

export const lineUpdateInput = lineInput.pick({
  name: true,
  planned: true,
  estimate: true,
  notes: true,
});

const reason = requiredText(500, "Say why, so the history makes sense later", "The reason");

export const adjustmentInput = z.object({
  lineId: z.string().trim().min(1),
  direction: z.enum(["increase", "decrease"], { message: "Choose raise or lower" }),
  amount: requiredMoney,
  reason,
  effectiveDate: requiredDate,
});

export const transferInput = z
  .object({
    fromLineId: z.string().trim().min(1, "Choose where the money comes from"),
    toLineId: z.string().trim().min(1, "Choose where the money goes"),
    amount: requiredMoney,
    reason,
    effectiveDate: requiredDate,
    allowOverAllocation: z
      .string()
      .default("")
      .transform((value) => value === "on" || value === "true"),
  })
  .refine((t) => t.fromLineId !== t.toLineId, {
    message: "Choose two different lines",
    path: ["toLineId"],
  });

export const reverseTransferInput = z.object({
  transferId: z.string().trim().min(1),
  reason,
});

export const COMMITMENT_SOURCES = ["quote", "contract", "change_order", "order", "manual"] as const;

export const commitmentInput = z.object({
  lineId: z.string().trim().min(1, "Choose a budget line"),
  vendorName: optionalText(120, "The name"),
  source: z.enum(COMMITMENT_SOURCES, { message: "Choose what kind of agreement it is" }),
  description: requiredText(200, "Describe what was agreed", "The description"),
  // A change order can lower the agreed amount, so negative is allowed.
  amount: signedMoney,
  committedOn: requiredDate,
  notes: optionalText(2000, "The notes"),
});

export const ALLOCATION_KINDS = ["item", "tax", "shipping"] as const;

/** Which part of a contractor's price a bill is for. */
export const PAYMENT_STAGES = ["deposit", "progress", "final"] as const;
export const STAGE_LABELS: Record<(typeof PAYMENT_STAGES)[number], string> = {
  deposit: "Deposit",
  progress: "Progress payment",
  final: "Final payment",
};

const allocationInput = z.object({
  lineId: z.string().trim().min(1, "Choose a budget line"),
  /** "" means "work it out": the rest of the total, shared among blank rows. */
  amount: z
    .string()
    .trim()
    .default("")
    .pipe(z.union([z.literal("").transform(() => null), money()])),
  kind: z.enum(ALLOCATION_KINDS).default("item"),
});

export const expenseInput = z
  .object({
    vendorName: optionalText(120, "The name"),
    commitmentId: z
      .string()
      .trim()
      .default("")
      .transform((value) => (value === "" ? null : value)),
    description: requiredText(200, "Describe the expense", "The description"),
    expenseDate: requiredDate,
    dueDate: optionalDate,
    total: requiredMoney,
    notes: optionalText(2000, "The notes"),
    stage: z
      .enum(["", ...PAYMENT_STAGES], { message: "Choose deposit, progress or final" })
      .default("")
      .transform((value) => (value === "" ? null : value)),
    allocations: z.array(allocationInput).min(1, "Charge it to at least one budget line").max(50),
  })
  .refine((e) => !e.dueDate || e.dueDate >= e.expenseDate, {
    message: "The due date is before the bill's date",
    path: ["dueDate"],
  });

export const refundInput = z.object({
  amount: requiredMoney,
  description: requiredText(200, "Say what was returned or refunded", "The description"),
  expenseDate: requiredDate,
});

export const PAYMENT_METHODS = ["card", "check", "transfer", "cash", "other"] as const;

export const paymentInput = z.object({
  amount: requiredMoney,
  paidOn: requiredDate,
  method: z.enum(PAYMENT_METHODS, { message: "Choose how it was paid" }).default("other"),
  reference: optionalText(100, "The reference"),
  notes: optionalText(1000, "The notes"),
});
