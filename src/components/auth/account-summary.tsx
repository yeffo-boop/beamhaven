import { LogOut } from "lucide-react";

import { signOutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

/**
 * The signed-in person's name with a sign-out button, for the bottom of the
 * sidebar. On the narrow iPad rail only the button shows.
 */
export async function AccountSummary() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center justify-center gap-2 lg:justify-between lg:px-1">
      <div className="hidden min-w-0 lg:block">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          title="Sign out"
          className="flex size-10 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogOut className="size-[18px]" aria-hidden="true" />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}
