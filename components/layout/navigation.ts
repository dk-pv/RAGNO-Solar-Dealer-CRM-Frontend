import type { ComponentType } from "react";

import { DashboardIcon, LeadsIcon, ReportsIcon, SettingsIcon, WorksIcon, type IconProps } from "./icons";
import type { ShellUser } from "./use-shell-session";

export type NavLink = { label: string; href: string; module?: string };
export type NavItem = { label: string; icon: ComponentType<IconProps>; module?: string } & (
  | { href: string }
  | { children: NavLink[] }
);

// The single source of CRM routes for the sidebar and the mobile drawer.
// Module owners add their page under app/(app)/<route>/page.tsx; a link resolves once that page exists.
// `module` is the backend module (MODULES in apps/accounts/permissions.py) a STAFF user needs to see the entry.
// A top-level entry without one is for admins only, the same deny-by-default rule as the API. A link without one
// follows its group; a link with one (Activities) also needs that module.
export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", module: "dashboard", icon: DashboardIcon },
  {
    label: "Leads",
    module: "leads",
    icon: LeadsIcon,
    children: [
      { label: "All Leads", href: "/leads" },
      { label: "Pipeline", href: "/leads/pipeline" },
      { label: "Activities", href: "/leads/activities", module: "activities" },
    ],
  },
  {
    label: "Works",
    module: "work",
    icon: WorksIcon,
    children: [
      { label: "Pipeline", href: "/works/pipeline" },
      { label: "Activities", href: "/works/activities", module: "activities" },
    ],
  },
  { label: "Reports", href: "/reports", module: "reports", icon: ReportsIcon },
  { label: "Settings", href: "/settings", module: "settings", icon: SettingsIcon },
];

type AccessUser = Pick<ShellUser, "role" | "modules">;

export function canOpen(user: AccessUser, entry: { module?: string }) {
  return user.role === "ADMIN" || (entry.module !== undefined && user.modules.includes(entry.module));
}

// The sidebar for this user: the entries they can open, each group narrowed to the links they can open.
export function navigationFor(user: AccessUser): NavItem[] {
  return NAVIGATION.filter((item) => canOpen(user, item)).map((item) =>
    "href" in item ? item : { ...item, children: item.children.filter((link) => !link.module || canOpen(user, link)) },
  );
}

const NAV_HREFS = NAVIGATION.flatMap((item) => ("href" in item ? [item.href] : item.children.map((c) => c.href)));

// The longest matching href wins, so /leads/pipeline activates "Pipeline" rather than "All Leads",
// while a detail page such as /leads/42 still activates "All Leads".
export function activeHrefFor(pathname: string) {
  return NAV_HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`)).sort(
    (a, b) => b.length - a.length,
  )[0];
}

// The entry this user lacks for a page, if any: /works/activities needs Works and Activities. "/" needs none.
export function blockedEntryFor(user: AccessUser, pathname: string) {
  const href = activeHrefFor(pathname);
  const item = NAVIGATION.find((entry) =>
    "href" in entry ? entry.href === href : entry.children.some((c) => c.href === href),
  );
  const link = item && "children" in item ? item.children.find((c) => c.href === href) : undefined;
  return [item, link?.module ? link : undefined].find((entry) => entry && !canOpen(user, entry));
}
