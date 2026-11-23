import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Money } from "@/components/budget/money";
import { ProblemNotice } from "@/components/budget/problem-notice";
import { BillForm, DeliveryForm, ReturnForm } from "@/components/orders/forms";
import { DeliveryBadge } from "@/components/orders/list";
import { PageHeader } from "@/components/page-header";
import { ActivityList } from "@/components/records/activity-list";
import { ConfirmAction } from "@/components/records/confirm-action";
import { FileList } from "@/components/records/file-list";
import { orNotFound } from "@/components/records/or-not-found";
import { Detail, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { dayInputValue, formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import {
  deleteDeliveryAction,
  deleteOrderAction,
  deleteReturnAction,
  removeBillAction,
} from "@/server/actions/orders";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { lineTitle } from "@/server/data/budget";
import { getActivity } from "@/server/services/activity";
import { getDocuments } from "@/server/services/attachments";
import { getOrder } from "@/server/services/orders";

export const metadata = { title: "Order" };

const PAID_LABELS = { unpaid: "Not paid", partly_paid: "Partly paid", paid: "Paid" } as const;

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const { problem } = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) notFound();
  const order = await orNotFound(getOrder(ctx, id));
  const canEdit = can(ctx, "records:edit");
  const [documents, activity] = await Promise.all([
    getDocuments(ctx, { kind: "order", id }),
    getActivity(ctx, "order", id),
  ]);
  const toCome = order.items
    .map((i) => ({ ...i, remainingMilli: Math.max(i.quantityMilli - i.deliveredMilli, 0) }))
    .filter((i) => i.remainingMilli > 0);
  const here = order.items
    .map((i) => ({ ...i, hereMilli: i.deliveredMilli - i.returnedMilli }))
    .filter((i) => i.hereMilli > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${order.projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {order.projectName}
        </Link>
        <PageHeader
          title={order.title}
          description={
            order.expectedOn && order.delivered !== "all"
              ? `Ordered ${formatDay(order.orderedOn)}, expected ${formatDay(order.expectedOn)}`
              : `Ordered ${formatDay(order.orderedOn)}`
          }
          actions={
            canEdit && !order.bill ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/orders/${id}/edit`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
                <ConfirmAction
                  action={deleteOrderAction}
                  label="Delete"
                  srLabel={`order ${order.title}`}
                  question="Delete this order, its deliveries and documents? It comes off the budget too."
                  confirmLabel="Yes, delete it"
                >
                  <input type="hidden" name="id" value={id} />
                </ConfirmAction>
              </div>
            ) : null
          }
        />
        <DeliveryBadge state={order.delivered} />
      </div>
      <ProblemNotice code={problem} />

      <Panel title="Summary" id="summary">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Detail label="Items">
            <Money cents={order.itemsCents} />
          </Detail>
          <Detail label="Tax">
            <Money cents={order.taxCents} />
          </Detail>
          <Detail label="Shipping">
            <Money cents={order.shippingCents} />
          </Detail>
          <Detail label="Order total">
            <Money cents={order.totalCents} className="text-base font-semibold" />
          </Detail>
          <Detail label="Ordered from">{order.supplierName}</Detail>
          <Detail label="Order number">
            {order.orderNumber ?? <span className="text-muted-foreground">Not set</span>}
          </Detail>
          {order.returns.length > 0 ? (
            <>
              <Detail label="Refunded">
                <Money cents={order.refundedCents} />
              </Detail>
              <Detail label="Cost after returns">
                <Money
                  cents={order.totalCents - order.refundedCents}
                  className="text-base font-semibold"
                />
              </Detail>
            </>
          ) : null}
        </dl>
        {order.notes ? <p className="text-sm whitespace-pre-line">{order.notes}</p> : null}
        <p className="text-sm text-muted-foreground">
          {order.bill
            ? "The bill is recorded, so the budget counts it as spent. The items and prices stay as they were paid."
            : "Until its bill is recorded, the order counts in the budget as a commitment on each line below (tax and shipping shared by value)."}
        </p>
      </Panel>

      <Panel title="Items" id="items">
        <div className="-mx-5 overflow-x-auto md:mx-0">
          <table aria-label="Items on this order" className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 pl-5 font-medium md:pl-0">Item</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Price paid</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Arrived</th>
                <th className="py-2 pr-5 pl-3 font-medium md:pr-0">Budget line</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3 pl-5 md:pl-0">
                    {item.materialId ? (
                      <Link
                        href={`/materials/${item.materialId}`}
                        className="font-medium hover:underline"
                      >
                        {item.description}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.description}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatQuantity(item.quantityMilli)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money cents={item.unitPriceCents} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money cents={item.totalCents} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatQuantity(item.deliveredMilli)} of {formatQuantity(item.quantityMilli)}
                    {item.returnedMilli > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {formatQuantity(item.returnedMilli)} returned
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-5 pl-3 md:pr-0">
                    <Link href={`/budget/lines/${item.line.id}`} className="hover:underline">
                      {lineTitle(item.line, { withProject: false })}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Deliveries" id="deliveries">
        {order.deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has arrived yet.</p>
        ) : (
          <ul aria-label="Deliveries" className="divide-y divide-border">
            {order.deliveries.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{formatDay(d.deliveredOn)}</span>
                  <span className="text-muted-foreground">
                    {d.items
                      .map((i) => `${formatQuantity(i.quantityMilli)} × ${i.description}`)
                      .join(", ")}
                  </span>
                  {d.notes ? <span className="text-muted-foreground">{d.notes}</span> : null}
                </div>
                {canEdit ? (
                  <ConfirmAction
                    action={deleteDeliveryAction}
                    label="Remove"
                    srLabel={`delivery of ${formatDay(d.deliveredOn)}`}
                    question="Remove this delivery? The items count as still to come."
                    confirmLabel="Yes, remove it"
                    size="xs"
                  >
                    <input type="hidden" name="orderId" value={id} />
                    <input type="hidden" name="id" value={d.id} />
                  </ConfirmAction>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && toCome.length > 0 ? (
          <details
            className="rounded-[var(--radius-control)] border border-border p-3"
            open={order.deliveries.length === 0 ? undefined : false}
          >
            <summary className="cursor-pointer text-sm font-medium">Record a delivery</summary>
            <div className="mt-3">
              <DeliveryForm
                // A fresh form (and today's date) after each delivery.
                key={order.deliveries.length}
                orderId={id}
                items={toCome.map((i) => ({
                  id: i.id,
                  description: i.description,
                  remaining: formatQuantity(i.remainingMilli).replace(/,/g, ""),
                }))}
              />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Bill" id="bill">
        {order.bill ? (
          <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Detail label="Total">
                <Money cents={order.bill.totalCents} />
              </Detail>
              <Detail label="Paid">
                <Money cents={order.bill.paidCents} /> · {PAID_LABELS[order.bill.state]}
              </Detail>
              <Detail label="Date">{formatDay(order.bill.expenseDate)}</Detail>
              <Detail label="Due by">
                {formatDay(order.bill.dueDate) ?? (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </Detail>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/budget/expenses/${order.bill.id}`}>
                  Open the bill (payments and receipt)
                </Link>
              </Button>
              {canEdit && order.returns.length === 0 ? (
                <ConfirmAction
                  action={removeBillAction}
                  label="Remove the bill"
                  srLabel={`for ${order.title}`}
                  question="Remove the bill, with its payments and receipt? The order goes back to being a commitment."
                  confirmLabel="Yes, remove it"
                  size="sm"
                >
                  <input type="hidden" name="orderId" value={id} />
                </ConfirmAction>
              ) : null}
            </div>
          </div>
        ) : canEdit && order.totalCents > 0n ? (
          <BillForm
            orderId={id}
            orderedOn={dayInputValue(order.orderedOn)}
            total={formatMoney(order.totalCents)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No bill recorded yet.</p>
        )}
      </Panel>

      {order.bill ? (
        <Panel title="Returns" id="returns">
          {order.returns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has been returned.</p>
          ) : (
            <ul aria-label="Returns" className="divide-y divide-border">
              {order.returns.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">
                      {formatDay(r.returnedOn)} ·{" "}
                      {r.refundCents > 0n ? (
                        <>
                          <Money cents={r.refundCents} /> back
                          {r.refundReceived ? ", received" : ", still to come"}
                        </>
                      ) : (
                        "nothing back"
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {r.items
                        .map((i) => `${formatQuantity(i.quantityMilli)} × ${i.description}`)
                        .join(", ")}
                    </span>
                    {r.notes ? <span className="text-muted-foreground">{r.notes}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.refundId ? (
                      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                        <Link href={`/budget/expenses/${r.refundId}`}>Open the refund</Link>
                      </Button>
                    ) : null}
                    {canEdit ? (
                      <ConfirmAction
                        action={deleteReturnAction}
                        label="Remove"
                        srLabel={`return of ${formatDay(r.returnedOn)}`}
                        question="Remove this return and its refund? The items count as kept again."
                        confirmLabel="Yes, remove it"
                        size="xs"
                      >
                        <input type="hidden" name="orderId" value={id} />
                        <input type="hidden" name="id" value={r.id} />
                      </ConfirmAction>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {canEdit && here.length > 0 ? (
            <details
              className="rounded-[var(--radius-control)] border border-border p-3"
              open={false}
            >
              <summary className="cursor-pointer text-sm font-medium">Record a return</summary>
              <div className="mt-3">
                <ReturnForm
                  key={order.returns.length}
                  orderId={id}
                  items={here.map((i) => ({
                    id: i.id,
                    description: i.description,
                    here: formatQuantity(i.hereMilli).replace(/,/g, ""),
                  }))}
                />
              </div>
            </details>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Only what has arrived can go back. A refund lowers what the order cost on its budget
            lines.
          </p>
        </Panel>
      ) : null}

      <Panel title="Order documents" id="documents">
        <p className="text-sm text-muted-foreground">
          The order confirmation, a packing slip or a quote from the store. The receipt goes on the
          bill.
        </p>
        <FileList
          files={documents}
          target={{ kind: "order", id }}
          noun="document"
          canEdit={canEdit}
        />
      </Panel>

      <Panel title="Activity" id="activity">
        <ActivityList items={activity} />
      </Panel>
    </div>
  );
}
