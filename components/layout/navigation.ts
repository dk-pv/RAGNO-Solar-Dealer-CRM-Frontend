import type { ComponentType } from "react";

import { DashboardIcon, LeadsIcon, ReportsIcon, SettingsIcon, WorksIcon, type IconProps } from "./icons";

export type NavLink = { label: string; href: string };
export type NavItem = { label: string; icon: ComponentType<IconProps> } & ({ href: string } | { children: NavLink[] });

// The single source of CRM routes for the sidebar and the mobile drawer.
// Module owners add their page under app/(app)/<route>/page.tsx; a link resolves once that page exists.
export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  {
    label: "Leads",
    icon: LeadsIcon,
    children: [
      { label: "All Leads", href: "/leads" },
      { label: "Pipeline", href: "/leads/pipeline" },
      { label: "Activities", href: "/leads/activities" },
    ],
  },
  {
    label: "Works",
    icon: WorksIcon,
    children: [
      { label: "Pipeline", href: "/works/pipeline" },
      { label: "Activities", href: "/works/activities" },
    ],
  },
  { label: "Reports", href: "/reports", icon: ReportsIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

const NAV_HREFS = NAVIGATION.flatMap((item) => ("href" in item ? [item.href] : item.children.map((c) => c.href)));

// The longest matching href wins, so /leads/pipeline activates "Pipeline" rather than "All Leads",
// while a detail page such as /leads/42 still activates "All Leads".
export function activeHrefFor(pathname: string) {
  return NAV_HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`)).sort(
    (a, b) => b.length - a.length,
  )[0];
}
