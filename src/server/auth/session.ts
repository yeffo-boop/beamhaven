import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "./auth";

/** The signed-in person, with only the fields pages need. */
export type CurrentUser = { id: string; name: string; email: string };

type SessionData = { user: CurrentUser; activeWorkspaceId: string | null };

/**
 * Reads the login cookie and checks it against the sessions table.
 * `cache` means several components on one page share a single lookup.
 * This reads the request, so callers must sit inside a <Suspense> boundary.
 */
export const getSessionData = cache(async (): Promise<SessionData | null> => {
  // Read the request first: during `next build` this pauses here, so the
  // settings (only present on the running server) are never touched.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, name, email } = session.user;
  return {
    user: { id, name, email },
    activeWorkspaceId: session.session.activeOrganizationId ?? null,
  };
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return (await getSessionData())?.user ?? null;
}

/**
 * Use at the start of every protected page, Server Action and route handler.
 * The proxy's cookie check only makes redirects fast; this is the real check.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
