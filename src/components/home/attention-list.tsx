import { CircleAlert, Clock, FileQuestion, Receipt, Truck } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/records/panel";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionKind } from "@/server/services/dashboard-rules";

const ICONS: Record<AttentionKind, typeof Clock> = {
  task: Clock,
  bill: Receipt,
  delivery: Truck,
  quote: FileQuestion,
};

const KIND_LABELS: Record<AttentionKind, string> = {
  task: "Task",
  bill: "Bill",
  delivery: "Delivery",
  quote: "Quote",
};

/** Overdue tasks, bills and deliveries due soon, and quotes waiting for a decision. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return <EmptyState>Nothing needs attention right now.</EmptyState>;
  return (
    <ul aria-label="Needs attention" className="divide-y divide-border">
      {items.map((item) => {
        const Icon = item.overdue ? CircleAlert : ICONS[item.kind];
        return (
          <li key={item.key} className="flex items-start gap-3 py-2.5">
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                item.overdue ? "text-destructive" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link href={item.href} className="font-medium break-words hover:underline">
                <span className="sr-only">{KIND_LABELS[item.kind]}: </span>
                {item.title}
              </Link>
              <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span className={cn(item.overdue && "font-medium text-destructive")}>
                  {KIND_LABELS[item.kind]} · {item.reason}
                </span>
                {item.note ? <span>{item.note}</span> : null}
                {item.projectName ? <span>{item.projectName}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
