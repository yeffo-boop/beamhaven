import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { EmptyState, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatWeekday } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { markReminderReadAction } from "@/server/actions/reminders";
import { getWorkspaceContext } from "@/server/auth/workspace";
import type { ReminderRecord } from "@/server/data/reminders";
import { getReminders } from "@/server/services/reminders";

export const metadata = { title: "Reminders" };

const WHAT: Record<string, string> = {
  appointment: "Appointment",
  inspection: "Inspection",
  delivery: "Delivery",
  other: "On the calendar",
  task: "Task due",
  milestone: "Milestone target",
  expected: "Order expected",
  payment: "Bill due",
};

function ReminderList({ reminders }: { reminders: ReminderRecord[] }) {
  return (
    <ul aria-label="Reminders" className="divide-y divide-border">
      {reminders.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5"
        >
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <Link
              href={r.href}
              className={cn("font-medium hover:underline", r.readAt && "text-muted-foreground")}
            >
              {r.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {WHAT[r.kind] ?? "Reminder"} · {formatWeekday(r.day)}
            </span>
          </div>
          {r.readAt ? null : (
            <form action={markReminderReadAction}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs">
                Mark read<span className="sr-only"> {r.title}</span>
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function RemindersPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const reminders = await getReminders(ctx);
  const unread = reminders.filter((r) => !r.readAt);
  const read = reminders.filter((r) => r.readAt);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Reminders"
        description="What's coming up tomorrow, and bills due in the next few days. New ones arrive each morning."
        actions={
          unread.length > 0 ? (
            <form action={markReminderReadAction}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />
      <Panel title="New" id="new">
        {unread.length > 0 ? (
          <ReminderList reminders={unread} />
        ) : (
          <EmptyState>You&apos;re all caught up.</EmptyState>
        )}
      </Panel>
      {read.length > 0 ? (
        <Panel title="Earlier" id="earlier">
          <ReminderList reminders={read} />
        </Panel>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Reminders follow the household&apos;s time zone, set in{" "}
        <Link href="/settings" className="text-primary hover:underline">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
