import Link from "next/link";

import { formatDay } from "@/lib/dates";
import { type AdjustmentRecord, lineTitle, type TransferRecord } from "@/server/data/budget";
import type { CommitmentRecord, ExpenseSummary } from "@/server/data/expenses";

import { EmptyState } from "@/components/records/panel";

import { Money } from "./money";
import { ReverseTransferForm } from "./reverse-transfer-form";

const SOURCE_LABELS: Record<string, string> = {
  quote: "Approved quote",
  contract: "Contract",
  change_order: "Change order",
  order: "Order",
  manual: "Agreement",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export const sourceOptions = Object.entries(SOURCE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STATE_LABELS = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid" } as const;

export function ExpenseList({ expenses, label }: { expenses: ExpenseSummary[]; label: string }) {
  if (expenses.length === 0) return <EmptyState>No expenses yet.</EmptyState>;
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {expenses.map((e) => (
        <li
          key={e.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <Link href={`/budget/expenses/${e.id}`} className="font-medium hover:underline">
              {e.isRefund ? "Refund: " : ""}
              {e.description}
            </Link>
            <span className="text-xs text-muted-foreground">
              {[formatDay(e.expenseDate), e.vendorName, STATE_LABELS[e.state]]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="flex flex-col items-end text-sm">
            <Money cents={e.shareCents} />
            {e.shareCents !== e.totalCents ? (
              <span className="text-xs text-muted-foreground">
                of <Money cents={e.totalCents} />
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CommitmentList({
  commitments,
  showLine = false,
}: {
  commitments: CommitmentRecord[];
  showLine?: boolean;
}) {
  if (commitments.length === 0) return <EmptyState>Nothing agreed yet.</EmptyState>;
  return (
    <ul aria-label="Commitments" className="divide-y divide-border">
      {commitments.map((c) => {
        const left = c.amountCents - c.invoicedCents;
        return (
          <li
            key={c.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
          >
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/budget/commitments/${c.id}/edit`}
                className="font-medium hover:underline"
              >
                {c.description}
              </Link>
              <span className="text-xs text-muted-foreground">
                {[
                  sourceLabel(c.source),
                  c.vendorName,
                  formatDay(c.committedOn),
                  showLine ? lineTitle(c.line, { withProject: false }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex flex-col items-end text-sm">
              <Money cents={c.amountCents} />
              <span className="text-xs text-muted-foreground">
                {left > 0n ? (
                  <>
                    <Money cents={left} /> not yet billed
                  </>
                ) : (
                  "Fully billed"
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TransferList({
  transfers,
  canApprove,
}: {
  transfers: TransferRecord[];
  canApprove: boolean;
}) {
  if (transfers.length === 0) return <EmptyState>No transfers.</EmptyState>;
  return (
    <ul aria-label="Transfers" className="divide-y divide-border">
      {transfers.map((t) => (
        <li key={t.id} className="flex flex-col gap-1 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span>
              <Money cents={t.amountCents} className="font-medium" /> from{" "}
              <Link href={`/budget/lines/${t.from.id}`} className="hover:underline">
                {lineTitle(t.from)}
              </Link>{" "}
              to{" "}
              <Link href={`/budget/lines/${t.to.id}`} className="hover:underline">
                {lineTitle(t.to)}
              </Link>
            </span>
            <span className="text-xs text-muted-foreground">{formatDay(t.effectiveDate)}</span>
          </div>
          <span className="text-muted-foreground">
            {t.reversesTransferId ? "Reversal: " : ""}
            {t.reason}
            {t.createdByName ? ` (${t.createdByName})` : ""}
            {t.allowOverAllocation ? " · went over what was available" : ""}
            {t.reversedById ? " · reversed" : ""}
          </span>
          {canApprove && !t.reversesTransferId && !t.reversedById ? (
            <ReverseTransferForm transferId={t.id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AdjustmentList({ adjustments }: { adjustments: AdjustmentRecord[] }) {
  if (adjustments.length === 0) return <EmptyState>No adjustments.</EmptyState>;
  return (
    <ul aria-label="Adjustments" className="divide-y divide-border">
      {adjustments.map((a) => (
        <li key={a.id} className="flex flex-col gap-0.5 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span>
              <Money cents={a.amountCents} showPlus className="font-medium" />{" "}
              <Link href={`/budget/lines/${a.line.id}`} className="hover:underline">
                {lineTitle(a.line, { withProject: false })}
              </Link>
            </span>
            <span className="text-xs text-muted-foreground">{formatDay(a.effectiveDate)}</span>
          </div>
          <span className="text-muted-foreground">
            {a.reason}
            {a.createdByName ? ` (${a.createdByName})` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
