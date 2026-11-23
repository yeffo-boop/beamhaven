/**
 * Room-based cost estimates (Milestone 5, part 3): how much flooring, paint
 * or trim a set of rooms needs, and what it costs. Pure arithmetic, so it
 * can be tested on its own; docs/BUDGET_DEFINITIONS.md, "Room estimates",
 * is the plain-English version.
 *
 * Sizes are whole millimetres (and mm² for areas), money whole cents, both
 * as integers. Everything rounds once, at the end of each row, to the cent.
 */

import { type Cents, splitByWeights } from "./money";

export const MEASURES = ["floor", "walls", "ceiling", "perimeter"] as const;
export type Measure = (typeof MEASURES)[number];

export const PRICE_UNITS = ["sq_ft", "sq_m", "lin_ft", "lin_m", "gallon", "litre"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** mm² (or mm, for a length) in one of each unit, as a fraction num/den. */
const UNIT_SIZE: Record<"sq_ft" | "sq_m" | "lin_ft" | "lin_m", { num: bigint; den: bigint }> = {
  sq_ft: { num: 9_290_304n, den: 100n }, // 304.8 mm × 304.8 mm = 92,903.04 mm²
  sq_m: { num: 1_000_000n, den: 1n },
  lin_ft: { num: 3048n, den: 10n }, // 304.8 mm
  lin_m: { num: 1000n, den: 1n },
};

export function isLength(measure: Measure): boolean {
  return measure === "perimeter";
}

export function isCan(unit: PriceUnit): unit is "gallon" | "litre" {
  return unit === "gallon" || unit === "litre";
}

/** The unit labor is priced in: per sq ft or linear foot (or the metric ones). */
export function laborUnit(measure: Measure, unit: PriceUnit): keyof typeof UNIT_SIZE {
  const metric = unit === "sq_m" || unit === "lin_m" || unit === "litre";
  if (isLength(measure)) return metric ? "lin_m" : "lin_ft";
  return metric ? "sq_m" : "sq_ft";
}

export type RoomShape = {
  lengthMm: number | null;
  widthMm: number | null;
  ceilingHeightMm: number | null;
  openings: { kind: string; widthMm: number; heightMm: number }[];
};

/**
 * How much of a room the measure covers, assuming it's a rectangle: mm² for
 * floor, walls and ceiling, mm for the perimeter. Walls leave out every
 * opening; the perimeter (for baseboard and trim) leaves out door widths.
 * Null when the room's size isn't known well enough.
 */
export function measureRoom(measure: Measure, room: RoomShape): number | null {
  const { lengthMm: l, widthMm: w, ceilingHeightMm: h } = room;
  if (!l || !w) return null;
  switch (measure) {
    case "floor":
    case "ceiling":
      return l * w;
    case "walls": {
      if (!h) return null;
      const openings = room.openings.reduce((sum, o) => sum + o.widthMm * o.heightMm, 0);
      return Math.max(0, 2 * (l + w) * h - openings);
    }
    case "perimeter": {
      const doors = room.openings
        .filter((o) => o.kind === "door")
        .reduce((sum, o) => sum + o.widthMm, 0);
      return Math.max(0, 2 * (l + w) - doors);
    }
  }
}

export type Pricing = {
  measure: Measure;
  unit: PriceUnit;
  /** Per unit (sq ft, sq m, linear ft or m), or per can (gallon or litre). */
  priceCents: Cents;
  /** For cans: what one covers, in mm². */
  coverageMm2: number | null;
  coats: number;
  /** Install price per sq ft / sq m / linear ft / m, if any. */
  laborCents: Cents | null;
  wastePercent: number;
  taxable: boolean;
};

export type EstimateRowInput = { key: string; amount: number | null };

export type EstimateRow = {
  key: string;
  /** mm² or mm; null when it couldn't be measured. */
  amount: number | null;
  materialCents: Cents;
  taxCents: Cents;
  laborCents: Cents;
  totalCents: Cents;
};

export type EstimateResult = {
  rows: EstimateRow[];
  /** Everything that could be measured: mm² or mm. */
  amount: number;
  /** For can-priced items: how many cans to buy (whole cans). */
  cans: number | null;
  materialCents: Cents;
  taxCents: Cents;
  laborCents: Cents;
  totalCents: Cents;
  /** Rows that couldn't be measured (no size, no typed area). */
  unmeasured: number;
};

/** a / b, rounded half up, for non-negative values. */
function divRound(a: bigint, b: bigint): bigint {
  return (2n * a + b) / (2n * b);
}

/** a / b, rounded up, for non-negative values. */
function divCeil(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/**
 * Works out each row's cost. Material includes the waste allowance; tax is
 * on material only (when the item is taxable); labor is on the measured
 * amount, with no waste. Paint and other can-priced items are bought as
 * whole cans for all the rows together, then shared out by area.
 */
export function estimate(
  pricing: Pricing,
  inputs: readonly EstimateRowInput[],
  taxBp: number,
): EstimateResult {
  const waste = BigInt(100 + pricing.wastePercent);
  const amounts = inputs.map((r) => BigInt(r.amount ?? 0));

  let material: bigint[];
  let cans: number | null = null;
  if (isCan(pricing.unit)) {
    const coverage = BigInt(pricing.coverageMm2 ?? 0);
    const coats = BigInt(pricing.coats);
    const needed = amounts.reduce((sum, a) => sum + a, 0n) * coats * waste;
    const count = coverage > 0n && needed > 0n ? divCeil(needed, coverage * 100n) : 0n;
    cans = Number(count);
    const total = count * pricing.priceCents;
    material = amounts.some((a) => a > 0n) ? splitByWeights(total, amounts) : amounts.map(() => 0n);
  } else {
    const size = UNIT_SIZE[pricing.unit];
    material = amounts.map((a) =>
      divRound(a * waste * pricing.priceCents * size.den, 100n * size.num),
    );
  }

  const laborSize = UNIT_SIZE[laborUnit(pricing.measure, pricing.unit)];
  const labor = amounts.map((a) =>
    pricing.laborCents ? divRound(a * pricing.laborCents * laborSize.den, laborSize.num) : 0n,
  );
  const tax = material.map((m) =>
    pricing.taxable && taxBp > 0 ? divRound(m * BigInt(taxBp), 10_000n) : 0n,
  );

  const rows = inputs.map((r, i) => {
    const m = material[i] ?? 0n;
    const t = tax[i] ?? 0n;
    const l = labor[i] ?? 0n;
    return {
      key: r.key,
      amount: r.amount,
      materialCents: m,
      taxCents: t,
      laborCents: l,
      totalCents: m + t + l,
    };
  });
  const sum = (pick: (row: EstimateRow) => bigint) => rows.reduce((s, r) => s + pick(r), 0n);
  return {
    rows,
    amount: inputs.reduce((s, r) => s + (r.amount ?? 0), 0),
    cans,
    materialCents: sum((r) => r.materialCents),
    taxCents: sum((r) => r.taxCents),
    laborCents: sum((r) => r.laborCents),
    totalCents: sum((r) => r.totalCents),
    unmeasured: inputs.filter((r) => r.amount === null).length,
  };
}

/** A price per sq ft (or linear ft, or the metric one): cents for a total over an amount. */
export function pricePerUnit(
  totalCents: Cents,
  amount: number,
  unit: keyof typeof UNIT_SIZE,
): Cents | null {
  if (amount <= 0) return null;
  const size = UNIT_SIZE[unit];
  return divRound(totalCents * size.num, BigInt(amount) * size.den);
}

/** A typed quantity ("450" sq ft, "12.5" m) as mm² or mm. Null if it isn't a positive number. */
export function typedToBase(text: string, unit: keyof typeof UNIT_SIZE): number | null {
  const clean = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(clean)) return null;
  const value = Number(clean);
  const size = UNIT_SIZE[unit];
  const base = Math.round((value * Number(size.num)) / Number(size.den));
  return base > 0 ? base : null;
}

/** mm² or mm shown in a unit, to one decimal place at most. */
export function baseToUnit(amount: number, unit: keyof typeof UNIT_SIZE): number {
  const size = UNIT_SIZE[unit];
  return Math.round((amount * Number(size.den) * 10) / Number(size.num)) / 10;
}

export const UNIT_LABELS: Record<PriceUnit, string> = {
  sq_ft: "sq ft",
  sq_m: "m²",
  lin_ft: "linear ft",
  lin_m: "m",
  gallon: "gallon",
  litre: "litre",
};

export const MEASURE_LABELS: Record<Measure, string> = {
  floor: "Floor area",
  walls: "Wall area",
  ceiling: "Ceiling area",
  perimeter: "Around the room (trim)",
};
