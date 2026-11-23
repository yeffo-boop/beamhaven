import { describe, expect, it } from "vitest";

import {
  formatMoney,
  MAX_CENTS,
  moneyInputValue,
  parseMoney,
  splitByWeights,
  splitEvenly,
  sumCents,
} from "@/lib/money";

describe("parseMoney", () => {
  it.each([
    ["1234", 123400n],
    ["1234.5", 123450n],
    ["1234.56", 123456n],
    ["$1,234.56", 123456n],
    [" $ 12 ", 1200n],
    [".99", 99n],
    ["0.10", 10n],
    ["-25", -2500n],
    ["−25.00", -2500n],
    ["(25.00)", -2500n],
    ["-$5", -500n],
    ["1,000,000", 100000000n],
  ])("reads %j as %s cents", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each([
    "",
    "abc",
    "12.345",
    "1.2.3",
    "12,34",
    "1,2345",
    "$",
    ".",
    "1e5",
    "--5",
    "100000000.01",
  ])("refuses %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("accepts exactly the maximum", () => {
    expect(parseMoney("100,000,000.00")).toBe(MAX_CENTS);
  });
});

describe("formatMoney and moneyInputValue", () => {
  it("formats with thousands separators and two decimals", () => {
    expect(formatMoney(0n)).toBe("$0.00");
    expect(formatMoney(5n)).toBe("$0.05");
    expect(formatMoney(123456789n)).toBe("$1,234,567.89");
    expect(formatMoney(-50000n)).toBe("−$500.00");
    expect(formatMoney(50000n, { showPlus: true })).toBe("+$500.00");
    expect(formatMoney(0n, { showPlus: true })).toBe("$0.00");
  });

  it("gives back a value that reads in again unchanged", () => {
    for (const cents of [0n, 7n, 123456n, -2500n, MAX_CENTS]) {
      expect(parseMoney(moneyInputValue(cents))).toBe(cents);
    }
    expect(moneyInputValue(null)).toBe("");
  });
});

describe("splitByWeights (largest remainder)", () => {
  it("always adds up to the total, to the cent", () => {
    expect(splitEvenly(10000n, 3)).toEqual([3334n, 3333n, 3333n]);
    expect(splitEvenly(2n, 3)).toEqual([1n, 1n, 0n]);
    expect(splitEvenly(-10000n, 3)).toEqual([-3334n, -3333n, -3333n]);
    for (const total of [1n, 99n, 10001n, 123457n, -777n]) {
      for (const weights of [[1n], [1n, 2n], [3n, 3n, 4n], [1n, 0n, 7n, 13n]]) {
        expect(sumCents(splitByWeights(total, weights))).toBe(total);
      }
    }
  });

  it("gives leftover cents to the parts that lost the most in rounding", () => {
    // $10.00 split 1:1:1:7 -> 1.00, 1.00, 1.00, 7.00 exactly.
    expect(splitByWeights(1000n, [1n, 1n, 1n, 7n])).toEqual([100n, 100n, 100n, 700n]);
    // $1.00 split 2:1 -> 66.67 and 33.33: the first part's remainder is larger.
    expect(splitByWeights(100n, [2n, 1n])).toEqual([67n, 33n]);
    // Zero-weight parts get nothing.
    expect(splitByWeights(100n, [0n, 1n])).toEqual([0n, 100n]);
  });

  it("refuses nonsense weights", () => {
    expect(() => splitByWeights(100n, [])).toThrow();
    expect(() => splitByWeights(100n, [0n, 0n])).toThrow();
    expect(() => splitByWeights(100n, [-1n, 2n])).toThrow();
  });
});
