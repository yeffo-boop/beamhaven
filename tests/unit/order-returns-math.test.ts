import { describe, expect, it } from "vitest";

import {
  largestRefund,
  type LineShare,
  refundableParts,
  splitRefund,
  usualRefund,
} from "@/lib/order-math";

// The order from order-math.test.ts: tile line $655.38 (+ $54.07 tax,
// $27.76 shipping), fixtures line $289.00 (+ $23.84 tax, $12.24 shipping).
const tile: LineShare = {
  lineId: "tile",
  itemsCents: 65_538n,
  taxCents: 5_407n,
  shippingCents: 2_776n,
  totalCents: 73_721n,
};
const fixtures: LineShare = {
  lineId: "fixtures",
  itemsCents: 28_900n,
  taxCents: 2_384n,
  shippingCents: 1_224n,
  totalCents: 32_508n,
};
const none = { item: 0n, tax: 0n, shipping: 0n };
const nothingBack = { share: tile, returnedBeforeCents: 0n, returnedNowCents: 0n, refunded: none };

describe("refunds for returns", () => {
  it("gives back a whole line's items, tax and (at most) shipping", () => {
    const parts = refundableParts([
      nothingBack,
      { share: fixtures, returnedBeforeCents: 0n, returnedNowCents: 28_900n, refunded: none },
    ]);
    // Only the line with something going back.
    expect(parts.map((p) => [p.lineId, p.cents, p.usual])).toEqual([
      ["fixtures", 28_900n, 28_900n],
      ["fixtures", 2_384n, 2_384n],
      ["fixtures", 1_224n, 0n],
    ]);
    expect(usualRefund(parts)).toBe(31_284n); // the faucet and its tax
    expect(largestRefund(parts)).toBe(32_508n); // the line's whole share
  });

  it("follows the items' value for tax and shipping, rounding down", () => {
    // 4 of 12 boxes of tile at $49.99 = $199.96.
    const parts = refundableParts([
      { share: tile, returnedBeforeCents: 0n, returnedNowCents: 19_996n, refunded: none },
    ]);
    // Tax 54.07 × 199.96 / 655.38 = 16.497…; shipping 27.76 × … = 8.469…
    expect(parts.map((p) => p.cents)).toEqual([19_996n, 1_649n, 846n]);
  });

  it("can give back what's left once everything has gone back, but usually only this return", () => {
    // The first return got $200.00 back (a restocking fee kept $16.45).
    const parts = refundableParts([
      {
        share: tile,
        returnedBeforeCents: 19_996n,
        returnedNowCents: 45_542n,
        refunded: { item: 18_476n, tax: 1_524n, shipping: 0n },
      },
    ]);
    expect(parts.map((p) => p.cents)).toEqual([65_538n - 18_476n, 5_407n - 1_524n, 2_776n]);
    expect(largestRefund(parts) + 18_476n + 1_524n).toBe(tile.totalCents);
    // Usually: the other 8 boxes and grout ($455.42) and the rest of the tax ($37.58).
    expect(parts.map((p) => p.usual)).toEqual([45_542n, 5_407n - 1_649n, 0n]);
  });

  it("shares a smaller refund over items and tax, and puts any extra on shipping", () => {
    const parts = [
      { lineId: "tile", kind: "item" as const, cents: 19_996n, usual: 19_996n },
      { lineId: "tile", kind: "tax" as const, cents: 1_649n, usual: 1_649n },
      { lineId: "tile", kind: "shipping" as const, cents: 846n, usual: 0n },
    ];
    // $200.00 of $216.45: 200 × 199.96 / 216.45 = 184.763…, tax 15.236…
    expect(splitRefund(20_000n, parts).map((p) => p.cents)).toEqual([18_476n, 1_524n]);
    expect(splitRefund(22_000n, parts).map((p) => [p.kind, p.cents])).toEqual([
      ["item", 19_996n],
      ["tax", 1_649n],
      ["shipping", 355n],
    ]);
    expect(splitRefund(0n, parts)).toEqual([]);
  });
});
