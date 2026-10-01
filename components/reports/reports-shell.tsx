"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useContext, useEffect, type ReactNode } from "react";

import { canOpen } from "@/components/layout/navigation";
import { CurrentUserContext, type ShellUser } from "@/components/layout/use-shell-session";
import { PeriodFilter } from "./report-ui";

// The reports, each shown only to roles with the modules its records belong to (the API checks the same).
const REPORTS = [
  { href: "/reports/leads", label: "Leads", modules: ["leads"] },
  { href: "/reports/works", label: "Works", modules: ["work"] },
  { href: "/reports/activities", label: "Activities & Follow-ups", modules: ["leads", "work"] },
  { href: "/reports/staff", label: "Staff Activity", modules: ["leads", "work"] },
  { href: "/reports/history", label: "CRM History", modules: ["leads", "work"] },
];

function useReports() {
  const me = useContext(CurrentUserContext) as ShellUser;
  return REPORTS.filter((report) => report.modules.some((module) => canOpen(me, { module })));
}

// Reports: what happened over a period, with the records behind every number. The period is shared by every report and
// kept when moving between them.
export function ReportsShell({ children }: { children: ReactNode }) {
  const reports = useReports();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = new URLSearchParams();
  for (const key of ["period", "from", "to"]) {
    const value = searchParams.get(key);
    if (value) period.set(key, value);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What happened over a period, grouped, with the records behind every number. Dates are in India Standard Time.
          </p>
        </div>
        <PeriodFilter />
      </div>
      <nav aria-label="Reports" className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {reports.map((report) => {
          const current = pathname === report.href;
          return (
            <Link
              key={report.href}
              href={period.size ? `${report.href}?${period}` : report.href}
              aria-current={current ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {report.label}
            </Link>
          );
        })}
      </nav>
      {reports.length === 0 ? (
        <p className="rounded-lg border border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
          Your role doesn&apos;t include the Leads or Work module, so there are no records to report on.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

// /reports opens the first report this user can see.
export function ReportsIndex() {
  const reports = useReports();
  const router = useRouter();
  const first = reports[0]?.href;
  useEffect(() => {
    if (first) router.replace(first);
  }, [first, router]);
  return null;
}
