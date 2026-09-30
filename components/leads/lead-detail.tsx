"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

import { CalendarIcon, ChevronLeftIcon, PencilIcon, PhoneIcon, WhatsAppIcon } from "@/components/layout/icons";
import { toApiError, useApi } from "@/lib/api";
import {
  LEAD_STATUSES,
  canConvert,
  changeLeadStatus,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPhone,
  sourceLabel,
  statusLabel,
  telHref,
  whatsappHref,
  type Activity,
  type Lead,
  type LeadStatus,
  type Page,
} from "./api";
import { ConvertDialog, LeadFormDialog } from "./lead-dialogs";
import { ErrorState, PinButton, StatusBadge, iconButton, inputClass, primaryButton, secondaryButton, useNotice } from "./ui";

const outlinedIcon = `${iconButton} size-9 border border-border`;

export function LeadDetail({ id }: { id: number }) {
  const { data: lead, error, reload } = useApi<Lead>(`/leads/${id}/`);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [activitiesVersion, setActivitiesVersion] = useState(0);
  const [noticeElement, notify] = useNotice();
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
              <span key={index} className={`block h-4 animate-pulse rounded bg-muted motion-reduce:animate-none ${width}`} />
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
          <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
            <PencilIcon className="size-4" />
            Edit
          </button>
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
            leadId={lead.id}
            nextFollowUp={lead.next_follow_up}
            onScheduleFollowUp={() => setEditing(true)}
          />
        </div>

        <aside className="space-y-6 lg:border-l lg:border-border lg:pl-6">
          <section>
            <h2 className="text-sm font-semibold">Status</h2>
            <StatusChange
              lead={lead}
              onChanged={(updated) => {
                notify({ text: `Status changed to ${statusLabel(updated.status)}.` });
                refresh();
              }}
            />
          </section>
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Conversion</h2>
            {lead.status === "WON" ? (
              <p className="mt-2 text-sm">
                Converted.{lead.work ? ` Work #${lead.work} was created for the installation.` : ""}
              </p>
            ) : canConvert(lead) ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  When the customer confirms, convert the lead: it becomes Won and a Work is created for the installation.
                </p>
                <button type="button" onClick={() => setConverting(true)} className={`${primaryButton} mt-3 w-full`}>
                  Convert to Work
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">This lead can&apos;t be converted in its current status.</p>
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
      {converting && (
        <ConvertDialog
          lead={lead}
          onClose={() => setConverting(false)}
          onConverted={(converted) => {
            notify({ text: `${converted.name} is now Won${converted.work ? `. Work #${converted.work} was created.` : "."}` });
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

// Offers only the moves the backend allows for this lead (allowed_transitions); the API validates the change again.
function StatusChange({ lead, onChanged }: { lead: Lead; onChanged: (lead: Lead) => void }) {
  const formId = useId();
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  // Won is reached only through conversion, which also creates the Work.
  const options = LEAD_STATUSES.filter((item) => item.value !== "WON" && lead.allowed_transitions.includes(item.value));

  if (options.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No status changes are available for this lead.</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const updated = await changeLeadStatus(lead.id, status as LeadStatus);
      setStatus("");
      onChanged(updated);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div>
        <label htmlFor={`${formId}-status`} className="mb-1.5 block text-sm">
          Move to
        </label>
        <select
          id={`${formId}-status`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          required
          className={inputClass}
        >
          <option value="">Choose a status</option>
          {options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {status === "LOST" && (
        <p className="text-xs text-muted-foreground">Lost is a final outcome. The lead and its history are kept.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={!status || pending} className={`${secondaryButton} w-full`}>
        {pending ? "Updating…" : "Update status"}
      </button>
    </form>
  );
}

type ActivitiesProps = { leadId: number; nextFollowUp: string | null; onScheduleFollowUp: () => void };

// Read-only for now: the Activity form is a separate task. Activities are shared by Leads and Works (see /api/activities/).
function Activities({ leadId, nextFollowUp, onScheduleFollowUp }: ActivitiesProps) {
  const { data, error, loading, reload } = useApi<Page<Activity>>(`/activities/?lead=${leadId}`);

  let content;
  if (error?.status === 404) {
    // The Activities module isn't on the server yet; this isn't a failure the user can retry.
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
              <p className="text-sm">
                <span className="font-medium">{activity.type_display}</span>
                {activity.description && <span className="text-muted-foreground"> — {activity.description}</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(activity.created_at)}
                {activity.created_by_name ? ` · ${activity.created_by_name}` : ""}
              </p>
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
          <span className="font-medium">{nextFollowUp ? formatDate(nextFollowUp) : "Not scheduled"}</span>
        </span>
        <button
          type="button"
          onClick={onScheduleFollowUp}
          className="ml-auto text-sm font-medium underline-offset-2 hover:underline"
        >
          {nextFollowUp ? "Change" : "Schedule"}
        </button>
      </div>
      {content}
    </section>
  );
}
