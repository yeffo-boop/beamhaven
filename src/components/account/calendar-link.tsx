"use client";

import { useActionState } from "react";

import { CopyLink } from "@/components/forms/copy-link";
import { Button } from "@/components/ui/button";
import { type CalendarLinkResult, calendarLinkAction } from "@/server/actions/calendar-feed";

/**
 * Turns the private calendar link on, replaces it, or turns it off
 * (ADR-045). The link is shown only right after it's made, because only a
 * fingerprint of it is stored.
 */
export function CalendarLink({ since }: { since: string | null }) {
  const [state, act, pending] = useActionState<CalendarLinkResult, FormData>(calendarLinkAction, {
    status: "idle",
  });
  const created = state.status === "created" ? state.url : null;

  return (
    <div className="flex flex-col gap-3">
      {created ? (
        <>
          <CopyLink link={created} label="Your calendar link" />
          <p className="text-sm text-muted-foreground">
            Copy it now: it won&apos;t be shown again. On an iPhone, go to Settings › Calendar ›
            Accounts › Add Account › Other › Add Subscribed Calendar and paste it. In Google
            Calendar on a computer, use Other calendars › + › From URL. Calendars check for changes
            every few hours.
          </p>
          <p className="text-sm text-muted-foreground">
            Anyone with this link can see your household&apos;s calendar, so keep it to yourself.
          </p>
        </>
      ) : since ? (
        <p className="text-sm text-muted-foreground">
          Your calendar link is on (made {since}). If you lost it or shared it by mistake, make a
          new one: the old one stops working.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          See appointments, task due dates, milestones, deliveries and bills in your phone&apos;s
          calendar. This makes a private link for you to subscribe to.
        </p>
      )}
      <form action={act} className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="make" variant="outline" disabled={pending}>
          {since || created ? "Make a new link" : "Turn on calendar link"}
        </Button>
        {since || created ? (
          <Button type="submit" name="intent" value="off" variant="ghost" disabled={pending}>
            Turn off
          </Button>
        ) : null}
      </form>
    </div>
  );
}
