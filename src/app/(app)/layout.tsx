import { Suspense } from "react";

import { PhoneTabBar, PhoneTabBarView, PhoneTopBar } from "@/components/app-shell/phone-nav";
import { Sidebar, SidebarView } from "@/components/app-shell/sidebar";
import { AccountSummary } from "@/components/auth/account-summary";
import { SignedIn } from "@/components/auth/signed-in";

/**
 * The app shell shared by every signed-in page: sidebar on iPad and laptop,
 * top bar plus bottom tabs on phones (docs/UI_DIRECTION.md).
 *
 * The navigation itself is the same for everyone, so it loads instantly.
 * The page content waits behind <SignedIn>, which checks the login on the
 * server and sends anyone who isn't signed in to /sign-in.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const account = (
    <Suspense fallback={<div className="h-10" />}>
      <AccountSummary />
    </Suspense>
  );
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<SidebarView pathname={null} account={account} />}>
        <Sidebar account={account} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneTopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12 lg:px-10"
        >
          <Suspense fallback={<p className="sr-only">Loading…</p>}>
            <SignedIn>{children}</SignedIn>
          </Suspense>
        </main>
      </div>
      <Suspense fallback={<PhoneTabBarView pathname={null} />}>
        <PhoneTabBar />
      </Suspense>
    </div>
  );
}
