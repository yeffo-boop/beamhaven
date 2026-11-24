import Link from "next/link";

import { Available } from "@/components/budget/money";
import { EmptyState } from "@/components/records/panel";
import { StatusBadge } from "@/components/records/status-badge";
import { formatDay, formatDayRange } from "@/lib/dates";
import type { ActiveProject } from "@/server/services/dashboard";

function health(budget: ActiveProject["budget"]) {
  if (!budget) return <span className="text-muted-foreground">No budget yet</span>;
  if (budget.available < 0n) return <Available cents={budget.available} />;
  return (
    <span>
      <Available cents={budget.available} /> left
    </span>
  );
}

/** Projects being planned or worked on, with their dates, money and next milestone. */
export function ProjectCards({ projects }: { projects: ActiveProject[] }) {
  if (projects.length === 0) {
    return (
      <EmptyState>No projects under way. Projects being planned or worked on show here.</EmptyState>
    );
  }
  return (
    <ul aria-label="Active projects" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const dates = formatDayRange(p.start, p.end);
        return (
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/projects/${p.id}`}
                className="min-w-0 font-medium break-words hover:underline"
              >
                {p.name}
              </Link>
              <StatusBadge status={p.status} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Dates</dt>
              <dd>{dates ?? <span className="text-muted-foreground">Not set</span>}</dd>
              <dt className="text-muted-foreground">Budget</dt>
              <dd>{health(p.budget)}</dd>
              <dt className="text-muted-foreground">Next</dt>
              <dd className="break-words">
                {p.nextMilestone ? (
                  <>
                    {p.nextMilestone.name}{" "}
                    <span className="text-muted-foreground">
                      ({formatDay(p.nextMilestone.targetDate)})
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No milestone coming up</span>
                )}
              </dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
