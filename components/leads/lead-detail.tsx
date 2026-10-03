"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";

import {
  CalendarIcon,
  ChevronLeftIcon,
  FlagIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  WhatsAppIcon,
} from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { toApiError, useApi } from "@/lib/api";
import {
  convertBlocker,
  deleteActivity,
  deleteLead,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  isOverdue,
  sourceLabel,
  statusBlocker,
  statusLabel,
  telHref,
  updateActivity,
  whatsappHref,
  type Activity,
  type Lead,
  type Page,
} from "./api";
import { FollowUpDialog } from "./follow-ups";
import { ConvertDialog, LeadFormDialog, StatusDialog } from "./lead-dialogs";
import {
  ErrorState,
  FollowUpBadge,
  PinButton,
  StatusBadge,
  iconButton,
  primaryButton,
  secondaryButton,
  secondaryDangerButton,
  useNotice,
} from "./ui";

const outlinedIcon = `${iconButton} size-9 border border-border`;

export function LeadDetail({ id }: { id: number }) {
  const { data: lead, error, reload } = useApi<Lead>(`/leads/${id}/`);
  // Pending first (then newest), so none still to do is ever past the cut-off.
  const activities = useApi<Page<Activity>>(`/activities/?lead=${id}&ordering=status&page_size=100`);
  const [editing, setEditing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [converting, setConverting] = useState(false);
  const [noticeElement, notify] = useNotice();
  const router = useRouter();
  // The Work module (Settings -> Roles & Access) opens the Works list, where the lead's Work is found by its number.
  const canOpenWorks = useContext(CurrentUserContext)?.modules.includes("work") ?? false;
  const loaded = lead !== undefined;

  // The Follow-up / Activity action links to #activities, which exists only once the lead has loaded.
  useEffect(() => {
    if (loaded && window.location.hash === "#activities") document.getElementById("activities")?.scrollIntoView();
  }, [loaded]);

  function refresh() {
    reload();
    activities.reload();
  }

  if (!lead) {
    return (
      <div>
        <BackLink />
        {error ? (
          <div className="mt-4 rounded-lg border border-border bg-background">
            {error.status === 404 ? (
              <ErrorState title="Lead not found" message="This lead doesn't exist, or you don't have access to it." />
            ) : (
              <ErrorState title="Couldn't load this lead" message={error.message} onRetry={reload} />
            )}
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading lead" className="mt-4 space-y-3">
            {["w-56", "w-40", "w-full", "w-full", "w-2/3"].map((width, index) => (
              <span key={index} className={`block h-4 animate-pulse rounded bg-subtle motion-reduce:animate-none ${width}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const whatsapp = whatsappHref(lead);
  const tel = telHref(lead);

  async function removeLead(target: Lead) {
    if (!window.confirm(`Delete ${target.name}? The lead and its activities are removed for good.`)) return;
    try {
      await deleteLead(target.id);
      router.push("/leads");
    } catch (err) {
      notify({ text: toApiError(err).message, error: true });
    }
  }

  return (
    <div>
      <BackLink />
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold break-words">{lead.name}</h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead #{lead.id} · Added {formatDate(lead.created_at)}
            {lead.created_by_name ? ` by ${lead.created_by_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <PinButton
            lead={lead}
            onChanged={reload}
            onError={(text) => notify({ text, error: true })}
            className="size-9 border border-border"
          />
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${lead.name} (opens in a new tab)`}
            title="WhatsApp"
            className={outlinedIcon}
          >
            <WhatsAppIcon className="size-4.5" />
          </a>
          <a href={tel} aria-label={`Call ${lead.name}`} title="Call" className={outlinedIcon}>
            <PhoneIcon className="size-4.5" />
          </a>
          <a href="#activities" className={secondaryButton}>
            <CalendarIcon className="size-4" />
            Follow-up / Activity
          </a>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={!lead.can_edit}
            title={lead.can_edit ? undefined : "You can view this lead but not change it"}
            className={secondaryButton}
          >
            <PencilIcon className="size-4" />
            Edit
          </button>
          {lead.can_delete && (
            <button type="button" onClick={() => removeLead(lead)} className={secondaryDangerButton}>
              <TrashIcon className="size-4" />
              Delete
            </button>
          )}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-8">
          <Details
            title="Customer"
            items={[
              ["Phone", formatPhone(lead)],
              ["Email", lead.email || "—"],
            ]}
          />
          <Details
            title="Location"
            items={[
              ["Area / locality", lead.area || "—"],
              ["District", lead.district || "—"],
              ["State", lead.state || "—"],
              ["PIN code", lead.pin_code || "—"],
            ]}
          />
          <Details
            title="Solar plan"
            items={[
              ["Plan", lead.plan_name ?? "—"],
              ["Amount", <span key="amount" className="tabular-nums">{formatMoney(lead.amount)}</span>],
            ]}
          />
          <Details
            title="Lead"
            items={[
              ["Lead source", lead.source ? sourceLabel(lead.source) : "—"],
              ["Assigned staff", lead.assigned_to_name ?? "Unassigned"],
            ]}
          />
          {lead.notes && (
            <section>
              <h2 className="text-sm font-semibold">Notes</h2>
              <p className="mt-2 text-sm break-words whitespace-pre-line">{lead.notes}</p>
            </section>
          )}
          <Activities
            activities={activities}
            lead={lead}
            onScheduleFollowUp={() => setEditing(true)}
            notify={(text, error) => notify({ text, error })}
          />
        </div>

        <aside className="order-first space-y-6 max-lg:border-b max-lg:border-border max-lg:pb-6 lg:order-none lg:border-l lg:border-border lg:pl-6">
          <section>
            <h2 className="text-sm font-semibold">Status</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {statusBlocker(lead) ?? "Move the lead forward, or mark it Won or Lost."}
            </p>
            <button
              type="button"
              onClick={() => setUpdatingStatus(true)}
              disabled={!!statusBlocker(lead)}
              className={`${secondaryButton} mt-3 w-full`}
            >
              <FlagIcon className="size-4" />
              Update Status
            </button>
          </section>
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Conversion</h2>
            {lead.work ? (
              <>
                <p className="mt-2 text-sm">Converted to Work #{lead.work} for the installation.</p>
                {canOpenWorks && (
                  <Link href={`/works?search=%23${lead.work}`} className={`${secondaryButton} mt-3 w-full`}>
                    View Work #{lead.work}
                  </Link>
                )}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {convertBlocker(lead) ?? "The lead is Won. Convert it to create its Work for the installation."}
                </p>
                <button
                  type="button"
                  onClick={() => setConverting(true)}
                  disabled={!lead.can_convert}
                  className={`${primaryButton} mt-3 w-full`}
                >
                  Convert to Work
                </button>
              </>
            )}
          </section>
        </aside>
      </div>

      {editing && (
        <LeadFormDialog
          lead={lead}
          onClose={() => setEditing(false)}
          onError={(text) => notify({ text, error: true })}
          onSaved={(saved) => {
            notify({ text: `Saved changes to ${saved.name}.` });
            refresh();
          }}
        />
      )}
      {updatingStatus && (
        <StatusDialog
          lead={lead}
          onClose={() => setUpdatingStatus(false)}
          onChanged={(updated) => {
            notify({ text: `Status changed to ${statusLabel(updated.status)}.` });
            refresh();
          }}
        />
      )}
      {converting && (
        <ConvertDialog
          lead={lead}
          onClose={() => setConverting(false)}
          onConverted={(converted) => {
            notify({ text: `Converted ${converted.name}${converted.work ? ` to Work #${converted.work}` : ""}.` });
            refresh();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeftIcon className="size-4" />
      All leads
    </Link>
  );
}

export function Details({ title, items }: { title: string; items: [string, ReactNode][] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type ActivitiesProps = {
  activities: ReturnType<typeof useApi<Page<Activity>>>;
  lead: Lead;
  onScheduleFollowUp: () => void;
  notify: (text: string, error?: boolean) => void;
};

const linkButton = "font-medium text-foreground underline-offset-2 hover:underline aria-disabled:opacity-50";

// The lead's follow-ups, each Pending until marked Completed (which is final). Whoever can edit the lead (an admin, or
// the staff member it's assigned to) adds, completes, edits and deletes them; the API applies the same rules.
function Activities({ activities, lead, onScheduleFollowUp, notify }: ActivitiesProps) {
  const { data, error, loading, reload } = activities;
  const [dialog, setDialog] = useState<{ activity?: Activity }>(); // the open Add or Edit Follow-up dialog
  const [busyId, setBusyId] = useState<number>();
  const [actionError, setActionError] = useState<string>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function run(activity: Activity, action: () => Promise<unknown>, done: string) {
    setBusyId(activity.id);
    setActionError(undefined);
    try {
      await action();
      reload();
      notify(done);
    } catch (err) {
      setActionError(toApiError(err).message);
    } finally {
      setBusyId(undefined);
    }
  }

  function remove(activity: Activity) {
    if (!window.confirm(`Delete the follow-up "${heading(activity)}"?`)) return;
    run(
      activity,
      async () => {
        await deleteActivity(activity.id);
        headingRef.current?.focus();
      },
      "Follow-up deleted.",
    );
  }

  let content;
  if (error?.status === 404) {
    // The Activities API isn't on this server; not something the user can retry.
    content = <p className="mt-4 text-sm text-muted-foreground">Follow-ups aren&apos;t available yet.</p>;
  } else if (error) {
    content = (
      <div className="mt-3 rounded-lg border border-border bg-background">
        <ErrorState title="Couldn't load follow-ups" message={error.message} onRetry={reload} />
      </div>
    );
  } else if (!data) {
    content = <p className="mt-4 text-sm text-muted-foreground">Loading follow-ups…</p>;
  } else if (data.results.length === 0) {
    content = <p className="mt-4 text-sm text-muted-foreground">No follow-ups for this lead yet.</p>;
  } else {
    content = (
      <>
        <ol aria-busy={loading} className="mt-4 space-y-4 border-l border-border pl-5">
          {data.results.map((activity) => {
            const overdue = isOverdue(activity);
            return (
              <li key={activity.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 -left-[24.5px] size-2 rounded-full ${
                    activity.status === "COMPLETED" ? "bg-success" : overdue ? "bg-error" : "bg-muted-foreground"
                  }`}
                />
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium break-words">
                    {activity.title || <span className="font-normal text-muted-foreground italic">No heading</span>}
                  </span>
                  <FollowUpBadge status={activity.status} />
                  {overdue && <span className="text-xs font-medium text-error">Overdue</span>}
                </p>
                <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline">Type: </dt>
                    <dd className="inline text-foreground">{activity.type_display}</dd>
                  </div>
                  <div>
                    <dt className="inline">Assigned: </dt>
                    <dd className="inline text-foreground">{activity.assigned_to_name ?? "Not assigned"}</dd>
                  </div>
                  <div>
                    <dt className="inline">Due: </dt>
                    <dd className={`inline ${overdue ? "font-medium text-error" : "text-foreground"}`}>
                      {activity.due_date ? formatDate(activity.due_date) : "No date"}
                    </dd>
                  </div>
                </dl>
                {activity.description && (
                  <p className="mt-1 text-sm break-words whitespace-pre-line text-muted-foreground">{activity.description}</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>
                    Added {formatDateTime(activity.created_at)}
                    {activity.created_by_name ? ` · ${activity.created_by_name}` : ""}
                  </span>
                  {activity.can_edit && (
                    <>
                      {activity.status === "PENDING" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (busyId === activity.id) return;
                            run(
                              activity,
                              async () => {
                                await updateActivity(activity.id, { status: "COMPLETED" });
                                // The button goes away once it's completed, so the focus moves to the list's heading.
                                headingRef.current?.focus();
                              },
                              "Follow-up marked complete.",
                            );
                          }}
                          // aria-disabled, not disabled, while saving: a disabled button would drop the focus.
                          aria-disabled={busyId === activity.id || undefined}
                          aria-label={`Mark complete: ${heading(activity)}`}
                          className={linkButton}
                        >
                          Mark complete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDialog({ activity })}
                        aria-label={`Edit follow-up: ${heading(activity)}`}
                        className={linkButton}
                      >
                        Edit
                      </button>
                    </>
                  )}
                  {activity.can_delete && (
                    <button
                      type="button"
                      onClick={() => remove(activity)}
                      aria-label={`Delete follow-up: ${heading(activity)}`}
                      className="font-medium text-error underline-offset-2 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
        {data.count > data.results.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {data.results.length} of {data.count} follow-ups, pending first.
          </p>
        )}
      </>
    );
  }

  return (
    <section id="activities" className="scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
          Follow-ups / Activities
        </h2>
        {lead.can_edit && !error && (
          <button type="button" onClick={() => setDialog({})} className={secondaryButton}>
            <PlusIcon className="size-4" />
            Add follow-up
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-background px-4 py-3 text-sm">
        <CalendarIcon className="size-4 text-muted-foreground" />
        <span>
          Next follow-up:{" "}
          <span className="font-medium">{lead.next_follow_up ? formatDate(lead.next_follow_up) : "Not scheduled"}</span>
        </span>
        {lead.can_edit && (
          <button
            type="button"
            onClick={onScheduleFollowUp}
            className="ml-auto text-sm font-medium underline-offset-2 hover:underline"
          >
            {lead.next_follow_up ? "Change" : "Schedule"}
          </button>
        )}
      </div>
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-error">
          {actionError}
        </p>
      )}
      {content}
      {dialog && (
        <FollowUpDialog
          activity={dialog.activity}
          lead={lead}
          onClose={() => setDialog(undefined)}
          onError={(text) => notify(text, true)}
          onSaved={() => {
            reload();
            notify(dialog.activity ? "Follow-up saved." : "Follow-up created.");
          }}
        />
      )}
    </section>
  );
}

const heading = (activity: Activity) => activity.title || activity.type_display;
