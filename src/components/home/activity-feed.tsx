import Link from "next/link";

import { LocalTime } from "@/components/records/local-time";
import { EmptyState } from "@/components/records/panel";
import type { FeedEntry } from "@/server/services/activity";

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Household events, newest first, each linking to its record when it still exists. */
export function ActivityFeed({
  items,
  empty = "Nothing has happened yet.",
}: {
  items: FeedEntry[];
  empty?: string;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ol aria-label="Activity" className="flex flex-col divide-y divide-border">
      {items.map((item) => {
        const text = (
          <>
            {item.actorName ? <span className="font-medium">{item.actorName}</span> : "Someone"}{" "}
            {lowerFirst(item.summary)}
          </>
        );
        return (
          <li
            key={item.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm"
          >
            {item.href ? (
              <Link href={item.href} className="min-w-0 break-words hover:underline">
                {text}
              </Link>
            ) : (
              <span className="min-w-0 break-words">{text}</span>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              <LocalTime iso={item.createdAt.toISOString()} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
