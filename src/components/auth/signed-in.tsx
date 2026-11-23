import type { ReactNode } from "react";

import { requireUser } from "@/server/auth/session";

/**
 * Renders its children only for a signed-in person, otherwise redirects to
 * the sign-in page. Wrap it in <Suspense>, because it reads the request.
 */
export async function SignedIn({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}
