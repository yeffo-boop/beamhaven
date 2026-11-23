import { Flag } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/records/panel";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MilestoneRecord } from "@/server/data/milestones";
import { daysUntil } from "@/server/services/contractor-inputs";

/** Whether a milestone is done (every task finished), late, or still going. */
export function milestoneState(
  m: Pick<MilestoneRecord, "taskCount" | "doneCount" | "targetDate">,
  today: Date,
): "done" | "late" | "open" {
  if (m.taskCount > 0 && m.doneCount === m.taskCount) return "done";
  if (m.targetDate && daysUntil(m.targetDate, today) < 0) return "late";
  return "open";
}

const tones = {
  done: "bg-positive/12 text-positive",
  late: "bg-destructive/12 text-destructive",
  open: "bg-muted text-muted-foreground",
} as const;
const words = { done: "Done", late: "Late", open: "In progress" } as const;

export function MilestoneBadge({ state }: { state: keyof typeof tones }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tones[state])}>
      {words[state]}
    </span>
  );
}

export function MilestoneList({
  milestones,
  today,
  showProject = false,
}: {
  milestones: MilestoneRecord[];
  today: Date;
  showProject?: boolean;
}) {
  if (milestones.length === 0) return <EmptyState>No milestones yet.</EmptyState>;
  return (
    <ul aria-label="Milestones" className="divide-y divide-border">
      {milestones.map((m) => {
        const state = milestoneState(m, today);
        return (
          <li
            key={m.id}
            className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm"
          >
            <div className="flex min-w-0 items-start gap-2">
              <Flag aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link href={`/milestones/${m.id}`} className="font-medium hover:underline">
                  {m.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {[
                    showProject ? m.projectName : null,
                    m.taskCount === 0
                      ? "No tasks yet"
                      : `${m.doneCount} of ${m.taskCount} ${m.taskCount === 1 ? "task" : "tasks"} done`,
                    m.targetDate ? `Target ${formatDay(m.targetDate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </div>
            <MilestoneBadge state={state} />
          </li>
        );
      })}
    </ul>
  );
}
