"use client";

import Link from "next/link";
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { CloseIcon, FileIcon, MoreIcon, PencilIcon, PhoneIcon, PinIcon, PlusIcon, WhatsAppIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, formatPhone, telHref, whatsappHref, type Assignee } from "@/components/leads/api";
import { Field, Section, dialogClass } from "@/components/leads/lead-dialogs";
import { menuItemClass, placeMenu } from "@/components/leads/lead-actions";
import { Busy, iconButton, inputClass, primaryButton, secondaryButton } from "@/components/leads/ui";
import { toApiError, type ApiError } from "@/lib/api";
import { WORK_STAGES, today, updateWork, type Work, type WorkChanges, type WorkStage } from "./api";
import { ActivityDialog } from "./work-activities";

type Notify = (notice: { text: string; error?: boolean }) => void;
type Assignees = { data?: Assignee[]; error?: ApiError };
export type WorkActions = ReturnType<typeof useWorkActions>;

export const isOverdue = (work: Work) => work.due_date !== null && work.stage !== "COMPLETED" && work.due_date < today();

// Edit, add a follow-up and pin, with their dialogs: what the board's cards, the list's rows and the Work's page do.
// Render `dialogs` once on the page; `onChanged` reloads after any change, with the Work before and after it.
export function useWorkActions(notify: Notify, onChanged: (before: Work, after: Work) => void, assignees: Assignees) {
  const [editing, setEditing] = useState<Work>();
  const [adding, setAdding] = useState<Work>();

  async function togglePin(work: Work) {
    try {
      onChanged(work, await updateWork(work.id, { is_pinned: !work.is_pinned }));
    } catch (error) {
      notify({ text: `Couldn't ${work.is_pinned ? "unpin" : "pin"} ${work.customer_name}. ${toApiError(error).message}`, error: true });
    }
  }

  const dialogs = (
    <>
      {editing && (
        <WorkDialog
          work={editing}
          assignees={assignees}
          onClose={() => setEditing(undefined)}
          onSaved={(before, after) => {
            notify({ text: `Saved changes to ${after.customer_name}.` });
            onChanged(before, after);
          }}
        />
      )}
      {adding && (
        <ActivityDialog
          work={adding}
          assignees={assignees}
          onClose={() => setAdding(undefined)}
          onSaved={() => {
            notify({ text: `Added an activity to ${adding.customer_name}.` });
            onChanged(adding, adding);
          }}
        />
      )}
    </>
  );

  return { dialogs, edit: setEditing, addActivity: setAdding, togglePin };
}

type WorkPinButtonProps = { work: Work; actions: WorkActions; className?: string };

// Pinning is stored on the Work by the API, so every user sees the same pinned Works first.
export function WorkPinButton({ work, actions, className = "size-8" }: WorkPinButtonProps) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        if (pending) return;
        setPending(true);
        await actions.togglePin(work);
        setPending(false);
      }}
      // aria-disabled, not disabled, while saving: a disabled button would drop the keyboard focus.
      aria-disabled={pending || undefined}
      aria-pressed={work.is_pinned}
      aria-label={`Pin ${work.customer_name}`}
      title={work.is_pinned ? "Unpin" : "Pin"}
      className={`${iconButton} ${className}`}
    >
      <PinIcon className={`size-4 ${work.is_pinned ? "text-brand" : ""}`} fill={work.is_pinned ? "currentColor" : "none"} />
    </button>
  );
}

// The Work's three-dot menu on the list's rows and the board's cards. Everything here is part of the Work module, which
// the API checks on every request. Opening the Work, its activities and pinning it are on the row and card themselves.
export function WorkMenu({ work, actions }: { work: Work; actions: WorkActions }) {
  const menuId = useId();
  const hide = () => document.getElementById(menuId)?.hidePopover();
  const run = (action: () => void) => () => {
    hide();
    action();
  };

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={(event) => placeMenu(event.currentTarget, menuId)}
        aria-label={`Actions for ${work.customer_name}`}
        className={`${iconButton} size-8`}
      >
        <MoreIcon className="size-4" />
      </button>
      <div
        id={menuId}
        popover="auto"
        className="fixed inset-auto m-0 w-56 rounded-md border border-border bg-background p-1 text-foreground shadow-lg"
      >
        <Link href={`/works/${work.id}/documents`} className={menuItemClass}>
          <FileIcon className="size-4 text-muted-foreground" />
          Documents
        </Link>
        <button type="button" onClick={run(() => actions.edit(work))} className={menuItemClass}>
          <PencilIcon className="size-4 text-muted-foreground" />
          Edit Work
        </button>
        <button type="button" onClick={run(() => actions.addActivity(work))} className={menuItemClass}>
          <PlusIcon className="size-4 text-muted-foreground" />
          Add follow-up
        </button>
        <div className="my-1 border-t border-border" />
        <a href={whatsappHref(work)} target="_blank" rel="noopener noreferrer" onClick={hide} className={menuItemClass}>
          <WhatsAppIcon className="size-4 text-muted-foreground" />
          WhatsApp
        </a>
        <a href={telHref(work)} onClick={hide} className={menuItemClass}>
          <PhoneIcon className="size-4 text-muted-foreground" />
          Call
        </a>
      </div>
    </>
  );
}

type WorkDialogProps = {
  work: Work;
  assignees: Assignees;
  onClose: () => void;
  onSaved: (before: Work, after: Work) => void;
};

// A Work's details, and where its stage, assignee and due date change (also the keyboard and touch way to move it).
export function WorkDialog({ work, assignees, onClose, onSaved }: WorkDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [stage, setStage] = useState<WorkStage>(work.stage);
  const [assignedTo, setAssignedTo] = useState(work.assigned_to ? String(work.assigned_to) : "");
  const [dueDate, setDueDate] = useState(work.due_date ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const me = useContext(CurrentUserContext);
  // The lead's page needs the Leads module.
  const canOpenLeads = me?.role === "ADMIN" || me?.modules.includes("leads");
  const close = () => dialogRef.current?.close();
  const fieldId = (field: string) => `${formId}-${field}`;
  const location = [work.area, work.district, work.state, work.pin_code].filter(Boolean).join(", ");
  // Someone no longer active stays visible on a Work that already has them.
  const keepAssignee =
    work.assigned_to && !assignees.data?.some((person) => person.id === work.assigned_to)
      ? { id: work.assigned_to, name: work.assigned_to_name ?? `User #${work.assigned_to}` }
      : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes: WorkChanges = {};
    if (stage !== work.stage) changes.stage = stage;
    const assignee = assignedTo ? Number(assignedTo) : null;
    if (assignee !== work.assigned_to) changes.assigned_to = assignee;
    const due = dueDate || null;
    if (due !== work.due_date) changes.due_date = due;
    if (Object.keys(changes).length === 0) {
      close();
      return;
    }

    setSaving(true);
    setFormError(undefined);
    try {
      onSaved(work, await updateWork(work.id, changes));
      close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      setFormError(apiError.message);
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={`${formId}-title`}
      className={`${dialogClass} max-h-[calc(100dvh-2rem)] max-w-xl overflow-hidden p-0`}
    >
      <form noValidate onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${formId}-title`} className="truncate text-base font-semibold">
              {work.customer_name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Work #{work.id} · from{" "}
              {canOpenLeads ? (
                <Link href={`/leads/${work.lead}`} className="font-medium text-link underline underline-offset-2 hover:text-link-hover">
                  Lead #{work.lead}
                </Link>
              ) : (
                `Lead #${work.lead}`
              )}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className={`${iconButton} -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          {formError && (
            <p role="alert" className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
              {formError}
            </p>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-page px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Plan</dt>
            <dd>{work.plan_name}</dd>
            <dt className="text-muted-foreground">Confirmed amount</dt>
            <dd>
              <span className="font-semibold tabular-nums">{formatMoney(work.amount)}</span>
              <span className="block text-xs text-muted-foreground">Fixed at conversion. Plan price changes don&apos;t affect it.</span>
            </dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a href={telHref(work)} className="text-link tabular-nums hover:text-link-hover">
                {formatPhone(work)}
              </a>
            </dd>
            {work.email && (
              <>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="wrap-anywhere">{work.email}</dd>
              </>
            )}
            {location && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{location}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Added</dt>
            <dd>{formatDate(work.created_at)}</dd>
          </dl>

          <Section title="Pipeline">
            <Field label="Stage" id={fieldId("stage")} error={errors.stage}>
              <select
                id={fieldId("stage")}
                value={stage}
                onChange={(event) => setStage(event.target.value as WorkStage)}
                className={inputClass}
              >
                {WORK_STAGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Assigned staff"
              id={fieldId("assigned_to")}
              error={errors.assigned_to}
              hint={assignees.error && `Staff couldn't be loaded: ${assignees.error.message}`}
            >
              <select
                id={fieldId("assigned_to")}
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {[...(assignees.data ?? []), ...(keepAssignee ? [keepAssignee] : [])].map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date" id={fieldId("due_date")} error={errors.due_date}>
              <input
                id={fieldId("due_date")}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </Field>
          </Section>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? <Busy>Saving…</Busy> : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
