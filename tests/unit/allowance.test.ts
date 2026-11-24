import { describe, expect, it } from "vitest";

import { checkAllowance, materialCost } from "@/lib/allowance";

describe("checkAllowance", () => {
  it("adds up chosen materials and compares them with the allowance", () => {
    const check = checkAllowance(300_000n, [
      // 120 sq ft of tile at $12.50 = $1,500.00
      { status: "selected", quantityMilli: 120_000, unitPriceCents: 1250n },
      // 2.5 boxes of grout at $19.99 = $49.975 → $49.98
      { status: "ordered", quantityMilli: 2_500, unitPriceCents: 1999n },
      { status: "considering", quantityMilli: 1_000, unitPriceCents: 40_000n },
      { status: "returned", quantityMilli: 1_000, unitPriceCents: 99_999n },
      { status: "canceled", quantityMilli: 1_000, unitPriceCents: 99_999n },
    ]);
    expect(check).toEqual({
      allowance: 300_000n,
      chosen: 154_998n,
      considering: 40_000n,
      remaining: 145_002n,
      over: false,
      unpriced: 0,
    });
  });

  it("says when the choices go over", () => {
    const check = checkAllowance(100_000n, [
      { status: "installed", quantityMilli: 1_000, unitPriceCents: 125_000n },
    ]);
    expect(check.over).toBe(true);
    expect(check.remaining).toBe(-25_000n);
  });

  it("counts materials it can't price instead of guessing", () => {
    const check = checkAllowance(100_000n, [
      { status: "selected", quantityMilli: null, unitPriceCents: 500n },
      { status: "considering", quantityMilli: 1_000, unitPriceCents: null },
      { status: "canceled", quantityMilli: null, unitPriceCents: null },
    ]);
    expect(check).toMatchObject({ chosen: 0n, considering: 0n, unpriced: 2 });
  });

  it("is exactly the allowance when nothing is chosen", () => {
    expect(checkAllowance(0n, [])).toMatchObject({ remaining: 0n, over: false });
    expect(materialCost({ status: "selected", quantityMilli: 1_000, unitPriceCents: 1n })).toBe(1n);
  });
});
