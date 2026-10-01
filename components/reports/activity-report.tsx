"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ACTIVITY_TYPES, formatDate, formatDateTime } from "@/components/leads/api";
import { updateQuery } from "@/components/leads/leads-toolbar";
import { fieldClass } from "@/components/leads/ui";
import { ACTIVITY_STATUSES } from "@/components/works/api";
import { ActivityStatusBadge } from "@/components/works/work-activities";
import { useApi } from "@/lib/api";
import type { ActivityReportRow, ActivityReportSummary, Page } from "./api";
import {
  ActiveFilters,
  BarList,
  DataTable,
  ExportButtons,
  FilterSelect,
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

const FILTERS = ["date_field", "record", "type", "status", "overdue", "assigned_to", "lead", "work"] as const;
const SORTS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date" },
  { value: "-completed_at", label: "Recently completed" },
];
const DATE_FIELDS = [
  { value: "created", label: "Created" },
  { value: "due", label: "Due" },
  { value: "completed", label: "Completed" },
];

const COLUMNS: Column<ActivityReportRow>[] = [
  {
    header: "Activity",
    render: (activity) => (
      <>
        <span className="block font-medium whitespace-nowrap">{activity.type_display}</span>
        <span title={activity.description} className="line-clamp-2 max-w-72 text-xs break-words text-muted-foreground">
          {activity.description}
        </span>
      </>
    ),
  },
  {
    header: "Lead / Work",
    render: (activity) => (
      <Link
        href={activity.work ? `/works/${activity.work}#activities` : `/leads/${activity.lead}#activities`}
        className="font-medium whitespace-nowrap text-link hover:text-link-hover hover:underline"
      >
        {activity.work ? `Work #${activity.work}` : `Lead #${activity.lead}`}
      </Link>
    ),
  },
  { header: "Customer", render: (activity) => <span className="block max-w-44 truncate">{activity.customer_name}</span> },
  { header: "Assigned to", render: (activity) => activity.assigned_to_name ?? <span className="text-muted-foreground">Unassigned</span>, className: "whitespace-nowrap" },
  {
    header: "Due date",
    render: (activity) => (
      <span className={activity.overdue ? "font-medium text-error" : ""}>
        {formatDate(activity.due_date)}
        {activity.overdue && <span className="block text-xs">Overdue</span>}
      </span>
    ),
    className: "whitespace-nowrap",
  },
  {
    header: "Status",
    // A lead's activity is a log entry: it has no follow-up status.
    render: (activity) =>
      activity.status ? (
        <ActivityStatusBadge status={activity.status} />
      ) : (
        <span className="inline-flex rounded-md bg-neutral-soft px-2 py-0.5 text-xs font-medium text-neutral ring-1 ring-neutral-border ring-inset">Log</span>
      ),
  },
  {
    header: "Created",
    render: (activity) => (
      <span className="whitespace-nowrap">
        {formatDateTime(activity.created_at)}
        {activity.created_by_name && <span className="block text-xs text-muted-foreground">by {activity.created_by_name}</span>}
      </span>
    ),
  },
  {
    header: "Completed",
    render: (activity) =>
      activity.completed_at ? (
        <span className="whitespace-nowrap">
          {formatDateTime(activity.completed_at)}
          {activity.completed_by_name && <span className="block text-xs text-muted-foreground">by {activity.completed_by_name}</span>}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

// Activities and follow-ups in the period (by when they were created, due or completed): completed ones included.
export function ActivityReport() {
  const report = useReport(FILTERS);
  const searchParams = useSearchParams();
  const summary = useApi<ActivityReportSummary>(`/reports/activities/summary/?${report.filters}`);
  const rows = useApi<Page<ActivityReportRow>>(`/reports/activities/?${report.rows}`);
  const people = useAssignees();
  const data = summary.data;
  const dateField = searchParams.get("date_field") ?? "created";
  const nameOf = (id: string) => (id === "none" ? "Unassigned" : (people?.find((person) => String(person.id) === id)?.name ?? `User #${id}`));
  // The period's date is a setting rather than a filter, so it isn't listed with the filters to remove.
  const active = report.active.filter((key) => key !== "date_field");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Period by</span>
          <select
            value={dateField}
            onChange={(event) => updateQuery({ date_field: event.target.value === "created" ? null : event.target.value })}
            className={`${fieldClass} h-9`}
          >
            {DATE_FIELDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} date
              </option>
            ))}
          </select>
        </label>
        <FilterSelect name="record" label="Lead or Work" all="Leads and Works" options={[{ value: "lead", label: "Leads" }, { value: "work", label: "Works" }]} />
        <FilterSelect name="type" label="Activity type" all="All types" options={ACTIVITY_TYPES.map((item) => ({ ...item }))} />
        <FilterSelect name="status" label="Status" all="Any status" options={ACTIVITY_STATUSES.map((item) => ({ ...item }))} />
        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-field px-3 text-sm">
          <input
            type="checkbox"
            checked={searchParams.get("overdue") === "true"}
            onChange={(event) => updateQuery({ overdue: event.target.checked ? "true" : null })}
            className="accent-primary"
          />
          Overdue only
        </label>
        <FilterSelect name="assigned_to" label="Assigned staff" all="Anyone" options={assigneeOptions(people)} />
        <span className="ml-auto">
          <ExportButtons path="/reports/activities/" query={report.filters} name="activity-report" />
        </span>
      </div>
      <ActiveFilters
        active={active}
        describe={(key, value) =>
          ({
            record: value === "lead" ? "Leads only" : "Works only",
            type: `Type: ${ACTIVITY_TYPES.find((item) => item.value === value)?.label ?? value}`,
            status: `Status: ${ACTIVITY_STATUSES.find((item) => item.value === value)?.label ?? value}`,
            overdue: "Overdue",
            assigned_to: `Assigned: ${nameOf(value)}`,
            lead: `Lead #${value}`,
            work: `Work #${value}`,
          })[key] ?? value
        }
      />
      <p className="text-xs text-muted-foreground">
        A lead&apos;s activities are its log: they have no status, so pending, completed and overdue count Work follow-ups only.
        Overdue means still pending after its due date, as of today.
      </p>

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
                  label: "Activities",
                  value: data.totals.total.toLocaleString("en-IN"),
                  hint: `${data.totals.on_works} on Works · ${data.totals.on_leads} on Leads`,
                },
                { label: "Pending", value: data.totals.pending.toLocaleString("en-IN"), onClick: () => updateQuery({ status: "PENDING", overdue: null }) },
                { label: "Completed", value: data.totals.completed.toLocaleString("en-IN"), onClick: () => updateQuery({ status: "COMPLETED", overdue: null }) },
                {
                  label: "Overdue",
                  value: data.totals.overdue.toLocaleString("en-IN"),
                  alert: data.totals.overdue > 0,
                  onClick: () => updateQuery({ overdue: "true", status: null }),
                },
                {
                  label: "Due in the period",
                  value: data.totals.due_in_period.toLocaleString("en-IN"),
                  onClick: () => updateQuery({ date_field: "due", record: "work" }),
                },
                {
                  label: "Completed in the period",
                  value: data.totals.completed_in_period.toLocaleString("en-IN"),
                  onClick: () => updateQuery({ date_field: "completed" }),
                },
              ]
            }
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Created and completed over time" description="Select a column to see those days.">
              {data ? (
                <TrendChart
                  {...data.trend}
                  series={[
                    { key: "created", label: "Created", color: "bg-primary/60" },
                    { key: "completed", label: "Completed", color: "bg-success" },
                  ]}
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
                    detail: `${row.pending} pending · ${row.completed} done · ${row.overdue} overdue`,
                    onClick: () => updateQuery({ assigned_to: row.id === null ? "none" : String(row.id) }),
                  }))}
                />
              ) : (
                <Skeleton lines={4} />
              )}
            </Panel>
            <Panel title="By type">
              {data ? (
                <BarList
                  items={data.by_type.map((row) => ({ key: row.value, label: row.label, count: row.count, onClick: () => updateQuery({ type: row.value }) }))}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </Panel>
            <Panel title="Leads and Works with the most activities" description="The top ten in the period.">
              {data ? (
                <BarList
                  items={data.by_record.map((row) => ({
                    key: row.work ? `w${row.work}` : `l${row.lead}`,
                    label: `${row.work ? `Work #${row.work}` : `Lead #${row.lead}`} · ${row.customer_name ?? ""}`,
                    count: row.count,
                    detail: row.work ? `${row.pending} pending · ${row.completed} done` : "Lead log",
                    onClick: () => updateQuery(row.work ? { work: String(row.work), lead: null } : { lead: String(row.lead), work: null }),
                  }))}
                />
              ) : (
                <Skeleton lines={5} />
              )}
            </Panel>
          </div>
        </div>
      )}

      <Panel
        title="Activities"
        description="Every activity behind the numbers above. Completed ones stay as history."
        action={sortSelect(SORTS, report.searchParams.get("ordering") ?? SORTS[0].value)}
      >
        {rows.error ? (
          <ReportError error={rows.error} onRetry={rows.reload} />
        ) : (
          <DataTable caption="Activity report" columns={COLUMNS} data={rows.data} loading={rows.loading} page={report.page} pageSize={report.pageSize} />
        )}
      </Panel>
    </div>
  );
}
