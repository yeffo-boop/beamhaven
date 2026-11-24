import "server-only";

import { addDays, hourIn, isTimeZone, todayIn } from "@/lib/calendar";
import { assertCan } from "@/server/auth/permissions";
import { systemWorkspaceContext } from "@/server/auth/system-context";
import { listCalendarEntries } from "@/server/data/calendar";
import type { WorkspaceContext } from "@/server/data/context";
import {
  countUnreadReminders,
  insertReminders,
  listHouseholdZones,
  listMembersWithRoles,
  listReminders,
  markRemindersRead,
  type ReminderRecord,
} from "@/server/data/reminders";

import { BILL_DAYS_AHEAD, entriesToRemind, remindersFor, SEND_FROM_HOUR } from "./reminder-rules";

/** In-app reminders (Milestone 7, part 3, ADR-033). */

export async function getReminders(
  ctx: WorkspaceContext,
  options: { unreadOnly?: boolean } = {},
): Promise<ReminderRecord[]> {
  assertCan(ctx, "records:view");
  return listReminders(ctx, options);
}

export async function getUnreadReminderCount(ctx: WorkspaceContext): Promise<number> {
  assertCan(ctx, "records:view");
  return countUnreadReminders(ctx);
}

/**
 * Marks the person's own reminder (or all of them) read. Anyone may do this,
 * viewers too: it only changes their own list.
 */
export async function markReminderRead(ctx: WorkspaceContext, id?: string): Promise<void> {
  assertCan(ctx, "records:view");
  await markRemindersRead(ctx, id);
}

/**
 * The worker's job: in every household where it's past the morning send time,
 * add reminders for what's coming up. Safe to run as often as we like, since
 * each person gets one reminder per thing per day.
 */
export async function createDueReminders(now: Date = new Date()): Promise<number> {
  let created = 0;
  for (const household of await listHouseholdZones()) {
    const zone = isTimeZone(household.timeZone) ? household.timeZone : "UTC";
    if (hourIn(zone, now) < SEND_FROM_HOUR) continue;
    const today = todayIn(zone, now);
    const ctx = systemWorkspaceContext(household.id);
    const [entries, members] = await Promise.all([
      listCalendarEntries(ctx, { from: today, to: addDays(today, BILL_DAYS_AHEAD) }),
      listMembersWithRoles(household.id),
    ]);
    const targets = remindersFor(entriesToRemind(entries, today), members);
    created += await insertReminders(targets.map((t) => ({ ...t, workspaceId: household.id })));
  }
  return created;
}
