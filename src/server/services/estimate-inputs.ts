import { z } from "zod";

import { isCan, MEASURES, PRICE_UNITS, typedToBase } from "@/lib/room-estimate";

import { optionalMoney, requiredMoney } from "./budget-inputs";
import { optionalText, requiredText } from "./inputs";

/** Form rules for the price list and room estimates (Milestone 5, part 3). */

function wholeNumber(min: number, max: number, fallback: number, message: string) {
  return z
    .string()
    .trim()
    .default("")
    .transform((value, context) => {
      if (value === "") return fallback;
      const n = Number(value.replace(/%$/, ""));
      if (!Number.isInteger(n) || n < min || n > max) {
        context.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });
}

export const priceItemInput = z
  .object({
    name: requiredText(120, "Give it a name", "The name"),
    measure: z.enum(MEASURES, { message: "Choose what it's measured by" }),
    unit: z.enum(PRICE_UNITS, { message: "Choose what the price is for" }),
    price: requiredMoney,
    /** For paint: sq ft a gallon covers, or m² a litre covers. */
    coverage: z.string().trim().default(""),
    coats: wholeNumber(1, 10, 1, "Enter 1 to 10 coats"),
    labor: optionalMoney,
    wastePercent: wholeNumber(0, 100, 0, "Enter a whole percent from 0 to 100"),
    taxable: z
      .string()
      .default("")
      .transform((value) => value === "on" || value === "true"),
    notes: optionalText(2000, "The notes"),
  })
  .superRefine((p, context) => {
    const length = p.measure === "perimeter";
    const lengthUnit = p.unit === "lin_ft" || p.unit === "lin_m";
    if (length !== lengthUnit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: length
          ? "Trim is priced per linear foot or metre"
          : "Areas are priced per sq ft, m², gallon or litre",
      });
    }
    if (isCan(p.unit) && coverageMm2(p.unit, p.coverage) === null) {
      context.addIssue({
        code: "custom",
        path: ["coverage"],
        message:
          p.unit === "gallon"
            ? "Enter how many sq ft a gallon covers, like 350"
            : "Enter how many m² a litre covers, like 10",
      });
    }
  })
  .transform(({ coverage, price, labor, ...p }) => ({
    ...p,
    priceCents: price,
    laborCents: labor,
    coverageMm2: isCan(p.unit) ? coverageMm2(p.unit, coverage) : null,
    coats: isCan(p.unit) ? p.coats : 1,
  }));

function coverageMm2(unit: "gallon" | "litre", text: string): number | null {
  return typedToBase(text, unit === "gallon" ? "sq_ft" : "sq_m");
}

/** "9.25" (percent) → 925 hundredths of a percent. */
export const taxInput = z.object({
  rate: z
    .string()
    .trim()
    .default("")
    .transform((value, context) => {
      const clean = value.replace(/%$/, "").trim();
      if (clean === "") return 0;
      if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(clean) || Number(clean) > 50) {
        context.addIssue({ code: "custom", message: "Enter a percent like 9.25 (50 at most)" });
        return z.NEVER;
      }
      return Math.round(Number(clean) * 100);
    }),
});

export const estimateInput = z.object({
  name: requiredText(120, "Give it a name, like Flooring", "The name"),
  priceItemId: z.string().trim().min(1, "Choose an item from the price list"),
  materialCategoryId: z.string().trim().min(1, "Choose a budget category"),
  laborCategoryId: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value === "" ? null : value)),
  lineMode: z.enum(["per_room", "one_line"]).default("per_room"),
  notes: optionalText(2000, "The notes"),
  roomIds: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
});

export const typedAreaInput = z.object({
  roomId: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value === "" ? null : value)),
  label: optionalText(120, "The label"),
  amount: z.string().trim().min(1, "Enter the size"),
});
