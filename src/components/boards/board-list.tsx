import { BadgeCheck } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/records/panel";
import type { BoardSummary } from "@/server/data/boards";

import { ItemVisual } from "./board-items";

/** Boards as cards with a strip of their first items, on Inspiration, rooms and projects. */
export function BoardList({ boards, empty }: { boards: BoardSummary[]; empty: string }) {
  if (boards.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul aria-label="Design boards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((b) => {
        const where = [b.roomName, b.projectName].filter(Boolean).join(" · ");
        return (
          <li
            key={b.id}
            className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
          >
            <div className="grid aspect-[2/1] grid-cols-4 gap-0.5 bg-muted" aria-hidden="true">
              {b.preview.map((p) => (
                <div key={p.id} className="overflow-hidden">
                  <ItemVisual item={{ ...p, title: "" }} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 p-4">
              <Link
                href={`/inspiration/${b.id}`}
                className="font-medium break-words hover:underline"
              >
                {b.name}
              </Link>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{b.itemCount === 1 ? "1 item" : `${b.itemCount} items`}</span>
                {b.approvedCount > 0 ? (
                  <span className="flex items-center gap-1 text-primary">
                    <BadgeCheck className="size-3" aria-hidden="true" />
                    {b.approvedCount} approved
                  </span>
                ) : null}
                {where ? <span>{where}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
