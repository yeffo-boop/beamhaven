/**
 * Money is always a whole number of cents, held as a `bigint` (ADR-008).
 * Floats can't hold amounts like 0.10 exactly, so they never touch money.
 * These helpers turn what people type into cents and cents back into text.
 */

export type Cents = bigint;

/** The largest amount we accept anywhere: $100 million. */
export const MAX_CENTS: Cents = 10_000_000_000n;

/**
 * Reads an amount the way people type it: "1234", "$1,234.5", "1234.56",
 * "-25" or "(25.00)" for a refund. Returns null for anything else,
 * including more than two decimal places or amounts over MAX_CENTS.
 */
export function parseMoney(input: string): Cents | null {
  let text = input.trim().replace(/\s+/g, "");
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-") || text.startsWith("−")) {
    negative = !negative;
    text = text.slice(1);
  }
  text = text.replace(/^\$/, "");
  // Commas only as thousands separators: "1,234" yes, "12,34" no.
  if (text.includes(",")) {
    if (!/^\d{1,3}(,\d{3})*(\.\d*)?$/.test(text)) return null;
    text = text.replace(/,/g, "");
  }
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  const [, dollars = "", fraction = ""] = match;
  if (!dollars && !fraction) return null;
  const cents = BigInt(dollars || "0") * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

/** "$1,234.56", "−$25.00". Uses a real minus sign so it lines up in tables. */
export function formatMoney(cents: Cents, { showPlus = false } = {}): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = (abs % 100n).toString().padStart(2, "0");
  const sign = negative ? "−" : showPlus && cents > 0n ? "+" : "";
  return `${sign}$${dollars}.${rest}`;
}

/** The value to put back into an amount field: "1234.56" (no symbol or commas). */
export function moneyInputValue(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a > b ? a : b;
}

/**
 * Splits `total` in proportion to `weights` so the parts add up exactly
 * (BUDGET_DEFINITIONS rule 5). Each part is rounded down, then the cents
 * left over go one at a time to the parts that lost the most in rounding
 * (the "largest remainder" method); ties go to the earlier part.
 *
 * Works for negative totals (refunds) too. Weights must not be negative,
 * and at least one must be above zero.
 */
export function splitByWeights(total: Cents, weights: readonly Cents[]): Cents[] {
  if (weights.length === 0) throw new Error("Nothing to split between.");
  if (weights.some((w) => w < 0n)) throw new Error("Weights can't be negative.");
  const weightSum = sumCents(weights);
  if (weightSum === 0n) throw new Error("At least one weight must be above zero.");

  const negative = total < 0n;
  const abs = negative ? -total : total;
  const parts = weights.map((w) => (abs * w) / weightSum);
  const remainders = weights.map((w, index) => ({ index, rest: (abs * w) % weightSum }));
  let left = abs - sumCents(parts);
  remainders.sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1));
  for (const { index } of remainders) {
    if (left === 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return negative ? parts.map((p) => -p) : parts;
}

/** Splits evenly: $100 three ways is $33.34, $33.33, $33.33. */
export function splitEvenly(total: Cents, ways: number): Cents[] {
  return splitByWeights(total, Array<Cents>(ways).fill(1n));
}
