import type { ComponentType } from "react";

import { CalendarIcon, DashboardIcon, LeadsIcon, ReportsIcon, SettingsIcon, WorksIcon, type IconProps } from "./icons";
import type { ShellUser } from "./use-shell-session";

export type NavLink = { label: string; href: string; role?: ShellUser["role"] };
export type NavItem = { label: string; icon: ComponentType<IconProps>; module?: string; role?: ShellUser["role"] } & (
  | { href: string }
  | { children: NavLink[] }
);

// The single source of CRM routes for the sidebar and the mobile drawer.
// Module owners add their page under app/(app)/<route>/page.tsx; a link resolves once that page exists.
// `module` is the backend module (MODULES in apps/accounts/permissions.py) a STAFF user needs to see the entry; a
// group's links follow it. A top-level entry without one is for admins only, the same deny-by-default rule as the API.
// An entry or link with a `role` is for that role only: admins find the Activities pages in Leads and Works, staff
// (whose role can hold only the Activities module) in a group of their own, so those pages need only that module.
export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", module: "dashboard", icon: DashboardIcon },
  {
    label: "Leads",
    module: "leads",
    icon: LeadsIcon,
    children: [
      { label: "All Leads", href: "/leads" },
      { label: "Pipeline", href: "/leads/pipeline" },
      { label: "Activities", href: "/leads/activities", role: "ADMIN" },
    ],
  },
  {
    label: "Works",
    module: "work",
    icon: WorksIcon,
    children: [
      { label: "All Works", href: "/works" },
      { label: "Pipeline", href: "/works/pipeline" },
      { label: "Activities", href: "/works/activities", role: "ADMIN" },
    ],
  },
  {
    label: "Activities",
    module: "activities",
    role: "STAFF",
    icon: CalendarIcon,
    children: [
      { label: "Lead Activities", href: "/leads/activities" },
      { label: "Work Activities", href: "/works/activities" },
    ],
  },
  { label: "Reports", href: "/reports", module: "reports", icon: ReportsIcon },
  { label: "Settings", href: "/settings", module: "settings", icon: SettingsIcon },
];

type AccessUser = Pick<ShellUser, "role" | "modules">;

export function canOpen(user: AccessUser, entry: { module?: string }) {
  return user.role === "ADMIN" || (entry.module !== undefined && user.modules.includes(entry.module));
}

// The navigation of this user's role, before any module check.
function roleNavigation(user: AccessUser): NavItem[] {
  const listed = (entry: { role?: ShellUser["role"] }) => !entry.role || entry.role === user.role;
  return NAVIGATION.filter(listed).map((item) =>
    "href" in item ? item : { ...item, children: item.children.filter(listed) },
  );
}

// The sidebar for this user: the entries of their role that they can open.
export function navigationFor(user: AccessUser): NavItem[] {
  return roleNavigation(user).filter((item) => canOpen(user, item));
}

const hrefsOf = (items: NavItem[]) =>
  items.flatMap((item) => ("href" in item ? [item.href] : item.children.map((c) => c.href)));
const NAV_HREFS = hrefsOf(NAVIGATION);

// The longest matching href wins, so /leads/pipeline activates "Pipeline" rather than "All Leads",
// while a detail page such as /leads/42 still activates "All Leads".
export function activeHrefFor(pathname: string) {
  return NAV_HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`)).sort(
    (a, b) => b.length - a.length,
  )[0];
}

// The entry this user lacks for a page, if any: the one holding it in their role's navigation, so /works/42 needs Works
// and, for staff, /works/activities needs Activities. "/" needs none.
export function blockedEntryFor(user: AccessUser, pathname: string) {
  const href = activeHrefFor(pathname);
  const item = roleNavigation(user).find((entry) =>
    "href" in entry ? entry.href === href : entry.children.some((c) => c.href === href),
  );
  return item && !canOpen(user, item) ? item : undefined;
}

// Where "/" takes this user (so where signing in lands), and the way on from a page they can't open: All Leads when
// they can open it (admins, as before), otherwise the first page of their navigation (Lead Activities for
// Activities-only staff). None when their role opens no page.
export function startPageFor(user: AccessUser): string | undefined {
  const hrefs = hrefsOf(navigationFor(user));
  return hrefs.includes("/leads") ? "/leads" : hrefs[0];
}
