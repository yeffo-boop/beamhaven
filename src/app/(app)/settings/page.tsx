import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { signOutAction } from "@/server/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <section
        aria-labelledby="appearance-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6"
      >
        <div>
          <h2 id="appearance-heading" className="font-semibold">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose light or dark, or match your device. Saved on this browser.
          </p>
        </div>
        <div className="self-start">
          <ThemeToggle />
        </div>
      </section>

      <section
        aria-labelledby="account-heading"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5 md:p-6"
      >
        <h2 id="account-heading" className="font-semibold">
          Account
        </h2>
        <Suspense fallback={<div className="h-16" />}>
          <AccountDetails />
        </Suspense>
      </section>

      <section className="rounded-[var(--radius-card)] border border-dashed border-border bg-surface p-5 text-sm text-muted-foreground md:p-6">
        Editing your profile and password, household members and invitations, and signing out of
        every device arrive later in Milestone 2.
      </section>
    </div>
  );
}

async function AccountDetails() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium">{user.name}</div>
        <div className="text-sm text-muted-foreground">{user.email}</div>
      </div>
      <form action={signOutAction}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
