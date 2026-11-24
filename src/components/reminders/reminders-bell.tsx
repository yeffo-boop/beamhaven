import { Bell } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { getWorkspaceContext } from "@/server/auth/workspace";
import { getUnreadReminderCount } from "@/server/services/reminders";

/**
 * A bell linking to Reminders, with how many are unread. Reads the session,
 * so it must sit inside <Suspense>.
 */
export async function RemindersBell({ compact = false }: { compact?: boolean }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return null;
  const unread = await getUnreadReminderCount(ctx);
  const label = unread === 0 ? "Reminders" : `Reminders, ${unread} unread`;
  return (
    <Link
      href="/reminders"
      title={label}
      aria-label={label}
      className={cn(
        "relative flex h-10 items-center justify-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        !compact && "lg:justify-start",
      )}
    >
      <Bell className="size-[18px] shrink-0" aria-hidden="true" />
      {compact ? null : <span className="hidden lg:inline">Reminders</span>}
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground",
            compact
              ? "absolute -top-0.5 -right-0.5"
              : "absolute top-0.5 right-0.5 lg:static lg:ml-auto",
          )}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
