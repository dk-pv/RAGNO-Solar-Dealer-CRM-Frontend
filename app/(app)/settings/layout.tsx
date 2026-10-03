"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, type ReactNode } from "react";

import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { tabClass, tabListClass } from "@/components/leads/ui";

const TABS = [
  { label: "Users", href: "/settings/users", adminOnly: false },
  { label: "Roles & Access", href: "/settings/roles", adminOnly: true },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

  return (
    <div>
      <h1 className="text-xl font-semibold">Settings</h1>
      <nav aria-label="Settings" className={`mt-3 ${tabListClass}`}>
        {TABS.filter((tab) => isAdmin || !tab.adminOnly).map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={pathname === tab.href ? "page" : undefined} className={tabClass}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="mt-5">{children}</div>
    </div>
  );
}
