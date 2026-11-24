import { connection } from "next/server";

import { clientAddress, createRateLimiter } from "@/server/security/rate-limit";
import { calendarFeedFor } from "@/server/services/calendar-feed";

// Calendars check every few hours; this only stops someone guessing links.
const feedLimiter = createRateLimiter({ max: 120, windowMs: 60 * 60 * 1000 });

/**
 * A person's private calendar feed (Milestone 12, ADR-045):
 * GET /api/calendar/<secret>. Calendar apps can't sign in, so the secret in
 * the address is the key. Unknown, replaced or turned-off links get a 404.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  await connection();
  if (!feedLimiter.attempt(await clientAddress())) {
    return new Response("Too many requests", { status: 429 });
  }
  const { token } = await params;
  const ics = await calendarFeedFor(token);
  if (ics === null) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="beamhaven.ics"',
      "Cache-Control": "private, no-store",
      // The address is the secret; don't pass it on to other sites.
      "Referrer-Policy": "no-referrer",
    },
  });
}
