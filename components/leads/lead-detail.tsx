"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { CompleteActivityDialog } from "@/components/complete-activity-dialog";
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
import { ActionDialog } from "@/components/selection";
import { useApi } from "@/lib/api";
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
  whatsappHref,
  withRow,
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
  const [deleting, setDeleting] = useState(false);
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
            <button type="button" onClick={() => setDeleting(true)} className={secondaryDangerButton}>
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
              <p className="mt-2 max-w-4xl text-sm break-words whitespace-pre-line">{lead.notes}</p>
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
      {deleting && (
        <ActionDialog
          destructive
          title={`Delete ${lead.name}?`}
          description="The lead and its activities are removed for good."
          confirmLabel="Delete lead"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            await deleteLead(lead.id);
            router.push("/leads");
          }}
          onClose={() => setDeleting(false)}
          onError={(text) => notify({ text, error: true })}
        />
      )}
      {noticeElement}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-2">
      <ChevronLeftIcon className="size-4" />
      All leads
    </Link>
  );
}

export function Details({ title, items }: { title: string; items: [string, ReactNode][] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {/* One column on a phone and two from sm, as on a laptop; from 2xl, as many as fit (more on a wide screen).
          auto-fill keeps empty tracks, so fields keep their width instead of spreading across the page and every
          section's columns line up. */}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 2xl:grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))]">
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

const linkButton = "font-medium text-foreground underline-offset-2 hover:underline pointer-coarse:py-2";

// The lead's follow-ups, each Pending until marked Completed (which is final). Admins add, edit and delete them; the
// staff member one is assigned to, or an admin, completes it. The API applies the same rules.
function Activities({ activities, lead, onScheduleFollowUp, notify }: ActivitiesProps) {
  const { data, error, loading, reload, replace } = activities;
  const [dialog, setDialog] = useState<{ activity?: Activity }>(); // the open Add or Edit Follow-up dialog
  const [deleting, setDeleting] = useState<Activity>();
  const [completing, setCompleting] = useState<Activity>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

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
                  // Centred on the list's 1px line at any text size: the padding plus half the dot, plus half the line.
                  className={`absolute top-1.5 -left-[calc(1.5rem+0.5px)] size-2 rounded-full ${
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
                {activity.completion_note && (
                  <p className="mt-1 text-sm break-words whitespace-pre-line text-muted-foreground">
                    <span className="font-medium text-label">Completion note:</span> {activity.completion_note}
                  </p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span>
                    Added {formatDateTime(activity.created_at)}
                    {activity.created_by_name ? ` · ${activity.created_by_name}` : ""}
                  </span>
                  {activity.status === "PENDING" && activity.can_update_status && (
                    <button
                      type="button"
                      onClick={() => setCompleting(activity)}
                      aria-label={`Mark as Completed: ${heading(activity)}`}
                      className={linkButton}
                    >
                      Mark as Completed
                    </button>
                  )}
                  {activity.can_edit && (
                    <button
                      type="button"
                      onClick={() => setDialog({ activity })}
                      aria-label={`Edit follow-up: ${heading(activity)}`}
                      className={linkButton}
                    >
                      Edit
                    </button>
                  )}
                  {activity.can_delete && (
                    <button
                      type="button"
                      onClick={() => setDeleting(activity)}
                      aria-label={`Delete follow-up: ${heading(activity)}`}
                      className="font-medium text-error underline-offset-2 hover:underline pointer-coarse:py-2"
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
    // A readable line length on a wide screen, with Change and Add follow-up kept near the list.
    <section id="activities" className="max-w-4xl scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold">
          Follow-ups / Activities
        </h2>
        {isAdmin && !error && (
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
            className="ml-auto text-sm font-medium underline-offset-2 hover:underline pointer-coarse:py-2"
          >
            {lead.next_follow_up ? "Change" : "Schedule"}
          </button>
        )}
      </div>
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
      {deleting && (
        <ActionDialog
          destructive
          title="Delete this follow-up?"
          description={`"${heading(deleting)}" will be removed for good.`}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            await deleteActivity(deleting.id);
            reload();
            notify("Follow-up deleted.");
          }}
          onClose={() => {
            setDeleting(undefined);
            headingRef.current?.focus(); // the row, and the button that opened this, may be gone
          }}
          onError={(text) => notify(text, true)}
        />
      )}
      {completing && (
        <CompleteActivityDialog
          activity={completing}
          label={`"${heading(completing)}" for ${completing.lead_name}`}
          onCompleted={(saved) => {
            if (data) replace(withRow(data, saved)); // shows Completed at once, so it can't be completed twice
            reload();
            notify("Follow-up marked complete.");
          }}
          onClose={(completed) => {
            setCompleting(undefined);
            // Its Mark as Completed button is gone, so the focus moves to the list's heading.
            if (completed) headingRef.current?.focus();
          }}
          onError={(text) => notify(text, true)}
        />
      )}
    </section>
  );
}

const heading =(activity: Activity) => activity.title || activity.type_display;
