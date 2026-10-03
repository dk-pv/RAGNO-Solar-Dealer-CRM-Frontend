"use client";

import Link from "next/link";

import { formatDate, formatDateTime, formatMoney } from "@/components/leads/api";
import { fillClass } from "@/components/leads/ui";
import { updateQuery } from "@/components/leads/leads-toolbar";
import { WORK_STAGES, stageFor, type WorkStage } from "@/components/works/api";
import { useApi } from "@/lib/api";
import type { Page, WorkReportRow, WorkReportSummary } from "./api";
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

const FILTERS = ["stage", "assigned_to"] as const;
const SORTS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-updated_at", label: "Recently updated" },
  { value: "customer_name", label: "Customer name" },
  { value: "stage", label: "Stage" },
  { value: "-amount", label: "Amount: high to low" },
  { value: "amount", label: "Amount: low to high" },
];

function StageChip({ stage }: { stage: WorkStage }) {
  const { label, dot, header } = stageFor(stage);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${header}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

const COLUMNS: Column<WorkReportRow>[] = [
  {
    header: "Work",
    render: (work) => (
      <Link href={`/works/${work.id}`} className="font-medium whitespace-nowrap text-link hover:text-link-hover hover:underline">
        Work #{work.id}
      </Link>
    ),
  },
  { header: "Customer", render: (work) => <span className="block max-w-48 truncate font-medium">{work.customer_name}</span> },
  { header: "Stage", render: (work) => <StageChip stage={work.stage} /> },
  { header: "Assigned to", render: (work) => work.assigned_to_name ?? <span className="text-muted-foreground">Unassigned</span>, className: "whitespace-nowrap" },
  { header: "Plan", render: (work) => work.plan_name, className: "whitespace-nowrap" },
  { header: "Confirmed amount", render: (work) => formatMoney(work.amount), className: "text-right whitespace-nowrap tabular-nums" },
  { header: "Due date", render: (work) => formatDate(work.due_date), className: "whitespace-nowrap" },
  { header: "Created (converted)", render: (work) => formatDateTime(work.created_at), className: "whitespace-nowrap" },
  { header: "Last updated", render: (work) => formatDateTime(work.updated_at), className: "whitespace-nowrap" },
  { header: "Latest activity", render: (work) => <LatestCell latest={work.latest_activity} /> },
];

// Works created (their lead converted) in the period: how many, their confirmed value, where they are now, who has them.
export function WorkReport() {
  const report = useReport(FILTERS);
  const summary = useApi<WorkReportSummary>(`/reports/works/summary/?${report.filters}`);
  const rows = useApi<Page<WorkReportRow>>(`/reports/works/?${report.rows}`);
  const people = useAssignees();
  const data = summary.data;
  const nameOf = (id: string) => (id === "none" ? "Unassigned" : (people?.find((person) => String(person.id) === id)?.name ?? `User #${id}`));

  return (
    <div className={`${fillClass} space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect name="stage" label="Stage" all="All stages" options={WORK_STAGES.map(({ value, label }) => ({ value, label }))} />
        <FilterSelect name="assigned_to" label="Assigned staff" all="Anyone" options={assigneeOptions(people)} />
        <span className="ml-auto">
          <ExportButtons path="/reports/works/" query={report.filters} name="work-report" />
        </span>
      </div>
      <ActiveFilters
        active={report.active}
        describe={(key, value) => (key === "stage" ? `Stage: ${stageFor(value as WorkStage).label}` : `Assigned: ${nameOf(value)}`)}
      />
      <p className="text-xs text-muted-foreground">
        Works are counted by when their lead was converted. Amounts are each Work&apos;s confirmed amount, fixed at conversion.
        When a Work reached its stage isn&apos;t recorded, so &ldquo;Completed&rdquo; means Completed now.
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
                  label: "Works created",
                  value: data.totals.created.toLocaleString("en-IN"),
                  hint: "Leads converted in the period",
                  onClick: report.active.length ? () => updateQuery(Object.fromEntries(FILTERS.map((key) => [key, null]))) : undefined,
                },
                { label: "Confirmed value", value: formatMoney(data.totals.amount) },
                { label: "Completed now", value: data.totals.completed.toLocaleString("en-IN"), onClick: () => updateQuery({ stage: "COMPLETED" }) },
                { label: "Completed value", value: formatMoney(data.totals.completed_amount) },
              ]
            }
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Works created over time" description="Select a column to see those Works.">
              {data ? (
                <TrendChart
                  {...data.trend}
                  series={[{ key: "created", label: "Created", color: "bg-primary/60" }]}
                  describe={(point) => `${formatMoney(String(point.created_value))} confirmed`}
                />
              ) : (
                <Skeleton lines={6} />
              )}
            </Panel>
            <Panel title="By current stage" description="Where the Works created in the period are now, and their value.">
              {data ? (
                <BarList
                  items={data.by_stage.map((row) => ({
                    key: row.value,
                    label: (
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${stageFor(row.value).dot}`} />
                        <span className="truncate">{row.label}</span>
                      </span>
                    ),
                    count: row.count,
                    detail: formatMoney(row.amount),
                    color: stageFor(row.value).dot,
                    onClick: () => updateQuery({ stage: row.value }),
                  }))}
                />
              ) : (
                <Skeleton lines={7} />
              )}
            </Panel>
            <Panel title="By assigned staff" className="lg:col-span-2">
              {data ? (
                <BarList
                  items={data.by_staff.map((row) => ({
                    key: String(row.id),
                    label: row.name ?? "Unassigned",
                    count: row.count,
                    detail: `${formatMoney(row.amount)} · ${row.completed} completed`,
                    onClick: () => updateQuery({ assigned_to: row.id === null ? "none" : String(row.id) }),
                  }))}
                />
              ) : (
                <Skeleton lines={4} />
              )}
            </Panel>
          </div>
        </div>
      )}

      <Panel
        title="Works"
        description="The Works behind the numbers above, with their latest activity."
        action={sortSelect(SORTS, report.searchParams.get("ordering") ?? SORTS[0].value)}
        className={fillClass}
      >
        {rows.error ? (
          <ReportError error={rows.error} onRetry={rows.reload} />
        ) : (
          <DataTable caption="Work report" columns={COLUMNS} data={rows.data} loading={rows.loading} page={report.page} pageSize={report.pageSize} />
        )}
      </Panel>
    </div>
  );
}
