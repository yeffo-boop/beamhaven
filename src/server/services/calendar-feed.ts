import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getEnv } from "@/config/env";
import { brand } from "@/config/brand";
import { addDays } from "@/lib/calendar";
import { buildIcal } from "@/lib/ical";
import { absoluteUrl } from "@/lib/url";
import { assertCan } from "@/server/auth/permissions";
import { resolveWorkspaceContext } from "@/server/auth/workspace";
import { type CalendarKind, listCalendarEntries } from "@/server/data/calendar";
import {
  type CalendarFeedInfo,
  deleteCalendarFeed,
  findCalendarFeedByHash,
  findCalendarFeedInfo,
  saveCalendarFeed,
  touchCalendarFeed,
} from "@/server/data/calendar-feeds";
import type { WorkspaceContext } from "@/server/data/context";

import { getHouseholdToday, getTimeZonePreference } from "./preferences";

/**
 * A private calendar link per person (Milestone 12, ADR-045): appointments,
 * task due dates, milestones, deliveries and bills, for Apple, Google or
 * Outlook to subscribe to. Anyone with the link can read the calendar, so
 * it holds 32 random bytes, only its hash is stored, and it can be replaced.
 */

/** How far back and ahead the feed reaches. */
const DAYS_BACK = 90;
const DAYS_AHEAD = 400;

/** Says what each entry is, since a phone calendar shows only the title. */
const PREFIX: Record<CalendarKind, string | null> = {
  appointment: null,
  other: null,
  inspection: "Inspection",
  delivery: "Delivery",
  task: "Task due",
  milestone: "Milestone",
  delivered: "Delivered",
  expected: "Delivery expected",
  payment: "Bill due",
};

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function calendarFeedUrl(token: string): string {
  return absoluteUrl(getEnv().APP_URL, `/api/calendar/${token}`);
}

/** Makes a new link (replacing the old one) and returns it. It's shown only this once. */
export async function createCalendarLink(ctx: WorkspaceContext): Promise<string> {
  assertCan(ctx, "records:view");
  const token = randomBytes(32).toString("base64url");
  await saveCalendarFeed(ctx, hashToken(token));
  return calendarFeedUrl(token);
}

export async function turnOffCalendarLink(ctx: WorkspaceContext): Promise<void> {
  assertCan(ctx, "records:view");
  await deleteCalendarFeed(ctx);
}

export async function getCalendarLinkInfo(ctx: WorkspaceContext): Promise<CalendarFeedInfo | null> {
  assertCan(ctx, "records:view");
  return findCalendarFeedInfo(ctx);
}

/**
 * The .ics text for a link, or null when the link is unknown, was replaced,
 * or its owner no longer belongs to the household.
 */
export async function calendarFeedFor(token: string, now = new Date()): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const feed = await findCalendarFeedByHash(hashToken(token));
  if (!feed) return null;
  const ctx = await resolveWorkspaceContext(feed.userId, feed.workspaceId);
  if (!ctx) return null;
  assertCan(ctx, "records:view");

  const [today, timeZone] = await Promise.all([
    getHouseholdToday(ctx, now),
    getTimeZonePreference(ctx),
  ]);
  const entries = await listCalendarEntries(ctx, {
    from: addDays(today, -DAYS_BACK),
    to: addDays(today, DAYS_AHEAD),
  });
  await touchCalendarFeed(feed.id);
  const host = new URL(getEnv().APP_URL).host;
  return buildIcal({
    name: brand.name,
    timeZone,
    now,
    events: entries.map((e) => ({
      uid: `${e.key}@${host}`,
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
      title: PREFIX[e.kind] ? `${PREFIX[e.kind]}: ${e.title}` : e.title,
      description: [e.projectName, e.note].filter(Boolean).join(" · ") || null,
      url: absoluteUrl(getEnv().APP_URL, e.href),
    })),
  });
}
