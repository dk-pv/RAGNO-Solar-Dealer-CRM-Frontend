"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ChangeEvent, type ReactNode } from "react";

import { FilterIcon, PlusIcon, SearchIcon } from "@/components/layout/icons";
import { useApi } from "@/lib/api";
import { LEAD_SOURCES, LEAD_STATUSES, type Assignee, type Plan } from "./api";
import { PageHeader, ViewSwitch, fieldClass, inputClass, primaryButton, secondaryButton, segmentClass, segmentedClass } from "./ui";

export const FILTER_KEYS = ["status", "plan", "assigned_to", "source", "created_after", "created_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The search, filters and sort that the list and the pipeline share. The URL query and the API query use the same names.
export const VIEW_KEYS = ["search", ...FILTER_KEYS, "ordering"];
export const DEFAULT_ORDERING = "-created_at";

// The API always lists pinned leads first, then in the chosen order.
export const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "name", label: "Customer name (A–Z)" },
  { value: "-name", label: "Customer name (Z–A)" },
  { value: "status", label: "Status" },
  { value: "next_follow_up", label: "Next follow-up" },
  { value: "-amount", label: "Amount: high to low" },
  { value: "amount", label: "Amount: low to high" },
  { value: "plan__capacity", label: "Plan size" },
  { value: "assigned_to__name", label: "Assigned staff" },
];

// The given keys of the URL query that have a value, as an API query.
export function pickParams(searchParams: { get: (key: string) => string | null }, keys: string[]) {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

// Search, filters, sort and page live in the URL, so a refresh or the back button keeps the view.
// replaceState updates useSearchParams without a server round trip (Next.js integrates the History API).
export function updateQuery(changes: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  // Any change other than paging starts again from the first page.
  if (!("page" in changes)) params.delete("page");
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

const VIEWS = [
  { label: "List", href: "/leads" },
  { label: "Pipeline", href: "/leads/pipeline" },
];

type LeadsHeaderProps = { title: string; description?: string; onAdd: () => void };

// The heading of the Leads pages, with the List/Pipeline switch and Add Lead.
export function LeadsHeader({ title, description, onAdd }: LeadsHeaderProps) {
  const searchParams = useSearchParams();
  // Both views show the same leads, so switching keeps the search, filters and sort.
  const query = pickParams(searchParams, VIEW_KEYS).toString();

  return (
    <PageHeader title={title} description={description}>
      <ViewSwitch label="Leads view" views={VIEWS} query={query} />
      <button type="button" onClick={onAdd} className={primaryButton}>
        <PlusIcon className="size-4" />
        Add Lead
      </button>
    </PageHeader>
  );
}

type LeadsToolbarProps = { sortOptions?: typeof SORT_OPTIONS; children?: ReactNode };

// Search (as the user types), filters and sort, all kept in the URL. `children` adds the page's own buttons.
export function LeadsToolbar({ sortOptions = SORT_OPTIONS, children }: LeadsToolbarProps) {
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterPanelId = useId();

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox label="Search leads" placeholder="Search name, phone, email or ID" />
        <FilterToggle
          open={filtersOpen}
          onToggle={() => setFiltersOpen((open) => !open)}
          controls={filterPanelId}
          active={FILTER_KEYS.filter((key) => searchParams.get(key)).length}
        />
        <SortSelect options={sortOptions} defaultValue={DEFAULT_ORDERING} />
        {children}
      </div>
      {filtersOpen && <FilterPanel id={filterPanelId} searchParams={searchParams} onDone={() => setFiltersOpen(false)} />}
    </>
  );
}

// The toolbar pieces below are shared by every list and board: the Leads and Works pages and both Activities pages.

// The URL's ?status=, as a row of toggles: All, then each status. Both Activities pages narrow their list with it.
export function StatusTabs({ statuses }: { statuses: readonly { value: string; label: string }[] }) {
  const status = useSearchParams().get("status") ?? "";
  return (
    <div role="group" aria-label="Status" className={segmentedClass}>
      {[{ value: "", label: "All" }, ...statuses].map((tab) => (
        <button
          key={tab.value}
          type="button"
          aria-pressed={status === tab.value}
          onClick={() => updateQuery({ status: tab.value || null })}
          className={segmentClass}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// The URL's ?search=, typed into a search box.
export function SearchBox({ label, placeholder }: { label: string; placeholder: string }) {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [shownSearch, setShownSearch] = useState(search);
  const [sentSearch, setSentSearch] = useState<string>(); // this box's latest search, until the URL shows it

  // The URL's search changed from elsewhere (a Clear button, Back): show it in the box. The box's own search arriving in
  // the URL is left alone, so what was typed since isn't overwritten.
  if (search !== shownSearch) {
    setShownSearch(search);
    if (search === sentSearch) setSentSearch(undefined);
    else if (search !== searchText.trim()) setSearchText(search);
  }

  // Search as the user types, once they pause.
  useEffect(() => {
    const next = searchText.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSentSearch(next);
      updateQuery({ search: next || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
      <input
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${inputClass} pl-8`}
      />
    </div>
  );
}

type FilterToggleProps = { open: boolean; onToggle: () => void; controls: string; active: number };

// Shows and hides a filter panel; the badge counts the filters in use.
export function FilterToggle({ open, onToggle, controls, active }: FilterToggleProps) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} className={secondaryButton}>
      <FilterIcon className="size-4" />
      Filter
      {active > 0 && <span className="rounded bg-primary px-1.5 text-xs leading-5 text-white">{active}</span>}
    </button>
  );
}

// The URL's ?ordering=, left out of the URL when it's the default.
export function SortSelect({ options, defaultValue }: { options: { value: string; label: string }[]; defaultValue: string }) {
  const ordering = useSearchParams().get("ordering") ?? defaultValue;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Sort</span>
      <select
        value={options.some((option) => option.value === ordering) ? ordering : defaultValue}
        onChange={(event) => updateQuery({ ordering: event.target.value === defaultValue ? null : event.target.value })}
        className={`${fieldClass} h-9`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type FilterPanelProps = { id: string; searchParams: URLSearchParams; onDone: () => void };

function FilterPanel({ id, searchParams, onDone }: FilterPanelProps) {
  const plans = useApi<Plan[]>("/plans/");
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
      className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Status</span>
        <select {...bind("status")}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
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
          <option value="">{assignees.error ? "Anyone (staff couldn't be loaded)" : "Anyone"}</option>
          {assignees.data?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Lead source</span>
        <select {...bind("source")}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((source) => (
            <option key={source.value} value={source.value}>
              {source.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Created from</span>
        <input type="date" max={draft.created_before || undefined} {...bind("created_after")} />
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium text-label">Created to</span>
        <input type="date" min={draft.created_after || undefined} {...bind("created_before")} />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
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
