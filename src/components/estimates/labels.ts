import { formatMoney, moneyInputValue } from "@/lib/money";
import { baseToUnit, isCan, laborUnit, MEASURE_LABELS, UNIT_LABELS } from "@/lib/room-estimate";
import type { PriceItemRecord } from "@/server/data/estimates";

import type { PriceItemValues } from "./forms";

/** "$4.29 per sq ft · install $2.00 per sq ft · 10% extra for waste · taxed" */
export function describePrice(p: PriceItemRecord): string {
  const lu = UNIT_LABELS[laborUnit(p.measure, p.unit)];
  return [
    `${formatMoney(p.priceCents)} per ${UNIT_LABELS[p.unit]}`,
    isCan(p.unit) && p.coverageMm2
      ? `covers ${baseToUnit(p.coverageMm2, p.unit === "gallon" ? "sq_ft" : "sq_m")} ${
          p.unit === "gallon" ? "sq ft" : "m²"
        }, ${p.coats} ${p.coats === 1 ? "coat" : "coats"}`
      : null,
    p.laborCents !== null ? `install ${formatMoney(p.laborCents)} per ${lu}` : null,
    p.wastePercent > 0 ? `${p.wastePercent}% extra for waste` : null,
    p.taxable ? "taxed" : "no tax",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function measureLabel(p: PriceItemRecord): string {
  return MEASURE_LABELS[p.measure];
}

export function priceItemValues(p: PriceItemRecord): PriceItemValues {
  return {
    id: p.id,
    name: p.name,
    measure: p.measure,
    unit: p.unit,
    price: moneyInputValue(p.priceCents),
    coverage:
      p.coverageMm2 !== null
        ? String(baseToUnit(p.coverageMm2, p.unit === "gallon" ? "sq_ft" : "sq_m"))
        : "",
    coats: String(p.coats),
    labor: p.laborCents !== null ? moneyInputValue(p.laborCents) : "",
    wastePercent: String(p.wastePercent),
    taxable: p.taxable,
    notes: p.notes ?? "",
  };
}

/** 925 → "9.25" */
export function taxRateText(bp: number): string {
  return bp === 0 ? "" : (bp / 100).toFixed(2).replace(/\.?0+$/, "");
}
