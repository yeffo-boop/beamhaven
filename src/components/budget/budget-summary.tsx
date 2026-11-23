import type { ReactNode } from "react";

import type { Totals } from "@/server/services/budget-math";

import { Available, Money } from "./money";

/**
 * The headline numbers for a project or the household, each with a line
 * saying what it means (the definitions are in docs/BUDGET_DEFINITIONS.md).
 */
export function BudgetSummary({
  totals,
  label,
  showContingency = true,
}: {
  totals: Totals;
  label: string;
  /** Off for a single line that isn't a Contingency line. */
  showContingency?: boolean;
}) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-3 lg:grid-cols-4"
    >
      <Tile
        term="Current budget"
        help={
          totals.original === null ? (
            "The plan so far"
          ) : (
            <>
              Locked in at <Money cents={totals.original} />
            </>
          )
        }
      >
        <Money cents={totals.current} />
      </Tile>
      <Tile term="Forecast" help="Where it's likely to end up">
        <Money cents={totals.forecast} />
      </Tile>
      <Tile term="Available" help="Budget minus forecast">
        <Available cents={totals.available} />
      </Tile>
      <Tile
        term="Variance"
        help={
          totals.variance === null
            ? "Shown once the budget is locked in"
            : "Forecast against the locked-in plan"
        }
      >
        {totals.variance === null ? (
          <span className="text-muted-foreground">—</span>
        ) : totals.variance > 0n ? (
          <span className="text-destructive">
            <Money cents={totals.variance} showPlus /> over
          </span>
        ) : (
          <span>
            <Money cents={-totals.variance} /> {totals.variance < 0n ? "under" : "on plan"}
          </span>
        )}
      </Tile>
      <Tile term="Committed" help="Agreed to: contracts, orders and bills">
        <Money cents={totals.committed} />
      </Tile>
      <Tile term="Spent" help="Bills and purchases so far">
        <Money cents={totals.expenses} />
      </Tile>
      <Tile term="Unpaid" help="Bills not paid yet">
        <Money cents={totals.unpaid} />
      </Tile>
      {showContingency ? (
        <Tile term="Contingency left" help="What's left of the safety buffer">
          <Available cents={totals.contingencyRemaining} />
        </Tile>
      ) : (
        <Tile term="Not yet billed" help="Agreed, but no bill yet">
          <Money cents={totals.notYetInvoiced} />
        </Tile>
      )}
    </dl>
  );
}

function Tile({ term, help, children }: { term: string; help: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
      <dd className="text-xs text-muted-foreground">{help}</dd>
    </div>
  );
}
