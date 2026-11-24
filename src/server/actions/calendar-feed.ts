"use server";

import { refresh } from "next/cache";

import { requireWorkspace } from "@/server/auth/workspace";
import { createCalendarLink, turnOffCalendarLink } from "@/server/services/calendar-feed";

export type CalendarLinkResult = { status: "idle" } | { status: "created"; url: string };

/**
 * "make" creates a new private calendar link (replacing any old one) and
 * returns it to show once; "off" turns the link off.
 */
export async function calendarLinkAction(
  _previous: CalendarLinkResult,
  formData: FormData,
): Promise<CalendarLinkResult> {
  const ctx = await requireWorkspace();
  if (formData.get("intent") === "off") {
    await turnOffCalendarLink(ctx);
    refresh();
    return { status: "idle" };
  }
  const url = await createCalendarLink(ctx);
  refresh();
  return { status: "created", url };
}
