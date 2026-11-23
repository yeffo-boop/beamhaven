import { AlertTriangle, CalendarClock } from "lucide-react";
import Link from "next/link";

import { ConfirmAction } from "@/components/records/confirm-action";
import { EmptyState } from "@/components/records/panel";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  deleteCommunicationAction,
  setTaskStatusAction,
  unlinkProjectAction,
} from "@/server/actions/contractors";
import type { CommunicationRecord, ProjectContractor } from "@/server/data/contractors";
import type { TaskRecord, WarrantyRecord } from "@/server/data/tasks";
import {
  CHANNEL_LABELS,
  CONTRACTOR_STATUS_LABELS,
  daysUntil,
  expiryState,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from "@/server/services/contractor-inputs";

import { labelFor } from "./labels";

// Color is never the only signal: badges always carry their words, and
// warnings an icon.

const statusTones: Record<string, string> = {
  prospect: "bg-info/12 text-info",
  active: "bg-primary/12 text-primary",
  past: "bg-muted text-muted-foreground",
  do_not_use: "bg-destructive/12 text-destructive",
};

export function ContractorStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        statusTones[status] ?? statusTones.past,
      )}
    >
      {labelFor(CONTRACTOR_STATUS_LABELS, status)}
    </span>
  );
}

/**
 * "License expired Mar 1, 2026" or "Insurance expires in 12 days". Nothing
 * when the date is unknown or more than 30 days away, unless `always`.
 */
export function ExpiryNote({
  what,
  date,
  today,
  always = false,
}: {
  what: string;
  date: Date | null;
  today: Date;
  always?: boolean;
}) {
  const state = expiryState(date, today);
  if (!date || !state || (state === "ok" && !always)) return null;
  const days = daysUntil(date, today);
  const text =
    state === "expired"
      ? `${what} expired ${formatDay(date)}`
      : state === "soon"
        ? days === 0
          ? `${what} expires today`
          : `${what} expires in ${days} day${days === 1 ? "" : "s"}`
        : `${what} valid until ${formatDay(date)}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        state === "expired"
          ? "text-destructive"
          : state === "soon"
            ? "text-warning"
            : "text-muted-foreground",
      )}
    >
      {state === "ok" ? null : state === "expired" ? (
        <AlertTriangle className="size-3.5" aria-hidden="true" />
      ) : (
        <CalendarClock className="size-3.5" aria-hidden="true" />
      )}
      {text}
    </span>
  );
}

export function ProjectContractorList({
  contractors,
  projectId,
  canEdit,
}: {
  contractors: ProjectContractor[];
  projectId: string;
  canEdit: boolean;
}) {
  if (contractors.length === 0) return <EmptyState>No contractors on this project yet.</EmptyState>;
  return (
    <ul aria-label="Contractors on this project" className="divide-y divide-border">
      {contractors.map((c) => (
        <li
          key={c.contractorId}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm"
        >
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/contractors/${c.contractorId}`} className="font-medium hover:underline">
              {c.name}
            </Link>
            <span className="text-muted-foreground">{c.role ?? c.trade}</span>
            {c.status === "do_not_use" ? <ContractorStatusBadge status={c.status} /> : null}
          </span>
          {canEdit ? (
            <ConfirmAction
              action={unlinkProjectAction}
              label="Remove"
              srLabel={`${c.name} from this project`}
              question={`Take ${c.name} off this project? Their log and records stay.`}
              confirmLabel="Yes, take them off"
              size="xs"
            >
              <input type="hidden" name="contractorId" value={c.contractorId} />
              <input type="hidden" name="projectId" value={projectId} />
            </ConfirmAction>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CommunicationList({
  entries,
  canEdit,
  showContractor = false,
}: {
  entries: CommunicationRecord[];
  canEdit: boolean;
  showContractor?: boolean;
}) {
  if (entries.length === 0) return <EmptyState>Nothing logged yet.</EmptyState>;
  return (
    <ul aria-label="Communication log" className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-medium">
              {labelFor(CHANNEL_LABELS, e.channel)} · {formatDay(e.occurredOn)}
              {showContractor ? (
                <>
                  {" · "}
                  <Link href={`/contractors/${e.contractorId}`} className="hover:underline">
                    {e.contractorName}
                  </Link>
                </>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {[e.projectName, e.createdByName].filter(Boolean).join(" · ")}
            </span>
          </div>
          <p className="whitespace-pre-line">{e.summary}</p>
          {canEdit ? (
            <ConfirmAction
              action={deleteCommunicationAction}
              label="Delete"
              srLabel={`log entry from ${formatDay(e.occurredOn)}`}
              question="Delete this log entry?"
              confirmLabel="Yes, delete it"
              size="xs"
            >
              <input type="hidden" name="id" value={e.id} />
            </ConfirmAction>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function WarrantyList({
  warranties,
  today,
  show,
}: {
  warranties: WarrantyRecord[];
  today: Date;
  /** Which links to mention (the page's own one is left out). */
  show: ("contractor" | "project" | "room" | "material")[];
}) {
  if (warranties.length === 0) return <EmptyState>No warranties recorded.</EmptyState>;
  return (
    <ul aria-label="Warranties" className="divide-y divide-border">
      {warranties.map((w) => (
        <li key={w.id} className="flex flex-col gap-0.5 py-2.5 text-sm">
          <Link href={`/warranties/${w.id}`} className="font-medium hover:underline">
            {w.coverage}
          </Link>
          <span className="text-xs text-muted-foreground">
            {[
              w.provider,
              show.includes("contractor") ? w.contractorName : null,
              show.includes("project") ? w.projectName : null,
              show.includes("room") ? w.roomName : null,
              show.includes("material") ? w.materialName : null,
              w.expiresOn ? null : "No end date",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <ExpiryNote what="Warranty" date={w.expiresOn} today={today} always />
        </li>
      ))}
    </ul>
  );
}

const priorityTone: Record<string, string> = {
  high: "text-destructive",
  normal: "text-muted-foreground",
  low: "text-muted-foreground",
};

export function TaskList({
  tasks,
  canEdit,
  today,
  show = [],
}: {
  tasks: TaskRecord[];
  canEdit: boolean;
  today: Date;
  show?: ("project" | "room")[];
}) {
  if (tasks.length === 0) return <EmptyState>No tasks yet.</EmptyState>;
  return (
    <ul aria-label="Tasks" className="divide-y divide-border">
      {tasks.map((t) => {
        const done = t.status === "done";
        const overdue = !done && t.dueDate !== null && daysUntil(t.dueDate, today) < 0;
        return (
          <li
            key={t.id}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5 text-sm"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={`/tasks/${t.id}`}
                className={cn(
                  "font-medium hover:underline",
                  done && "text-muted-foreground line-through",
                )}
              >
                {t.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                {[
                  labelFor(TASK_STATUS_LABELS, t.status),
                  t.assigneeName,
                  show.includes("project") ? t.projectName : null,
                  show.includes("room") ? t.roomName : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {t.priority !== "normal" ? (
                  <span className={priorityTone[t.priority]}>
                    {" · "}
                    {labelFor(PRIORITY_LABELS, t.priority)} priority
                  </span>
                ) : null}
              </span>
              {t.dueDate && !done ? (
                <span
                  className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}
                >
                  {overdue ? "Overdue: was due " : "Due "}
                  {formatDay(t.dueDate)}
                </span>
              ) : null}
            </div>
            {canEdit ? (
              <form action={setTaskStatusAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value={done ? "todo" : "done"} />
                <button
                  type="submit"
                  className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                  aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” done`}
                >
                  {done ? "Reopen" : "Mark done"}
                </button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
