import { addDays } from "@/lib/calendar";
import type { CalendarEntry } from "@/server/data/calendar";

/** What the Home page's "Needs attention" list is made of (Milestone 9, part 1, ADR-037). */

/** Bills and deliveries this many days ahead count as "soon". */
export const ATTENTION_DAYS_AHEAD = 7;

export type AttentionKind = "task" | "bill" | "delivery" | "quote";

export type AttentionItem = {
  key: string;
  kind: AttentionKind;
  title: string;
  href: string;
  /** "Overdue", "Due today", "Due in 3 days", "Waiting for a decision"... */
  reason: string;
  /** Overdue things come first and are marked as such. */
  overdue: boolean;
  day: Date | null;
  projectName: string | null;
  note: string | null;
};

/** A quote's few facts this needs (from the quotes list). */
export type QuoteFacts = {
  id: string;
  title: string;
  status: string;
  projectName: string;
  contractorName: string;
  validUntil: Date | null;
};

const DAY_MS = 86_400_000;

function when(day: Date, today: Date, verb: string): { reason: string; overdue: boolean } {
  const days = Math.round((day.getTime() - today.getTime()) / DAY_MS);
  if (days < 0) {
    return { reason: days === -1 ? "1 day overdue" : `${-days} days overdue`, overdue: true };
  }
  if (days === 0) return { reason: `${verb} today`, overdue: false };
  if (days === 1) return { reason: `${verb} tomorrow`, overdue: false };
  return { reason: `${verb} in ${days} days`, overdue: false };
}

/**
 * Picks out what needs someone's attention from the calendar (which must
 * cover from well before `today` to at least a week after it) and the quotes:
 * - tasks not done, due today or earlier;
 * - unpaid bills due within a week, or already late;
 * - orders expected within a week that haven't all arrived, or are late;
 * - quotes received or under review, waiting for a decision.
 * Overdue things first, then by day; quotes last.
 */
export function needsAttention(
  entries: readonly CalendarEntry[],
  quotes: readonly QuoteFacts[],
  today: Date,
): AttentionItem[] {
  const horizon = addDays(today, ATTENTION_DAYS_AHEAD);
  const dated: AttentionItem[] = [];
  for (const e of entries) {
    if (e.done) continue;
    const base = {
      key: e.key,
      title: e.title,
      href: e.href,
      day: e.day,
      projectName: e.projectName,
      note: e.note,
    };
    if (e.kind === "task" && e.day <= today) {
      dated.push({ ...base, kind: "task", ...when(e.day, today, "Due") });
    } else if (e.kind === "payment" && e.day <= horizon) {
      dated.push({ ...base, kind: "bill", ...when(e.day, today, "Due") });
    } else if (e.kind === "expected" && e.day <= horizon) {
      dated.push({ ...base, kind: "delivery", ...when(e.day, today, "Expected") });
    }
  }
  dated.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (a.day?.getTime() ?? 0) - (b.day?.getTime() ?? 0) ||
      a.title.localeCompare(b.title),
  );
  const waiting = quotes
    .filter((q) => q.status === "received" || q.status === "under_review")
    .map((q): AttentionItem => ({
      key: `quote:${q.id}`,
      kind: "quote",
      title: q.title,
      href: `/quotes/${q.id}`,
      reason:
        q.validUntil && q.validUntil < today
          ? "Waiting for a decision (the offer has expired)"
          : "Waiting for a decision",
      overdue: false,
      day: q.validUntil,
      projectName: q.projectName,
      note: q.contractorName,
    }));
  return [...dated, ...waiting];
}
