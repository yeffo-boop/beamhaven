import type { ReactNode } from "react";

import { signOutAction } from "@/server/auth/actions";
import { requireUser } from "@/server/auth/session";
import { getWorkspaceContext } from "@/server/auth/workspace";

/**
 * Renders its children only for a signed-in member of a household.
 * Signed-out visitors go to the sign-in page. Wrap it in <Suspense>,
 * because it reads the request.
 */
export async function SignedIn({ children }: { children: ReactNode }) {
  await requireUser();
  const ctx = await getWorkspaceContext();
  if (!ctx) return <NoHousehold />;
  return children;
}

/** Shown to someone whose account isn't part of any household (yet). */
function NoHousehold() {
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">You&rsquo;re not in a household</h1>
      <p className="text-sm text-muted-foreground">
        Your account isn&rsquo;t part of a household right now. Ask a household owner to send you an
        invitation link.
      </p>
      <form action={signOutAction}>
        <button type="submit" className="text-sm font-medium text-primary underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
