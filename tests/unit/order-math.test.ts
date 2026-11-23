import { describe, expect, it } from "vitest";

import { itemTotal, orderTotal, shareByLine } from "@/lib/order-math";

describe("order math", () => {
  const tile = { lineId: "tile", quantityMilli: 12_000, unitPriceCents: 4_999n }; // $599.88
  const grout = { lineId: "tile", quantityMilli: 3_000, unitPriceCents: 1_850n }; // $55.50
  const faucet = { lineId: "fixtures", quantityMilli: 1_000, unitPriceCents: 28_900n }; // $289.00

  it("prices each item at the price paid", () => {
    expect(itemTotal(tile)).toBe(59_988n);
    expect(itemTotal({ quantityMilli: 2_500, unitPriceCents: 5_499n })).toBe(13_748n);
  });

  it("puts each line's items there, with tax and shipping shared by value", () => {
    // Items: tile line $655.38, fixtures $289.00, $944.38 in all.
    // Tax $77.91 and shipping $40.00, shared 655.38 : 289.00.
    const shares = shareByLine([tile, grout, faucet], 7_791n, 4_000n);
    expect(shares).toEqual([
      {
        lineId: "tile",
        itemsCents: 65_538n,
        taxCents: 5_407n, // 77.91 × 655.38 / 944.38 = 54.068…
        shippingCents: 2_776n, // 40.00 × 655.38 / 944.38 = 27.759…
        totalCents: 73_721n,
      },
      {
        lineId: "fixtures",
        itemsCents: 28_900n,
        taxCents: 2_384n,
        shippingCents: 1_224n,
        totalCents: 32_508n,
      },
    ]);
    const all = shares.reduce((sum, s) => sum + s.totalCents, 0n);
    expect(all).toBe(orderTotal([tile, grout, faucet], 7_791n, 4_000n));
    expect(all).toBe(106_229n);
  });

  it("shares shipping evenly when everything was free", () => {
    const free = [
      { lineId: "a", quantityMilli: 1_000, unitPriceCents: 0n },
      { lineId: "b", quantityMilli: 1_000, unitPriceCents: 0n },
    ];
    expect(shareByLine(free, 0n, 1_001n).map((s) => s.totalCents)).toEqual([501n, 500n]);
  });

  it("has nothing to share with no items", () => {
    expect(shareByLine([], 100n, 100n)).toEqual([]);
  });
});
