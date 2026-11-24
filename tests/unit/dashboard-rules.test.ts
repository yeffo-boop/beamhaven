import { describe, expect, it } from "vitest";

import { parseDay } from "@/lib/calendar";
import type { CalendarEntry } from "@/server/data/calendar";
import { needsAttention, type QuoteFacts } from "@/server/services/dashboard-rules";

const day = (value: string) => parseDay(value) ?? new Date(NaN);
const today = day("2026-12-10");

function entry(over: Partial<CalendarEntry> & Pick<CalendarEntry, "key" | "kind" | "day">) {
  return {
    startTime: null,
    endTime: null,
    title: over.key,
    href: `/x/${over.key}`,
    projectName: "Kitchen",
    done: false,
    note: null,
    ...over,
  } satisfies CalendarEntry;
}

const quote = (over: Partial<QuoteFacts>): QuoteFacts => ({
  id: "q",
  title: "Tile quote",
  status: "received",
  projectName: "Kitchen",
  contractorName: "Tilers",
  validUntil: null,
  ...over,
});

describe("needs attention", () => {
  it("lists overdue and due-today tasks, but not later or finished ones", () => {
    const items = needsAttention(
      [
        entry({ key: "late", kind: "task", day: day("2026-12-07") }),
        entry({ key: "today", kind: "task", day: day("2026-12-10") }),
        entry({ key: "tomorrow", kind: "task", day: day("2026-12-11") }),
        entry({ key: "done", kind: "task", day: day("2026-12-01"), done: true }),
      ],
      [],
      today,
    );
    expect(items.map((i) => [i.key, i.reason, i.overdue])).toEqual([
      ["late", "3 days overdue", true],
      ["today", "Due today", false],
    ]);
  });

  it("lists bills and deliveries within a week, late ones first", () => {
    const items = needsAttention(
      [
        entry({ key: "bill-soon", kind: "payment", day: day("2026-12-12") }),
        entry({ key: "bill-later", kind: "payment", day: day("2026-12-18") }),
        entry({ key: "bill-week", kind: "payment", day: day("2026-12-17") }),
        entry({ key: "bill-late", kind: "payment", day: day("2026-12-09") }),
        entry({ key: "paid", kind: "payment", day: day("2026-12-11"), done: true }),
        entry({ key: "order", kind: "expected", day: day("2026-12-11") }),
        entry({ key: "arrived", kind: "delivered", day: day("2026-12-10") }),
        entry({ key: "visit", kind: "appointment", day: day("2026-12-10") }),
      ],
      [],
      today,
    );
    expect(items.map((i) => [i.key, i.kind, i.reason])).toEqual([
      ["bill-late", "bill", "1 day overdue"],
      ["order", "delivery", "Expected tomorrow"],
      ["bill-soon", "bill", "Due in 2 days"],
      ["bill-week", "bill", "Due in 7 days"],
    ]);
  });

  it("adds quotes still waiting for a decision, last", () => {
    const items = needsAttention(
      [entry({ key: "late", kind: "task", day: day("2026-12-01") })],
      [
        quote({ id: "a", status: "received" }),
        quote({ id: "b", status: "under_review", validUntil: day("2026-12-01") }),
        quote({ id: "c", status: "approved" }),
        quote({ id: "d", status: "rejected" }),
      ],
      today,
    );
    expect(items.map((i) => [i.key, i.reason])).toEqual([
      ["late", "9 days overdue"],
      ["quote:a", "Waiting for a decision"],
      ["quote:b", "Waiting for a decision (the offer has expired)"],
    ]);
    expect(items[1]).toMatchObject({ href: "/quotes/a", note: "Tilers" });
  });
});
