import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * A quick first check before any page renders: with no login cookie at all,
 * go straight to the sign-in page.
 *
 * This only looks for the cookie; it doesn't check that it's valid. The real
 * check is requireUser() on the server, in every protected page and action.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") signIn.searchParams.set("next", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Everything except the pages used before signing in (sign-in,
  // invitations, password resets), API routes (they check for themselves),
  // Next.js internals and files such as the favicon.
  matcher: ["/((?!sign-in|invite/|reset-password|api/|_next/|favicon\\.ico|.*\\.[a-z0-9]+$).*)"],
};
