import { describe, expect, it } from "vitest";

import {
  baseToUnit,
  estimate,
  measureRoom,
  type Pricing,
  pricePerUnit,
  type RoomShape,
  typedToBase,
} from "@/lib/room-estimate";

// 12′ × 10′, 8′ ceiling, one 3′ × 6′8″ door and one 3′ × 4′ window
// (lengths in whole millimetres, as stored).
const kitchen: RoomShape = {
  lengthMm: 3658,
  widthMm: 3048,
  ceilingHeightMm: 2438,
  openings: [
    { kind: "door", widthMm: 914, heightMm: 2032 },
    { kind: "window", widthMm: 914, heightMm: 1219 },
  ],
};

const flooring: Pricing = {
  measure: "floor",
  unit: "sq_ft",
  priceCents: 429n,
  coverageMm2: null,
  coats: 1,
  laborCents: 200n,
  wastePercent: 10,
  taxable: true,
};

describe("measuring a room", () => {
  it("works out floor, ceiling, wall and perimeter sizes", () => {
    expect(measureRoom("floor", kitchen)).toBe(3658 * 3048);
    expect(measureRoom("ceiling", kitchen)).toBe(3658 * 3048);
    // Perimeter × height, less the door and the window.
    expect(measureRoom("walls", kitchen)).toBe(2 * (3658 + 3048) * 2438 - 914 * 2032 - 914 * 1219);
    // Baseboard runs around the room but not across the door.
    expect(measureRoom("perimeter", kitchen)).toBe(2 * (3658 + 3048) - 914);
  });

  it("can't measure without the size", () => {
    expect(measureRoom("floor", { ...kitchen, widthMm: null })).toBeNull();
    expect(measureRoom("walls", { ...kitchen, ceilingHeightMm: null })).toBeNull();
    expect(measureRoom("floor", { ...kitchen, ceilingHeightMm: null })).toBe(3658 * 3048);
  });
});

describe("pricing rooms", () => {
  it("prices flooring per sq ft with waste, tax on the material and labor", () => {
    const floor = measureRoom("floor", kitchen); // 120.01 sq ft
    const result = estimate(flooring, [{ key: "kitchen", amount: floor }], 925);
    // 120.013 sq ft × 1.10 × $4.29 = $566.34
    expect(result.materialCents).toBe(56_634n);
    // 9.25% of the material only: $52.39
    expect(result.taxCents).toBe(5_239n);
    // 120.013 sq ft × $2.00, no waste: $240.03
    expect(result.laborCents).toBe(24_003n);
    expect(result.totalCents).toBe(56_634n + 5_239n + 24_003n);
    expect(result.cans).toBeNull();
  });

  it("adds rooms up, and skips (and counts) rooms it can't measure", () => {
    const result = estimate(
      { ...flooring, laborCents: null, wastePercent: 0, taxable: false },
      [
        { key: "a", amount: 9_290_304 }, // 100 sq ft
        { key: "b", amount: null },
        { key: "c", amount: 4_645_152 }, // 50 sq ft
      ],
      925,
    );
    expect(result.rows.map((r) => r.materialCents)).toEqual([42_900n, 0n, 21_450n]);
    expect(result.totalCents).toBe(64_350n);
    expect(result.unmeasured).toBe(1);
    expect(result.taxCents).toBe(0n);
  });

  it("buys paint by the whole gallon for all rooms together", () => {
    const paint: Pricing = {
      measure: "walls",
      unit: "gallon",
      priceCents: 7_800n,
      coverageMm2: 32_516_064, // 350 sq ft
      coats: 2,
      laborCents: null,
      wastePercent: 0,
      taxable: true,
    };
    const walls = measureRoom("walls", kitchen) ?? 0; // 319.98 sq ft
    // 2 coats × 320 sq ft = 640 sq ft, at 350 a gallon: 2 gallons.
    const one = estimate(paint, [{ key: "k", amount: walls }], 0);
    expect(one.cans).toBe(2);
    expect(one.materialCents).toBe(15_600n);
    // Two such rooms: 1,280 sq ft → 4 gallons (not 2 + 2 rounded separately
    // by luck), shared equally because the rooms are the same size.
    const two = estimate(
      paint,
      [
        { key: "a", amount: walls },
        { key: "b", amount: walls },
      ],
      0,
    );
    expect(two.cans).toBe(4);
    expect(two.rows.map((r) => r.materialCents)).toEqual([15_600n, 15_600n]);
    // Three small rooms that need 1 gallon between them, not 3.
    const small = estimate(
      { ...paint, coats: 1 },
      [
        { key: "a", amount: 9_290_304 },
        { key: "b", amount: 9_290_304 },
        { key: "c", amount: 9_290_304 },
      ],
      0,
    );
    expect(small.cans).toBe(1);
    expect(small.materialCents).toBe(7_800n);
  });

  it("prices trim per linear foot", () => {
    const trim: Pricing = {
      ...flooring,
      measure: "perimeter",
      unit: "lin_ft",
      priceCents: 250n,
      laborCents: 150n,
      wastePercent: 10,
      taxable: false,
    };
    const length = measureRoom("perimeter", kitchen) ?? 0; // 12498 mm = 41.0 ft
    const result = estimate(trim, [{ key: "k", amount: length }], 925);
    // 41.004 ft × 1.10 × $2.50 = $112.76; labor 41.004 × $1.50 = $61.51
    expect(result.materialCents).toBe(11_276n);
    expect(result.laborCents).toBe(6_151n);
  });

  it("prices metric items per square metre", () => {
    const result = estimate(
      { ...flooring, unit: "sq_m", priceCents: 4_500n, laborCents: 1_000n, wastePercent: 5 },
      [{ key: "k", amount: 12_000_000 }], // 12 m²
      0,
    );
    expect(result.materialCents).toBe(56_700n); // 12 × 1.05 × $45
    expect(result.laborCents).toBe(12_000n); // 12 × $10
  });
});

describe("typed areas and per-unit prices", () => {
  it("turns typed sq ft, m² and lengths into stored sizes and back", () => {
    expect(typedToBase("100", "sq_ft")).toBe(9_290_304);
    expect(typedToBase("1,000", "sq_ft")).toBe(92_903_040);
    expect(typedToBase("2.5", "sq_m")).toBe(2_500_000);
    expect(typedToBase("10", "lin_ft")).toBe(3048);
    expect(typedToBase("0", "sq_ft")).toBeNull();
    expect(typedToBase("-5", "sq_ft")).toBeNull();
    expect(typedToBase("ten", "sq_ft")).toBeNull();
    expect(baseToUnit(9_290_304, "sq_ft")).toBe(100);
    expect(baseToUnit(3048, "lin_ft")).toBe(10);
  });

  it("works out what a quote comes to per sq ft", () => {
    expect(pricePerUnit(420_000n, 92_903_040, "sq_ft")).toBe(420n); // $4,200 over 1,000 sq ft
    expect(pricePerUnit(100n, 0, "sq_ft")).toBeNull();
  });
});
