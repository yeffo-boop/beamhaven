import type { ActivityItem } from "@/server/data/activity";

import { LocalTime } from "./local-time";

export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol aria-label="Recent activity" className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span>
            {item.actorName ? <span className="font-medium">{item.actorName}</span> : "Someone"}{" "}
            {lowerFirst(item.summary)}
          </span>
          <span className="text-xs text-muted-foreground">
            <LocalTime iso={item.createdAt.toISOString()} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
