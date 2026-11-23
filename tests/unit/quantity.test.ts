import { describe, expect, it } from "vitest";

import { formatQuantity, lineTotal, parseQuantity, quantityInputValue } from "@/lib/quantity";

describe("quantities", () => {
  it("reads whole numbers, decimals and thousands commas", () => {
    expect(parseQuantity("12")).toBe(12_000);
    expect(parseQuantity("2.5")).toBe(2_500);
    expect(parseQuantity(" 0.125 ")).toBe(125);
    expect(parseQuantity(".5")).toBe(500);
    expect(parseQuantity("1,200")).toBe(1_200_000);
    expect(parseQuantity("3.")).toBe(3_000);
  });

  it("refuses zero, negatives, too many decimals and words", () => {
    for (const bad of ["", "0", "-1", "1.2345", "two", "1e3", "1.2.3"]) {
      expect(parseQuantity(bad), bad).toBeNull();
    }
    expect(parseQuantity("1000001")).toBeNull();
  });

  it("writes them back without trailing zeros", () => {
    expect(formatQuantity(2_500)).toBe("2.5");
    expect(formatQuantity(12_000)).toBe("12");
    expect(formatQuantity(1_200_000)).toBe("1,200");
    expect(formatQuantity(125)).toBe("0.125");
    expect(quantityInputValue(1_200_500)).toBe("1200.5");
    expect(quantityInputValue(null)).toBe("");
  });

  it("works out a line total to the cent", () => {
    // 2.5 boxes at $54.99 = $137.475 → $137.48
    expect(lineTotal(5_499n, 2_500)).toBe(13_748n);
    expect(lineTotal(399n, 1_000)).toBe(399n);
    // 0.333 × $1.00 = 33.3¢ → 33¢
    expect(lineTotal(100n, 333)).toBe(33n);
  });
});
