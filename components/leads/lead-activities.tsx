"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useId, useRef, useState, type ChangeEvent } from "react";

import { CompleteActivityDialog } from "@/components/complete-activity-dialog";
import { EyeIcon, MoreIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { ActionDialog } from "@/components/selection";
import { ColumnsButton, DEFAULT_PAGE_SIZE, EmptyState, ListShell, SkeletonRows, useColumns, type Columns } from "@/components/table";
import { useApi } from "@/lib/api";
import {
  ACTIVITY_TYPES,
  FOLLOW_UP_STATUSES,
  deleteActivity,
  formatDate,
  formatPhone,
  isOverdue,
  withRow,
  type Activity,
  type Assignee,
  type Page,
} from "./api";
import { FollowUpDialog } from "./follow-ups";
import { menuItemClass, placeMenu } from "./lead-actions";
import { FilterToggle, SearchBox, SortSelect, StatusTabs, pickParams, updateQuery } from "./leads-toolbar";
import {
  FollowUpBadge,
  PageHeader,
  fillClass,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
  stickyNameClass,
  useNotice,
} from "./ui";

const FILTER_KEYS = ["type", "assigned_to", "due_after", "due_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", "status", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-created_at";
const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date: soonest" },
  { value: "-due_date", label: "Due date: latest" },
  { value: "status", label: "Pending first" },
  { value: "-status", label: "Completed first" },
];

// The columns the Columns menu can hide. The lead, the follow-up's heading and the row's actions always show.
const COLUMNS = [
  { key: "type", label: "Type" },
  { key: "assigned", label: "Assigned staff" },
  { key: "due", label: "Due date" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];
const FIXED_COLUMNS = 3; // lead, heading, actions

const heading = (activity: Activity) => activity.title || activity.type_display;

// Lead Activities: the follow-ups this user works with. An admin's are all of them; staff see only those assigned to
// them (the API decides). Search, filters, sort and page live in the URL, as on the leads list.
export function LeadActivitiesPage() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, QUERY_KEYS);
  const { data, error, loading, reload, replace } = useApi<Page<Activity>>(
    query.toString() ? `/activities/?${query}` : "/activities/",
  );
  const [noticeElement, notify] = useNotice();
  const [editing, setEditing] = useState<Activity | null>(); // null: a new follow-up; undefined: the dialog is closed
  const [deleting, setDeleting] = useState<Activity>();
  const [completing, setCompleting] = useState<Activity>();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clears, setClears] = useState(0);
  const filterPanelId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const columns = useColumns("lead-activities", COLUMNS);
  // Adding follow-ups, and choosing whose to list, are for admins; staff see and complete only their own.
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const activeFilters = FILTER_KEYS.filter((key) => searchParams.get(key)).length;
  const narrowed = Boolean(search || status) || activeFilters > 0;
  const sorted = Boolean(searchParams.get("ordering")); // a change can then move the row to another page
  const rows = data?.results ?? [];
  const loaded = rows.length > 0;
  const { shows } = columns;
  const showError = (text: string) => notify({ text, error: true });

  // A row that leaves the list (completed while showing Pending, deleted) takes the focus with it: keep it on the page.
  const keepFocus = () => headingRef.current?.focus();

  function clearAll() {
    updateQuery(Object.fromEntries(["search", "status", ...FILTER_KEYS].map((key) => [key, null])));
    setClears((count) => count + 1); // a fresh search box drops a search still being typed
    setFiltersOpen(false);
    keepFocus();
  }

  return (
    <div className={fillClass}>
      <PageHeader
        title="Lead Activities"
        titleRef={headingRef}
        description={data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "follow-up" : "follow-ups"}` : undefined}
      >
        {isAdmin && (
          <button type="button" onClick={() => setEditing(null)} className={primaryButton}>
            <PlusIcon className="size-4" />
            Add follow-up
          </button>
        )}
      </PageHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusTabs statuses={FOLLOW_UP_STATUSES} />
        <SearchBox key={clears} label="Search follow-ups" placeholder="Search lead, phone, ID, heading or notes" />
        <FilterToggle
          open={filtersOpen}
          onToggle={() => setFiltersOpen((open) => !open)}
          controls={filterPanelId}
          active={activeFilters}
        />
        <SortSelect options={SORT_OPTIONS} defaultValue={DEFAULT_ORDERING} />
        <ColumnsButton columns={columns} />
      </div>
      {filtersOpen && (
        <FilterPanel
          id={filterPanelId}
          searchParams={searchParams}
          showAssignee={isAdmin}
          onDone={() => {
            setFiltersOpen(false);
            // The panel, and the button pressed in it, go away.
            document.querySelector<HTMLElement>(`[aria-controls="${filterPanelId}"]`)?.focus();
          }}
        />
      )}

      <ListShell
        noun="follow-ups"
        error={error}
        onRetry={reload}
        page={page}
        pageSize={pageSize}
        count={data?.count}
        loading={loading}
        empty={
          narrowed ? (
            <EmptyState title="No follow-ups match your search or filters." hint="Try a different search, or clear the filters.">
              <button type="button" onClick={clearAll} className={secondaryButton}>
                Clear search and filters
              </button>
            </EmptyState>
          ) : isAdmin ? (
            <EmptyState title="No follow-ups yet." hint="Add one here, or from a lead's Follow-ups / Activities section.">
              <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>
                Add follow-up
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No follow-ups assigned to you." hint="Follow-ups an admin assigns to you show here." />
          )
        }
      >
        <table
          aria-busy={loading}
          // With columns hidden the table is as wide as what's left needs, no wider.
          className={`w-full text-sm transition-opacity ${columns.hiddenCount > 0 ? "min-w-max" : "min-w-240"} ${loading && loaded ? "opacity-60" : ""}`}
        >
          <caption className="sr-only">Lead follow-ups</caption>
          <thead>
            <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
              <th scope="col" className="sticky left-0 z-1 bg-page px-3 py-2.5">
                Lead
              </th>
              <th scope="col" className="px-3 py-2.5">Heading</th>
              {shows("type") && <th scope="col" className="px-3 py-2.5">Type</th>}
              {shows("assigned") && <th scope="col" className="px-3 py-2.5">Assigned staff</th>}
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
            {loaded ? (
              rows.map((activity) => (
                <FollowUpRow
                  key={activity.id}
                  activity={activity}
                  shows={shows}
                  onComplete={setCompleting}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ))
            ) : (
              <SkeletonRows columns={FIXED_COLUMNS + COLUMNS.length - columns.hiddenCount} />
            )}
          </tbody>
        </table>
      </ListShell>

      {editing !== undefined && (
        <FollowUpDialog
          activity={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onError={showError}
          onSaved={(saved, stillOpen) => {
            notify({
              text: editing ? `Saved the follow-up for ${saved.lead_name}.` : `Added a follow-up for ${saved.lead_name}.`,
            });
            // An edit can take the row out of a searched or filtered view; the first follow-up replaces the empty state.
            if (stillOpen && ((editing && (narrowed || sorted)) || data?.count === 0)) keepFocus();
            reload();
          }}
        />
      )}
      {deleting && (
        <ActionDialog
          destructive
          title="Delete this follow-up?"
          description={`"${heading(deleting)}" for ${deleting.lead_name} will be removed for good.`}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            await deleteActivity(deleting.id);
            notify({ text: `Deleted the follow-up for ${deleting.lead_name}.` });
            reload();
          }}
          onClose={() => {
            setDeleting(undefined);
            keepFocus(); // the row, and the menu that opened this, may be gone
          }}
          onError={showError}
        />
      )}
      {completing && (
        <CompleteActivityDialog
          activity={completing}
          label={`"${heading(completing)}" for ${completing.lead_name}`}
          onCompleted={(saved) => {
            // The row shows Completed at once, so it can't be completed twice; the reload may then take it out of a
            // filtered or sorted view.
            if (data) replace(withRow(data, saved));
            notify({ text: `Completed: ${heading(saved)} (${saved.lead_name}).` });
            reload();
          }}
          onClose={(completed) => {
            setCompleting(undefined);
            if (completed) keepFocus(); // the Mark as Completed button that opened this is gone
          }}
          onError={showError}
        />
      )}
      {noticeElement}
    </div>
  );
}

type FollowUpRowProps = {
  activity: Activity;
  shows: Columns<ColumnKey>["shows"];
  onComplete: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
};

function FollowUpRow({ activity, shows, onComplete, onEdit, onDelete }: FollowUpRowProps) {
  const overdue = isOverdue(activity);
  const pending = activity.status === "PENDING";
  const phone = formatPhone({ country_code: activity.lead_country_code, phone: activity.lead_phone });
  // The lead and the actions stay in view while the rest scrolls sideways on a narrow screen. Sticky cells need an
  // opaque background, so the row hover colour is the solid one.
  const stickyCell = "z-1 bg-background group-hover:bg-row-hover";

  return (
    <tr className="group border-b border-border align-top last:border-0 hover:bg-row-hover">
      <th scope="row" className={`${stickyCell} sticky left-0 px-3 py-2.5 text-left font-medium`}>
        {/* Staff who only do the follow-up can't open someone else's lead, so for them the name wraps instead of being
            cut: nothing else shows it. Its cap (see stickyNameClass) leaves a phone room to scroll the other columns. */}
        {activity.can_open_lead ? (
          <Link href={`/leads/${activity.lead}`} className={`block ${stickyNameClass} truncate hover:underline`}>
            {activity.lead_name}
          </Link>
        ) : (
          // w-max: a name that fits its cap stays on one line, however narrow the table squeezes the column.
          <span className={`block w-max ${stickyNameClass} break-words`}>{activity.lead_name}</span>
        )}
        <span className="mt-0.5 block text-xs font-normal whitespace-nowrap text-muted-foreground tabular-nums">
          {phone}
        </span>
      </th>
      <td className="min-w-48 px-3 py-2.5">
        <span className="line-clamp-2 block max-w-[max(18rem,19cqw)] font-medium">
          {activity.title || <span className="font-normal text-muted-foreground italic">No heading</span>}
        </span>
        {activity.description && (
          <span className="mt-0.5 line-clamp-2 block max-w-[max(18rem,19cqw)] text-xs text-muted-foreground">{activity.description}</span>
        )}
        {activity.completion_note && (
          <span title={activity.completion_note} className="mt-1 line-clamp-3 max-w-[max(18rem,19cqw)] text-xs break-words text-muted-foreground">
            <span className="font-medium text-label">Completion note:</span> {activity.completion_note}
          </span>
        )}
      </td>
      {shows("type") && <td className="min-w-28 px-3 py-2.5">{activity.type_display}</td>}
      {shows("assigned") && (
        <td className="px-3 py-2.5 whitespace-nowrap">
          {activity.assigned_to_name ? (
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full bg-background text-[0.625rem] font-semibold ring-1 ring-border"
              >
                {initials(activity.assigned_to_name)}
              </span>
              <span className="max-w-[max(12rem,13cqw)] truncate">{activity.assigned_to_name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Not assigned</span>
          )}
        </td>
      )}
      {shows("due") && (
        <td className="px-3 py-2.5 whitespace-nowrap">
          {activity.due_date ? (
            <>
              <span className={overdue ? "font-medium text-error" : undefined}>{formatDate(activity.due_date)}</span>
              {overdue && <span className="block text-xs text-error">Overdue</span>}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      )}
      {shows("status") && (
        <td className="px-3 py-2.5">
          <FollowUpBadge status={activity.status} />
        </td>
      )}
      {shows("created") && (
        <td className="px-3 py-2.5 whitespace-nowrap">
          {formatDate(activity.created_at)}
          {activity.created_by_name && (
            <span className="block max-w-[max(12rem,13cqw)] truncate text-xs text-muted-foreground">{activity.created_by_name}</span>
          )}
        </td>
      )}
      <td className={`${stickyCell} px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)] sm:sticky sm:right-0`}>
        <div className="flex items-center justify-end gap-1">
          {pending ? (
            // Only its assignee, or an admin, completes it (the API refuses anyone else).
            activity.can_update_status && (
              <button
                type="button"
                onClick={() => onComplete(activity)}
                aria-label={`Mark as Completed: ${heading(activity)} (${activity.lead_name})`}
                className={`${secondaryButton} px-2.5`}
              >
                Mark as Completed
              </button>
            )
          ) : (
            <span className="px-2.5 text-xs whitespace-nowrap text-muted-foreground">Completed</span>
          )}
          <RowMenu activity={activity} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </td>
    </tr>
  );
}

type RowMenuProps = { activity: Activity; onEdit: (activity: Activity) => void; onDelete: (activity: Activity) => void };

function RowMenu({ activity, onEdit, onDelete }: RowMenuProps) {
  const menuId = useId();
  const hide = () => document.getElementById(menuId)?.hidePopover();
  if (!activity.can_open_lead && !activity.can_edit && !activity.can_delete) return null;

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={(event) => placeMenu(event.currentTarget, menuId)}
        aria-label={`Actions for the follow-up: ${heading(activity)} (${activity.lead_name})`}
        className={`${iconButton} size-8`}
      >
        <MoreIcon className="size-4" />
      </button>
      <div
        id={menuId}
        popover="auto"
        className="fixed inset-auto m-0 w-56 rounded-md border border-border bg-background p-1 text-foreground shadow-lg"
      >
        {activity.can_open_lead && (
          <Link href={`/leads/${activity.lead}#activities`} className={menuItemClass}>
            <EyeIcon className="size-4 text-muted-foreground" />
            Open lead
          </Link>
        )}
        {activity.can_edit && (
          <button
            type="button"
            onClick={() => {
              hide();
              onEdit(activity);
            }}
            className={menuItemClass}
          >
            <PencilIcon className="size-4 text-muted-foreground" />
            Edit
          </button>
        )}
        {activity.can_delete && (
          <button
            type="button"
            onClick={() => {
              hide();
              onDelete(activity);
            }}
            className={`${menuItemClass} text-error`}
          >
            <TrashIcon className="size-4" />
            Delete
          </button>
        )}
      </div>
    </>
  );
}

// `showAssignee`: whose follow-ups to list can be chosen (admins). The staff list needs the Leads module, so it is loaded
// only then.
type FilterPanelProps = { id: string; searchParams: URLSearchParams; showAssignee: boolean; onDone: () => void };

function FilterPanel({ id, searchParams, showAssignee, onDone }: FilterPanelProps) {
  const assignees = useApi<Assignee[]>(showAssignee ? "/leads/assignees/" : null);
  const [draft, setDraft] = useState(
    () => Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ""])) as Record<FilterKey, string>,
  );
  const bind = (key: FilterKey) => ({
    value: draft[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
    className: inputClass,
  });

  return (
    <form
      id={id}
      onSubmit={(event) => {
        event.preventDefault();
        updateQuery(Object.fromEntries(FILTER_KEYS.map((key) => [key, draft[key] || null])));
        onDone();
      }}
      // On a wide screen each filter keeps a field's width (24rem at most) instead of a quarter of the page.
      className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,24rem))]"
    >
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Type</span>
        <select {...bind("type")}>
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      {showAssignee && (
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-label">Assigned staff</span>
          <select {...bind("assigned_to")}>
            <option value="">{assignees.error ? "Anyone (staff couldn't be loaded)" : "Anyone"}</option>
            {assignees.data?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Due from</span>
        <input type="date" max={draft.due_before || undefined} {...bind("due_after")} />
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Due to</span>
        <input type="date" min={draft.due_after || undefined} {...bind("due_before")} />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <button
          type="button"
          onClick={() => {
            updateQuery(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])));
            onDone();
          }}
          className={secondaryButton}
        >
          Clear filters
        </button>
        <button type="submit" className={primaryButton}>
          Apply
        </button>
      </div>
    </form>
  );
}
