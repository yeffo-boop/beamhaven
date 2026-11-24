import { addDays, dayKey } from "@/lib/calendar";
import type { CalendarEntry } from "@/server/data/calendar";

/**
 * Who is reminded of what, and when (Milestone 7, part 3, ADR-033).
 * Plain functions, so the rules can be tested without a database.
 */

/** Reminders go out from this hour of the household's morning. */
export const SEND_FROM_HOUR = 7;
/** Bills are flagged this many days before they're due (and on the day). */
export const BILL_DAYS_AHEAD = 3;

export type ReminderTarget = {
  userId: string;
  entryKey: string;
  kind: string;
  title: string;
  href: string;
  day: Date;
};

/** Which calendar entries are worth a reminder today. */
export function entriesToRemind(entries: readonly CalendarEntry[], today: Date): CalendarEntry[] {
  const tomorrow = dayKey(addDays(today, 1));
  const billsUntil = addDays(today, BILL_DAYS_AHEAD).getTime();
  return entries.filter((e) => {
    // Finished, passed or paid things, and deliveries that already came, need nothing.
    if (e.done || e.kind === "delivered") return false;
    if (e.kind === "payment") {
      return e.day.getTime() >= today.getTime() && e.day.getTime() <= billsUntil;
    }
    return dayKey(e.day) === tomorrow;
  });
}

/**
 * One reminder per person for each entry. A task given to a household member
 * goes to them alone; everything else goes to everyone who can make changes
 * (owners and members). Viewers aren't reminded: they can't act on it.
 */
export function remindersFor(
  entries: readonly CalendarEntry[],
  members: readonly { userId: string; role: string }[],
): ReminderTarget[] {
  const editors = members.filter((m) => m.role !== "viewer").map((m) => m.userId);
  const everyone = new Set(members.map((m) => m.userId));
  return entries.flatMap((e) => {
    const people =
      e.kind === "task" && e.assigneeUserId && everyone.has(e.assigneeUserId)
        ? [e.assigneeUserId]
        : editors;
    return people.map((userId) => ({
      userId,
      entryKey: e.key,
      kind: e.kind,
      title: e.title,
      href: e.href,
      day: e.day,
    }));
  });
}
