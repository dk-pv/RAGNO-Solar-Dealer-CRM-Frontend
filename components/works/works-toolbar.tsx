"use client";

import { useSearchParams } from "next/navigation";
import { useId, useState, type ChangeEvent, type ReactNode } from "react";

import type { Assignee, Plan } from "@/components/leads/api";
import { FilterToggle, SearchBox, SortSelect, pickParams, updateQuery } from "@/components/leads/leads-toolbar";
import { PageHeader, ViewSwitch, inputClass, primaryButton, secondaryButton } from "@/components/leads/ui";
import { useApi } from "@/lib/api";
import { WORK_STAGES } from "./api";

export const FILTER_KEYS = ["stage", "plan", "assigned_to", "created_after", "created_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The search, filters and sort that the list and the pipeline share. The URL query and the API query use the same names.
export const VIEW_KEYS = ["search", ...FILTER_KEYS, "ordering"];
export const DEFAULT_ORDERING = "-created_at";

// Must match the backend's Work orderings. The API always lists pinned Works first, then in the chosen order.
export const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "customer_name", label: "Customer name" },
  { value: "stage", label: "Stage" },
  { value: "due_date", label: "Due date" },
  { value: "-amount", label: "Amount: high to low" },
  { value: "amount", label: "Amount: low to high" },
];

// The List and Pipeline show the same Works; both headers switch between them.
const VIEWS = [
  { label: "List", href: "/works" },
  { label: "Pipeline", href: "/works/pipeline" },
];

// The heading of the Works pages, with the List/Pipeline switch, as the Leads pages have theirs. A Work is created only
// by converting a lead, so there is nothing to add here.
export function WorksHeader({ title, description }: { title: string; description?: string }) {
  const searchParams = useSearchParams();
  // Both views show the same Works, so switching keeps the search, filters and sort.
  const query = pickParams(searchParams, VIEW_KEYS).toString();

  return (
    <PageHeader title={title} description={description}>
      <ViewSwitch label="Works view" views={VIEWS} query={query} />
    </PageHeader>
  );
}

type WorksToolbarProps = { sortOptions?: typeof SORT_OPTIONS; assignees?: Assignee[]; children?: ReactNode };

// Search (as the user types), filters and sort, all kept in the URL, built from the same pieces as the Leads toolbar.
// `children` adds the page's own buttons.
export function WorksToolbar({ sortOptions = SORT_OPTIONS, assignees, children }: WorksToolbarProps) {
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPanelId = useId();

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox label="Search works" placeholder="Search customer, phone or Work ID" />
        <FilterToggle
          open={filtersOpen}
          onToggle={() => setFiltersOpen((open) => !open)}
          controls={filterPanelId}
          active={FILTER_KEYS.filter((key) => searchParams.get(key)).length}
        />
        <SortSelect options={sortOptions} defaultValue={DEFAULT_ORDERING} />
        {children}
      </div>
      {filtersOpen && (
        <FilterPanel id={filterPanelId} searchParams={searchParams} assignees={assignees} onDone={() => setFiltersOpen(false)} />
      )}
    </>
  );
}

type FilterPanelProps = { id: string; searchParams: URLSearchParams; assignees?: Assignee[]; onDone: () => void };

function FilterPanel({ id, searchParams, assignees, onDone }: FilterPanelProps) {
  const plans = useApi<Plan[]>("/plans/");
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
      // On a wide screen each filter keeps a field's width (24rem at most) instead of a third of the page.
      className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,24rem))]"
    >
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Stage</span>
        <select {...bind("stage")}>
          <option value="">All stages</option>
          {WORK_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Plan</span>
        <select {...bind("plan")}>
          <option value="">{plans.error ? "All plans (plans couldn't be loaded)" : "All plans"}</option>
          {plans.data?.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
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
        <span className="mb-1.5 block font-medium text-label">Converted from</span>
        <input type="date" max={draft.created_before || undefined} {...bind("created_after")} />
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Converted to</span>
        <input type="date" min={draft.created_after || undefined} {...bind("created_before")} />
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
