import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Afterwards you&rsquo;ll be signed out on every device, and can sign in with the new
          password.
        </p>
      </div>
      <Suspense fallback={<div className="h-[212px]" aria-hidden="true" />}>
        <WithToken searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function WithToken({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length === 0) {
    return (
      <p className="text-sm text-destructive">
        This page needs the full reset link. Ask a household owner for a new one.
      </p>
    );
  }
  return <ResetPasswordForm token={token} />;
}
