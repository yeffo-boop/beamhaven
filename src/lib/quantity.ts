import type { Cents } from "./money";

/**
 * Quantities ("2.5 boxes", "120 sq ft", "3 each") are stored as whole
 * thousandths, so they add up exactly and no floats reach the database.
 */

/** The most anyone sensibly orders of one thing (a million units). */
export const MAX_QUANTITY_MILLI = 1_000_000_000;

/** "2.5" → 2500, "1,200" → 1200000, "12" → 12000. Null if it isn't a positive number with up to 3 decimals. */
export function parseQuantity(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{0,3}))?$/.exec(cleaned) ?? /^\.(\d{1,3})$/.exec(cleaned);
  if (!match) return null;
  const [whole, fraction] = cleaned.startsWith(".") ? ["0", match[1]] : [match[1], match[2]];
  const milli = Number(whole) * 1000 + Number((fraction ?? "").padEnd(3, "0"));
  if (!Number.isSafeInteger(milli) || milli <= 0 || milli > MAX_QUANTITY_MILLI) return null;
  return milli;
}

/** 2500 → "2.5", 12000 → "12", 1200000 → "1,200". */
export function formatQuantity(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(milli % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}

/** For a form's text box: like formatQuantity, without the thousands commas. */
export function quantityInputValue(milli: number | null | undefined): string {
  return milli == null ? "" : formatQuantity(milli).replace(/,/g, "");
}

/** Unit price × quantity, to the nearest cent (halves round up). */
export function lineTotal(unitCents: Cents, quantityMilli: number): Cents {
  return (unitCents * BigInt(quantityMilli) + 500n) / 1000n;
}
