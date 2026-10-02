"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent } from "react";

import { EyeIcon, MoreIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { toApiError, useApi } from "@/lib/api";
import {
  ACTIVITY_TYPES,
  FOLLOW_UP_STATUSES,
  deleteActivity,
  formatDate,
  formatPhone,
  isOverdue,
  updateActivity,
  type Activity,
  type Assignee,
  type Page,
} from "./api";
import { FollowUpDialog } from "./follow-ups";
import { menuItemClass, placeMenu } from "./lead-actions";
import { Pagination } from "./leads-page";
import { FilterToggle, SearchBox, SortSelect, pickParams, updateQuery } from "./leads-toolbar";
import {
  ErrorState,
  FollowUpBadge,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
  useNotice,
} from "./ui";

const FILTER_KEYS = ["type", "assigned_to", "due_after", "due_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", "status", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-created_at";
const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date: soonest" },
  { value: "-due_date", label: "Due date: latest" },
  { value: "status", label: "Pending first" },
  { value: "-status", label: "Completed first" },
];
const STATUS_TABS = [{ value: "", label: "All" }, ...FOLLOW_UP_STATUSES];
const COLUMN_COUNT = 8;

const heading = (activity: Activity) => activity.title || activity.type_display;

// Lead Activities: the follow-ups this user works with. An admin's are all of them; staff see those on their own leads
// and those assigned to them (the API decides). Search, filters, sort and page live in the URL, as on the leads list.
export function LeadActivitiesPage() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, QUERY_KEYS);
  const { data, error, loading, reload } = useApi<Page<Activity>>(
    query.toString() ? `/activities/?${query}` : "/activities/",
  );
  const [noticeElement, notify] = useNotice();
  const [editing, setEditing] = useState<Activity | null>(); // null: a new follow-up; undefined: the dialog is closed
  const [busyId, setBusyId] = useState<number>();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clears, setClears] = useState(0);
  const filterPanelId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const activeFilters = FILTER_KEYS.filter((key) => searchParams.get(key)).length;
  const sorted = Boolean(searchParams.get("ordering")); // a change can then move the row to another page

  // A row that leaves the list (completed while showing Pending, deleted) takes the focus with it: keep it on the page.
  const keepFocus = () => headingRef.current?.focus();

  // Pending -> Completed; a completed follow-up stays completed.
  async function complete(activity: Activity) {
    setBusyId(activity.id);
    try {
      await updateActivity(activity.id, { status: "COMPLETED" });
      notify({ text: `Completed: ${heading(activity)} (${activity.lead_name}).` });
      // The Mark complete button goes away (and the row may leave a filtered or sorted view).
      keepFocus();
      reload();
    } catch (err) {
      notify({ text: toApiError(err).message, error: true });
    } finally {
      setBusyId(undefined);
    }
  }

  async function remove(activity: Activity) {
    if (!window.confirm(`Delete the follow-up "${heading(activity)}" for ${activity.lead_name}?`)) return;
    try {
      await deleteActivity(activity.id);
      notify({ text: `Deleted the follow-up for ${activity.lead_name}.` });
      keepFocus();
      reload();
    } catch (err) {
      notify({ text: toApiError(err).message, error: true });
    }
  }

  function clearAll() {
    updateQuery(Object.fromEntries(["search", "status", ...FILTER_KEYS].map((key) => [key, null])));
    setClears((count) => count + 1); // a fresh search box drops a search still being typed
    setFiltersOpen(false);
    keepFocus();
  }

  let content;
  if (error) {
    content = (
      <div className="mt-4 rounded-lg border border-border">
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message="There are fewer follow-ups than before."
            onRetry={() => updateQuery({ page: null })}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState title="Unable to load follow-ups." message={error.message} onRetry={reload} retryLabel="Retry" />
        )}
      </div>
    );
  } else if (data && data.count === 0 && !loading) {
    const narrowed = Boolean(search || status) || activeFilters > 0;
    content = (
      <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-12 text-center">
        <p className="text-sm font-medium">{narrowed ? "No follow-ups match your search." : "No follow-ups found."}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {narrowed
            ? "Try a different search, or clear the filters."
            : "Add one here, or from a lead's Follow-ups / Activities section."}
        </p>
        <button
          type="button"
          onClick={narrowed ? clearAll : () => setEditing(null)}
          className={`${secondaryButton} mt-4`}
        >
          {narrowed ? "Clear search and filters" : "Add follow-up"}
        </button>
      </div>
    );
  } else {
    const rows = data && data.results.length > 0 ? data.results : undefined;
    content = (
      <>
        <div className="scrollbar-none mt-4 overflow-x-auto rounded-lg border border-border">
          <table
            aria-busy={loading}
            className={`w-full min-w-240 text-sm transition-opacity ${loading && rows ? "opacity-60" : ""}`}
          >
            <caption className="sr-only">Lead follow-ups</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="sticky left-0 z-1 bg-page px-3 py-2.5">
                  Lead
                </th>
                <th scope="col" className="px-3 py-2.5">Heading</th>
                <th scope="col" className="px-3 py-2.5">Type</th>
                <th scope="col" className="px-3 py-2.5">Assigned staff</th>
                <th scope="col" className="px-3 py-2.5">Due date</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Created</th>
                <th scope="col" className="sticky right-0 z-1 bg-page px-3 py-2.5 shadow-[inset_1px_0_0_var(--color-border)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows
                ? rows.map((activity) => (
                    <FollowUpRow
                      key={activity.id}
                      activity={activity}
                      busy={busyId === activity.id}
                      onComplete={complete}
                      onEdit={setEditing}
                      onDelete={remove}
                    />
                  ))
                : Array.from({ length: 8 }, (_, row) => (
                    <tr key={row} className="border-b border-border last:border-0">
                      {Array.from({ length: COLUMN_COUNT }, (_, cell) => (
                        <td key={cell} className="px-3 py-4">
                          <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {data && data.count > 0 && <Pagination page={page} pageSize={pageSize} count={data.count} />}
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold">
            Lead Activities
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "follow-up" : "follow-ups"}` : " "}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(null)} className={primaryButton}>
          <PlusIcon className="size-4" />
          Add follow-up
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Status" className="flex rounded-md border border-input bg-background p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={status === tab.value}
              onClick={() => updateQuery({ status: tab.value || null })}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                status === tab.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <SearchBox key={clears} label="Search follow-ups" placeholder="Search lead, phone, ID, heading or notes" />
        <FilterToggle
          open={filtersOpen}
          onToggle={() => setFiltersOpen((open) => !open)}
          controls={filterPanelId}
          active={activeFilters}
        />
        <SortSelect options={SORT_OPTIONS} defaultValue={DEFAULT_ORDERING} />
      </div>
      {filtersOpen && (
        <FilterPanel
          id={filterPanelId}
          searchParams={searchParams}
          onDone={() => {
            setFiltersOpen(false);
            // The panel, and the button pressed in it, go away.
            document.querySelector<HTMLElement>(`[aria-controls="${filterPanelId}"]`)?.focus();
          }}
        />
      )}

      {content}

      {editing !== undefined && (
        <FollowUpDialog
          activity={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onError={(text) => notify({ text, error: true })}
          onSaved={(saved, stillOpen) => {
            notify({
              text: editing ? `Saved the follow-up for ${saved.lead_name}.` : `Added a follow-up for ${saved.lead_name}.`,
            });
            // An edit can take the row out of a searched or filtered view; the first follow-up replaces the empty state.
            const narrowed = search || status || activeFilters > 0 || sorted;
            if (stillOpen && ((editing && narrowed) || data?.count === 0)) keepFocus();
            reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type FollowUpRowProps = {
  activity: Activity;
  busy: boolean;
  onComplete: (activity: Activity) => void;
  onEdit: (activity: Activity) => void;
  onDelete: (activity: Activity) => void;
};

function FollowUpRow({ activity, busy, onComplete, onEdit, onDelete }: FollowUpRowProps) {
  const overdue = isOverdue(activity);
  const pending = activity.status === "PENDING";
  const phone = formatPhone({ country_code: activity.lead_country_code, phone: activity.lead_phone });
  // The lead and the actions stay in view while the rest scrolls sideways on a narrow screen. Sticky cells need an
  // opaque background, so the row hover colour is the solid one.
  const stickyCell = "sticky z-1 bg-background group-hover:bg-row-hover";

  return (
    <tr className="group border-b border-border align-top last:border-0 hover:bg-row-hover">
      <th scope="row" className={`${stickyCell} left-0 px-3 py-2.5 text-left font-medium`}>
        {/* Staff who only do the follow-up can't open someone else's lead. */}
        {activity.can_open_lead ? (
          <Link href={`/leads/${activity.lead}`} className="block max-w-52 truncate hover:underline">
            {activity.lead_name}
          </Link>
        ) : (
          <span className="block max-w-52 truncate">{activity.lead_name}</span>
        )}
        <span className="mt-0.5 block text-xs font-normal whitespace-nowrap text-muted-foreground tabular-nums">
          {phone}
        </span>
      </th>
      <td className="min-w-48 px-3 py-2.5">
        <span className="line-clamp-2 block max-w-72 font-medium">
          {activity.title || <span className="font-normal text-muted-foreground italic">No heading</span>}
        </span>
        {activity.description && (
          <span className="mt-0.5 line-clamp-2 block max-w-72 text-xs text-muted-foreground">{activity.description}</span>
        )}
      </td>
      <td className="min-w-28 px-3 py-2.5">{activity.type_display}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {activity.assigned_to_name ? (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-full bg-background text-[10px] font-semibold ring-1 ring-border"
            >
              {initials(activity.assigned_to_name)}
            </span>
            {activity.assigned_to_name}
          </span>
        ) : (
          <span className="text-muted-foreground">Not assigned</span>
        )}
      </td>
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
      <td className="px-3 py-2.5">
        <FollowUpBadge status={activity.status} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {formatDate(activity.created_at)}
        {activity.created_by_name && (
          <span className="block text-xs text-muted-foreground">{activity.created_by_name}</span>
        )}
      </td>
      <td className={`${stickyCell} right-0 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)]`}>
        <div className="flex items-center justify-end gap-1">
          {pending ? (
            activity.can_edit && (
              <button
                type="button"
                onClick={() => {
                  if (!busy) onComplete(activity);
                }}
                // aria-disabled, not disabled, while saving: a disabled button would drop the keyboard focus.
                aria-disabled={busy || undefined}
                aria-label={`Mark complete: ${heading(activity)} (${activity.lead_name})`}
                className={`${secondaryButton} h-8 px-2.5 whitespace-nowrap aria-disabled:opacity-50`}
              >
                Mark complete
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
        onClick={(event) => placeMenu(event.currentTarget, menuId, 150)}
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

type FilterPanelProps = { id: string; searchParams: URLSearchParams; onDone: () => void };

function FilterPanel({ id, searchParams, onDone }: FilterPanelProps) {
  const assignees = useApi<Assignee[]>("/leads/assignees/");
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
      className="mt-3 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="text-sm">
        <span className="mb-1.5 block font-medium">Type</span>
        <select {...bind("type")}>
          <option value="">All types</option>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium">Assigned staff</span>
        <select {...bind("assigned_to")}>
          <option value="">{assignees.error ? "Anyone (staff couldn't be loaded)" : "Anyone"}</option>
          {assignees.data?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium">Due from</span>
        <input type="date" max={draft.due_before || undefined} {...bind("due_after")} />
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium">Due to</span>
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
