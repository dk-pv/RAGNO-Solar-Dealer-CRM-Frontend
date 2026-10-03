"use client";

import Link from "next/link";
import { useState } from "react";

import { initials } from "@/components/layout/navbar";
import type { Assignee, Page } from "@/components/leads/api";
import { ErrorState, StatusBadge, fieldClass, fillClass, paginationFooterClass, secondaryButton } from "@/components/leads/ui";
import { stageFor } from "@/components/works/api";
import { ActivityStatusBadge } from "@/components/works/work-activities";
import { useApi } from "@/lib/api";
import {
  dayOf,
  formatDayHeading,
  formatExact,
  formatShortDateTime,
  formatTime,
  shiftDay,
  type LatestActivity,
  type TimelineEvent,
} from "./api";

const PAGE_SIZE = 20;

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

// The days a period covers, in the CRM's time zone.
function periodRange(period: Period, today: string, custom: { from: string; to: string }) {
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: shiftDay(today, -1), to: shiftDay(today, -1) };
    case "7":
      return { from: shiftDay(today, -6), to: today };
    case "30":
      return { from: shiftDay(today, -29), to: today };
    case "custom":
      return custom;
    default:
      return { from: "", to: "" };
  }
}

type TimelineProps = { today: string; users?: Assignee[]; version: number };

// What happened in the CRM, newest first, by everyone whose work this user may see. Filtering and paging happen on the
// server, so a filter never hides events that simply weren't loaded.
export function CrmTimeline({ today, users, version }: TimelineProps) {
  const [user, setUser] = useState("");
  const [record, setRecord] = useState("");
  const [period, setPeriod] = useState<Period>("7");
  const [custom, setCustom] = useState({ from: shiftDay(today, -6), to: today });
  const [page, setPage] = useState(1);

  const range = periodRange(period, today, custom);
  const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (user) query.set("user", user);
  if (record) query.set("record", record);
  if (range.from) query.set("date_from", range.from);
  if (range.to) query.set("date_to", range.to);
  if (version) query.set("v", String(version));
  const { data, error, loading, reload } = useApi<Page<TimelineEvent>>(`/dashboard/timeline/?${query}`);

  // Any filter change starts again from the newest events.
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  let content;
  if (error) {
    content = <ErrorState title="Couldn't load the timeline" message={error.message} onRetry={reload} />;
  } else if (!data) {
    content = (
      <ul aria-busy="true" aria-label="Loading the timeline" className="space-y-5 py-2">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className="flex gap-3">
            <span className="size-8 shrink-0 animate-pulse rounded-full bg-subtle motion-reduce:animate-none" />
            <span className="flex-1 space-y-2">
              <span className="block h-3.5 w-2/3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
              <span className="block h-3 w-1/2 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (data.count === 0) {
    content = (
      <p className="rounded-md border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted-foreground">
        {user || record ? "Nothing matches these filters in this period." : "Nothing happened in this period."}
      </p>
    );
  } else {
    const days: { day: string; events: TimelineEvent[] }[] = [];
    for (const event of data.results) {
      const day = dayOf(event.at);
      if (days.at(-1)?.day !== day) days.push({ day, events: [] });
      days.at(-1)!.events.push(event);
    }
    const first = (page - 1) * PAGE_SIZE + 1;
    content = (
      <div className={`${fillClass} transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
        {days.map(({ day, events }) => (
          <section key={day} className="mt-4 first:mt-0">
            <h3 className="sticky top-0 z-1 bg-background py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {day === today ? "Today" : day === shiftDay(today, -1) ? "Yesterday" : formatDayHeading(day)}
            </h3>
            <ol className="mt-1 divide-y divide-border">
              {events.map((event) => (
                <TimelineItem key={event.key} event={event} />
              ))}
            </ol>
          </section>
        ))}
        <nav aria-label="Timeline pages" className={`${paginationFooterClass} justify-between`}>
          <span className="text-muted-foreground tabular-nums">
            {first.toLocaleString("en-IN")}–{(first + data.results.length - 1).toLocaleString("en-IN")} of{" "}
            {data.count.toLocaleString("en-IN")}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setPage(page - 1)} disabled={page === 1 || loading} className={secondaryButton}>
              Newer
            </button>
            <button type="button" onClick={() => setPage(page + 1)} disabled={!data.next || loading} className={secondaryButton}>
              Older
            </button>
          </span>
        </nav>
      </div>
    );
  }

  const select = `${fieldClass} h-9 max-sm:w-full`;
  return (
    // The card around the timeline stretches to its neighbour in the Dashboard's grid; the pages nav stays at its bottom.
    <div className={fillClass}>
      <div className="flex flex-wrap gap-2">
        <select value={user} onChange={(event) => filter(setUser)(event.target.value)} aria-label="User" className={select}>
          <option value="">All users</option>
          {users?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <select value={record} onChange={(event) => filter(setRecord)(event.target.value)} aria-label="Records" className={select}>
          <option value="">All records</option>
          <option value="leads">Leads</option>
          <option value="works">Works</option>
          <option value="activities">Activities</option>
        </select>
        <select
          value={period}
          onChange={(event) => filter(setPeriod)(event.target.value as Period)}
          aria-label="Period"
          className={select}
        >
          {PERIODS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {period === "custom" && (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(event) => filter(setCustom)({ ...custom, from: event.target.value })}
              aria-label="From"
              className={select}
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(event) => filter(setCustom)({ ...custom, to: event.target.value })}
              aria-label="To"
              className={select}
            />
          </span>
        )}
      </div>
      <div className={`${fillClass} mt-3`}>{content}</div>
    </div>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const who = event.user?.name ?? "Someone";
  const { lead, work, activity } = event;
  const recordLink = work ? (
    <Link href={`/works/${work.id}`} className="font-medium text-link hover:text-link-hover hover:underline">
      Work #{work.id}
    </Link>
  ) : lead ? (
    <Link href={`/leads/${lead.id}`} className="font-medium text-link hover:text-link-hover hover:underline">
      Lead #{lead.id}
    </Link>
  ) : null;
  // Every activity type reads with "a": a phone call, a follow-up, a site visit, a customer meeting, a note.
  const what = activity && `a ${activity.type_display.toLowerCase()}`;

  let sentence;
  if (event.kind === "lead_created") sentence = <>added {recordLink}</>;
  else if (event.kind === "work_created")
    sentence = (
      <>
        converted Lead #{work?.lead} into {recordLink}
      </>
    );
  else if (event.kind === "activity_added") sentence = <>added {what} to {recordLink}</>;
  else sentence = <>completed {what} on {recordLink}</>;

  const customer = work?.customer_name ?? lead?.customer_name;
  const assignee = work ? work.assigned_to_name : lead?.assigned_to_name;

  return (
    <li className="flex gap-3 py-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-secondary-foreground"
      >
        {initials(who)}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <time dateTime={event.at} title={formatExact(event.at)} className="text-xs font-medium text-muted-foreground tabular-nums">
            {formatTime(event.at)}
          </time>
          <span className="min-w-0">
            <span className="font-medium">{who}</span> {sentence}
          </span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {customer && <span>Customer: {customer}</span>}
          <span>Assigned: {assignee ?? "Unassigned"}</span>
          {work ? (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${stageFor(work.stage).dot}`} />
              {work.stage_display}
            </span>
          ) : (
            lead && <StatusBadge status={lead.status} />
          )}
        </p>
        {activity ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {/* A lead's activities are its log: the Leads screens set no status on them, so none is shown. */}
            {work && <ActivityStatusBadge status={activity.status} />}
            <span className="line-clamp-1 text-secondary-foreground">{activity.description}</span>
          </p>
        ) : (
          <LatestActivityLine latest={(work ?? lead)?.latest_activity ?? null} />
        )}
      </div>
    </li>
  );
}

// A record's newest activity, or a clear "No activity yet": never an activity that didn't happen.
export function LatestActivityLine({ latest }: { latest: LatestActivity }) {
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Latest activity:{" "}
      {latest ? (
        <span className="text-secondary-foreground">
          {latest.type_display} · <time dateTime={latest.at} title={formatExact(latest.at)}>{formatShortDateTime(latest.at)}</time>
        </span>
      ) : (
        <span className="italic">No activity yet</span>
      )}
    </p>
  );
}
