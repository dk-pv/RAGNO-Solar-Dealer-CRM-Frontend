"use client";

import Link from "next/link";

import { formatDayHeading, formatExact, formatTime, dayOf, type TimelineEvent } from "@/components/dashboard/api";
import { StatusBadge, fillClass } from "@/components/leads/ui";
import { stageFor } from "@/components/works/api";
import { useApi } from "@/lib/api";
import { EVENT_KINDS, type Page } from "./api";
import { ActiveFilters, DataTable, ExportButtons, FilterSelect, Panel, ReportError, useAssignees, useReport, type Column } from "./report-ui";

const FILTERS = ["user", "record", "kind"] as const;
const RECORDS = [
  { value: "leads", label: "Leads" },
  { value: "works", label: "Works" },
  { value: "activities", label: "Activities" },
];

const COLUMNS: Column<TimelineEvent>[] = [
  { header: "Date", render: (event) => formatDayHeading(dayOf(event.at)), className: "whitespace-nowrap" },
  {
    header: "Time",
    render: (event) => (
      <time dateTime={event.at} title={formatExact(event.at)} className="tabular-nums">
        {formatTime(event.at)}
      </time>
    ),
    className: "whitespace-nowrap",
  },
  {
    header: "User",
    render: (event) => <span className="block max-w-[max(11rem,12cqw)] truncate">{event.user?.name ?? "—"}</span>,
    className: "whitespace-nowrap font-medium",
  },
  { header: "Event", render: (event) => EVENT_KINDS.find((kind) => kind.value === event.kind)?.label, className: "whitespace-nowrap" },
  {
    header: "Record",
    render: (event) =>
      event.work ? (
        <Link href={`/works/${event.work.id}`} className="whitespace-nowrap text-link hover:text-link-hover hover:underline">
          Work #{event.work.id}
        </Link>
      ) : event.lead ? (
        <Link href={`/leads/${event.lead.id}`} className="whitespace-nowrap text-link hover:text-link-hover hover:underline">
          Lead #{event.lead.id}
        </Link>
      ) : (
        "—"
      ),
  },
  { header: "Customer", render: (event) => <span className="block max-w-[max(11rem,12cqw)] truncate">{(event.work ?? event.lead)?.customer_name}</span> },
  {
    header: "Now",
    render: (event) =>
      event.work ? (
        <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${stageFor(event.work.stage).dot}`} />
          {event.work.stage_display}
        </span>
      ) : (
        event.lead && <StatusBadge status={event.lead.status} />
      ),
  },
  {
    header: "Details",
    // At least 12rem wide: in a table narrower than its columns, a cell that can wrap is squeezed to its longest word.
    render: (event) =>
      event.activity ? (
        <span title={event.activity.description} className="line-clamp-2 min-w-48 max-w-[max(18rem,19cqw)] text-xs break-words">
          <span className="font-medium">{event.activity.type_display}:</span> {event.activity.description}
        </span>
      ) : event.kind === "work_created" ? (
        <span className="text-xs text-muted-foreground">From Lead #{event.work?.lead}</span>
      ) : null,
  },
];

// The CRM's recorded events in the period, newest first: leads added, leads converted into Works, activities
// added and completed. Only what was recorded: no event is made up for a record with no activity.
export function HistoryReport() {
  const report = useReport(FILTERS);
  const { data, error, loading, reload } = useApi<Page<TimelineEvent>>(`/reports/history/?${report.rows}`);
  const people = useAssignees();

  return (
    <div className={`${fillClass} space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect name="user" label="User" all="All users" options={(people ?? []).map((person) => ({ value: String(person.id), label: person.name }))} />
        <FilterSelect name="record" label="Records" all="All records" options={RECORDS} />
        <FilterSelect name="kind" label="Event" all="All events" options={EVENT_KINDS.map((kind) => ({ ...kind }))} />
        <span className="ml-auto">
          <ExportButtons path="/reports/history/" query={report.filters} name="crm-history" />
        </span>
      </div>
      <ActiveFilters
        active={report.active}
        describe={(key, value) =>
          key === "user"
            ? `User: ${people?.find((person) => String(person.id) === value)?.name ?? `#${value}`}`
            : key === "record"
              ? `Records: ${RECORDS.find((item) => item.value === value)?.label ?? value}`
              : `Event: ${EVENT_KINDS.find((kind) => kind.value === value)?.label ?? value}`
        }
      />
      <p className="text-xs text-muted-foreground">
        Every event here was recorded with its user and exact time (India Standard Time). Status and stage changes,
        assignments and edits aren&apos;t recorded with who made them, so they don&apos;t appear.
      </p>
      <Panel title="CRM history" description="Newest first." className={fillClass}>
        {error ? (
          <ReportError error={error} onRetry={reload} />
        ) : (
          <DataTable caption="CRM history" columns={COLUMNS} data={data} loading={loading} page={report.page} pageSize={report.pageSize} rowKey={(event) => event.key} />
        )}
      </Panel>
    </div>
  );
}
