"use client";

import { Ellipsis, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { brand } from "@/config/brand";
import {
  allNavItems,
  getNavItem,
  isActive as isActiveFor,
  type NavItem,
  phoneTabIds,
  searchItem,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

/** Phone-only top bar with the product name and the reminders bell. */
export function PhoneTopBar({ reminders }: { reminders?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <BrandMark className="size-6" />
        <span className="font-semibold tracking-tight">{brand.name}</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Link
          href={searchItem.href}
          aria-label="Search"
          className="flex size-10 items-center justify-center rounded-[var(--radius-control)] text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <SearchIcon className="size-5" aria-hidden="true" />
        </Link>
        {reminders}
      </div>
    </header>
  );
}

/** Phone-only bottom tab bar: four main sections plus "More" for the rest. */
export function PhoneTabBar() {
  return <PhoneTabBarView pathname={usePathname()} />;
}

/** The tab bar for a known page, or with nothing highlighted (see SidebarView). */
export function PhoneTabBarView({ pathname }: { pathname: string | null }) {
  const isActive = (item: NavItem) => pathname !== null && isActiveFor(item, pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = phoneTabIds.map((id) => getNavItem(id));
  const moreItems = allNavItems.filter((item) => !tabs.includes(item));
  const moreActive = moreItems.some((item) => isActive(item));

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      active ? "font-semibold text-primary" : "text-muted-foreground",
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface px-1 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] md:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            <Icon className="size-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger className={tabClass(moreActive)}>
          <Ellipsis className="size-5" aria-hidden="true" />
          More
        </SheetTrigger>
        <SheetContent>
          <SheetTitle className="text-base font-semibold">More</SheetTitle>
          <SheetDescription className="sr-only">Other sections and appearance</SheetDescription>
          <ul className="mt-3 flex flex-col">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-2",
                      active ? "font-semibold text-primary" : "text-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-border pt-4">
            <ThemeToggle />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
