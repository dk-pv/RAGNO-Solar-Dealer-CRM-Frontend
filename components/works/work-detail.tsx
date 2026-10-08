"use client";

import Link from "next/link";
import { useContext, useEffect, useState } from "react";

import { ChevronLeftIcon, FileIcon, PencilIcon, PhoneIcon, PlusIcon, WhatsAppIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, formatPhone, telHref, whatsappHref, type Assignee } from "@/components/leads/api";
import { Details } from "@/components/leads/lead-detail";
import { ErrorState, iconButton, secondaryButton, useNotice } from "@/components/leads/ui";
import { useApi } from "@/lib/api";
import { stageFor, type Work } from "./api";
import { WorkActivities } from "./work-activities";
import { WorkPinButton, isOverdue, useWorkActions } from "./work-actions";
import { DocumentStatus } from "./work-documents";

const outlinedIcon = `${iconButton} size-9 border border-border`;

// One Work: its customer, plan and confirmed amount, where it is in the pipeline, and every activity, as the lead page
// shows a lead.
export function WorkDetail({ id }: { id: number }) {
  const { data: work, error, reload } = useApi<Work>(`/works/${id}/`);
  const assignees = useApi<Assignee[]>("/works/assignees/");
  const [activitiesVersion, setActivitiesVersion] = useState(0);
  const [noticeElement, notify] = useNotice();
  const me = useContext(CurrentUserContext);
  const actions = useWorkActions(
    notify,
    () => {
      reload();
      setActivitiesVersion((version) => version + 1);
    },
    assignees,
  );
  const loaded = work !== undefined;

  // Links to #activities (the list's next follow-up, the board's cards, the dashboard, notifications) need the section,
  // which exists only once the Work has loaded.
  useEffect(() => {
    if (loaded && window.location.hash === "#activities") document.getElementById("activities")?.scrollIntoView();
  }, [loaded]);

  if (!work) {
    return (
      <div>
        <BackLink />
        {error ? (
          <div className="mt-4 rounded-lg border border-border bg-background">
            {error.status === 404 ? (
              <ErrorState title="Work not found" message="This Work doesn't exist, or you don't have access to it." />
            ) : (
              <ErrorState title="Couldn't load this Work" message={error.message} onRetry={reload} />
            )}
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading Work" className="mt-4 space-y-3">
            {["w-56", "w-40", "w-full", "w-full", "w-2/3"].map((width, index) => (
              <span key={index} className={`block h-4 animate-pulse rounded bg-subtle motion-reduce:animate-none ${width}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const stage = stageFor(work.stage);
  const overdue = isOverdue(work);
  // The lead's page needs the Leads module.
  const canOpenLeads = me?.role === "ADMIN" || me?.modules.includes("leads");

  return (
    <div>
      <BackLink />
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold break-words">{work.customer_name}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${stage.header}`}>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${stage.dot}`} />
              {stage.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Work #{work.id} · Converted {formatDate(work.created_at)} from{" "}
            {canOpenLeads ? (
              <Link href={`/leads/${work.lead}`} className="text-link underline-offset-2 hover:underline">
                Lead #{work.lead}
              </Link>
            ) : (
              `Lead #${work.lead}`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <WorkPinButton work={work} actions={actions} className="size-9 border border-border" />
          <a
            href={whatsappHref(work)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${work.customer_name} (opens in a new tab)`}
            title="WhatsApp"
            className={outlinedIcon}
          >
            <WhatsAppIcon className="size-4.5" />
          </a>
          <a href={telHref(work)} aria-label={`Call ${work.customer_name}`} title="Call" className={outlinedIcon}>
            <PhoneIcon className="size-4.5" />
          </a>
          <Link href={`/works/${work.id}/documents`} className={secondaryButton}>
            <FileIcon className="size-4" />
            Documents
          </Link>
          <button type="button" onClick={() => actions.addActivity(work)} className={secondaryButton}>
            <PlusIcon className="size-4" />
            Add follow-up
          </button>
          <button type="button" onClick={() => actions.edit(work)} className={secondaryButton}>
            <PencilIcon className="size-4" />
            Edit
          </button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-8">
          <Details
            title="Customer"
            items={[
              ["Phone", formatPhone(work)],
              ["Email", work.email || "—"],
            ]}
          />
          <Details
            title="Location"
            items={[
              ["Area / locality", work.area || "—"],
              ["District", work.district || "—"],
              ["State", work.state || "—"],
              ["PIN code", work.pin_code || "—"],
            ]}
          />
          <Details
            title="Solar plan"
            items={[
              ["Plan", work.plan_name],
              ["Confirmed amount", <span key="amount" className="tabular-nums">{formatMoney(work.amount)}</span>],
            ]}
          />
          <WorkActivities
            key={activitiesVersion}
            work={work}
            assignees={assignees}
            notify={notify}
            onAdd={() => actions.addActivity(work)}
            onChanged={reload}
          />
        </div>

        <aside className="order-first space-y-6 max-lg:border-b max-lg:border-border max-lg:pb-6 lg:order-none lg:border-l lg:border-border lg:pl-6">
          <section>
            <h2 className="text-sm font-semibold">Pipeline</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Stage</dt>
                <dd className="mt-0.5">{stage.label}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assigned staff</dt>
                <dd className="mt-0.5">{work.assigned_to_name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Due date</dt>
                <dd className={`mt-0.5 ${overdue ? "font-medium text-error" : ""}`}>
                  {work.due_date ? `${formatDate(work.due_date)}${overdue ? " · Overdue" : ""}` : "—"}
                </dd>
              </div>
            </dl>
            <button type="button" onClick={() => actions.edit(work)} className={`${secondaryButton} mt-4 w-full`}>
              <PencilIcon className="size-4" />
              Change stage, staff or due date
            </button>
          </section>
          <section className="border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Documents</h2>
            <p className="mt-3 text-sm tabular-nums">
              {work.document_summary.completed_count} of {work.document_summary.required_count} provided
            </p>
            <DocumentStatus work={work} className="mt-1" />
            <Link href={`/works/${work.id}/documents`} className={`${secondaryButton} mt-4 w-full`}>
              <FileIcon className="size-4" />
              Open documents
            </Link>
          </section>
        </aside>
      </div>

      {actions.dialogs}
      {noticeElement}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/works" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-2">
      <ChevronLeftIcon className="size-4" />
      All works
    </Link>
  );
}
