/**
 * Builds an iCalendar (.ics) feed, the format Apple Calendar, Google
 * Calendar and Outlook subscribe to (RFC 5545). Pure, so it is unit tested
 * without a database (Milestone 12, ADR-045).
 */

export type IcalEvent = {
  /** Stable across downloads, so a calendar updates an event instead of adding a copy. */
  uid: string;
  /** The day, as stored: midnight UTC on that date. */
  day: Date;
  /** "HH:MM" in the household's time zone, or null for an all-day event. */
  startTime: string | null;
  endTime: string | null;
  title: string;
  description: string | null;
  url: string;
};

export type IcalFeed = {
  name: string;
  timeZone: string;
  events: IcalEvent[];
  now?: Date;
};

const CRLF = "\r\n";

/** Escapes text values: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Lines longer than 75 bytes are folded: broken and continued on the next
 * line after a space. Counted in UTF-8 bytes, never splitting a character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function dateValue(day: Date): string {
  return day.toISOString().slice(0, 10).replace(/-/g, "");
}

function stamp(at: Date): string {
  return `${at.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

function localDateTime(day: Date, time: string): string {
  return `${dateValue(day)}T${time.replace(":", "")}00`;
}

function nextDay(day: Date): Date {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000);
}

/** Adds an hour to "HH:MM", stopping at 23:59 so the event stays on its day. */
function hourLater(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h >= 23 ? "23:59" : `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function buildIcal(feed: IcalFeed): string {
  const now = feed.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BeamHaven//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(feed.name)}`,
    `X-WR-TIMEZONE:${feed.timeZone}`,
    // Ask calendars to check back every few hours.
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
  ];
  for (const event of feed.events) {
    lines.push("BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${stamp(now)}`);
    if (event.startTime && TIME.test(event.startTime)) {
      const end =
        event.endTime && TIME.test(event.endTime) && event.endTime > event.startTime
          ? event.endTime
          : hourLater(event.startTime);
      lines.push(
        `DTSTART;TZID=${feed.timeZone}:${localDateTime(event.day, event.startTime)}`,
        `DTEND;TZID=${feed.timeZone}:${localDateTime(event.day, end)}`,
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${dateValue(event.day)}`,
        `DTEND;VALUE=DATE:${dateValue(nextDay(event.day))}`,
        // All-day reminders shouldn't block time as "busy".
        "TRANSP:TRANSPARENT",
      );
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push(`URL:${event.url}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
