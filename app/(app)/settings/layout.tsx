"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, type ReactNode } from "react";

import { CurrentUserContext } from "@/components/layout/use-shell-session";

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
      <nav aria-label="Settings" className="mt-3 flex gap-1 border-b border-border text-sm">
        {TABS.filter((tab) => isAdmin || !tab.adminOnly).map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? "page" : undefined}
            className="-mb-px rounded-t-md border-b-2 border-transparent px-2 pt-1.5 pb-2 text-muted-foreground hover:text-label aria-[current=page]:border-primary aria-[current=page]:bg-primary-softer aria-[current=page]:font-medium aria-[current=page]:text-primary-strong"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="mt-5">{children}</div>
    </div>
  );
}
