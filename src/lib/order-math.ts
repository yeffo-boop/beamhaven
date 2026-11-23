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

// --- Returns (Milestone 6, part 3, ADR-030) --------------------------------

export type RefundKind = "item" | "tax" | "shipping";

/** One budget line of a billed order, as a return sees it. */
export type ReturnLine = {
  /** The line's share of the order (from `shareByLine`). */
  share: LineShare;
  /** Value of the items on this line returned before, and with, this return. */
  returnedBeforeCents: Cents;
  returnedNowCents: Cents;
  /** Already refunded on this line, by kind (positive amounts). */
  refunded: Record<RefundKind, Cents>;
};

/** `cents` is the most that can come back; `usual` what this return normally brings. */
export type RefundPart = { lineId: string; kind: RefundKind; cents: Cents; usual: Cents };

/**
 * What this return can give back on each line it touches, and by kind.
 * Items count at the price paid; tax and shipping follow the items' value
 * on the line, rounded down, so once everything has gone back exactly the
 * line's tax and shipping can have been refunded, and never more.
 *
 * The **usual** refund is this return's own items and their tax. The most
 * it can bring also takes in its shipping, and whatever earlier returns on
 * those lines didn't get back (a fee the store later gave back after all).
 */
export function refundableParts(lines: readonly ReturnLine[]): RefundPart[] {
  return lines
    .filter((line) => line.returnedNowCents > 0n)
    .flatMap((line) => {
      const { share } = line;
      const before = line.returnedBeforeCents;
      const after = before + line.returnedNowCents;
      const follow = (value: Cents, total: Cents) =>
        share.itemsCents === 0n ? 0n : (value * total) / share.itemsCents;
      const kinds: [RefundKind, Cents, Cents][] = [
        ["item", before, after],
        ["tax", follow(before, share.taxCents), follow(after, share.taxCents)],
        ["shipping", follow(before, share.shippingCents), follow(after, share.shippingCents)],
      ];
      return kinds.map(([kind, was, target]) => {
        const left = max0(target - line.refunded[kind]);
        const usual = kind === "shipping" ? 0n : min(target - was, left);
        return { lineId: share.lineId, kind, cents: left, usual };
      });
    });
}

const max0 = (c: Cents) => (c > 0n ? c : 0n);
const min = (a: Cents, b: Cents) => (a < b ? a : b);

/** The usual refund: this return's items at the price paid, and their tax. */
export function usualRefund(parts: readonly RefundPart[]): Cents {
  return sumCents(parts.map((p) => p.usual));
}

/** The most this return can give back. */
export function largestRefund(parts: readonly RefundPart[]): Cents {
  return sumCents(parts.map((p) => p.cents));
}

/**
 * Shares a refund of `cents` (0 to `largestRefund`) over the parts, to the
 * cent: up to the usual refund in proportion to it; anything above that
 * pays the usual parts in full and the rest is shared over what's left.
 */
export function splitRefund(cents: Cents, parts: readonly RefundPart[]): RefundPart[] {
  const usual = usualRefund(parts);
  const share = (total: Cents, weights: Cents[]): Cents[] =>
    total === 0n || sumCents(weights) === 0n
      ? weights.map(() => 0n)
      : splitByWeights(total, weights);
  const amounts =
    cents <= usual
      ? share(
          cents,
          parts.map((p) => p.usual),
        )
      : share(
          cents - usual,
          parts.map((p) => p.cents - p.usual),
        ).map((extra, i) => extra + (parts[i]?.usual ?? 0n));
  return parts.map((p, i) => ({ ...p, cents: amounts[i] ?? 0n })).filter((p) => p.cents !== 0n);
}
