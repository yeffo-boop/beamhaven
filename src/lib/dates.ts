/**
 * Project dates are calendar days stored at midnight UTC, so they're shown
 * in UTC too; otherwise a date could appear a day early west of Greenwich.
 */
const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDay(date: Date | null): string | null {
  return date ? dayFormat.format(date) : null;
}

/** "2026-12-01", for a date input's value. */
export function dayInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** "Mar 1 – May 1, 2027", or one end, or null. */
export function formatDayRange(start: Date | null, end: Date | null): string | null {
  if (start && end) return `${formatDay(start)} – ${formatDay(end)}`;
  if (start) return `From ${formatDay(start)}`;
  if (end) return `By ${formatDay(end)}`;
  return null;
}
