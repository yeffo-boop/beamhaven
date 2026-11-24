import { Available, Money } from "@/components/budget/money";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Totals } from "@/server/services/budget-math";

/** Percent of `whole`, for bar widths. Whole cents in, a plain number out. */
function share(part: bigint, whole: bigint): number {
  if (whole <= 0n || part <= 0n) return 0;
  return Number((part * 10_000n) / whole) / 100;
}

const SEGMENTS = [
  { key: "paid", label: "Paid", swatch: "bg-primary" },
  { key: "unpaid", label: "Billed, not paid", swatch: "bg-primary/55" },
  { key: "expected", label: "Still expected", swatch: "bg-primary/25" },
] as const;

/**
 * The household's money in four numbers and one bar: what's paid, billed
 * but unpaid, still expected (the forecast less bills so far), and what's
 * left of the budget. Definitions: docs/BUDGET_DEFINITIONS.md.
 */
export function BudgetCard({ totals }: { totals: Totals }) {
  const paid = totals.expenses - totals.unpaid;
  const expected = totals.forecast > totals.expenses ? totals.forecast - totals.expenses : 0n;
  const scale = totals.forecast > totals.current ? totals.forecast : totals.current;
  const values = { paid, unpaid: totals.unpaid, expected };
  const over = totals.available < 0n;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Current budget</dt>
          <dd className="text-lg font-semibold">
            <Money cents={totals.current} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Spent</dt>
          <dd className="text-lg font-semibold">
            <Money cents={totals.expenses} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Still to pay</dt>
          <dd className="text-lg font-semibold">
            <Money cents={totals.unpaid} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Left to plan</dt>
          <dd className="text-lg font-semibold">
            <Available cents={totals.available} />
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2">
        <div
          role="img"
          aria-label={`Of ${formatMoney(totals.current)} budgeted: ${formatMoney(paid)} paid, ${formatMoney(totals.unpaid)} billed and not paid, ${formatMoney(expected)} still expected${over ? `; the forecast is over budget by ${formatMoney(-totals.available)}` : ""}.`}
          className="relative flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        >
          {SEGMENTS.map((s) => {
            const width = share(values[s.key], scale);
            return width > 0 ? (
              <span
                key={s.key}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", s.swatch)}
                style={{ width: `${width}%` }}
              />
            ) : null;
          })}
          {over ? (
            <span
              className="absolute inset-y-0 w-0.5 bg-foreground"
              style={{ left: `${share(totals.current, scale)}%` }}
            />
          ) : null}
        </div>
        <ul
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {SEGMENTS.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", s.swatch)} />
              {s.label}
            </li>
          ))}
          {over ? (
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-foreground" />
              Budget
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
