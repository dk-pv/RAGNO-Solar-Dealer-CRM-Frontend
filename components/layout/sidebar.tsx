"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import {
  CloseIcon,
  DashboardIcon,
  LeadsIcon,
  LogoutIcon,
  ReportsIcon,
  SettingsIcon,
  WorksIcon,
  type IconProps,
} from "./icons";

type NavLink = { label: string; href: string };
type NavItem = { label: string; icon: ComponentType<IconProps> } & ({ href: string } | { children: NavLink[] });

// Module owners add their page under app/(app)/<route>/page.tsx; these links resolve once it exists.
export const NAVIGATION: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  {
    label: "Leads",
    icon: LeadsIcon,
    children: [
      { label: "All Leads", href: "/leads" },
      { label: "Lead Pipeline", href: "/leads/pipeline" },
      { label: "Lead Activities", href: "/leads/activities" },
    ],
  },
  {
    label: "Works",
    icon: WorksIcon,
    children: [
      { label: "Work Pipeline", href: "/works/pipeline" },
      { label: "Work Activities", href: "/works/activities" },
    ],
  },
  { label: "Reports", href: "/reports", icon: ReportsIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

const NAV_HREFS = NAVIGATION.flatMap((item) => ("href" in item ? [item.href] : item.children.map((c) => c.href)));

// The longest matching href wins, so /leads/pipeline activates "Lead Pipeline" rather than "All Leads",
// while a detail page such as /leads/42 still activates "All Leads".
function activeHrefFor(pathname: string) {
  return NAV_HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`)).sort(
    (a, b) => b.length - a.length,
  )[0];
}

const linkClass =
  "flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground";

type SidebarProps = {
  onLogout: (() => void) | null;
  onClose?: () => void;
};

export function Sidebar({ onLogout, onClose }: SidebarProps) {
  const activeHref = activeHrefFor(usePathname());

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-sm font-semibold text-background"
        >
          R
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">Ragno Power System</p>
          <p className="truncate text-xs text-muted-foreground">Solar Dealer CRM</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAVIGATION.map((item) =>
            "href" in item ? (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.href === activeHref ? "page" : undefined}
                  className={linkClass}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  {item.label}
                </Link>
              </li>
            ) : (
              <li key={item.label} className="pt-2">
                <p
                  className={`flex h-8 items-center gap-3 px-3 text-sm font-medium ${
                    item.children.some((c) => c.href === activeHref) ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  {item.label}
                </p>
                <ul className="space-y-0.5">
                  {item.children.map((child) => (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        aria-current={child.href === activeHref ? "page" : undefined}
                        className={`${linkClass} pl-[42px]`}
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={onLogout ?? undefined}
          disabled={!onLogout}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border text-sm text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogoutIcon className="size-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
