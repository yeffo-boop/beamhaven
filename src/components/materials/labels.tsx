import { formatMoney } from "@/lib/money";
import { formatQuantity, lineTotal } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import {
  MATERIAL_STATUS_LABELS,
  MATERIAL_STATUSES,
  type MaterialStatus,
} from "@/server/services/material-inputs";

// Color is never the only signal: every badge also carries its word.
const tones: Record<MaterialStatus, string> = {
  considering: "bg-muted text-muted-foreground",
  selected: "bg-info/12 text-info",
  ordered: "bg-warning/15 text-warning",
  delivered: "bg-primary/12 text-primary",
  installed: "bg-positive/15 text-positive",
  returned: "bg-muted text-muted-foreground line-through",
  canceled: "bg-muted text-muted-foreground line-through",
};

export function materialStatusLabel(status: string): string {
  return MATERIAL_STATUS_LABELS[status as MaterialStatus] ?? status;
}

export function MaterialStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[status as MaterialStatus] ?? tones.considering,
      )}
    >
      {materialStatusLabel(status)}
    </span>
  );
}

export const materialStatusOptions = MATERIAL_STATUSES.map((value) => ({
  value,
  label: MATERIAL_STATUS_LABELS[value],
}));

/** "2.5 boxes × $54.99 = $137.48", or as much of it as is known. */
export function describeQuantity(m: {
  quantityMilli: number | null;
  unit: string | null;
  unitPriceCents: bigint | null;
}): string | null {
  const amount = m.quantityMilli !== null ? formatQuantity(m.quantityMilli) : null;
  const what = [amount, m.unit].filter(Boolean).join(" ");
  if (m.unitPriceCents === null) return what || null;
  const each = `${formatMoney(m.unitPriceCents)}${m.unit ? ` per ${m.unit}` : " each"}`;
  if (m.quantityMilli === null) return each;
  return `${what} at ${each} = ${formatMoney(lineTotal(m.unitPriceCents, m.quantityMilli))}`;
}

/** Brand, model and color in one short line. */
export function productLine(m: {
  brand: string | null;
  modelNumber: string | null;
  colorFinish: string | null;
}): string | null {
  return [m.brand, m.modelNumber, m.colorFinish].filter(Boolean).join(" · ") || null;
}
