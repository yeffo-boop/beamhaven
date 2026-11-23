import Link from "next/link";

import { Money } from "@/components/budget/money";
import { SelectField } from "@/components/forms/field";
import { EmptyState } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { baseToUnit, laborUnit, pricePerUnit, UNIT_LABELS } from "@/lib/room-estimate";
import { setQuoteEstimateAction } from "@/server/actions/estimates";
import type { EstimateView } from "@/server/services/estimates";

/**
 * A quote's price next to the household's own room estimate: the
 * difference, and what each comes to per sq ft (or per foot), so a painter's
 * $4,200 can be judged against the rooms it covers.
 */
export function EstimateComparison({
  quoteId,
  quoteCents,
  estimates,
  chosenId,
  canEdit,
}: {
  quoteId: string;
  quoteCents: bigint;
  estimates: EstimateView[];
  chosenId: string | null;
  canEdit: boolean;
}) {
  const chosen = estimates.find((e) => e.id === chosenId) ?? null;
  const picker = canEdit ? (
    <form action={setQuoteEstimateAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={quoteId} />
      <SelectField
        id="compare-estimate"
        name="estimateId"
        label="Compare with"
        defaultValue={chosenId ?? ""}
        options={[
          { value: "", label: "Don't compare" },
          ...estimates.map((e) => ({
            value: e.id,
            label: `${e.name} (${formatMoney(e.result.totalCents)})`,
          })),
        ]}
        className="min-w-60"
      />
      <Button type="submit" variant="outline">
        Compare
      </Button>
    </form>
  ) : null;

  if (estimates.length === 0) {
    return <EmptyState>No room estimates on this project to compare with.</EmptyState>;
  }
  if (!chosen) return picker ?? <EmptyState>Not compared with an estimate.</EmptyState>;

  const unit = laborUnit(chosen.priceItem.measure, chosen.priceItem.unit);
  const amount = chosen.result.amount;
  const mine = chosen.result.totalCents;
  const difference = quoteCents - mine;
  const percent = mine > 0n ? Number((difference * 1000n) / mine) / 10 : null;
  const per = (cents: bigint) => {
    const value = pricePerUnit(cents, amount, unit);
    return value === null ? "—" : `${formatMoney(value)} per ${UNIT_LABELS[unit]}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">This quote</dt>
          <dd className="text-sm">
            <Money cents={quoteCents} className="font-semibold" />
            <span className="block text-xs text-muted-foreground">{per(quoteCents)}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">
            Your estimate:{" "}
            <Link href={`/estimates/${chosen.id}`} className="text-primary hover:underline">
              {chosen.name}
            </Link>
          </dt>
          <dd className="text-sm">
            <Money cents={mine} className="font-semibold" />
            <span className="block text-xs text-muted-foreground">
              {per(mine)}, over {baseToUnit(amount, unit).toLocaleString("en-US")}{" "}
              {UNIT_LABELS[unit]}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Difference</dt>
          <dd className="text-sm font-medium">
            {difference === 0n
              ? "The same"
              : `${formatMoney(difference < 0n ? -difference : difference)} ${
                  difference > 0n ? "more" : "less"
                } than your estimate${percent !== null ? ` (${Math.abs(percent)}%)` : ""}`}
          </dd>
        </div>
      </dl>
      {chosen.result.unmeasured > 0 ? (
        <p className="text-sm text-warning">
          {chosen.result.unmeasured} of its rooms aren&apos;t measured yet, so your estimate is low.
        </p>
      ) : null}
      {picker}
    </div>
  );
}
