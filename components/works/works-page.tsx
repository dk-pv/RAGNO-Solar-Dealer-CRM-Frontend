"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useEffect, useId, useState, type ChangeEvent } from "react";

import {
  ChevronLeftIcon,
  FilterIcon,
  LeadsIcon,
  MoreIcon,
  PencilIcon,
  PhoneIcon,
  SearchIcon,
  WhatsAppIcon,
} from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, formatPhone, telHref, whatsappHref, type Assignee, type Page, type Plan } from "@/components/leads/api";
import { Pagination, menuItemClass, placeMenu, updateQuery } from "@/components/leads/leads-page";
import { ErrorState, iconButton, inputClass, fieldClass, primaryButton, secondaryButton, useNotice } from "@/components/leads/ui";
import { toApiError, useApi } from "@/lib/api";
import { WORK_STAGES, stageFor, updateWork, type Work, type WorkChanges, type WorkStage } from "./api";
import { WorkDialog, isOverdue } from "./work-pipeline";

const FILTER_KEYS = ["stage", "plan", "assigned_to", "created_after", "created_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-created_at";
const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const COLUMN_COUNT = 11;

// Must match the backend's Work orderings.
const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "customer_name", label: "Customer name" },
  { value: "stage", label: "Stage" },
  { value: "due_date", label: "Due date" },
  { value: "-amount", label: "Amount: high to low" },
  { value: "amount", label: "Amount: low to high" },
];

// Every Work, as a table: one row per converted lead. The same data as the Work Pipeline board.
export function WorksPage() {
  const searchParams = useSearchParams();
  const query = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  const { data, error, loading, reload } = useApi<Page<Work>>(query.toString() ? `/works/?${query}` : "/works/");
  const assignees = useApi<Assignee[]>("/works/assignees/");

  const search = searchParams.get("search") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openWork, setOpenWork] = useState<Work>();
  const [noticeElement, notify] = useNotice();
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

  function clearSearchAndFilters() {
    setSearchText("");
    updateQuery(Object.fromEntries(["search", ...FILTER_KEYS].map((key) => [key, null])));
  }

  let content;
  if (error) {
    content = (
      <div className="mt-4 rounded-lg border border-border bg-background">
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message="There are fewer works than before."
            onRetry={() => updateQuery({ page: null })}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState title="Unable to load Works" message={error.message} onRetry={reload} />
        )}
      </div>
    );
  } else if (data && data.count === 0 && !loading) {
    const filtered = Boolean(search) || activeFilters > 0;
    content = (
      <div className="mt-4 rounded-lg border border-dashed border-border-strong bg-background px-4 py-12 text-center">
        <p className="text-sm font-medium">{filtered ? "No works match your search or filters." : "No works yet."}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "Try a different search, or clear the filters."
            : "A Work is created when a Superhot lead is converted. It appears here straight away."}
        </p>
        {filtered ? (
          <button type="button" onClick={clearSearchAndFilters} className={`${secondaryButton} mt-4`}>
            Clear search and filters
          </button>
        ) : (
          <Link href="/leads" className={`${secondaryButton} mt-4`}>
            Go to Leads
          </Link>
        )}
      </div>
    );
  } else {
    const rows = data && data.results.length > 0 ? data.results : undefined;
    content = (
      <>
        <div className="scrollbar-none mt-4 overflow-x-auto rounded-lg border border-border bg-background">
          <table
            aria-busy={loading}
            className={`w-full min-w-270 text-sm transition-opacity ${loading && rows ? "opacity-60" : ""}`}
          >
            <caption className="sr-only">Works</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="w-16 px-3 py-2.5">
                  Work
                </th>
                <th scope="col" className="sticky left-0 z-1 bg-page px-3 py-2.5">
                  Customer
                </th>
                <th scope="col" className="px-3 py-2.5">Phone</th>
                <th scope="col" className="px-3 py-2.5">Location</th>
                <th scope="col" className="px-3 py-2.5">Plan</th>
                <th scope="col" className="px-3 py-2.5 text-right">Confirmed amount</th>
                <th scope="col" className="px-3 py-2.5">Stage</th>
                <th scope="col" className="px-3 py-2.5">Assigned</th>
                <th scope="col" className="px-3 py-2.5">Due date</th>
                <th scope="col" className="px-3 py-2.5">Converted</th>
                <th scope="col" className="sticky right-0 z-1 w-12 bg-page px-2 py-2.5 shadow-[inset_1px_0_0_var(--color-border)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows ? (
                rows.map((work) => (
                  // Keyed by the last update too, so a row starts fresh once its saved change has reloaded.
                  <WorkRow
                    key={`${work.id}-${work.updated_at}`}
                    work={work}
                    assignees={assignees.data}
                    onOpen={setOpenWork}
                    onSaved={(text) => {
                      notify({ text });
                      reload();
                    }}
                    onError={(text) => notify({ text, error: true })}
                  />
                ))
              ) : (
                <SkeletonRows />
              )}
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
          <h1 className="text-xl font-semibold">Works</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "work" : "works"}` : " "}
          </p>
        </div>
        <Link href="/works/pipeline" className={primaryButton}>
          Open pipeline
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search customer, phone or Work ID"
            aria-label="Search works"
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

      {openWork && (
        <WorkDialog
          work={openWork}
          assignees={assignees}
          onClose={() => setOpenWork(undefined)}
          onSaved={(_, saved) => {
            notify({ text: `Saved changes to ${saved.customer_name}.` });
            reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type WorkRowProps = {
  work: Work;
  assignees?: Assignee[];
  onOpen: (work: Work) => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
};

const chevron = (
  <ChevronLeftIcon className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 -rotate-90 opacity-70" />
);

function WorkRow({ work, assignees, onOpen, onSaved, onError }: WorkRowProps) {
  // A change being saved shows straight away; if the API refuses it, the saved value comes back.
  const [pending, setPending] = useState<WorkChanges>();
  const [saving, setSaving] = useState(false);
  const location = [work.area, work.district].filter(Boolean).join(", ");
  const overdue = isOverdue(work);
  // Sticky cells need an opaque background, so the row hover colour is a solid colour too.
  const stickyCell = "sticky z-1 bg-background group-hover:bg-row-hover";

  const stageValue = pending?.stage ?? work.stage;
  const stage = stageFor(stageValue);
  const assigneeValue = pending && "assigned_to" in pending ? pending.assigned_to : work.assigned_to;
  // Someone no longer active stays listed on a Work that already has them.
  const people = [
    ...(assignees ?? []),
    ...(work.assigned_to && !assignees?.some((person) => person.id === work.assigned_to)
      ? [{ id: work.assigned_to, name: work.assigned_to_name ?? `User #${work.assigned_to}` }]
      : []),
  ];
  const assigneeName = people.find((person) => person.id === assigneeValue)?.name;

  async function save(changes: WorkChanges, message: string) {
    setPending(changes);
    setSaving(true);
    try {
      await updateWork(work.id, changes);
      onSaved(message);
    } catch (error) {
      setPending(undefined);
      onError(`Couldn't update ${work.customer_name}. ${toApiError(error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="group border-b border-border last:border-0 hover:bg-row-hover">
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">#{work.id}</td>
      <th scope="row" className={`${stickyCell} left-0 px-3 py-2 text-left font-medium`}>
        <button type="button" onClick={() => onOpen(work)} className="block max-w-52 truncate text-left hover:underline">
          {work.customer_name}
        </button>
      </th>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatPhone(work)}</td>
      <td className="px-3 py-2">
        <span className="block max-w-48 truncate">{location || "—"}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{work.plan_name}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(work.amount)}</td>
      <td className="px-3 py-2">
        <span className="relative inline-flex">
          <select
            value={stageValue}
            onChange={(event) => {
              const next = event.target.value as WorkStage;
              save({ stage: next }, `Moved ${work.customer_name} to ${stageFor(next).label}.`);
            }}
            disabled={saving}
            aria-label={`Stage for ${work.customer_name}`}
            className={`cursor-pointer appearance-none rounded-md py-0.5 pr-6 pl-2 text-xs font-medium hover:ring-1 hover:ring-border-strong disabled:cursor-wait disabled:opacity-60 ${stage.header}`}
          >
            {WORK_STAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {chevron}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          {assigneeName && (
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-[10px] font-semibold ring-1 ring-border"
            >
              {initials(assigneeName)}
            </span>
          )}
          <span className="relative inline-flex">
            <select
              value={assigneeValue ?? ""}
              onChange={(event) => {
                const id = event.target.value ? Number(event.target.value) : null;
                const name = people.find((person) => person.id === id)?.name;
                save({ assigned_to: id }, name ? `Assigned ${work.customer_name} to ${name}.` : `Unassigned ${work.customer_name}.`);
              }}
              // Until the staff list loads, only the current value could be chosen.
              disabled={saving || !assignees}
              aria-label={`Assigned staff for ${work.customer_name}`}
              className={`cursor-pointer appearance-none rounded-md bg-transparent py-1 pr-6 pl-1.5 text-sm hover:bg-muted disabled:cursor-wait disabled:opacity-60 ${
                assigneeValue ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <option value="">Unassigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            {chevron}
          </span>
        </span>
      </td>
      <td className={`px-3 py-2 whitespace-nowrap ${overdue ? "font-medium text-error" : ""}`}>
        {work.due_date ? `${formatDate(work.due_date)}${overdue ? " · Overdue" : ""}` : "—"}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(work.created_at)}</td>
      <td className={`${stickyCell} right-0 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)]`}>
        <RowActions work={work} onOpen={onOpen} />
      </td>
    </tr>
  );
}

function RowActions({ work, onOpen }: { work: Work; onOpen: (work: Work) => void }) {
  const me = useContext(CurrentUserContext);
  const menuId = useId();
  const hide = () => document.getElementById(menuId)?.hidePopover();
  // The lead's page needs the Leads module.
  const canOpenLeads = me?.role === "ADMIN" || me?.modules.includes("leads");

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
        <button
          type="button"
          onClick={() => {
            hide();
            onOpen(work);
          }}
          className={menuItemClass}
        >
          <PencilIcon className="size-4 text-faint" />
          Stage, staff and due date
        </button>
        <a href={whatsappHref(work)} target="_blank" rel="noopener noreferrer" onClick={hide} className={menuItemClass}>
          <WhatsAppIcon className="size-4 text-faint" />
          WhatsApp
        </a>
        <a href={telHref(work)} onClick={hide} className={menuItemClass}>
          <PhoneIcon className="size-4 text-faint" />
          Call
        </a>
        {canOpenLeads && (
          <Link href={`/leads/${work.lead}`} className={menuItemClass}>
            <LeadsIcon className="size-4 text-faint" />
            View lead #{work.lead}
          </Link>
        )}
      </div>
    </>
  );
}

function SkeletonRows() {
  return Array.from({ length: 8 }, (_, row) => (
    <tr key={row} className="border-b border-border last:border-0">
      {Array.from({ length: COLUMN_COUNT }, (_, cell) => (
        <td key={cell} className="px-3 py-3.5">
          <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
        </td>
      ))}
    </tr>
  ));
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
      className="mt-3 grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3"
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
