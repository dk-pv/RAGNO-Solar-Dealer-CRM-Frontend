"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ChangeEvent } from "react";

import { FilterIcon, PlusIcon, SearchIcon } from "@/components/layout/icons";
import { ACTIVITY_TYPES, type Assignee, type Page } from "@/components/leads/api";
import { Pagination } from "@/components/leads/leads-page";
import { updateQuery } from "@/components/leads/leads-toolbar";
import { ErrorState, fieldClass, inputClass, primaryButton, secondaryButton, useNotice } from "@/components/leads/ui";
import { useApi } from "@/lib/api";
import { ACTIVITY_STATUSES, type WorkActivity } from "./api";
import { ActivityDialog, WorkActivityTable, useActivityRowActions } from "./work-activities";

const FILTER_KEYS = ["status", "type", "assigned_to", "due_after", "due_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-work";
const DEFAULT_PAGE_SIZE = 25; // the API's default page size

// Must match the backend's Work activity orderings. All but due date keep each Work's activities together.
const SORT_OPTIONS = [
  { value: "-work", label: "Newest Work first" },
  { value: "work", label: "Oldest Work first" },
  { value: "customer_name", label: "Customer name" },
  { value: "due_date", label: "Due date (soonest first)" },
];

// Every Work's activities and follow-ups in one table, each Work's rows together and in the Work's own colour.
export function WorkActivitiesPage() {
  const searchParams = useSearchParams();
  const query = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  const { data, error, loading, reload } = useApi<Page<WorkActivity>>(
    query.toString() ? `/activities/works/?${query}` : "/activities/works/",
  );
  const assignees = useApi<Assignee[]>("/works/assignees/");
  const [noticeElement, notify] = useNotice();
  const rowActions = useActivityRowActions(notify, reload, assignees);
  const [adding, setAdding] = useState(false);

  const search = searchParams.get("search") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPanelId = useId();

  // Search as the user types, once they pause.
  useEffect(() => {
    const next = searchText.trim();
    if (next === search) return;
    const timer = setTimeout(() => updateQuery({ search: next || null }), 300);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const activeFilters = FILTER_KEYS.filter((key) => searchParams.get(key)).length;
  const filtered = Boolean(search) || activeFilters > 0;

  function clearSearchAndFilters() {
    setSearchText("");
    updateQuery(Object.fromEntries(["search", ...FILTER_KEYS].map((key) => [key, null])));
  }

  const addButton = (
    <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
      <PlusIcon className="size-4" />
      Add Activity
    </button>
  );

  let content;
  if (error) {
    content = (
      <div className="mt-4 rounded-lg border border-border bg-background">
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message="There are fewer activities than before."
            onRetry={() => updateQuery({ page: null })}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState title="Unable to load activities" message="Something went wrong while loading them." onRetry={reload} />
        )}
      </div>
    );
  } else if (data && data.count === 0 && !loading) {
    content = (
      <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-background px-4 py-12 text-center">
        <p className="text-sm font-medium">{filtered ? "No activities match your search or filters." : "No activities found."}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered ? "Try a different search, or clear the filters." : "Add a follow-up to keep track of the next action on a Work."}
        </p>
        <div className="mt-4">
          {filtered ? (
            <button type="button" onClick={clearSearchAndFilters} className={secondaryButton}>
              Clear search and filters
            </button>
          ) : (
            addButton
          )}
        </div>
      </div>
    );
  } else {
    content = (
      <>
        <div className="mt-4">
          <WorkActivityTable
            rows={data?.results}
            loading={loading}
            showWork
            completingId={rowActions.completingId}
            onEdit={rowActions.edit}
            onComplete={rowActions.complete}
          />
        </div>
        {data && data.count > 0 && <Pagination page={page} pageSize={pageSize} count={data.count} />}
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Work Activities</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "activity" : "activities"}` : " "}
          </p>
        </div>
        {addButton}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-96">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search customer, Work ID, activity or staff"
            aria-label="Search activities"
            className={`${inputClass} pl-8`}
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls={filterPanelId}
          className={secondaryButton}
        >
          <FilterIcon className="size-4" />
          Filter
          {activeFilters > 0 && <span className="rounded bg-primary px-1.5 text-xs leading-5 text-white">{activeFilters}</span>}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={searchParams.get("ordering") ?? DEFAULT_ORDERING}
            onChange={(event) =>
              updateQuery({ ordering: event.target.value === DEFAULT_ORDERING ? null : event.target.value })
            }
            className={`${fieldClass} h-9`}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtersOpen && (
        <FilterPanel
          id={filterPanelId}
          searchParams={searchParams}
          assignees={assignees.data}
          onDone={() => setFiltersOpen(false)}
        />
      )}

      {content}

      {rowActions.dialog}
      {adding && (
        <ActivityDialog
          assignees={assignees}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            notify({ text: `Added an activity to ${saved.work_summary.customer_name}.` });
            reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type FilterPanelProps = { id: string; searchParams: URLSearchParams; assignees?: Assignee[]; onDone: () => void };

function FilterPanel({ id, searchParams, assignees, onDone }: FilterPanelProps) {
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
      className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Status</span>
        <select {...bind("status")}>
          <option value="">All statuses</option>
          {ACTIVITY_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Activity type</span>
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
        <span className="mb-1.5 block font-medium text-label">Assigned staff</span>
        <select {...bind("assigned_to")}>
          <option value="">Anyone</option>
          {assignees?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Due from</span>
        <input type="date" max={draft.due_before || undefined} {...bind("due_after")} />
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Due to</span>
        <input type="date" min={draft.due_after || undefined} {...bind("due_before")} />
      </label>
      <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-1">
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
