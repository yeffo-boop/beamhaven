import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PaymentForm, RefundForm } from "@/components/budget/forms";
import { labelFor } from "@/components/contractors/labels";
import { Money } from "@/components/budget/money";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { ReceiptList } from "@/components/budget/receipt-list";
import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, EmptyState, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import { formatMoney, moneyInputValue } from "@/lib/money";
import { deleteExpenseAction, deletePaymentAction } from "@/server/actions/budget";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getActivity } from "@/server/services/activity";
import { getReceipts } from "@/server/services/attachments";
import { STAGE_LABELS } from "@/server/services/budget-inputs";
import { getExpense } from "@/server/services/expenses";

export const metadata = { title: "Expense" };

const STATE_LABELS = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid" } as const;
const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  check: "Check",
  transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

export default async function ExpensePage({
  params,
  searchParams,
}: PageProps<"/budget/expenses/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const expense = await orNotFound(getExpense(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [receipts, activity] = await Promise.all([
    getReceipts(ctx, id),
    getActivity(ctx, "expense", id),
  ]);
  const isRefund = expense.refundOfExpenseId !== null;
  const owed = expense.totalCents - expense.paidCents;
  const owedAbs = owed < 0n ? -owed : owed;
  const refunded = expense.refunds.reduce((sum, r) => sum + r.totalCents, 0n);
  const refundable = expense.totalCents + refunded;
  const firstLine = expense.allocations[0]?.line;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={firstLine ? `/projects/${firstLine.projectId}/budget` : "/budget"}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {firstLine ? `${firstLine.projectName} budget` : "Budget"}
        </Link>
        <PageHeader
          title={isRefund ? `Refund: ${expense.description}` : expense.description}
          actions={
            canEdit && expense.orderId ? (
              <Button asChild variant="outline">
                <Link href={`/orders/${expense.orderId}`}>Open the order</Link>
              </Button>
            ) : canEdit ? (
              <>
                {isRefund ? null : (
                  <Button asChild variant="outline">
                    <Link href={`/budget/expenses/${id}/edit`}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </Link>
                  </Button>
                )}
                <ConfirmAction
                  action={deleteExpenseAction}
                  label="Delete"
                  srLabel={`expense ${expense.description}`}
                  question="Delete this expense, its payments and receipts? This can't be undone."
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </>
            ) : null
          }
        />
      </div>
      <ProblemNotice code={problem} />

      <Panel title="Details" id="details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label={isRefund ? "Refunded" : "Total"}>
            <Money cents={isRefund ? -expense.totalCents : expense.totalCents} />
          </Detail>
          <Detail label={isRefund ? "Received" : "Paid"}>
            <Money cents={isRefund ? -expense.paidCents : expense.paidCents} /> ·{" "}
            {STATE_LABELS[expense.state]}
          </Detail>
          <Detail label="Date">{formatDay(expense.expenseDate)}</Detail>
          <Detail label="Due by">
            {formatDay(expense.dueDate) ?? <span className="text-muted-foreground">Not set</span>}
          </Detail>
          {expense.vendorName ? (
            <Detail label="Shop or supplier">{expense.vendorName}</Detail>
          ) : null}
          {expense.orderId ? (
            <Detail label="Bill for">
              <Link href={`/orders/${expense.orderId}`} className="text-primary hover:underline">
                An order
              </Link>
            </Detail>
          ) : null}
          {expense.commitmentDescription ? (
            <Detail label="Bill for">{expense.commitmentDescription}</Detail>
          ) : null}
          {expense.stage ? (
            <Detail label="Payment stage">{labelFor(STAGE_LABELS, expense.stage)}</Detail>
          ) : null}
          {expense.refundOfExpenseId ? (
            <Detail label="Refund of">
              <Link
                href={`/budget/expenses/${expense.refundOfExpenseId}`}
                className="text-primary hover:underline"
              >
                {expense.refundOfDescription}
              </Link>
            </Detail>
          ) : null}
          {expense.createdByName ? (
            <Detail label="Recorded by">{expense.createdByName}</Detail>
          ) : null}
        </dl>
        {expense.notes ? <p className="text-sm whitespace-pre-line">{expense.notes}</p> : null}
      </Panel>

      <Panel title="Charged to" id="charged">
        <ul aria-label="Charged to" className="divide-y divide-border">
          {expense.allocations.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-sm"
            >
              <Link href={`/budget/lines/${a.line.id}`} className="hover:underline">
                {lineTitle(a.line)}
                {a.kind !== "item" ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({a.kind === "tax" ? "tax" : "shipping"})
                  </span>
                ) : null}
              </Link>
              <Money cents={a.amountCents} />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={isRefund ? "Money received" : "Payments"} id="payments">
        {expense.payments.length === 0 ? (
          <EmptyState>{isRefund ? "Nothing received yet." : "Nothing paid yet."}</EmptyState>
        ) : (
          <ul aria-label="Payments" className="divide-y divide-border">
            {expense.payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm"
              >
                <span>
                  <Money
                    cents={p.amountCents < 0n ? -p.amountCents : p.amountCents}
                    className="font-medium"
                  />{" "}
                  <span className="text-muted-foreground">
                    {[formatDay(p.paidOn), METHOD_LABELS[p.method], p.reference, p.createdByName]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {canEdit ? (
                  <ConfirmAction
                    action={deletePaymentAction}
                    label="Remove"
                    srLabel={`payment of ${formatMoney(p.amountCents)}`}
                    question="Remove this payment record?"
                    confirmLabel="Yes, remove it"
                    size="xs"
                  >
                    <input type="hidden" name="expenseId" value={id} />
                    <input type="hidden" name="paymentId" value={p.id} />
                  </ConfirmAction>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && owedAbs > 0n ? (
          <details
            className="rounded-[var(--radius-control)] border border-border p-3"
            open={expense.payments.length === 0}
          >
            <summary className="cursor-pointer text-sm font-medium">
              {isRefund ? "Record money received" : "Record a payment"} ({formatMoney(owedAbs)}{" "}
              left)
            </summary>
            <div className="mt-3">
              <PaymentForm expenseId={id} owed={moneyInputValue(owedAbs)} isRefund={isRefund} />
            </div>
          </details>
        ) : null}
      </Panel>

      {!isRefund ? (
        <Panel title="Refunds and returns" id="refunds">
          {expense.refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul aria-label="Refunds" className="divide-y divide-border">
              {expense.refunds.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-sm"
                >
                  <Link href={`/budget/expenses/${r.id}`} className="hover:underline">
                    {r.description}
                  </Link>
                  <span className="text-muted-foreground">
                    <Money cents={-r.totalCents} /> · {formatDay(r.expenseDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {expense.orderId ? (
            <p className="text-sm text-muted-foreground">
              Returns from an order are recorded on the order&apos;s page.
            </p>
          ) : null}
          {canEdit && refundable > 0n && !expense.orderId ? (
            <details className="rounded-[var(--radius-control)] border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Record a refund or return
              </summary>
              <div className="mt-3">
                <RefundForm expenseId={id} left={formatMoney(refundable)} />
              </div>
            </details>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Receipts" id="receipts">
        <ReceiptList receipts={receipts} expenseId={id} canEdit={canEdit} />
      </Panel>

      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
