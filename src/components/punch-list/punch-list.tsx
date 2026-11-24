import Link from "next/link";

import { EmptyState } from "@/components/records/panel";
import { cn } from "@/lib/utils";
import { setPunchStatusAction } from "@/server/actions/punch-list";
import type { PunchItemRecord } from "@/server/data/punch-list";
import { PUNCH_STATUS_LABELS, type PunchStatus } from "@/server/services/punch-list";

/** The next step for each status, offered as one button. */
const NEXT: Record<PunchStatus, { status: PunchStatus; label: string } | null> = {
  open: { status: "fixed", label: "Mark fixed" },
  fixed: { status: "signed_off", label: "Sign off" },
  signed_off: null,
};

const tone: Record<PunchStatus, string> = {
  open: "text-warning",
  fixed: "text-primary",
  signed_off: "text-muted-foreground",
};

export function punchStatusLabel(status: string): string {
  return PUNCH_STATUS_LABELS[status as PunchStatus] ?? status;
}

export function PunchStatusButton({
  id,
  status,
  title,
}: {
  id: string;
  status: string;
  title: string;
}) {
  const next = NEXT[status as PunchStatus];
  if (!next) return null;
  return (
    <form action={setPunchStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next.status} />
      <button
        type="submit"
        className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        aria-label={`${next.label}: “${title}”`}
      >
        {next.label}
      </button>
    </form>
  );
}

/** A project's punch list, open items first. */
export function PunchList({ items, canEdit }: { items: PunchItemRecord[]; canEdit: boolean }) {
  if (items.length === 0) return <EmptyState>Nothing on the punch list.</EmptyState>;
  const order: Record<string, number> = { open: 0, fixed: 1, signed_off: 2 };
  const sorted = [...items].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  return (
    <ul aria-label="Punch list" className="divide-y divide-border">
      {sorted.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5 text-sm"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/punch/${item.id}`}
              className={cn(
                "font-medium hover:underline",
                item.status === "signed_off" && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              <span className={tone[item.status as PunchStatus]}>
                {punchStatusLabel(item.status)}
              </span>
              {[
                item.roomName,
                item.contractorName,
                item.photoCount > 0
                  ? `${item.photoCount} ${item.photoCount === 1 ? "file" : "files"}`
                  : null,
              ]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join("")}
            </span>
          </div>
          {canEdit ? (
            <PunchStatusButton id={item.id} status={item.status} title={item.title} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
