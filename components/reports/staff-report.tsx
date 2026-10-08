"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { initials } from "@/components/layout/navbar";
import { useApi } from "@/lib/api";
import { STAFF_COLUMNS, type StaffColumn, type StaffReportRow } from "./api";
import { DataTable, ExportButtons, Panel, ReportError, useReport, type Column } from "./report-ui";

// Where each number's records are: the report and filters that list them, for the same period.
function drillDown(column: StaffColumn, user: StaffReportRow["user"]): [string, Record<string, string>] {
  const assignee = user ? String(user.id) : "none";
  const id = user ? String(user.id) : "";
  switch (column) {
    case "leads_assigned":
      return ["/reports/leads", { assigned_to: assignee }];
    case "works_assigned":
      return ["/reports/works", { assigned_to: assignee }];
    case "activities_assigned":
      return ["/reports/activities", { assigned_to: assignee }];
    case "pending":
      return ["/reports/activities", { assigned_to: assignee, status: "PENDING" }];
    case "completed":
      return ["/reports/activities", { assigned_to: assignee, status: "COMPLETED" }];
    case "overdue":
      return ["/reports/activities", { assigned_to: assignee, overdue: "true" }];
    case "leads_added":
      return ["/reports/history", { user: id, kind: "lead_created" }];
    case "works_converted":
      return ["/reports/history", { user: id, kind: "work_created" }];
    case "activities_added":
      return ["/reports/history", { user: id, kind: "activity_added" }];
    case "follow_ups_completed":
      return ["/reports/history", { user: id, kind: "activity_completed" }];
  }
}

// Per user, for the period: what was assigned to them and what they did. Facts, not a score: users are listed by name.
export function StaffReport() {
  const report = useReport([]);
  const searchParams = useSearchParams();
  const { data, error, loading, reload } = useApi<{ results: StaffReportRow[] }>(`/reports/staff/?${report.filters}`);
  const period = new URLSearchParams();
  for (const key of ["period", "from", "to"]) {
    const value = searchParams.get(key);
    if (value) period.set(key, value);
  }

  const columns: Column<StaffReportRow & { id: string }>[] = [
    {
      header: "User",
      render: (row) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[0.625rem] font-semibold text-secondary-foreground">
            {row.user ? initials(row.user.name) : "–"}
          </span>
          <span className="max-w-[max(11rem,12cqw)] truncate font-medium">{row.user?.name ?? "Unassigned"}</span>
          {row.user && !row.user.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
        </span>
      ),
    },
    ...STAFF_COLUMNS.map(({ key, label }) => ({
      header: label,
      // `relative` frames the number's link, which covers the whole cell: the cell is the target, not just its digits.
      className: "relative text-right tabular-nums whitespace-nowrap",
      render: (row: StaffReportRow) => {
        const value = row[key];
        // Unassigned work has no one who did anything: only the "assigned" numbers apply to it.
        if (value === 0 || (!row.user && !["leads_assigned", "works_assigned", "activities_assigned", "pending", "completed", "overdue"].includes(key))) {
          return <span className="text-muted-foreground">{value || "–"}</span>;
        }
        const [path, filters] = drillDown(key, row.user);
        const query = new URLSearchParams({ ...Object.fromEntries(period), ...filters });
        return (
          <Link href={`${path}?${query}`} className={`font-medium text-link after:absolute after:inset-0 hover:text-link-hover hover:underline ${key === "overdue" ? "text-error" : ""}`}>
            {value.toLocaleString("en-IN")}
          </Link>
        );
      },
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-xs text-muted-foreground">
          What was assigned to each user in the period, and what they did, from the records you can see. These are facts, not a
          score or a ranking: users are listed by name. Who edited a record isn&apos;t recorded, so there is no &ldquo;records
          updated&rdquo; column. Select a number to see its records.
        </p>
        <ExportButtons path="/reports/staff/" query={report.filters} name="staff-report" />
      </div>
      <Panel title="Staff activity">
        {error ? (
          <ReportError error={error} onRetry={reload} />
        ) : (
          <DataTable
            caption="Staff activity report"
            columns={columns}
            data={data && { count: data.results.length, results: data.results.map((row) => ({ ...row, id: String(row.user?.id ?? "none") })) }}
            loading={loading}
          />
        )}
      </Panel>
    </div>
  );
}
