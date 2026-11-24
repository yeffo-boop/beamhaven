import { describe, expect, it } from "vitest";

import { buildIcal, escapeText, foldLine } from "@/lib/ical";

const day = new Date("2026-12-03T00:00:00Z");
const now = new Date("2026-11-24T16:00:00Z");

describe("buildIcal", () => {
  it("writes an all-day event for something with no time", () => {
    const ics = buildIcal({
      name: "BeamHaven",
      timeZone: "America/Chicago",
      now,
      events: [
        {
          uid: "task:1@beamhaven",
          day,
          startTime: null,
          endTime: null,
          title: "Pick tile",
          description: "Kitchen remodel",
          url: "https://example.com/tasks/1",
        },
      ],
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261203\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261204\r\n");
    expect(ics).toContain("SUMMARY:Pick tile\r\n");
    expect(ics).toContain("DTSTAMP:20261124T160000Z\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("uses the household's time zone for timed events", () => {
    const ics = buildIcal({
      name: "BeamHaven",
      timeZone: "America/Chicago",
      now,
      events: [
        {
          uid: "appointment:1@beamhaven",
          day,
          startTime: "09:30",
          endTime: "11:00",
          title: "Inspection",
          description: null,
          url: "https://example.com/appointments/1",
        },
      ],
    });
    expect(ics).toContain("DTSTART;TZID=America/Chicago:20261203T093000\r\n");
    expect(ics).toContain("DTEND;TZID=America/Chicago:20261203T110000\r\n");
    expect(ics).not.toContain("DESCRIPTION");
  });

  it("makes a timed event an hour long when there's no sensible end", () => {
    const ics = buildIcal({
      name: "B",
      timeZone: "UTC",
      now,
      events: [
        {
          uid: "a@b",
          day,
          startTime: "23:15",
          endTime: "08:00",
          title: "Late",
          description: null,
          url: "https://example.com/",
        },
      ],
    });
    expect(ics).toContain("DTEND;TZID=UTC:20261203T235900\r\n");
  });
});

describe("escapeText", () => {
  it("escapes the characters iCalendar treats specially", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds long lines at 75 bytes without splitting characters", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(line);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
