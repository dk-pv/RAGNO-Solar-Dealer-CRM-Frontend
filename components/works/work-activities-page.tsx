"use client";

import { useSearchParams } from "next/navigation";
import { useContext, useId, useState, type ChangeEvent } from "react";

import { PlusIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { ACTIVITY_TYPES, withRow, type Assignee, type Page } from "@/components/leads/api";
import { FilterToggle, SearchBox, SortSelect, StatusTabs, pickParams, updateQuery } from "@/components/leads/leads-toolbar";
import { PageHeader, fillClass, inputClass, primaryButton, secondaryButton, useNotice } from "@/components/leads/ui";
import { ColumnsButton, DEFAULT_PAGE_SIZE, EmptyState, ListShell, useColumns } from "@/components/table";
import { useApi } from "@/lib/api";
import { ACTIVITY_STATUSES, type WorkActivity } from "./api";
import { ActivityDialog, WORK_ACTIVITY_COLUMNS, WorkActivityTable, useActivityRowActions } from "./work-activities";

const FILTER_KEYS = ["type", "assigned_to", "due_after", "due_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", "status", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-work";

// Must match the backend's Work activity orderings. All but due date keep each Work's activities together.
const SORT_OPTIONS = [
  { value: "-work", label: "Newest Work first" },
  { value: "work", label: "Oldest Work first" },
  { value: "customer_name", label: "Customer name" },
  { value: "due_date", label: "Due date (soonest first)" },
];

// Work Activities: every Work's activities and follow-ups in one table, each Work's rows together and in the Work's own
// colour. Built from the same pieces as Lead Activities: the status tabs, search, filters, sort, columns and paging,
// all kept in the URL.
export function WorkActivitiesPage() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, QUERY_KEYS);
  const { data, error, loading, reload, replace } = useApi<Page<WorkActivity>>(
    query.toString() ? `/activities/works/?${query}` : "/activities/works/",
  );
  // Adding and editing activities, and choosing whose to list, are for admins; staff see and complete only their own,
  // and never load the staff list (it needs the Work module).
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  const assignees = useApi<Assignee[]>(isAdmin ? "/works/assignees/" : null);
  const [noticeElement, notify] = useNotice();
  const rowActions = useActivityRowActions(
    notify,
    (saved) => {
      if (data) replace(withRow(data, saved)); // shown at once (a completed one can't be completed twice)
      reload();
    },
    assignees,
  );
  const [adding, setAdding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [clears, setClears] = useState(0);
  const filterPanelId = useId();
  const columns = useColumns("work-activities", WORK_ACTIVITY_COLUMNS);

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const activeFilters = FILTER_KEYS.filter((key) => searchParams.get(key)).length;
  const narrowed = Boolean(searchParams.get("search") || searchParams.get("status")) || activeFilters > 0;

  function clearAll() {
    updateQuery(Object.fromEntries(["search", "status", ...FILTER_KEYS].map((key) => [key, null])));
    setClears((count) => count + 1); // a fresh search box drops a search still being typed
    setFiltersOpen(false);
  }

  return (
    <div className={fillClass}>
      <PageHeader
        title="Work Activities"
        description={data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "activity" : "activities"}` : undefined}
      >
        {isAdmin && (
          <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
            <PlusIcon className="size-4" />
            Add activity
          </button>
        )}
      </PageHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusTabs statuses={ACTIVITY_STATUSES} />
        <SearchBox key={clears} label="Search activities" placeholder="Search customer, Work ID, activity or staff" />
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
          assignees={assignees.data}
          onDone={() => {
            setFiltersOpen(false);
            // The panel, and the button pressed in it, go away.
            document.querySelector<HTMLElement>(`[aria-controls="${filterPanelId}"]`)?.focus();
          }}
        />
      )}

      <ListShell
        noun="activities"
        error={error}
        onRetry={reload}
        page={page}
        pageSize={pageSize}
        count={data?.count}
        loading={loading}
        boxed
        empty={
          narrowed ? (
            <EmptyState title="No activities match your search or filters." hint="Try a different search, or clear the filters.">
              <button type="button" onClick={clearAll} className={secondaryButton}>
                Clear search and filters
              </button>
            </EmptyState>
          ) : isAdmin ? (
            <EmptyState title="No activities yet." hint="Add a follow-up to keep track of the next action on a Work.">
              <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
                Add activity
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No activities assigned to you." hint="Work activities an admin assigns to you show here." />
          )
        }
      >
        <WorkActivityTable
          rows={data?.results}
          loading={loading}
          showWork
          shows={columns.shows}
          onEdit={rowActions.edit}
          onComplete={rowActions.complete}
        />
      </ListShell>

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

// `showAssignee`: whose activities to list can be chosen (admins).
type FilterPanelProps = { id: string; searchParams: URLSearchParams; showAssignee: boolean; assignees?: Assignee[]; onDone: () => void };

function FilterPanel({ id, searchParams, showAssignee, assignees, onDone }: FilterPanelProps) {
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
            <option value="">Anyone</option>
            {assignees?.map((person) => (
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
