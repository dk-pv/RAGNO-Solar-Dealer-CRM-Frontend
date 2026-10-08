"use client";

import Link from "next/link";
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { CompleteActivityDialog } from "@/components/complete-activity-dialog";
import { EyeIcon, MoreIcon, PencilIcon, PlusIcon } from "@/components/layout/icons";
import { canOpen } from "@/components/layout/navigation";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import {
  ACTIVITY_NOT_YOURS,
  ACTIVITY_TYPES,
  formatDate,
  formatPhone,
  withRow,
  type ActivityType,
  type Assignee,
  type Page,
} from "@/components/leads/api";
import { menuItemClass, placeMenu } from "@/components/leads/lead-actions";
import { Field, FormDialog } from "@/components/leads/lead-dialogs";
import { ErrorState, FollowUpBadge, iconButton, inputClass, secondaryButton, tableAreaClass } from "@/components/leads/ui";
import { SkeletonRows } from "@/components/table";
import { toApiError, useApi, type ApiError } from "@/lib/api";
import {
  ACTIVITY_STATUSES,
  saveWorkActivity,
  stageFor,
  today,
  type ActivityStatus,
  type Work,
  type WorkActivity,
} from "./api";

const PAGE_SIZE = 25;

type Assignees = { data?: Assignee[]; error?: ApiError };
type Notify = (notice: { text: string; error?: boolean }) => void;

// An activity's Pending or Completed badge: the one the lead follow-ups wear, under the name the Dashboard and Reports
// know it by.
export { FollowUpBadge as ActivityStatusBadge };

// The columns of the Work Activities page that its Columns menu can hide. The Work, the activity and the row's actions
// always show.
export const WORK_ACTIVITY_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "assigned", label: "Assigned to" },
  { key: "due", label: "Due date" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
] as const;
export type WorkActivityColumn = (typeof WORK_ACTIVITY_COLUMNS)[number]["key"];

// Each Work's own soft accent, picked from its ID, so the same Work has the same colour on every page and every visit:
// a light wash over its rows, a stronger left edge and the dot on its badge. It identifies the Work only: never its
// stage, an activity's type or its status.
const WORK_COLORS = [
  {
    dot: "bg-work-1",
    edge: "shadow-[inset_3px_0_0_var(--color-work-1)]",
    row: "bg-work-1-tint hover:bg-work-1-hover",
    cell: "bg-work-1-tint group-hover:bg-work-1-hover",
  },
  {
    dot: "bg-work-2",
    edge: "shadow-[inset_3px_0_0_var(--color-work-2)]",
    row: "bg-work-2-tint hover:bg-work-2-hover",
    cell: "bg-work-2-tint group-hover:bg-work-2-hover",
  },
  {
    dot: "bg-work-3",
    edge: "shadow-[inset_3px_0_0_var(--color-work-3)]",
    row: "bg-work-3-tint hover:bg-work-3-hover",
    cell: "bg-work-3-tint group-hover:bg-work-3-hover",
  },
  {
    dot: "bg-work-4",
    edge: "shadow-[inset_3px_0_0_var(--color-work-4)]",
    row: "bg-work-4-tint hover:bg-work-4-hover",
    cell: "bg-work-4-tint group-hover:bg-work-4-hover",
  },
  {
    dot: "bg-work-5",
    edge: "shadow-[inset_3px_0_0_var(--color-work-5)]",
    row: "bg-work-5-tint hover:bg-work-5-hover",
    cell: "bg-work-5-tint group-hover:bg-work-5-hover",
  },
  {
    dot: "bg-work-6",
    edge: "shadow-[inset_3px_0_0_var(--color-work-6)]",
    row: "bg-work-6-tint hover:bg-work-6-hover",
    cell: "bg-work-6-tint group-hover:bg-work-6-hover",
  },
  {
    dot: "bg-work-7",
    edge: "shadow-[inset_3px_0_0_var(--color-work-7)]",
    row: "bg-work-7-tint hover:bg-work-7-hover",
    cell: "bg-work-7-tint group-hover:bg-work-7-hover",
  },
  {
    dot: "bg-work-8",
    edge: "shadow-[inset_3px_0_0_var(--color-work-8)]",
    row: "bg-work-8-tint hover:bg-work-8-hover",
    cell: "bg-work-8-tint group-hover:bg-work-8-hover",
  },
];
export const workColor = (workId: number) => WORK_COLORS[(workId - 1) % WORK_COLORS.length];

const isOverdue = (activity: WorkActivity) =>
  activity.status === "PENDING" && activity.due_date !== null && activity.due_date < today();

type WorkActivityTableProps = {
  rows?: WorkActivity[]; // undefined while the first page loads
  loading: boolean;
  // false on a Work's own page, where every row is that Work's.
  showWork: boolean;
  /** Which optional columns show (the Columns menu of the Work Activities page); all of them unless given. */
  shows?: (column: WorkActivityColumn) => boolean;
  onEdit: (activity: WorkActivity) => void;
  onComplete: (activity: WorkActivity) => void;
};

const workBadgeClass =
  "inline-flex items-center gap-1.5 rounded-md bg-background px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground ring-1 ring-border";

// Work activities as a table, one row each, with the same row actions as the lead follow-ups: Mark as Completed, and a
// menu. A Work's rows share its colour (the row wash, the left edge and the badge's dot); where several Works are listed,
// a stronger line marks where the next Work's activities start.
export function WorkActivityTable({ rows, loading, showWork, shows = () => true, onEdit, onComplete }: WorkActivityTableProps) {
  const optional = WORK_ACTIVITY_COLUMNS.filter((column) => (column.key === "customer" ? showWork : true) && shows(column.key));
  const hidden = optional.length < WORK_ACTIVITY_COLUMNS.length - (showWork ? 0 : 1);
  // Always shown: the Work (where several are listed), the activity and the actions.
  const columnCount = optional.length + (showWork ? 3 : 2);
  // A Work's page needs the Work module: without it (staff with Activities only) the Work is named, not linked.
  const me = useContext(CurrentUserContext);
  const linkWorks = showWork && me !== null && canOpen(me, { module: "work" });

  return (
    <div className={`${tableAreaClass} relative`}>
      <table
        aria-busy={loading}
        // With columns hidden the table is as wide as what's left needs, no wider.
        className={`w-full text-sm transition-opacity ${hidden ? "min-w-max" : showWork ? "min-w-280" : "min-w-210"} ${
          loading && rows ? "opacity-60" : ""
        }`}
      >
        <caption className="sr-only">Work activities</caption>
        <thead>
          <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
            {showWork && (
              <th scope="col" className="sticky left-0 z-1 bg-page px-3 py-2.5">
                Work
              </th>
            )}
            {showWork && shows("customer") && <th scope="col" className="px-3 py-2.5">Customer</th>}
            <th scope="col" className="px-3 py-2.5">Activity / Follow-up</th>
            {shows("assigned") && <th scope="col" className="px-3 py-2.5">Assigned to</th>}
            {shows("due") && <th scope="col" className="px-3 py-2.5">Due date</th>}
            {shows("status") && <th scope="col" className="px-3 py-2.5">Status</th>}
            {shows("created") && <th scope="col" className="px-3 py-2.5">Created</th>}
            {/* The actions stay in view beside a wide table; on a phone they would cover it, so there they scroll with it. */}
            <th scope="col" className="z-1 bg-page px-3 py-2.5 shadow-[inset_1px_0_0_var(--color-border)] sm:sticky sm:right-0">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows ? (
            rows.map((activity, index) => {
              const work = activity.work_summary;
              const color = workColor(work.id);
              const overdue = isOverdue(activity);
              const nextWork = showWork && index > 0 && rows[index - 1].work !== activity.work;
              const label = `${activity.type_display} for ${work.customer_name}`;
              return (
                <tr
                  key={activity.id}
                  className={`group border-b border-border last:border-0 ${color.row} ${
                    nextWork ? "border-t-2 border-t-border-strong" : ""
                  }`}
                >
                  {showWork && (
                    // Sticky cells need an opaque background: the same wash as the row.
                    <th scope="row" className={`sticky left-0 z-1 px-3 py-2 text-left font-normal ${color.cell} ${color.edge}`}>
                      {linkWorks ? (
                        <Link href={`/works/${work.id}`} className={`${workBadgeClass} hover:underline`}>
                          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${color.dot}`} />
                          Work #{work.id}
                        </Link>
                      ) : (
                        <span className={workBadgeClass}>
                          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${color.dot}`} />
                          Work #{work.id}
                        </span>
                      )}
                      <span className="mt-1 block text-xs whitespace-nowrap text-muted-foreground">
                        {work.plan_name} · {stageFor(work.stage).label}
                      </span>
                    </th>
                  )}
                  {showWork && shows("customer") && (
                    <td className="px-3 py-2">
                      <span className="block max-w-[max(12rem,13cqw)] truncate font-medium">{work.customer_name}</span>
                      <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatPhone(work)}</span>
                    </td>
                  )}
                  {/* A floor, as on the lead follow-ups table: the other columns don't wrap, so whenever the table
                      scrolls this one would otherwise be squeezed to its longest word. */}
                  <td className={`min-w-48 px-3 py-2 ${showWork ? "" : color.edge}`}>
                    <span className="block font-medium whitespace-nowrap">{activity.type_display}</span>
                    <span title={activity.description} className="line-clamp-2 max-w-[max(20rem,21cqw)] text-xs break-words text-muted-foreground">
                      {activity.description}
                    </span>
                    {activity.completion_note && (
                      <span title={activity.completion_note} className="mt-1 line-clamp-3 max-w-[max(20rem,21cqw)] text-xs break-words text-muted-foreground">
                        <span className="font-medium text-label">Completion note:</span> {activity.completion_note}
                      </span>
                    )}
                  </td>
                  {shows("assigned") && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {activity.assigned_to_name ?? <span className="text-muted-foreground">Unassigned</span>}
                    </td>
                  )}
                  {shows("due") && (
                    <td className={`px-3 py-2 whitespace-nowrap ${overdue ? "font-medium text-error" : ""}`}>
                      {activity.due_date ? formatDate(activity.due_date) : <span className="text-muted-foreground">—</span>}
                      {overdue && <span className="block text-xs">Overdue</span>}
                    </td>
                  )}
                  {shows("status") && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <FollowUpBadge status={activity.status} />
                      {activity.completed_at && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatDate(activity.completed_at)}
                          {activity.completed_by_name ? ` · ${activity.completed_by_name}` : ""}
                        </span>
                      )}
                    </td>
                  )}
                  {shows("created") && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(activity.created_at)}
                      {activity.created_by_name && (
                        <span className="block text-xs text-muted-foreground">by {activity.created_by_name}</span>
                      )}
                    </td>
                  )}
                  <td className={`z-1 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)] sm:sticky sm:right-0 ${color.cell}`}>
                    <div className="flex items-center justify-end gap-1">
                      {activity.status === "PENDING" ? (
                        // Only its assignee, or an admin, completes it (the API refuses anyone else).
                        activity.can_update_status && (
                          <button
                            type="button"
                            onClick={() => onComplete(activity)}
                            aria-label={`Mark as Completed: ${label}`}
                            className={`${secondaryButton} px-2.5`}
                          >
                            Mark as Completed
                          </button>
                        )
                      ) : (
                        <span className="px-2.5 text-xs whitespace-nowrap text-muted-foreground">Completed</span>
                      )}
                      <ActivityMenu activity={activity} label={label} withWork={linkWorks} onEdit={() => onEdit(activity)} />
                    </div>
                  </td>
                </tr>
              );
            })
          ) : (
            <SkeletonRows columns={columnCount} rows={6} />
          )}
        </tbody>
      </table>
    </div>
  );
}

type ActivityMenuProps = { activity: WorkActivity; label: string; withWork: boolean; onEdit: () => void };

// The row's three-dot menu, as on the Works and leads tables: Edit for admins (can_edit), and the Work's page for whoever
// can open it (`withWork`). With neither there is no menu. (Completing is the button beside it; an admin reopens a
// completed activity from Edit.)
function ActivityMenu({ activity, label, withWork, onEdit }: ActivityMenuProps) {
  const menuId = useId();
  const hide = () => document.getElementById(menuId)?.hidePopover();
  if (!activity.can_edit && !withWork) return null;

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={(event) => placeMenu(event.currentTarget, menuId)}
        aria-label={`Actions for ${label}`}
        className={`${iconButton} size-8`}
      >
        <MoreIcon className="size-4" />
      </button>
      <div
        id={menuId}
        popover="auto"
        className="fixed inset-auto m-0 w-56 rounded-md border border-border bg-background p-1 text-foreground shadow-lg"
      >
        {activity.can_edit && (
          <button
            type="button"
            onClick={() => {
              hide();
              onEdit();
            }}
            className={menuItemClass}
          >
            <PencilIcon className="size-4 text-muted-foreground" />
            Edit
          </button>
        )}
        {withWork && (
          <Link href={`/works/${activity.work}`} className={menuItemClass}>
            <EyeIcon className="size-4 text-muted-foreground" />
            View Work #{activity.work}
          </Link>
        )}
      </div>
    </>
  );
}

// Edit and Mark as Completed for a table of Work activities: their dialogs. Render `dialog` once; `onChanged` gets the
// saved activity after a change, to show it at once and reload the activities (and anything that counts them).
export function useActivityRowActions(notify: Notify, onChanged: (saved: WorkActivity) => void, assignees: Assignees) {
  const [editing, setEditing] = useState<WorkActivity>();
  const [completing, setCompleting] = useState<WorkActivity>();

  const dialog = (
    <>
      {editing && (
        <ActivityDialog
          work={{ id: editing.work, customer_name: editing.work_summary.customer_name, assigned_to: null }}
          activity={editing}
          assignees={assignees}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            notify({ text: "Saved the activity." });
            onChanged(saved);
          }}
        />
      )}
      {completing && (
        <CompleteActivityDialog
          activity={completing}
          label={`${completing.type_display} for ${completing.work_summary.customer_name}`}
          onCompleted={(saved) => {
            notify({ text: `Marked the ${saved.type_display.toLowerCase()} for ${saved.work_summary.customer_name} as completed.` });
            onChanged(saved);
          }}
          onClose={() => setCompleting(undefined)}
          onError={(text) => notify({ text: `Couldn't complete the activity. ${text}`, error: true })}
        />
      )}
    </>
  );

  return { dialog, edit: setEditing, complete: setCompleting };
}

type WorkActivitiesProps = {
  work: Work;
  assignees: Assignees;
  notify: Notify;
  onAdd: () => void;
  // After an activity is edited or completed, so the Work's activity counts reload too.
  onChanged: () => void;
};

// The Work page's Activities section: every activity of this Work, pending first (the soonest due first), then completed
// (the latest first). Completed activities stay as the Work's history.
export function WorkActivities({ work, assignees, notify, onAdd, onChanged }: WorkActivitiesProps) {
  const [size, setSize] = useState(PAGE_SIZE);
  const { data, error, loading, reload, replace } = useApi<Page<WorkActivity>>(
    `/activities/?work=${work.id}&page_size=${size}`,
  );
  const rowActions = useActivityRowActions(
    notify,
    (saved) => {
      if (data) replace(withRow(data, saved)); // shown at once (a completed one can't be completed twice)
      reload();
      onChanged();
    },
    assignees,
  );
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN"; // adding activities is for admins

  let content;
  if (error) {
    content = (
      <div className="rounded-lg border border-border bg-background">
        <ErrorState title="Couldn't load activities" message={error.message} onRetry={reload} />
      </div>
    );
  } else if (data?.count === 0) {
    content = (
      <div className="rounded-lg border border-dashed border-border-strong bg-background px-4 py-8 text-center">
        <p className="text-sm font-medium">No activities yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Add a follow-up to keep track of the next action.</p>
      </div>
    );
  } else {
    content = (
      <>
        <WorkActivityTable
          rows={data?.results}
          loading={loading}
          showWork={false}
          onEdit={rowActions.edit}
          onComplete={rowActions.complete}
        />
        {data && data.count > data.results.length && (
          <button
            type="button"
            onClick={() => setSize((current) => current + PAGE_SIZE)}
            disabled={loading}
            className={`${secondaryButton} mt-3 w-full`}
          >
            Show more ({(data.count - data.results.length).toLocaleString("en-IN")} more)
          </button>
        )}
      </>
    );
  }

  return (
    <section id="activities" className="scroll-mt-20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Activities
          {work.activity_count > 0 && (
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {work.pending_activity_count} pending · {work.activity_count} in all
            </span>
          )}
        </h2>
        {isAdmin && (
          <button type="button" onClick={onAdd} className={secondaryButton}>
            <PlusIcon className="size-4" />
            Add activity
          </button>
        )}
      </div>
      {content}
      {rowActions.dialog}
    </section>
  );
}

type ActivityDialogProps = {
  // The Work it was opened from; without one, the form asks which Work.
  work?: Pick<Work, "id" | "customer_name" | "assigned_to">;
  activity?: WorkActivity; // editing it; without one, a new activity
  assignees: Assignees;
  onClose: () => void;
  onSaved: (activity: WorkActivity) => void;
};

// Adds an activity to a Work, or edits one. Opened from a Work, the Work is already set and never chosen again.
export function ActivityDialog({ work, activity, assignees, onClose, onSaved }: ActivityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [pickedWork, setPickedWork] = useState<Work>();
  const target = work ?? pickedWork;
  const [type, setType] = useState<ActivityType>(activity?.type ?? "FOLLOW_UP");
  const [description, setDescription] = useState(activity?.description ?? "");
  // A new follow-up goes to whoever the Work is assigned to (if they are still active), unless changed here.
  const defaultAssignee = activity
    ? activity.assigned_to
    : assignees.data?.some((person) => person.id === target?.assigned_to)
      ? target?.assigned_to
      : null;
  const [pickedAssignee, setAssignedTo] = useState<string>();
  const assignedTo = pickedAssignee ?? (defaultAssignee ? String(defaultAssignee) : "");
  const [dueDate, setDueDate] = useState(activity?.due_date ?? "");
  const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? "PENDING");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const fieldId = (field: string) => `${formId}-${field}`;
  // Someone no longer active stays visible on an activity that already has them.
  const keepAssignee =
    activity?.assigned_to && !assignees.data?.some((person) => person.id === activity.assigned_to)
      ? { id: activity.assigned_to, name: activity.assigned_to_name ?? `User #${activity.assigned_to}` }
      : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const missing: Record<string, string> = {};
    if (!target) missing.work = "Choose the Work this activity is for.";
    if (!description.trim()) missing.description = "Describe the follow-up or what happened.";
    if (!target || !description.trim()) {
      setErrors(missing);
      document.getElementById(fieldId(target ? "description" : "work_search"))?.focus();
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      const input = {
        type,
        description: description.trim(),
        assigned_to: assignedTo ? Number(assignedTo) : null,
        due_date: dueDate || null,
        // Sent only when changed here: an untouched status (the disabled control included) is never a status change.
        ...(activity && status === activity.status ? {} : { status }),
      };
      onSaved(await saveWorkActivity(input, activity ? { id: activity.id } : { work: target.id }));
      dialogRef.current?.close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      setFormError(apiError.message);
      setSaving(false);
    }
  }

  return (
    <FormDialog
      ref={dialogRef}
      title={activity ? "Edit activity" : "Add follow-up / activity"}
      subtitle={work && `Work #${work.id} · ${work.customer_name}`}
      busy={saving}
      error={formError}
      submitLabel={activity ? "Save changes" : "Save activity"}
      busyLabel="Saving…"
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!work && <WorkPicker fieldId={fieldId} picked={pickedWork} onPick={setPickedWork} error={errors.work} />}
        <Field label="Activity type" id={fieldId("type")} error={errors.type} required>
          <select
            id={fieldId("type")}
            value={type}
            onChange={(event) => setType(event.target.value as ActivityType)}
            className={inputClass}
          >
            {ACTIVITY_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Status"
          id={fieldId("status")}
          error={errors.status}
          hint={activity && !activity.can_update_status ? ACTIVITY_NOT_YOURS : undefined}
        >
          <select
            id={fieldId("status")}
            value={status}
            onChange={(event) => setStatus(event.target.value as ActivityStatus)}
            // Only the assignee or an admin changes it; the API refuses anyone else.
            disabled={activity !== undefined && !activity.can_update_status}
            className={inputClass}
          >
            {ACTIVITY_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" id={fieldId("description")} error={errors.description} required wide>
          <textarea
            id={fieldId("description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="What needs doing, or what happened"
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? `${fieldId("description")}-error` : undefined}
            className={`${inputClass} h-auto py-2`}
          />
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
      </div>
    </FormDialog>
  );
}

const WORK_CHOICES = 20;

type WorkPickerProps = { fieldId: (field: string) => string; picked?: Work; onPick: (work?: Work) => void; error?: string };

// Finds the Work for an activity added from the Activities page: type to search (customer, phone or Work ID), then pick.
function WorkPicker({ fieldId, picked, onPick, error }: WorkPickerProps) {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const query = new URLSearchParams({ page_size: String(WORK_CHOICES) });
  if (search) query.set("search", search);
  const works = useApi<Page<Work>>(`/works/?${query}`);
  // The chosen Work stays listed while a new search runs.
  const choices = [...(picked && !works.data?.results.some((w) => w.id === picked.id) ? [picked] : []), ...(works.data?.results ?? [])];

  return (
    <div className="space-y-2 sm:col-span-2">
      <Field
        label="Work"
        id={fieldId("work_search")}
        required
        hint={works.data && works.data.count > WORK_CHOICES && "Showing the first matches. Type more to narrow them down."}
      >
        <input
          id={fieldId("work_search")}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search customer, phone or Work ID"
          className={inputClass}
        />
      </Field>
      <label htmlFor={fieldId("work")} className="sr-only">
        Choose the Work
      </label>
      <select
        id={fieldId("work")}
        value={picked?.id ?? ""}
        onChange={(event) => onPick(choices.find((w) => String(w.id) === event.target.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId("work")}-error` : undefined}
        className={inputClass}
      >
        <option value="">
          {works.error ? "Works couldn't be loaded" : works.data?.count === 0 ? "No Works match" : "Choose a Work"}
        </option>
        {choices.map((w) => (
          <option key={w.id} value={w.id}>
            Work #{w.id} · {w.customer_name} · {stageFor(w.stage).label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${fieldId("work")}-error`} className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
