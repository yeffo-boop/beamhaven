/**
 * Calendar arithmetic (Milestone 7, part 2, ADR-032). Calendar days are
 * Dates at midnight UTC, like every other day in BeamHaven, so adding days
 * never meets daylight saving. Only "today" depends on a time zone.
 */

const DAY_MS = 86_400_000;

/** "2026-12-01" as a day, or null if it isn't a real date. */
export function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

/** Whether `zone` is a time zone this server knows ("America/Chicago"). */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone.length > 0;
  } catch {
    return false;
  }
}

/** Today's date where the household is, as a day. */
export function todayIn(zone: string, now: Date = new Date()): Date {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: isTimeZone(zone) ? zone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseDay(local) ?? parseDay(now.toISOString().slice(0, 10)) ?? now;
}

/** The Sunday on or before `day`. */
export function startOfWeek(day: Date): Date {
  return addDays(day, -day.getUTCDay());
}

export function startOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** The same day of the month `months` away, clamped (Jan 31 + 1 month = Feb 28). */
export function addMonths(day: Date, months: number): Date {
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day.getUTCDate(), last)));
}

/** The weeks (Sunday to Saturday) that show the month containing `day`. */
export function monthWeeks(day: Date): Date[][] {
  const first = startOfMonth(day);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const weeks: Date[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

export function weekDays(day: Date): Date[] {
  const start = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "14:30" as "2:30 PM". */
export function formatTime(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatMonth(day: Date): string {
  return monthFormat.format(day);
}

/** "Tuesday, Dec 1". */
export function formatWeekday(day: Date): string {
  return weekdayFormat.format(day);
}
