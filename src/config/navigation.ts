import {
  CalendarDays,
  DoorOpen,
  FileText,
  FolderKanban,
  HardHat,
  House,
  type LucideIcon,
  Package,
  Palette,
  Settings,
  Wallet,
} from "lucide-react";

/**
 * The app's navigation, defined once and used by the sidebar, the iPad icon
 * rail and the phone tab bar (docs/UI_DIRECTION.md, "Navigation proposal").
 */
export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** One sentence shown on the section's page until it is built. */
  description: string;
  /** The roadmap milestone that builds this section. */
  milestone: number;
};

export type NavGroup = { label?: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    items: [
      {
        id: "home",
        label: "Home",
        href: "/",
        icon: House,
        description:
          "Your overview: active projects, the budget at a glance, and what needs attention.",
        milestone: 9,
      },
      {
        id: "projects",
        label: "Projects",
        href: "/projects",
        icon: FolderKanban,
        description: "Every renovation project, with its status, dates, rooms and budget.",
        milestone: 3,
      },
      {
        id: "rooms",
        label: "Rooms",
        href: "/rooms",
        icon: DoorOpen,
        description: "Rooms and areas with their measurements, photos and planned work.",
        milestone: 3,
      },
      {
        id: "budget",
        label: "Budget",
        href: "/budget",
        icon: Wallet,
        description: "Budgets, expenses, payments and transfers, plus budget reports.",
        milestone: 4,
      },
      {
        id: "schedule",
        label: "Schedule",
        href: "/schedule",
        icon: CalendarDays,
        description: "Tasks, milestones, appointments and deliveries on one calendar.",
        milestone: 7,
      },
    ],
  },
  {
    label: "People & things",
    items: [
      {
        id: "contractors",
        label: "Contractors",
        href: "/contractors",
        icon: HardHat,
        description: "Your contractor directory, with quotes, contracts, payments and warranties.",
        milestone: 5,
      },
      {
        id: "materials",
        label: "Materials",
        href: "/materials",
        icon: Package,
        description: "Products you're considering or have bought, with orders and deliveries.",
        milestone: 6,
      },
    ],
  },
  {
    label: "Library",
    items: [
      {
        id: "files",
        label: "Files",
        href: "/files",
        icon: FileText,
        description: "Quotes, contracts, receipts, permits, manuals, floor plans and photos.",
        milestone: 8,
      },
      {
        id: "inspiration",
        label: "Inspiration",
        href: "/inspiration",
        icon: Palette,
        description: "Design boards with images, products, colors and finishes for each room.",
        milestone: 8,
      },
    ],
  },
];

export const settingsItem: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/settings",
  icon: Settings,
  description: "Your profile, household members, preferences and appearance.",
  milestone: 2,
};

export const allNavItems: NavItem[] = [...navGroups.flatMap((g) => g.items), settingsItem];

/** The four sections on the phone's bottom tab bar; everything else is under "More". */
export const phoneTabIds = ["home", "projects", "budget", "schedule"] as const;

export function getNavItem(id: string): NavItem {
  const item = allNavItems.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown navigation item "${id}"`);
  return item;
}

/** True when `pathname` is this item's page or one of its sub-pages. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
