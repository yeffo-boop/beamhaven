"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { brand } from "@/config/brand";
import { isActive, type NavItem, navGroups, searchItem, settingsItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

/**
 * Left navigation for iPad and laptop screens (hidden on phones).
 * - md (iPad portrait): a narrow icon rail; labels are kept for screen readers.
 * - lg and up (iPad landscape, laptop): the full sidebar with labels.
 *
 * `account` is the signed-in person's name and sign-out button. It is passed
 * in from the server because it reads the login session.
 */
export function Sidebar({ account, reminders }: { account?: ReactNode; reminders?: ReactNode }) {
  return <SidebarView pathname={usePathname()} account={account} reminders={reminders} />;
}

/**
 * The sidebar for a known page, or with nothing highlighted (pathname null).
 * The layout shows the unhighlighted one while a page whose address has an
 * id in it (like /projects/abc) is still loading (Next.js needs the address
 * to come from inside <Suspense> for those pages).
 */
export function SidebarView({
  pathname,
  account,
  reminders,
}: {
  pathname: string | null;
  account?: ReactNode;
  /** The reminders bell, from the server (it reads the session). */
  reminders?: ReactNode;
}) {
  const active = (item: NavItem) => pathname !== null && isActive(item, pathname);
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border px-3 py-5 md:flex lg:w-60 print:hidden"
    >
      <Link
        href="/"
        className="mb-4 flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <BrandMark className="size-7 shrink-0" />
        <span className="sr-only text-base font-semibold tracking-tight lg:not-sr-only">
          {brand.name}
        </span>
      </Link>

      <div className="mb-2">
        <SidebarLink item={searchItem} active={active(searchItem)} />
      </div>

      {navGroups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-1">
          {group.label ? (
            <div className="mt-4 mb-1 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              <span className="hidden lg:inline">{group.label}</span>
              <span className="mx-auto block h-px w-6 bg-border lg:hidden" aria-hidden="true" />
            </div>
          ) : null}
          {group.items.map((item) => (
            <SidebarLink key={item.id} item={item} active={active(item)} />
          ))}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3">
        {reminders}
        <SidebarLink item={settingsItem} active={active(settingsItem)} />
        <div className="hidden px-1 lg:block">
          <ThemeToggle compact />
        </div>
        {account}
      </div>
    </nav>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "flex h-10 items-center justify-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:justify-start",
        active ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">{item.label}</span>
    </Link>
  );
}
