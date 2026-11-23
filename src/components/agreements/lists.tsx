import Link from "next/link";

import { Money } from "@/components/budget/money";
import { ConfirmAction } from "@/components/records/confirm-action";
import { EmptyState } from "@/components/records/panel";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { deleteChangeOrderAction } from "@/server/actions/agreements";
import type { ChangeOrderRecord, ContractSummary, QuoteSummary } from "@/server/data/agreements";
import { lineTitle } from "@/server/data/budget";
import type { ExpenseSummary } from "@/server/data/expenses";
import { STAGE_LABELS } from "@/server/services/budget-inputs";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@/server/services/quote-inputs";

const PAID_LABELS = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid" } as const;

/** A contractor's bills against one agreement, with their payment stage. */
export function BillList({ bills }: { bills: ExpenseSummary[] }) {
  if (bills.length === 0) return <EmptyState>No bills yet.</EmptyState>;
  return (
    <ul aria-label="Bills" className="divide-y divide-border">
      {bills.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <Link href={`/budget/expenses/${b.id}`} className="font-medium hover:underline">
              {b.isRefund ? "Refund: " : ""}
              {b.description}
            </Link>
            <span className="text-xs text-muted-foreground">
              {[
                b.stage ? STAGE_LABELS[b.stage as keyof typeof STAGE_LABELS] : null,
                formatDay(b.expenseDate),
                PAID_LABELS[b.state],
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="flex flex-col items-end text-sm">
            <Money cents={b.totalCents} />
            {b.state === "partly_paid" ? (
              <span className="text-xs text-muted-foreground">
                <Money cents={b.paidCents} /> paid
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Color is never the only signal: every badge carries its words.
const quoteTones: Record<QuoteStatus, string> = {
  received: "bg-info/12 text-info",
  under_review: "bg-warning/15 text-warning",
  approved: "bg-positive/15 text-positive",
  rejected: "bg-muted text-muted-foreground",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        quoteTones[status as QuoteStatus] ?? quoteTones.received,
      )}
    >
      {QUOTE_STATUS_LABELS[status as QuoteStatus] ?? status}
    </span>
  );
}

/** Quotes, newest first. `show` adds the contractor or project to each row. */
export function QuoteList({
  quotes,
  show,
}: {
  quotes: QuoteSummary[];
  show: "contractor" | "project";
}) {
  if (quotes.length === 0) return <EmptyState>No quotes yet.</EmptyState>;
  return (
    <ul aria-label="Quotes" className="divide-y divide-border">
      {quotes.map((q) => (
        <li
          key={q.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Link href={`/quotes/${q.id}`} className="font-medium hover:underline">
                {q.title}
              </Link>
              <QuoteStatusBadge status={q.status} />
            </span>
            <span className="text-xs text-muted-foreground">
              {[
                show === "contractor" ? q.contractorName : q.projectName,
                `Received ${formatDay(q.receivedOn)}`,
                q.revisionCount > 1 ? `${q.revisionCount} versions` : null,
                q.contractId ? "Has a contract" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <Money cents={q.amountCents} className="text-sm" />
        </li>
      ))}
    </ul>
  );
}

/** Contracts with what's agreed, billed and paid so far. */
export function ContractList({
  contracts,
  show,
}: {
  contracts: ContractSummary[];
  show: "contractor" | "project";
}) {
  if (contracts.length === 0) return <EmptyState>No contracts yet.</EmptyState>;
  return (
    <ul aria-label="Contracts" className="divide-y divide-border">
      {contracts.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <Link href={`/contracts/${c.id}`} className="font-medium hover:underline">
              {c.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {[
                show === "contractor" ? c.contractorName : c.projectName,
                c.signedOn ? `Signed ${formatDay(c.signedOn)}` : "Not signed yet",
                c.changeOrdersCents !== 0n ? "With change orders" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className="flex flex-col items-end text-sm">
            <Money cents={c.totalCents} />
            <span className="text-xs text-muted-foreground">
              <Money cents={c.paidCents} /> paid
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChangeOrderList({
  changeOrders,
  contractId,
  contractLineId,
  canEdit,
}: {
  changeOrders: ChangeOrderRecord[];
  contractId: string;
  contractLineId: string;
  canEdit: boolean;
}) {
  if (changeOrders.length === 0) return <EmptyState>No change orders.</EmptyState>;
  return (
    <ul aria-label="Change orders" className="divide-y divide-border">
      {changeOrders.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{c.description}</span>
            <span className="text-xs text-muted-foreground">
              {[
                formatDay(c.committedOn),
                c.line.id !== contractLineId ? lineTitle(c.line, { withProject: false }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {c.notes ? (
              <span className="text-sm whitespace-pre-line text-muted-foreground">{c.notes}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Money cents={c.amountCents} showPlus />
            {canEdit ? (
              <ConfirmAction
                action={deleteChangeOrderAction}
                label="Delete"
                srLabel={`change order ${c.description}`}
                question="Delete this change order? Only possible while no bills are linked to it."
                confirmLabel="Yes, delete"
                size="xs"
              >
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="contractId" value={contractId} />
              </ConfirmAction>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
