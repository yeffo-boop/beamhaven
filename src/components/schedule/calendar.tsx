import {
  CalendarClock,
  CircleDot,
  ClipboardCheck,
  Flag,
  type LucideIcon,
  PackageCheck,
  Receipt,
  SquareCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/records/panel";
import { dayKey, formatTime, formatWeekday } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { CalendarEntry, CalendarKind } from "@/server/data/calendar";

/** Month, week and agenda views of the calendar feed (Milestone 7, part 2). */

const KINDS: Record<CalendarKind, { icon: LucideIcon; label: string; tone: string }> = {
  appointment: { icon: CalendarClock, label: "Appointment", tone: "text-primary" },
  inspection: { icon: ClipboardCheck, label: "Inspection", tone: "text-info" },
  delivery: { icon: Truck, label: "Delivery", tone: "text-primary" },
  other: { icon: CircleDot, label: "Event", tone: "text-muted-foreground" },
  task: { icon: SquareCheck, label: "Task", tone: "text-foreground" },
  milestone: { icon: Flag, label: "Milestone", tone: "text-primary" },
  delivered: { icon: PackageCheck, label: "Delivery", tone: "text-positive" },
  expected: { icon: Truck, label: "Order", tone: "text-warning" },
  payment: { icon: Receipt, label: "Bill", tone: "text-warning" },
};

function byDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const key = dayKey(e.day);
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return map;
}

function when(e: CalendarEntry): string | null {
  if (!e.startTime) return null;
  return e.endTime
    ? `${formatTime(e.startTime)} – ${formatTime(e.endTime)}`
    : formatTime(e.startTime);
}

/** One line: icon, time, title, and what kind of thing it is. */
function Entry({ entry, compact = false }: { entry: CalendarEntry; compact?: boolean }) {
  const kind = KINDS[entry.kind];
  const Icon = kind.icon;
  const time = when(entry);
  const failed = entry.note === "Failed";
  return (
    <Link
      href={entry.href}
      className={cn(
        "group flex min-w-0 items-start gap-1.5 rounded-sm hover:bg-accent",
        compact ? "px-1 py-0.5 text-xs" : "px-1.5 py-1 text-sm",
      )}
    >
      <Icon
        className={cn("mt-0.5 shrink-0", compact ? "size-3" : "size-4", kind.tone)}
        aria-hidden
      />
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            compact ? "truncate" : "font-medium",
            entry.done && "text-muted-foreground line-through",
          )}
        >
          {compact && entry.startTime ? `${formatTime(entry.startTime)} ` : null}
          {entry.title}
        </span>
        {compact ? (
          <span className="sr-only">{[kind.label, entry.note].filter(Boolean).join(", ")}</span>
        ) : (
          <span className={cn("text-xs text-muted-foreground", failed && "text-destructive")}>
            {[time, kind.label, entry.note, entry.projectName].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    </Link>
  );
}

/** The days that have something on them, as a list. Used on phones and for the agenda. */
export function AgendaList({
  entries,
  today,
  empty = "Nothing on the calendar for these dates.",
}: {
  entries: CalendarEntry[];
  today: Date;
  empty?: string;
}) {
  if (entries.length === 0) return <EmptyState>{empty}</EmptyState>;
  const days = [...byDay(entries)];
  return (
    <ol aria-label="Agenda" className="flex flex-col gap-4">
      {days.map(([key, list]) => (
        <li key={key} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">
            {formatWeekday(list[0]!.day)}
            {key === dayKey(today) ? (
              <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-xs text-primary">
                Today
              </span>
            ) : null}
          </h3>
          <ul className="flex flex-col">
            {list.map((e) => (
              <li key={e.key}>
                <Entry entry={e} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_IN_CELL = 3;

/** A month grid from md up; a list of busy days on phones. */
export function MonthGrid({
  weeks,
  month,
  entries,
  today,
}: {
  weeks: Date[][];
  /** Any day in the month being shown. */
  month: Date;
  entries: CalendarEntry[];
  today: Date;
}) {
  const map = byDay(entries);
  const todayKey = dayKey(today);
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left" aria-label="Month">
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" className="pb-1 text-xs font-medium text-muted-foreground">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={dayKey(week[0]!)}>
                {week.map((day) => {
                  const key = dayKey(day);
                  const list = map.get(key) ?? [];
                  const outside = day.getUTCMonth() !== month.getUTCMonth();
                  return (
                    <td
                      key={key}
                      className={cn(
                        "h-24 border border-border p-1 align-top",
                        outside && "bg-muted/40",
                      )}
                    >
                      <div
                        className={cn(
                          "mb-0.5 flex size-6 items-center justify-center rounded-full text-xs",
                          outside && "text-muted-foreground",
                          key === todayKey && "bg-primary font-semibold text-primary-foreground",
                        )}
                      >
                        {day.getUTCDate()}
                      </div>
                      <ul className="flex flex-col">
                        {list.slice(0, MAX_IN_CELL).map((e) => (
                          <li key={e.key}>
                            <Entry entry={e} compact />
                          </li>
                        ))}
                      </ul>
                      {list.length > MAX_IN_CELL ? (
                        <Link
                          href={`/schedule?view=week&date=${key}`}
                          className="px-1 text-xs text-muted-foreground hover:underline"
                        >
                          {list.length - MAX_IN_CELL} more
                        </Link>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        <AgendaList entries={entries} today={today} empty="Nothing on the calendar this month." />
      </div>
    </>
  );
}

/** Seven columns from md up; a list of the week's days on phones. */
export function WeekColumns({
  days,
  entries,
  today,
}: {
  days: Date[];
  entries: CalendarEntry[];
  today: Date;
}) {
  const map = byDay(entries);
  const todayKey = dayKey(today);
  return (
    <>
      <ol aria-label="Week" className="hidden gap-2 md:grid md:grid-cols-7">
        {days.map((day) => {
          const key = dayKey(day);
          const list = map.get(key) ?? [];
          return (
            <li
              key={key}
              className={cn(
                "flex min-h-40 min-w-0 flex-col gap-1 rounded-[var(--radius-control)] border border-border p-1.5",
                key === todayKey && "border-primary",
              )}
            >
              <h3 className="px-1 text-xs font-medium text-muted-foreground">
                {WEEKDAYS[day.getUTCDay()]} {day.getUTCDate()}
                {key === todayKey ? <span className="sr-only"> (today)</span> : null}
              </h3>
              <ul className="flex flex-col">
                {list.map((e) => (
                  <li key={e.key}>
                    <Entry entry={e} compact />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      <div className="md:hidden">
        <AgendaList entries={entries} today={today} empty="Nothing on the calendar this week." />
      </div>
    </>
  );
}

/** An appointment's own list, for a project page. */
export { Entry as CalendarEntryLine };
