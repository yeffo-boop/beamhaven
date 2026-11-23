import { getAuth } from "@/server/auth/auth";

/**
 * Better Auth's own endpoints (sign in, sign out, session), under /api/auth.
 * Better Auth applies its rate limits and origin checks to these requests.
 */
function handler(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export { handler as GET, handler as POST };
