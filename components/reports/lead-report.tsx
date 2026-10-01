"use client";

import Link from "next/link";

import { formatDateTime, LEAD_SOURCES, LEAD_STATUSES, statusLabel, type LeadStatus } from "@/components/leads/api";
import { updateQuery } from "@/components/leads/leads-toolbar";
import { StatusBadge } from "@/components/leads/ui";
import { useApi } from "@/lib/api";
import type { LeadReportRow, LeadReportSummary, Page } from "./api";
import {
  ActiveFilters,
  BarList,
  DataTable,
  ExportButtons,
  FilterSelect,
  LatestCell,
  Panel,
  ReportError,
  Skeleton,
  Stats,
  TrendChart,
  assigneeOptions,
  sortSelect,
  useAssignees,
  useReport,
  type Column,
} from "./report-ui";

const FILTERS = ["status", "assigned_to", "source"] as const;
const SORTS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-updated_at", label: "Recently updated" },
  { value: "name", label: "Customer name" },
  { value: "status", label: "Status" },
];

const COLUMNS: Column<LeadReportRow>[] = [
  {
    header: "Lead",
    render: (lead) => (
      <Link href={`/leads/${lead.id}`} className="font-medium whitespace-nowrap text-link hover:text-link-hover hover:underline">
        Lead #{lead.id}
      </Link>
    ),
  },
  { header: "Customer", render: (lead) => <span className="block max-w-48 truncate font-medium">{lead.customer_name}</span> },
  { header: "Status (stage)", render: (lead) => <StatusBadge status={lead.status} /> },
  { header: "Assigned to", render: (lead) => lead.assigned_to_name ?? <span className="text-muted-foreground">Unassigned</span>, className: "whitespace-nowrap" },
  { header: "Source", render: (lead) => lead.source_display || <span className="text-muted-foreground">Not set</span>, className: "whitespace-nowrap" },
  { header: "Created", render: (lead) => formatDateTime(lead.created_at), className: "whitespace-nowrap" },
  { header: "Last updated", render: (lead) => formatDateTime(lead.updated_at), className: "whitespace-nowrap" },
  { header: "Latest activity", render: (lead) => <LatestCell latest={lead.latest_activity} /> },
];

// Leads created in the period: how many, where they are now, who has them and where they came from, and the leads.
export function LeadReport() {
  const report = useReport(FILTERS);
  const summary = useApi<LeadReportSummary>(`/reports/leads/summary/?${report.filters}`);
  const rows = useApi<Page<LeadReportRow>>(`/reports/leads/?${report.rows}`);
  const people = useAssignees();
  const data = summary.data;
  const nameOf = (id: string) => (id === "none" ? "Unassigned" : (people?.find((person) => String(person.id) === id)?.name ?? `User #${id}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect name="status" label="Status" all="All statuses" options={LEAD_STATUSES.map((item) => ({ ...item }))} />
        <FilterSelect name="assigned_to" label="Assigned staff" all="Anyone" options={assigneeOptions(people)} />
        <FilterSelect
          name="source"
          label="Source"
          all="All sources"
          options={[...LEAD_SOURCES.map((item) => ({ ...item })), { value: "none", label: "Not set" }]}
        />
        <span className="ml-auto">
          <ExportButtons path="/reports/leads/" query={report.filters} name="lead-report" />
        </span>
      </div>
      <ActiveFilters
        active={report.active}
        describe={(key, value) =>
          key === "status"
            ? `Status: ${statusLabel(value as LeadStatus)}`
            : key === "assigned_to"
              ? `Assigned: ${nameOf(value)}`
              : `Source: ${LEAD_SOURCES.find((item) => item.value === value)?.label ?? "Not set"}`
        }
      />

      {summary.error ? (
        <div className="rounded-lg border border-border bg-background">
          <ReportError error={summary.error} onRetry={summary.reload} />
        </div>
      ) : (
        // Dimmed while a newer summary loads, so the previous period's figures aren't read as this one's.
        <div aria-busy={summary.loading} className={`space-y-4 transition-opacity ${summary.loading && data ? "opacity-60" : ""}`}>
          <Stats
            stats={
              data && [
                {
                  label: "Leads created",
                  value: data.totals.created.toLocaleString("en-IN"),
                  hint: "In the period",
                  onClick: report.active.length ? () => updateQuery(Object.fromEntries(FILTERS.map((key) => [key, null]))) : undefined,
                },
                { label: "Still open", value: data.totals.open.toLocaleString("en-IN"), hint: "Now New to Superhot" },
                { label: "Confirmed (Won)", value: data.totals.confirmed.toLocaleString("en-IN"), onClick: () => updateQuery({ status: "WON" }) },
                { label: "Lost", value: data.totals.lost.toLocaleString("en-IN"), onClick: () => updateQuery({ status: "LOST" }) },
              ]
            }
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Leads created over time" description="Select a column to see those leads.">
              {data ? <TrendChart {...data.trend} series={[{ key: "created", label: "Created", color: "bg-primary/60" }]} /> : <Skeleton lines={6} />}
            </Panel>
            <Panel title="By current status" description="Where the leads created in the period are now.">
              {data ? (
                <BarList
                  items={data.by_status.map((row) => ({
                    key: row.value,
                    label: <StatusBadge status={row.value} />,
                    count: row.count,
                    onClick: () => updateQuery({ status: row.value }),
                  }))}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </Panel>
            <Panel title="By assigned staff">
              {data ? (
                <BarList
                  items={data.by_staff.map((row) => ({
                    key: String(row.id),
                    label: row.name ?? "Unassigned",
                    count: row.count,
                    detail: `${row.open} open · ${row.confirmed} won`,
                    onClick: () => updateQuery({ assigned_to: row.id === null ? "none" : String(row.id) }),
                  }))}
                />
              ) : (
                <Skeleton lines={4} />
              )}
            </Panel>
            <Panel title="By source">
              {data ? (
                <BarList
                  items={data.by_source
                    .filter((row) => row.count > 0)
                    .map((row) => ({ key: row.value, label: row.label, count: row.count, onClick: () => updateQuery({ source: row.value }) }))}
                />
              ) : (
                <Skeleton lines={4} />
              )}
            </Panel>
          </div>
        </div>
      )}

      <Panel
        title="Leads"
        description="The leads behind the numbers above, with their latest activity."
        action={sortSelect(SORTS, report.searchParams.get("ordering") ?? SORTS[0].value)}
      >
        {rows.error ? (
          <ReportError error={rows.error} onRetry={rows.reload} />
        ) : (
          <DataTable caption="Lead report" columns={COLUMNS} data={rows.data} loading={rows.loading} page={report.page} pageSize={report.pageSize} />
        )}
      </Panel>
    </div>
  );
}
