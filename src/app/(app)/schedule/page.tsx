import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { TaskList } from "@/components/contractors/lists";
import { inputClass } from "@/components/forms/field";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/records/panel";
import { AppointmentForm } from "@/components/schedule/appointment-form";
import { AgendaList, MonthGrid, WeekColumns } from "@/components/schedule/calendar";
import { MilestoneList } from "@/components/schedule/milestones";
import { Button } from "@/components/ui/button";
import {
  addDays,
  addMonths,
  dayKey,
  formatMonth,
  formatWeekday,
  monthWeeks,
  parseDay,
  startOfMonth,
  weekDays,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { can } from "@/server/auth/permissions";
import { getWorkspaceContext } from "@/server/auth/workspace";
import type { TaskRecord } from "@/server/data/tasks";
import { getCalendar } from "@/server/services/appointments";
import { getRecordChoices, NO_CHOICES } from "@/server/services/choices";
import { getMilestones } from "@/server/services/milestones";
import { getHouseholdToday } from "@/server/services/preferences";
import { getProjects } from "@/server/services/projects";
import { getTasks } from "@/server/services/tasks";

export const metadata = { title: "Schedule" };

const VIEWS = { month: "Month", week: "Week", agenda: "Agenda", tasks: "Tasks" } as const;
type View = keyof typeof VIEWS;
const AGENDA_DAYS = 30;

const SHOW = {
  open: { label: "Still to do", keep: (t: TaskRecord) => t.status !== "done" },
  blocked: {
    label: "Blocked",
    keep: (t: TaskRecord) => t.status !== "done" && t.blockedBy.length > 0,
  },
  done: { label: "Done", keep: (t: TaskRecord) => t.status === "done" },
  all: { label: "All tasks", keep: () => true },
} as const;
type Show = keyof typeof SHOW;

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** The days a view covers, and where its arrows go. */
function rangeFor(view: Exclude<View, "tasks">, date: Date) {
  if (view === "month") {
    const weeks = monthWeeks(date);
    return {
      from: weeks[0]![0]!,
      to: weeks.at(-1)![6]!,
      title: formatMonth(date),
      prev: startOfMonth(addMonths(date, -1)),
      next: startOfMonth(addMonths(date, 1)),
      weeks,
    };
  }
  if (view === "week") {
    const days = weekDays(date);
    return {
      from: days[0]!,
      to: days[6]!,
      title: `Week of ${formatWeekday(days[0]!)}`,
      prev: addDays(days[0]!, -7),
      next: addDays(days[0]!, 7),
      days,
    };
  }
  return {
    from: date,
    to: addDays(date, AGENDA_DAYS - 1),
    title: `${AGENDA_DAYS} days from ${formatWeekday(date)}`,
    prev: addDays(date, -AGENDA_DAYS),
    next: addDays(date, AGENDA_DAYS),
  };
}

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const params = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const canEdit = can(ctx, "records:edit");
  const projectId = one(params.project);
  const view: View = one(params.view) in VIEWS ? (one(params.view) as View) : "month";
  const show: Show = one(params.show) in SHOW ? (one(params.show) as Show) : "open";
  const [today, projects, choices] = await Promise.all([
    getHouseholdToday(ctx),
    getProjects(ctx),
    canEdit ? getRecordChoices(ctx) : Promise.resolve(NO_CHOICES),
  ]);
  const date = parseDay(one(params.date)) ?? today;

  /** A link to this page with some settings changed. */
  const href = (change: { view?: View; date?: Date | null; show?: Show }) => {
    const q = new URLSearchParams();
    if (projectId) q.set("project", projectId);
    const v = change.view ?? view;
    if (v !== "month") q.set("view", v);
    const d = change.date === undefined ? (params.date ? date : null) : change.date;
    if (d && v !== "tasks") q.set("date", dayKey(d));
    const s = change.show ?? show;
    if (v === "tasks" && s !== "open") q.set("show", s);
    const query = q.toString();
    return query ? `/schedule?${query}` : "/schedule";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        description="Appointments, inspections, deliveries, tasks due and bills to pay, on one calendar."
      />
      <nav aria-label="Schedule views" className="flex flex-wrap gap-1">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Button
            key={v}
            asChild
            size="sm"
            variant={v === view ? "default" : "outline"}
            aria-current={v === view ? "page" : undefined}
          >
            <Link href={href({ view: v })}>{VIEWS[v]}</Link>
          </Button>
        ))}
      </nav>
      <form
        method="get"
        className="flex flex-wrap items-end gap-3"
        aria-label="Filter the schedule"
      >
        {view !== "month" ? <input type="hidden" name="view" value={view} /> : null}
        {params.date && view !== "tasks" ? (
          <input type="hidden" name="date" value={dayKey(date)} />
        ) : null}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Project
          <select name="project" defaultValue={projectId} className={`${inputClass} min-w-48`}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {view === "tasks" ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Tasks
            <select name="show" defaultValue={show} className={`${inputClass} min-w-40`}>
              {Object.entries(SHOW).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button type="submit" variant="outline">
          Show
        </Button>
        {projectId || (view === "tasks" && show !== "open") ? (
          <Button asChild variant="ghost">
            <Link href={view === "month" ? "/schedule" : `/schedule?view=${view}`}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {canEdit ? (
        <details className="rounded-[var(--radius-control)] border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Add an appointment or inspection
          </summary>
          <div className="mt-3">
            <AppointmentForm
              fixed={projectId ? { projectId } : {}}
              projects={choices.projects}
              rooms={choices.rooms}
              contractors={choices.contractors}
            />
          </div>
        </details>
      ) : null}

      {view === "tasks" ? (
        <TasksView ctxProject={projectId} show={show} today={today} canEdit={canEdit} href={href} />
      ) : (
        <CalendarView view={view} date={date} today={today} projectId={projectId} href={href} />
      )}
    </div>
  );
}

async function CalendarView({
  view,
  date,
  today,
  projectId,
  href,
}: {
  view: Exclude<View, "tasks">;
  date: Date;
  today: Date;
  projectId: string;
  href: (change: { date?: Date | null }) => string;
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const range = rangeFor(view, date);
  const entries = await getCalendar(ctx, {
    from: range.from,
    to: range.to,
    ...(projectId ? { projectId } : {}),
  });
  const showsToday = today >= range.from && today <= range.to;
  return (
    <Panel
      title={range.title}
      id="calendar"
      actions={
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm">
            <Link href={href({ date: range.prev })} aria-label="Earlier">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(showsToday && "text-muted-foreground")}
          >
            <Link href={href({ date: null })}>Today</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={href({ date: range.next })} aria-label="Later">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      }
    >
      {"weeks" in range && range.weeks ? (
        <MonthGrid weeks={range.weeks} month={date} entries={entries} today={today} />
      ) : "days" in range && range.days ? (
        <WeekColumns days={range.days} entries={entries} today={today} />
      ) : (
        <AgendaList entries={entries} today={today} />
      )}
    </Panel>
  );
}

async function TasksView({
  ctxProject: projectId,
  show,
  today,
  canEdit,
  href,
}: {
  ctxProject: string;
  show: Show;
  today: Date;
  canEdit: boolean;
  href: (change: { show?: Show }) => string;
}) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const [tasks, milestones] = await Promise.all([
    getTasks(ctx, projectId ? { projectId } : {}),
    getMilestones(ctx, projectId ? { projectId } : {}),
  ]);
  const shown = tasks.filter(SHOW[show].keep);
  const blockedCount = tasks.filter(SHOW.blocked.keep).length;
  return (
    <>
      <Panel title="Milestones" id="milestones">
        <MilestoneList milestones={milestones} today={today} showProject={!projectId} />
      </Panel>
      <Panel title={SHOW[show].label} id="tasks">
        {show === "open" && blockedCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {blockedCount} {blockedCount === 1 ? "task is" : "tasks are"} blocked, waiting on
            others.{" "}
            <Link href={href({ show: "blocked" })} className="text-primary hover:underline">
              See which
            </Link>
          </p>
        ) : null}
        <TaskList
          tasks={shown}
          canEdit={canEdit}
          today={today}
          show={projectId ? ["room", "milestone"] : ["project", "milestone"]}
        />
      </Panel>
    </>
  );
}
