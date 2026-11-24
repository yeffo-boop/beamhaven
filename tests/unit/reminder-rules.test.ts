import { describe, expect, it } from "vitest";

import { hourIn, parseDay } from "@/lib/calendar";
import type { CalendarEntry } from "@/server/data/calendar";
import { entriesToRemind, remindersFor } from "@/server/services/reminder-rules";

const day = (value: string) => parseDay(value) ?? new Date(NaN);

function entry(
  key: string,
  kind: CalendarEntry["kind"],
  on: string,
  more: Partial<CalendarEntry> = {},
): CalendarEntry {
  return {
    key,
    kind,
    day: day(on),
    startTime: null,
    endTime: null,
    title: key,
    href: `/${key}`,
    projectName: null,
    done: false,
    note: null,
    ...more,
  };
}

describe("reminder rules", () => {
  const today = day("2026-12-01");

  it("picks tomorrow's things, and bills due within three days", () => {
    const entries = [
      entry("visit-today", "appointment", "2026-12-01"),
      entry("visit-tomorrow", "appointment", "2026-12-02"),
      entry("passed-tomorrow", "inspection", "2026-12-02", { done: true }),
      entry("delivered-tomorrow", "delivered", "2026-12-02"),
      entry("task-later", "task", "2026-12-03"),
      entry("bill-today", "payment", "2026-12-01"),
      entry("bill-in-3", "payment", "2026-12-04"),
      entry("bill-in-4", "payment", "2026-12-05"),
      entry("bill-late", "payment", "2026-11-30"),
    ];
    expect(entriesToRemind(entries, today).map((e) => e.key)).toEqual([
      "visit-tomorrow",
      "bill-today",
      "bill-in-3",
    ]);
  });

  it("sends a member's task to them alone, and everything else to owners and members", () => {
    const members = [
      { userId: "ana", role: "owner" },
      { userId: "ben", role: "member" },
      { userId: "vera", role: "viewer" },
    ];
    const targets = remindersFor(
      [
        entry("task-ben", "task", "2026-12-02", { assigneeUserId: "ben" }),
        entry("task-gone", "task", "2026-12-02", { assigneeUserId: "someone-who-left" }),
        entry("visit", "appointment", "2026-12-02"),
      ],
      members,
    );
    expect(targets.map((t) => [t.entryKey, t.userId])).toEqual([
      ["task-ben", "ben"],
      ["task-gone", "ana"],
      ["task-gone", "ben"],
      ["visit", "ana"],
      ["visit", "ben"],
    ]);
  });

  it("knows the hour where the household is", () => {
    const now = new Date("2026-12-01T15:30:00Z");
    expect(hourIn("UTC", now)).toBe(15);
    expect(hourIn("America/Los_Angeles", now)).toBe(7);
    expect(hourIn("Asia/Kolkata", now)).toBe(21);
    expect(hourIn("Not/AZone", now)).toBe(15);
  });
});
