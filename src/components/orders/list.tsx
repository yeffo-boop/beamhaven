import Link from "next/link";

import { Money } from "@/components/budget/money";
import { EmptyState } from "@/components/records/panel";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { DeliveryState, OrderSummary } from "@/server/data/orders";

const deliveryLabels: Record<DeliveryState, string> = {
  none: "Not delivered yet",
  partly: "Partly delivered",
  all: "Delivered",
};

const deliveryTones: Record<DeliveryState, string> = {
  none: "bg-warning/15 text-warning",
  partly: "bg-info/12 text-info",
  all: "bg-positive/15 text-positive",
};

/** "Delivered", with its word as well as its color. */
export function DeliveryBadge({ state }: { state: DeliveryState }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        deliveryTones[state],
      )}
    >
      {deliveryLabels[state]}
    </span>
  );
}

export function OrderList({
  orders,
  empty,
  showProject = false,
}: {
  orders: OrderSummary[];
  empty: string;
  showProject?: boolean;
}) {
  if (orders.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul aria-label="Orders" className="divide-y divide-border">
      {orders.map((o) => (
        <li key={o.id} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <Link
              href={`/orders/${o.id}`}
              className="min-w-0 font-medium break-words hover:underline"
            >
              {o.title}
            </Link>
            <Money cents={o.totalCents} className="font-medium" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDay(o.orderedOn)}</span>
            {showProject ? <span>{o.projectName}</span> : null}
            <span>{o.itemCount === 1 ? "1 item" : `${o.itemCount} items`}</span>
            <span>{o.billed ? "Bill recorded" : "No bill yet"}</span>
            <DeliveryBadge state={o.delivered} />
          </div>
        </li>
      ))}
    </ul>
  );
}
