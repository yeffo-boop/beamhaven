import { type Cents, splitByWeights, splitEvenly, sumCents } from "./money";
import { lineTotal } from "./quantity";

/**
 * What an order costs, and how it lands on the budget (Milestone 6,
 * ADR-029). Pure, so it can be tested against hand calculations.
 */

export type OrderItemAmounts = { lineId: string; quantityMilli: number; unitPriceCents: Cents };

export type LineShare = {
  lineId: string;
  itemsCents: Cents;
  taxCents: Cents;
  shippingCents: Cents;
  totalCents: Cents;
};

export function itemTotal(item: { quantityMilli: number; unitPriceCents: Cents }): Cents {
  return lineTotal(item.unitPriceCents, item.quantityMilli);
}

/**
 * The order's cost on each budget line, in the order the lines first
 * appear: its items there, plus a share of the order's tax and shipping in
 * proportion to those items (evenly if every item is free), to the cent.
 */
export function shareByLine(
  items: readonly OrderItemAmounts[],
  taxCents: Cents,
  shippingCents: Cents,
): LineShare[] {
  const byLine = new Map<string, Cents>();
  for (const item of items) {
    byLine.set(item.lineId, (byLine.get(item.lineId) ?? 0n) + itemTotal(item));
  }
  const lines = [...byLine.entries()];
  if (lines.length === 0) return [];
  const weights = lines.map(([, cents]) => cents);
  const split = (total: Cents) =>
    sumCents(weights) === 0n ? splitEvenly(total, lines.length) : splitByWeights(total, weights);
  const tax = split(taxCents);
  const shipping = split(shippingCents);
  return lines.map(([lineId, itemsCents], index) => {
    const t = tax[index] ?? 0n;
    const s = shipping[index] ?? 0n;
    return { lineId, itemsCents, taxCents: t, shippingCents: s, totalCents: itemsCents + t + s };
  });
}

export function orderTotal(
  items: readonly { quantityMilli: number; unitPriceCents: Cents }[],
  taxCents: Cents,
  shippingCents: Cents,
): Cents {
  return sumCents(items.map(itemTotal)) + taxCents + shippingCents;
}
