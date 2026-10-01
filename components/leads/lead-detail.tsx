"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

import {
  CalendarIcon,
  ChevronLeftIcon,
  FlagIcon,
  PencilIcon,
  PhoneIcon,
  TrashIcon,
  WhatsAppIcon,
} from "@/components/layout/icons";
import { toApiError, useApi } from "@/lib/api";
import {
  ACTIVITY_TYPES,
  addActivity,
  convertBlocker,
  deleteActivity,
  deleteLead,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  sourceLabel,
  statusBlocker,
  statusLabel,
  telHref,
  updateActivity,
  whatsappHref,
  type Activity,
  type ActivityType,
  type Lead,
  type Page,
} from "./api";
import { ConvertDialog, LeadFormDialog, StatusDialog } from "./lead-dialogs";
import {
  ErrorState,
  PinButton,
  StatusBadge,
  fieldClass,
  iconButton,
  primaryButton,
  secondaryButton,
  useNotice,
} from "./ui";

const outlinedIcon = `${iconButton} size-9 border border-border`;

export function LeadDetail({ id }: { id: number }) {
  const { data: lead, error, reload } = useApi<Lead>(`/leads/${id}/`);
  const [editing, setEditing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [converting, setConverting] = useState(false);
  const [activitiesVersion, setActivitiesVersion] = useState(0);
  const [noticeElement, notify] = useNotice();
  const router = useRouter();
  const loaded = lead !== undefined;

  // The Follow-up / Activity action links to #activities, which exists only once the lead has loaded.
  useEffect(() => {
    if (loaded && window.location.hash === "#activities") document.getElementById("activities")?.scrollIntoView();
  }, [loaded]);

  function refresh() {
    reload();
    setActivitiesVersion((version) => version + 1);
  }

  if (!lead) {
    return (
      <div>
        <BackLink />
        {error ? (
          <div className="mt-4 rounded-lg border border-border">
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
            <button type="button" onClick={() => removeLead(lead)} className={`${secondaryButton} text-error`}>
              <TrashIcon className="size-4" />
              Delete
            </button>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
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
            key={activitiesVersion}
            lead={lead}
            onScheduleFollowUp={() => setEditing(true)}
          />
        </div>

        <aside className="space-y-6 lg:border-l lg:border-border lg:pl-6">
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
              <p className="mt-2 text-sm">Converted to Work #{lead.work} for the installation.</p>
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

function Details({ title, items }: { title: string; items: [string, ReactNode][] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
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

type ActivitiesProps = { lead: Lead; onScheduleFollowUp: () => void };

// The lead's activity log. Whoever can edit the lead (an admin, or the staff member it's assigned to) adds, edits and
// deletes its activities; the API applies the same rule.
function Activities({ lead, onScheduleFollowUp }: ActivitiesProps) {
  const { data, error, loading, reload } = useApi<Page<Activity>>(`/activities/?lead=${lead.id}`);
  const [editingId, setEditingId] = useState<number>();
  const [actionError, setActionError] = useState<string>();

  async function remove(activity: Activity) {
    if (!window.confirm(`Delete this ${activity.type_display.toLowerCase()} activity?`)) return;
    setActionError(undefined);
    try {
      await deleteActivity(activity.id);
      reload();
    } catch (err) {
      setActionError(toApiError(err).message);
    }
  }

  let content;
  if (error?.status === 404) {
    // The Activities API isn't on this server; not something the user can retry.
    content = <p className="mt-4 text-sm text-muted-foreground">Activity history isn&apos;t available yet.</p>;
  } else if (error) {
    content = (
      <div className="mt-3 rounded-lg border border-border">
        <ErrorState title="Couldn't load activities" message={error.message} onRetry={reload} />
      </div>
    );
  } else if (!data || loading) {
    content = <p className="mt-4 text-sm text-muted-foreground">Loading activities…</p>;
  } else if (data.results.length === 0) {
    content = <p className="mt-4 text-sm text-muted-foreground">No activities recorded for this lead yet.</p>;
  } else {
    content = (
      <>
        <ol className="mt-4 space-y-4 border-l border-border pl-5">
          {data.results.map((activity) => (
            <li key={activity.id} className="relative">
              <span aria-hidden="true" className="absolute top-1.5 -left-[24.5px] size-2 rounded-full bg-muted-foreground" />
              {editingId === activity.id ? (
                <ActivityForm
                  initial={activity}
                  submitLabel="Save"
                  onSubmit={(type, description) => updateActivity(activity.id, type, description)}
                  onDone={() => {
                    setEditingId(undefined);
                    reload();
                  }}
                  onCancel={() => setEditingId(undefined)}
                />
              ) : (
                <>
                  <p className="text-sm">
                    <span className="font-medium">{activity.type_display}</span>
                    <span className="text-muted-foreground"> — {activity.description}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>
                      {formatDateTime(activity.created_at)}
                      {activity.created_by_name ? ` · ${activity.created_by_name}` : ""}
                    </span>
                    {lead.can_edit && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingId(activity.id)}
                          aria-label={`Edit ${activity.type_display} activity`}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(activity)}
                          aria-label={`Delete ${activity.type_display} activity`}
                          className="font-medium text-error underline-offset-2 hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </p>
                </>
              )}
            </li>
          ))}
        </ol>
        {data.count > data.results.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the {data.results.length} most recent of {data.count} activities.
          </p>
        )}
      </>
    );
  }

  return (
    <section id="activities" className="scroll-mt-20">
      <h2 className="text-sm font-semibold">Follow-up / Activity</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-4 py-3 text-sm">
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
      {lead.can_edit && !error && (
        <ActivityForm
          submitLabel="Add activity"
          onSubmit={(type, description) => addActivity(lead.id, type, description)}
          onDone={reload}
        />
      )}
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-error">
          {actionError}
        </p>
      )}
      {content}
    </section>
  );
}

type ActivityFormProps = {
  initial?: Activity;
  submitLabel: string;
  onSubmit: (type: ActivityType, description: string) => Promise<unknown>;
  onDone: () => void;
  onCancel?: () => void;
};

// Adds an activity, or edits one when `initial` is given.
function ActivityForm({ initial, submitLabel, onSubmit, onDone, onCancel }: ActivityFormProps) {
  const formId = useId();
  const [type, setType] = useState<ActivityType>(initial?.type ?? "PHONE_CALL");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim()) {
      setError("Describe what happened.");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await onSubmit(type, description.trim());
      if (!initial) setDescription("");
      onDone();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label htmlFor={`${formId}-type`} className="sr-only">
        Activity type
      </label>
      <select
        id={`${formId}-type`}
        value={type}
        onChange={(event) => setType(event.target.value as ActivityType)}
        className={`${fieldClass} h-9`}
      >
        {ACTIVITY_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <label htmlFor={`${formId}-description`} className="sr-only">
        What happened
      </label>
      <textarea
        id={`${formId}-description`}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={2}
        placeholder="What happened, or what was agreed"
        className={`${fieldClass} w-full py-2`}
      />
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={secondaryButton}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
