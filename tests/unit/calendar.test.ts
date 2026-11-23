import { describe, expect, it } from "vitest";

import {
  addMonths,
  dayKey,
  formatTime,
  isTimeZone,
  monthWeeks,
  parseDay,
  todayIn,
  weekDays,
} from "@/lib/calendar";

const day = (s: string) => parseDay(s) as Date;

describe("calendar", () => {
  it("knows what day it is where the household is", () => {
    // 3 AM UTC on Nov 24 is still the evening of Nov 23 in Los Angeles.
    const now = new Date("2026-11-24T03:00:00Z");
    expect(dayKey(todayIn("America/Los_Angeles", now))).toBe("2026-11-23");
    expect(dayKey(todayIn("UTC", now))).toBe("2026-11-24");
    expect(dayKey(todayIn("Not/AZone", now))).toBe("2026-11-24");
    expect(isTimeZone("America/Chicago")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
  });

  it("lays a month out in whole weeks, Sunday first", () => {
    // December 2026 starts on a Tuesday and ends on a Thursday.
    const weeks = monthWeeks(day("2026-12-15"));
    expect(weeks).toHaveLength(5);
    expect(dayKey(weeks[0]?.[0] as Date)).toBe("2026-11-29");
    expect(dayKey(weeks[4]?.[6] as Date)).toBe("2027-01-02");
    // A week across daylight saving's end (Nov 1, 2026) is still seven days.
    expect(weekDays(day("2026-11-03")).map(dayKey)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
  });

  it("moves by months without spilling over", () => {
    expect(dayKey(addMonths(day("2027-01-31"), 1))).toBe("2027-02-28");
    expect(dayKey(addMonths(day("2026-12-15"), 1))).toBe("2027-01-15");
    expect(dayKey(addMonths(day("2026-01-15"), -1))).toBe("2025-12-15");
  });

  it("reads days and shows times plainly", () => {
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("soon")).toBeNull();
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("14:30")).toBe("2:30 PM");
  });
});
