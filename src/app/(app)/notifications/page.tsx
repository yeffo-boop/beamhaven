import Link from "next/link";

import { LocalTime } from "@/components/records/local-time";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Panel } from "@/components/records/panel";
import { Button } from "@/components/ui/button";
import { formatWeekday } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import {
  markNotificationReadAction,
  markEverythingReadAction,
} from "@/server/actions/notifications";
import { markReminderReadAction } from "@/server/actions/reminders";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getNotifications } from "@/server/services/notifications";
import { getReminders } from "@/server/services/reminders";

export const metadata = { title: "Notifications" };

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

function MarkRead({
  action,
  id,
  what,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  what: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2 text-xs">
        Mark read<span className="sr-only"> {what}</span>
      </Button>
    </form>
  );
}

/**
 * What others did that involves you, and reminders of what's coming up
 * (ADR-033, ADR-040). Only ever the signed-in person's own.
 */
export default async function NotificationsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const [notifications, reminders] = await Promise.all([getNotifications(ctx), getReminders(ctx)]);
  const anyUnread = notifications.some((n) => !n.readAt) || reminders.some((r) => !r.readAt);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="What others in the household did that involves you, and what's coming up."
        actions={
          anyUnread ? (
            <form action={markEverythingReadAction}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null
        }
      />

      <Panel title="From your household" id="from-household">
        {notifications.length === 0 ? (
          <EmptyState>
            Nothing yet. You&apos;ll hear here when someone gives you a task, finishes one of yours,
            decides on a quote you added, or approves something on your design board.
          </EmptyState>
        ) : (
          <ul aria-label="From your household" className="divide-y divide-border">
            {notifications.map((n) => {
              const text = `${n.actorName ?? "Someone"} ${n.summary}`;
              return (
                <li
                  key={n.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5"
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <Link
                      href={n.href}
                      className={cn(
                        "break-words hover:underline",
                        n.readAt ? "text-muted-foreground" : "font-medium",
                      )}
                    >
                      {text}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {n.readAt ? null : <span className="font-medium text-primary">New · </span>}
                      <LocalTime iso={n.createdAt.toISOString()} />
                    </span>
                  </div>
                  {n.readAt ? null : (
                    <MarkRead action={markNotificationReadAction} id={n.id} what={text} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Reminders" id="reminders">
        {reminders.length === 0 ? (
          <EmptyState>
            No reminders. Each morning you&apos;ll get one for what&apos;s on tomorrow and for bills
            due soon.
          </EmptyState>
        ) : (
          <ul aria-label="Reminders" className="divide-y divide-border">
            {reminders.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <Link
                    href={r.href}
                    className={cn(
                      "break-words hover:underline",
                      r.readAt ? "text-muted-foreground" : "font-medium",
                    )}
                  >
                    {r.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {r.readAt ? null : <span className="font-medium text-primary">New · </span>}
                    {WHAT[r.kind] ?? "Reminder"} · {formatWeekday(r.day)}
                  </span>
                </div>
                {r.readAt ? null : (
                  <MarkRead action={markReminderReadAction} id={r.id} what={r.title} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
