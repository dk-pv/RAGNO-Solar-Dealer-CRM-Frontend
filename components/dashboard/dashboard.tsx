"use client";

import Link from "next/link";
import { useContext, useId, useState, type ComponentType, type ReactNode } from "react";

import {
  CalendarIcon,
  ClockIcon,
  ConvertIcon,
  LeadsIcon,
  PlusIcon,
  WorksIcon,
  type IconProps,
} from "@/components/layout/icons";
import { canOpen } from "@/components/layout/navigation";
import { CurrentUserContext, type ShellUser } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, type Assignee } from "@/components/leads/api";
import { useLeadActions } from "@/components/leads/lead-actions";
import { ErrorState, StatusBadge, secondaryButton, segmentClass, segmentedClass, useNotice } from "@/components/leads/ui";
import { stageFor, type StageSummary } from "@/components/works/api";
import { ActivityStatusBadge } from "@/components/works/work-activities";
import { useApi, type ApiError } from "@/lib/api";
import {
  FOLLOW_UP_BUCKETS,
  dayOf,
  formatDayHeading,
  formatExact,
  formatShortDateTime,
  type DashboardSummary,
  type FollowUp,
  type FollowUpBucket,
  type FollowUpTotals,
  type RecentRecords,
} from "./api";
import { CrmTimeline, LatestActivityLine } from "./timeline";

type Loaded<T> = { data?: T; error?: ApiError; reload: () => void };
type FollowUpView = { bucket: FollowUpBucket; mine: boolean };

// The Dashboard: what is happening across Leads, Works and their follow-ups, and who did what, when. Every number and
// list comes from the API, which applies the user's modules and lead visibility; each section loads, fails and retries
// on its own.
export function Dashboard() {
  // The shell renders pages only once the signed-in user has loaded.
  const me = useContext(CurrentUserContext) as ShellUser;
  const canLeads = canOpen(me, { module: "leads" });
  const canWorks = canOpen(me, { module: "work" });
  const canActivities = canOpen(me, { module: "activities" });
  // Bumped after a lead is added here (from the empty Lead overview), so every section reloads.
  const [version, setVersion] = useState(0);
  const v = version ? `?v=${version}` : "";
  const summary = useApi<DashboardSummary>(`/dashboard/summary/${v}`);
  const stages = useApi<StageSummary[]>(canWorks ? `/works/summary/${v}` : null);
  const recent = useApi<RecentRecords>(`/dashboard/recent/${v}`);
  // Who the timeline can be filtered by: anyone active for Work users; staff with only Leads see themselves.
  const users = useApi<Assignee[]>(canWorks ? "/works/assignees/" : canLeads ? "/leads/assignees/" : null);
  const [followUps, setFollowUps] = useState<FollowUpView>({ bucket: "overdue", mine: false });
  const [noticeElement, notify] = useNotice();
  const refresh = () => setVersion((current) => current + 1);
  const leadActions = useLeadActions(notify, refresh);
  const today = summary.data?.today ?? dayOf(new Date());

  function showFollowUps(bucket: FollowUpBucket, mine: boolean) {
    setFollowUps({ bucket, mine });
    document.getElementById("follow-ups")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Welcome back, {me.name.split(" ")[0]} · {formatDayHeading(today)}
        </p>
      </div>

      {!canLeads && !canWorks ? (
        <Panel title="Nothing to show yet">
          <p className="text-sm text-muted-foreground">
            Your role doesn&apos;t include the Leads or Work module, so there are no records to summarise here.
          </p>
        </Panel>
      ) : (
        <>
          <SummaryCards summary={summary} onFollowUps={(bucket) => showFollowUps(bucket, false)} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <FollowUpsPanel
              view={followUps}
              onView={setFollowUps}
              counts={summary.data && (followUps.mine ? summary.data.mine.follow_ups : summary.data.follow_ups)}
              today={today}
              version={version}
              links={{ works: canWorks && canActivities, leads: canLeads }}
              className="lg:col-span-2"
            />
            <MyWork summary={summary} me={me} onFollowUps={(bucket) => showFollowUps(bucket, true)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {canLeads && <LeadOverview summary={summary} onAdd={leadActions.add} />}
            {canWorks && <WorkOverview stages={stages} />}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              title="CRM Timeline"
              description="What happened, who did it and exactly when (India Standard Time)."
              className="xl:col-span-2"
            >
              <CrmTimeline today={today} users={users.data} version={version} />
            </Panel>
            <div className="space-y-4">
              {canLeads && <RecentLeads recent={recent} />}
              {canWorks && <RecentWorks recent={recent} />}
            </div>
          </div>
        </>
      )}

      {leadActions.dialogs}
      {noticeElement}
    </div>
  );
}

type PanelProps = { id?: string; title: string; description?: string; action?: ReactNode; className?: string; children: ReactNode };

function Panel({ id, title, description, action, className = "", children }: PanelProps) {
  const titleId = useId();
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`min-w-0 scroll-mt-20 rounded-lg border border-border bg-background p-4 ${className}`}
    >
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

const linkClass = "text-sm font-medium text-link underline-offset-2 hover:text-link-hover hover:underline";

function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="block h-4 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
      ))}
    </div>
  );
}

type Card = {
  title: string;
  value: number;
  hint: string;
  icon: ComponentType<IconProps>;
  href?: string;
  onClick?: () => void;
  alert?: boolean; // something needs attention: shown in words and colour
};

function sourceHint(totals: FollowUpTotals, key: "pending" | "overdue") {
  const parts = [];
  if (totals.works) parts.push(`${totals.works[key].toLocaleString("en-IN")} on Works`);
  if (totals.leads) parts.push(`${totals.leads[key].toLocaleString("en-IN")} on Leads`);
  return parts.join(" · ");
}

function SummaryCards({ summary, onFollowUps }: { summary: Loaded<DashboardSummary>; onFollowUps: (bucket: FollowUpBucket) => void }) {
  if (summary.error) {
    return (
      <div className="rounded-lg border border-border bg-background">
        <ErrorState title="Unable to load the summary" message={summary.error.message} onRetry={summary.reload} />
      </div>
    );
  }
  // Placeholders, never zeros, while the counts load.
  if (!summary.data) {
    return (
      <div aria-busy="true" aria-label="Loading the summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-[6.5rem] animate-pulse rounded-lg border border-border bg-background motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  const { leads, works, follow_ups: followUps } = summary.data;
  const cards: Card[] = [];
  if (leads) {
    cards.push(
      { title: "Total Leads", value: leads.total, hint: `${leads.lost.toLocaleString("en-IN")} lost`, icon: LeadsIcon, href: "/leads" },
      { title: "Active Leads", value: leads.active, hint: "New to Superhot", icon: LeadsIcon, href: "/leads/pipeline" },
      { title: "Confirmed Leads", value: leads.confirmed, hint: "Won", icon: ConvertIcon, href: "/leads?status=WON" },
    );
  }
  if (works) {
    cards.push(
      { title: "Total Works", value: works.total, hint: "Confirmed installations", icon: WorksIcon, href: "/works" },
      { title: "Active Works", value: works.active, hint: "Not completed yet", icon: WorksIcon, href: "/works/pipeline" },
      { title: "Completed Works", value: works.completed, hint: "Installation done", icon: ConvertIcon, href: "/works?stage=COMPLETED" },
    );
  }
  cards.push(
    {
      title: "Pending Follow-ups",
      value: followUps.total.pending,
      hint: sourceHint(followUps, "pending"),
      icon: CalendarIcon,
      onClick: () => onFollowUps("pending"),
    },
    {
      title: "Overdue Follow-ups",
      value: followUps.total.overdue,
      hint: followUps.total.overdue > 0 ? `Needs attention · ${sourceHint(followUps, "overdue")}` : "Nothing overdue",
      icon: ClockIcon,
      onClick: () => onFollowUps("overdue"),
      alert: followUps.total.overdue > 0,
    },
  );

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <SummaryCard key={card.title} card={card} />
      ))}
    </div>
  );
}

function SummaryCard({ card }: { card: Card }) {
  const Icon = card.icon;
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-secondary-foreground">{card.title}</span>
        <span
          aria-hidden="true"
          className={`grid size-8 shrink-0 place-items-center rounded-full ${card.alert ? "bg-error-soft text-error" : "bg-primary-softer text-primary"}`}
        >
          <Icon className="size-4" />
        </span>
      </span>
      <span className={`mt-1 block text-2xl font-semibold tabular-nums ${card.alert ? "text-error" : ""}`}>
        {card.value.toLocaleString("en-IN")}
      </span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{card.hint}</span>
    </>
  );
  const className =
    "block w-full rounded-lg border border-border bg-background p-4 text-left shadow-xs transition-colors hover:border-border-strong";
  return card.href ? (
    <Link href={card.href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={card.onClick} className={className}>
      {body}
    </button>
  );
}

type FollowUpsPanelProps = {
  view: FollowUpView;
  onView: (view: FollowUpView) => void;
  counts?: FollowUpTotals;
  today: string;
  version: number;
  links: { works: boolean; leads: boolean };
  className?: string;
};

// Follow-ups that need attention, from Works (pending activities) and leads (their scheduled next follow-up).
function FollowUpsPanel({ view, onView, counts, today, version, links, className }: FollowUpsPanelProps) {
  const { bucket, mine } = view;
  const query = new URLSearchParams({ bucket, limit: "8" });
  if (mine) query.set("mine", "true");
  if (version) query.set("v", String(version));
  const { data, error, loading, reload } = useApi<{ count: number; results: FollowUp[] }>(`/dashboard/follow-ups/?${query}`);
  const current = FOLLOW_UP_BUCKETS.find((item) => item.value === bucket)!;

  let content;
  if (error) {
    content = <ErrorState title="Unable to load follow-ups" message={error.message} onRetry={reload} />;
  } else if (!data) {
    content = <Skeleton lines={5} />;
  } else if (data.count === 0) {
    content = (
      <p className="rounded-md border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted-foreground">
        {current.empty}
        {mine ? " assigned to you." : "."}
      </p>
    );
  } else {
    content = (
      <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
        <ul className="divide-y divide-border">
          {data.results.map((item) => (
            <FollowUpItem key={item.key} item={item} today={today} />
          ))}
        </ul>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Showing {data.results.length} of {data.count.toLocaleString("en-IN")}
          </span>
          <span className="flex gap-3">
            {links.works && (
              <Link href={`/works/activities?status=${bucket === "completed" ? "COMPLETED" : "PENDING"}`} className={linkClass}>
                All Work follow-ups
              </Link>
            )}
            {links.leads && bucket !== "completed" && (
              <Link href="/leads?ordering=next_follow_up" className={linkClass}>
                Leads by next follow-up
              </Link>
            )}
          </span>
        </p>
      </div>
    );
  }

  return (
    <Panel
      id="follow-ups"
      title="Follow-ups"
      description="Pending activities on Works and the next follow-up scheduled on open leads."
      className={className}
      action={
        <div role="group" aria-label="Whose follow-ups" className={segmentedClass}>
          <button type="button" aria-pressed={!mine} onClick={() => onView({ bucket, mine: false })} className={segmentClass}>
            Everyone
          </button>
          <button type="button" aria-pressed={mine} onClick={() => onView({ bucket, mine: true })} className={segmentClass}>
            Assigned to me
          </button>
        </div>
      }
    >
      <div role="group" aria-label="Which follow-ups" className="scrollbar-none -mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
        {FOLLOW_UP_BUCKETS.map((item) => {
          const count = item.value === "completed" ? undefined : counts?.total[item.value];
          const pressed = item.value === bucket;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onView({ bucket: item.value, mine })}
              className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors pointer-coarse:py-2.5 ${
                pressed ? "border-primary bg-primary-softer text-primary-strong" : "border-border text-secondary-foreground hover:bg-muted"
              }`}
            >
              {item.label}
              {count !== undefined && (
                <span className={`ml-1.5 tabular-nums ${item.value === "overdue" && count > 0 ? "text-error" : ""}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
      {content}
    </Panel>
  );
}

function FollowUpItem({ item, today }: { item: FollowUp; today: string }) {
  const overdue = item.status === "PENDING" && item.due_date !== null && item.due_date < today;
  const href = item.work ? `/works/${item.work}#activities` : `/leads/${item.lead}#activities`;

  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <Link href={href} className="font-medium hover:underline">
            {item.title}
          </Link>
          <span className="text-muted-foreground">
            · {item.work ? `Work #${item.work}` : `Lead #${item.lead}`} · {item.customer_name}
          </span>
        </p>
        <p className="line-clamp-1 text-xs text-secondary-foreground">
          {item.description || "Next follow-up date scheduled on the lead"}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>Assigned: {item.assigned_to_name ?? "Unassigned"}</span>
          {item.due_date && (
            <span className={overdue ? "font-medium text-error" : undefined}>
              {overdue ? "Was due" : "Due"} {formatDate(item.due_date)}
            </span>
          )}
          {item.created_at && (
            <span title={formatExact(item.created_at)}>
              Created {formatShortDateTime(item.created_at)}
              {item.created_by_name ? ` by ${item.created_by_name}` : ""}
            </span>
          )}
          {item.completed_at && (
            <span title={formatExact(item.completed_at)}>
              Completed {formatShortDateTime(item.completed_at)}
              {item.completed_by_name ? ` by ${item.completed_by_name}` : ""}
            </span>
          )}
        </p>
      </div>
      {overdue ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-error-soft px-2 py-0.5 text-xs font-medium text-error ring-1 ring-error-border ring-inset">
          <ClockIcon className="size-3" />
          Overdue
        </span>
      ) : (
        <ActivityStatusBadge status={item.status} />
      )}
    </li>
  );
}

type MyWorkProps = { summary: Loaded<DashboardSummary>; me: ShellUser; onFollowUps: (bucket: FollowUpBucket) => void };

// The signed-in user's own work: what is assigned to them and their follow-ups.
function MyWork({ summary, me, onFollowUps }: MyWorkProps) {
  let content;
  if (summary.error) {
    content = <ErrorState title="Unable to load your work" message={summary.error.message} onRetry={summary.reload} />;
  } else if (!summary.data) {
    content = <Skeleton lines={6} />;
  } else {
    const mine = summary.data.mine;
    const counts = mine.follow_ups.total;
    const row = "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted";
    const value = (count: number, alert = false) => (
      <span className={`font-semibold tabular-nums ${alert && count > 0 ? "text-error" : ""}`}>{count.toLocaleString("en-IN")}</span>
    );
    content = (
      <ul className="-mx-2 space-y-0.5">
        {mine.leads !== null && (
          <li>
            <Link href={`/leads?assigned_to=${me.id}`} className={row}>
              <span>Open leads assigned to me</span>
              {value(mine.leads)}
            </Link>
          </li>
        )}
        {mine.works !== null && (
          <li>
            <Link href={`/works?assigned_to=${me.id}`} className={row}>
              <span>Active Works assigned to me</span>
              {value(mine.works)}
            </Link>
          </li>
        )}
        {(
          [
            ["overdue", "My overdue follow-ups"],
            ["today", "Due today"],
            ["upcoming", "Upcoming"],
            ["pending", "All my pending follow-ups"],
          ] as const
        ).map(([bucket, label]) => (
          <li key={bucket}>
            <button type="button" onClick={() => onFollowUps(bucket)} className={row}>
              <span>{label}</span>
              {value(counts[bucket], bucket === "overdue")}
            </button>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Panel title="My work" description={`Assigned to ${me.name}`}>
      {content}
    </Panel>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  // A record or two still shows a sliver, so a small count never reads as none.
  const width = value === 0 ? 0 : Math.max(3, (value / max) * 100);
  return (
    <span aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-full bg-muted">
      <span className={`block h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
    </span>
  );
}

function LeadOverview({ summary, onAdd }: { summary: Loaded<DashboardSummary>; onAdd: () => void }) {
  let content;
  if (summary.error) {
    content = <ErrorState title="Unable to load the Lead overview" message={summary.error.message} onRetry={summary.reload} />;
  } else if (!summary.data?.leads) {
    content = <Skeleton lines={6} />;
  } else if (summary.data.leads.total === 0) {
    content = (
      <div className="rounded-md border border-dashed border-border-strong px-4 py-8 text-center">
        <p className="text-sm font-medium">No Leads yet</p>
        <button type="button" onClick={onAdd} className={`${secondaryButton} mt-3`}>
          <PlusIcon className="size-4" />
          Add Lead
        </button>
      </div>
    );
  } else {
    const leads = summary.data.leads;
    const max = Math.max(...leads.by_status.map((row) => row.count), 1);
    content = (
      <>
        <ul className="space-y-1">
          {leads.by_status.map((row) => (
            <li key={row.status}>
              <Link
                href={`/leads?status=${row.status}`}
                className="-mx-2 grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <span>
                  <StatusBadge status={row.status} />
                </span>
                <Bar value={row.count} max={max} color="bg-primary/45" />
                <span className="text-right text-sm font-medium tabular-nums">{row.count.toLocaleString("en-IN")}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          {leads.active.toLocaleString("en-IN")} active · {leads.confirmed.toLocaleString("en-IN")} confirmed ·{" "}
          {leads.lost.toLocaleString("en-IN")} lost
        </p>
      </>
    );
  }
  return (
    <Panel
      title="Leads by status"
      action={
        <Link href="/leads/pipeline" className={linkClass}>
          Lead Pipeline
        </Link>
      }
    >
      {content}
    </Panel>
  );
}

function WorkOverview({ stages }: { stages: Loaded<StageSummary[]> }) {
  let content;
  if (stages.error) {
    content = <ErrorState title="Unable to load the Work overview" message={stages.error.message} onRetry={stages.reload} />;
  } else if (!stages.data) {
    content = <Skeleton lines={7} />;
  } else if (stages.data.every((row) => row.count === 0)) {
    content = (
      <div className="rounded-md border border-dashed border-border-strong px-4 py-8 text-center">
        <p className="text-sm font-medium">No Works yet</p>
        <p className="mt-1 text-sm text-muted-foreground">A Work is created when a lead is converted.</p>
      </div>
    );
  } else {
    const max = Math.max(...stages.data.map((row) => row.count), 1);
    const total = stages.data.reduce((sum, row) => sum + Number(row.total_amount), 0);
    content = (
      <>
        <ul className="space-y-1">
          {stages.data.map((row) => {
            const stage = stageFor(row.stage);
            return (
              <li key={row.stage}>
                <Link
                  href={`/works?stage=${row.stage}`}
                  className="-mx-2 grid grid-cols-[minmax(0,12.5rem)_1fr_2.5rem] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${stage.dot}`} />
                    <span className="truncate">{stage.label}</span>
                  </span>
                  <Bar value={row.count} max={max} color={stage.dot} />
                  <span className="text-right text-sm font-medium tabular-nums">{row.count.toLocaleString("en-IN")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          {/* The Works' own confirmed amounts, fixed at conversion: plan price changes never alter them. */}
          Confirmed value {formatMoney(String(total))} across {stages.data.reduce((sum, row) => sum + row.count, 0).toLocaleString("en-IN")}{" "}
          Works
        </p>
      </>
    );
  }
  return (
    <Panel
      title="Works by stage"
      action={
        <Link href="/works/pipeline" className={linkClass}>
          Work Pipeline
        </Link>
      }
    >
      {content}
    </Panel>
  );
}

function RecentList<T extends { id: number }>({
  title,
  recent,
  items,
  empty,
  render,
}: {
  title: string;
  recent: Loaded<RecentRecords>;
  items?: T[] | null;
  empty: string;
  render: (item: T) => ReactNode;
}) {
  let content;
  if (recent.error) {
    content = <ErrorState title={`Unable to load ${title.toLowerCase()}`} message={recent.error.message} onRetry={recent.reload} />;
  } else if (!items) {
    content = <Skeleton lines={5} />;
  } else if (items.length === 0) {
    content = <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  } else {
    content = (
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-2.5">
            {render(item)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Panel title={title} description="Most recently added or changed">
      {content}
    </Panel>
  );
}

function RecentLeads({ recent }: { recent: Loaded<RecentRecords> }) {
  return (
    <RecentList
      title="Recent Leads"
      recent={recent}
      items={recent.data?.leads}
      empty="No Leads yet"
      render={(lead) => (
        <>
          <p className="flex items-start justify-between gap-2 text-sm">
            <Link href={`/leads/${lead.id}`} className="min-w-0 truncate font-medium hover:underline">
              Lead #{lead.id} · {lead.customer_name}
            </Link>
            <StatusBadge status={lead.status} />
          </p>
          <RecordTimes assignee={lead.assigned_to_name} created={lead.created_at} updated={lead.updated_at} />
          <LatestActivityLine latest={lead.latest_activity} />
        </>
      )}
    />
  );
}

function RecentWorks({ recent }: { recent: Loaded<RecentRecords> }) {
  return (
    <RecentList
      title="Recent Works"
      recent={recent}
      items={recent.data?.works}
      empty="No Works yet"
      render={(work) => {
        const stage = stageFor(work.stage);
        return (
          <>
            <p className="flex items-start justify-between gap-2 text-sm">
              <Link href={`/works/${work.id}`} className="min-w-0 truncate font-medium hover:underline">
                Work #{work.id} · {work.customer_name}
              </Link>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${stage.header}`}>
                <span aria-hidden="true" className={`size-1.5 rounded-full ${stage.dot}`} />
                {stage.label}
              </span>
            </p>
            <RecordTimes assignee={work.assigned_to_name} created={work.created_at} updated={work.updated_at} />
            <LatestActivityLine latest={work.latest_activity} />
          </>
        );
      }}
    />
  );
}

function RecordTimes({ assignee, created, updated }: { assignee: string | null; created: string; updated: string }) {
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      <span>Assigned: {assignee ?? "Unassigned"}</span>
      <span title={formatExact(created)}>Added {formatShortDateTime(created)}</span>
      <span title={formatExact(updated)}>Updated {formatShortDateTime(updated)}</span>
    </p>
  );
}
