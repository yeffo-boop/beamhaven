import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNextPath } from "@/lib/redirect";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New here? Ask someone in your household for an invitation link.
        </p>
      </div>
      <Suspense fallback={<div className="h-[212px]" aria-hidden="true" />}>
        <AlreadySignedIn searchParams={searchParams} />
        <SignInForm />
      </Suspense>
    </div>
  );
}

/** Someone who is already signed in skips straight past this page. */
async function AlreadySignedIn({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const user = await getCurrentUser();
  if (user) {
    const { next } = await searchParams;
    redirect(safeNextPath(typeof next === "string" ? next : null));
  }
  return null;
}
