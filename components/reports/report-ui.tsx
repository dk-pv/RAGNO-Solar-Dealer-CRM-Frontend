"use client";

import { useSearchParams } from "next/navigation";
import { useContext, useId, useState, type ReactNode } from "react";

import { CloseIcon, DownloadIcon } from "@/components/layout/icons";
import { canOpen } from "@/components/layout/navigation";
import { CurrentUserContext, type ShellUser } from "@/components/layout/use-shell-session";
import { formatExact, formatShortDateTime, type LatestActivity } from "@/components/dashboard/api";
import { formatDate, type Assignee } from "@/components/leads/api";
import { Pagination } from "@/components/leads/leads-page";
import { updateQuery } from "@/components/leads/leads-toolbar";
import { ErrorState, fieldClass, secondaryButton } from "@/components/leads/ui";
import { apiDownload, toApiError, useApi, type ApiError } from "@/lib/api";
import { DEFAULT_PERIOD, PERIODS, periodDates, pointEnd, type Period, type TrendUnit } from "./api";

export const DEFAULT_PAGE_SIZE = 25;

// The report's state lives in the URL, so a report can be shared, bookmarked and drilled into with the back button.
// `period`, `from` and `to` are shared by every report; the other keys are the report's own filters, sent as they are.
export function useReport(filterKeys: readonly string[]) {
  const searchParams = useSearchParams();
  const period = (searchParams.get("period") as Period) || DEFAULT_PERIOD;
  const range = periodDates(PERIODS.some((item) => item.value === period) ? period : DEFAULT_PERIOD, {
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  });
  const filters = new URLSearchParams();
  if (range.from) filters.set("date_from", range.from);
  if (range.to) filters.set("date_to", range.to);
  for (const key of filterKeys) {
    const value = searchParams.get(key);
    if (value) filters.set(key, value);
  }
  const rows = new URLSearchParams(filters);
  for (const key of ["ordering", "page", "page_size"]) {
    const value = searchParams.get(key);
    if (value) rows.set(key, value);
  }
  return {
    searchParams,
    filters, // the period and filters: summaries and exports
    rows, // the same, with the table's sort and page
    page: Number(searchParams.get("page")) || 1,
    pageSize: Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE,
    active: filterKeys.filter((key) => searchParams.get(key)),
  };
}

// Who a report can be filtered by: anyone active for Work users; staff with only Leads, themselves.
export function useAssignees() {
  const me = useContext(CurrentUserContext) as ShellUser;
  const path = canOpen(me, { module: "work" }) ? "/works/assignees/" : canOpen(me, { module: "leads" }) ? "/leads/assignees/" : null;
  return useApi<Assignee[]>(path).data;
}

// The period shared by every report: a preset, or a custom range of days.
export function PeriodFilter() {
  const searchParams = useSearchParams();
  const period = (searchParams.get("period") as Period) || DEFAULT_PERIOD;
  const custom = { from: searchParams.get("from") ?? "", to: searchParams.get("to") ?? "" };
  const range = periodDates(period, custom);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Period</span>
        <select
          value={period}
          onChange={(event) => {
            const next = event.target.value as Period;
            // A custom range starts from the dates the previous period covered.
            updateQuery(next === "custom" ? { period: next, from: range.from, to: range.to } : { period: next, from: null, to: null });
          }}
          className={`${fieldClass} h-9`}
        >
          {PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {period === "custom" ? (
        <span className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={custom.from}
            max={custom.to || undefined}
            onChange={(event) => updateQuery({ from: event.target.value || null })}
            aria-label="From"
            className={`${fieldClass} h-9`}
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={custom.to}
            min={custom.from || undefined}
            onChange={(event) => updateQuery({ to: event.target.value || null })}
            aria-label="To"
            className={`${fieldClass} h-9`}
          />
        </span>
      ) : (
        <span className="text-muted-foreground tabular-nums">
          {range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(range.to)}`}
        </span>
      )}
    </div>
  );
}

type FilterSelectProps = { name: string; label: string; options: { value: string; label: string }[]; all: string };

// A report filter kept in the URL. Changing it reloads the summary, charts, table and export from the server.
export function FilterSelect({ name, label, options, all }: FilterSelectProps) {
  const searchParams = useSearchParams();
  return (
    <select
      value={searchParams.get(name) ?? ""}
      onChange={(event) => updateQuery({ [name]: event.target.value || null })}
      aria-label={label}
      className={`${fieldClass} h-9 max-sm:w-full`}
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export const assigneeOptions = (people?: Assignee[]) => [
  ...(people ?? []).map((person) => ({ value: String(person.id), label: person.name })),
  { value: "none", label: "Unassigned" },
];

// The filters in use, each with a way to remove it: how a drill-down shows what it narrowed the report to.
export function ActiveFilters({ active, describe }: { active: string[]; describe: (key: string, value: string) => string }) {
  const searchParams = useSearchParams();
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Showing only:</span>
      {active.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => updateQuery({ [key]: null })}
          aria-label={`Remove the filter ${describe(key, searchParams.get(key) ?? "")}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary-softer px-2 py-1 text-xs font-medium text-primary-strong hover:bg-primary-soft"
        >
          {describe(key, searchParams.get(key) ?? "")}
          <CloseIcon className="size-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => updateQuery(Object.fromEntries(active.map((key) => [key, null])))}
        className="text-xs font-medium text-link underline-offset-2 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}

// Downloads exactly what the report shows (its period and filters), as CSV or Excel.
export function ExportButtons({ path, query, name }: { path: string; query: URLSearchParams; name: string }) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function download(format: "csv" | "xlsx") {
    setBusy(format);
    setError(undefined);
    const params = new URLSearchParams(query);
    params.set("export", format);
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      await apiDownload(`${path}?${params}`, `${name}-${today}.${format}`);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {(["csv", "xlsx"] as const).map((format) => (
        <button key={format} type="button" onClick={() => download(format)} disabled={!!busy} className={secondaryButton}>
          <DownloadIcon className="size-4" />
          {busy === format ? "Exporting…" : format === "csv" ? "Export CSV" : "Export Excel"}
        </button>
      ))}
      {error && (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      )}
    </span>
  );
}

export function Panel({ title, description, action, className = "", children }: { title: string; description?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`min-w-0 rounded-lg border border-border bg-background p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="block h-4 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function ReportError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return <ErrorState title="Couldn't load report" message={error.message} onRetry={onRetry} />;
}

export const NO_DATA = "No data found for the selected filters.";

type Stat = { label: string; value: ReactNode; hint?: string; onClick?: () => void; alert?: boolean };

// The report's headline figures. A figure that can be drilled into is a button that narrows the report to its records.
export function Stats({ stats }: { stats?: Stat[] }) {
  if (!stats) {
    return (
      <div aria-busy="true" aria-label="Loading" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[5.5rem] animate-pulse rounded-lg border border-border bg-background motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  return (
    <div className={`grid grid-cols-2 gap-3 ${stats.length > 4 ? "md:grid-cols-3 xl:grid-cols-6" : "md:grid-cols-4"}`}>
      {stats.map((stat) => {
        const body = (
          <>
            <span className="block text-sm font-medium text-secondary-foreground">{stat.label}</span>
            <span className={`mt-1 block text-2xl font-semibold tabular-nums ${stat.alert ? "text-error" : ""}`}>{stat.value}</span>
            {stat.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{stat.hint}</span>}
          </>
        );
        const className = "block w-full rounded-lg border border-border bg-background p-4 text-left shadow-xs";
        return stat.onClick ? (
          <button key={stat.label} type="button" onClick={stat.onClick} className={`${className} transition-colors hover:border-primary/50`}>
            {body}
          </button>
        ) : (
          <div key={stat.label} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

type BarItem = { key: string; label: ReactNode; count: number; detail?: string; color?: string; onClick?: () => void };

// Counts as bars, largest first only if the caller orders them so. Each bar narrows the report to its records.
export function BarList({ items, empty = NO_DATA }: { items: BarItem[]; empty?: string }) {
  if (items.every((item) => item.count === 0)) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const width = item.count === 0 ? 0 : Math.max(3, (item.count / max) * 100);
        const content = (
          <>
            <span className="min-w-0 truncate text-sm">{item.label}</span>
            <span aria-hidden="true" className="h-2 min-w-0 rounded-full bg-muted">
              <span className={`block h-2 rounded-full ${item.color ?? "bg-primary/45"}`} style={{ width: `${width}%` }} />
            </span>
            <span className="text-right text-sm tabular-nums">
              <span className="font-medium">{item.count.toLocaleString("en-IN")}</span>
              {item.detail && <span className="block text-[11px] text-muted-foreground">{item.detail}</span>}
            </span>
          </>
        );
        const className = "-mx-2 grid w-[calc(100%+1rem)] grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left";
        return (
          <li key={item.key}>
            {item.onClick && item.count > 0 ? (
              <button type="button" onClick={item.onClick} className={`${className} hover:bg-muted`}>
                {content}
              </button>
            ) : (
              <div className={className}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const pointLabel = { day: { day: "numeric", month: "short" }, week: { day: "numeric", month: "short" }, month: { month: "short", year: "2-digit" } } as const;
const pointFormat = (unit: TrendUnit, start: string) =>
  new Intl.DateTimeFormat("en-IN", { ...pointLabel[unit], timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`));

type TrendSeries = { key: string; label: string; color: string };

// Counts over time as columns: one per day, week or month (the server picks by the period's length). A column narrows
// the report to the days it covers.
export function TrendChart({
  unit,
  points,
  series,
  describe,
}: {
  unit: TrendUnit;
  points: ({ start: string } & Record<string, number | string>)[];
  series: TrendSeries[];
  describe?: (point: Record<string, number | string>) => string;
}) {
  if (points.every((point) => series.every((item) => Number(point[item.key]) === 0))) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{NO_DATA}</p>;
  }
  const max = Math.max(...points.flatMap((point) => series.map((item) => Number(point[item.key]))), 1);
  const every = Math.ceil(points.length / 8); // label at most about eight columns
  const prefix = unit === "week" ? "Week of " : "";

  return (
    <div>
      {series.length > 1 && (
        <p className="mb-2 flex gap-4 text-xs text-muted-foreground">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2 rounded-sm ${item.color}`} />
              {item.label}
            </span>
          ))}
        </p>
      )}
      <div className="flex h-40 items-end gap-0.5 border-b border-border">
        {points.map((point) => {
          const text = `${prefix}${pointFormat(unit, point.start)}${unit === "month" ? "" : ` ${point.start.slice(0, 4)}`}: ${series
            .map((item) => `${Number(point[item.key]).toLocaleString("en-IN")} ${item.label.toLowerCase()}`)
            .join(", ")}${describe ? ` · ${describe(point)}` : ""}`;
          return (
            <button
              key={point.start}
              type="button"
              title={text}
              aria-label={`${text}. Show these records.`}
              onClick={() => updateQuery({ period: "custom", from: point.start, to: pointEnd(unit, point.start) })}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-t hover:bg-muted"
            >
              {series.map((item) => {
                const value = Number(point[item.key]);
                return (
                  <span
                    key={item.key}
                    className={`block w-full max-w-6 rounded-t-sm ${item.color}`}
                    style={{ height: value === 0 ? 0 : `${Math.max(3, (value / max) * 100)}%` }}
                  />
                );
              })}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-muted-foreground">
        {points.map((point, index) => (
          <span key={point.start} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {index % every === 0 ? pointFormat(unit, point.start) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// A record's newest activity in a table cell, or a plain "No activity yet": never an activity that didn't happen.
export function LatestCell({ latest }: { latest: LatestActivity }) {
  return latest ? (
    <span className="whitespace-nowrap">
      {latest.type_display}
      <time dateTime={latest.at} title={formatExact(latest.at)} className="block text-xs text-muted-foreground">
        {formatShortDateTime(latest.at)}
      </time>
    </span>
  ) : (
    <span className="whitespace-nowrap text-muted-foreground italic">No activity yet</span>
  );
}

export type Column<T> = { header: string; render: (row: T) => ReactNode; className?: string };

// A report's records: a page at a time from the server, scrolling sideways inside its box on small screens.
export function DataTable<T>({
  caption,
  columns,
  data,
  loading,
  page,
  pageSize,
  rowKey = (row) => String((row as { id?: number | string }).id),
}: {
  caption: string;
  columns: Column<T>[];
  data?: { count: number; results: T[] };
  loading: boolean;
  page?: number;
  pageSize?: number;
  rowKey?: (row: T) => string;
}) {
  if (data && data.count === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-strong bg-background px-4 py-10 text-center text-sm text-muted-foreground">
        {NO_DATA}
      </p>
    );
  }
  return (
    <>
      <div className="scrollbar-none relative overflow-x-auto rounded-lg border border-border bg-background">
        <table aria-busy={loading} className={`w-full text-sm transition-opacity ${loading && data ? "opacity-60" : ""}`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
              {columns.map((column) => (
                <th key={column.header} scope="col" className={`px-3 py-2.5 ${column.className ?? ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data
              ? data.results.map((row) => (
                  <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-row-hover">
                    {columns.map((column) => (
                      <td key={column.header} className={`px-3 py-2 align-top ${column.className ?? ""}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              : Array.from({ length: 6 }, (_, row) => (
                  <tr key={row} className="border-b border-border last:border-0">
                    {columns.map((column) => (
                      <td key={column.header} className="px-3 py-3.5">
                        <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {data && page !== undefined && pageSize !== undefined && <Pagination page={page} pageSize={pageSize} count={data.count} />}
    </>
  );
}

export const sortSelect = (options: { value: string; label: string }[], value: string) => (
  <label className="flex items-center gap-2 text-sm">
    <span className="text-muted-foreground">Sort</span>
    <select
      value={value}
      onChange={(event) => updateQuery({ ordering: event.target.value === options[0].value ? null : event.target.value })}
      className={`${fieldClass} h-9`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);
