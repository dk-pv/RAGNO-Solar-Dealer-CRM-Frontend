"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useEffect, useId, useState, type ChangeEvent } from "react";

import { ChevronLeftIcon, FilterIcon, FlagIcon, PinIcon, SearchIcon, TrashIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, formatPhone, type Assignee, type Page, type Plan } from "@/components/leads/api";
import { Pagination } from "@/components/leads/leads-page";
import { updateQuery } from "@/components/leads/leads-toolbar";
import {
  ErrorState,
  ViewSwitch,
  emptyAreaClass,
  fieldClass,
  fillClass,
  inputClass,
  messageAreaClass,
  primaryButton,
  secondaryButton,
  secondaryDangerButton,
  tableAreaClass,
  useNotice,
} from "@/components/leads/ui";
import {
  ActionDialog,
  BulkBar,
  ChoiceDialog,
  RowCheckbox,
  SelectAllCheckbox,
  SelectionAnnouncement,
  describeBulkResult,
  useSelection,
  type BulkResult,
} from "@/components/selection";
import { toApiError, useApi } from "@/lib/api";
import {
  WORK_STAGES,
  bulkChangeWorkStage,
  bulkDeleteWorks,
  stageFor,
  today,
  updateWork,
  type Work,
  type WorkChanges,
  type WorkStage,
} from "./api";
import { WorkMenu, WorkPinButton, isOverdue, useWorkActions, type WorkActions } from "./work-actions";

const FILTER_KEYS = ["stage", "plan", "assigned_to", "created_after", "created_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-created_at";
const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const COLUMN_COUNT = 14;

type BulkAction = "stage" | "delete";

// The List and Pipeline show the same Works; both headers switch between them.
export const WORK_VIEWS = [
  { label: "List", href: "/works" },
  { label: "Pipeline", href: "/works/pipeline" },
];

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
  const [noticeElement, notify] = useNotice();
  const actions = useWorkActions(notify, reload, assignees);
  const filterPanelId = useId();
  // Deleting Works is an admin's decision on the API; only admins are offered it.
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

  // The rows selected on this page, for the bulk actions. A new search, filter, sort or page starts with none selected.
  const rows = data?.results ?? [];
  const selection = useSelection(rows.map((work) => work.id), query.toString());
  const [bulkAction, setBulkAction] = useState<BulkAction>();

  // Runs a bulk action on the selected Works and reports what went through and what didn't. The selection is kept when
  // nothing went through, so the user can change it and try again.
  async function runBulk(request: (ids: number[]) => Promise<BulkResult>, past: string) {
    const result = await request(selection.selected);
    notify(describeBulkResult(result, "work", past));
    if (result.succeeded.length > 0) selection.clear();
    reload();
  }

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
      <div className={`${messageAreaClass} mt-4`}>
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message="There are fewer works than before."
            onRetry={() => updateQuery({ page: null })}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState title="Couldn't load Works" message={error.message} onRetry={reload} />
        )}
      </div>
    );
  } else if (data && data.count === 0 && !loading) {
    const filtered = Boolean(search) || activeFilters > 0;
    content = (
      <div className={`${emptyAreaClass} mt-4`}>
        <p className="text-sm font-medium">{filtered ? "No works match your search or filters." : "No works yet."}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? "Try a different search, or clear the filters."
            : "A Work is created when a Won lead is converted. It appears here straight away."}
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
    const loaded = rows.length > 0;
    content = (
      <>
        <SelectionAnnouncement count={selection.count} />
        {selection.count > 0 && (
          <BulkBar count={selection.count} onClear={selection.clear}>
            <button type="button" onClick={() => setBulkAction("stage")} className={secondaryButton}>
              <FlagIcon className="size-4" />
              Update Stage
            </button>
            {isAdmin && (
              <button type="button" onClick={() => setBulkAction("delete")} className={secondaryDangerButton}>
                <TrashIcon className="size-4" />
                Delete
              </button>
            )}
          </BulkBar>
        )}
        <div className={`${tableAreaClass} ${selection.count > 0 ? "mt-3" : "mt-4"}`}>
          <table
            aria-busy={loading}
            className={`w-full min-w-310 text-sm transition-opacity ${loading && loaded ? "opacity-60" : ""}`}
          >
            <caption className="sr-only">Works</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <SelectAllCheckbox
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    onChange={selection.toggleAll}
                    disabled={!loaded}
                    label="Select all works on this page"
                  />
                </th>
                <th scope="col" className="w-11 px-3 py-2.5">
                  <PinIcon className="size-3.5" />
                  <span className="sr-only">Pinned</span>
                </th>
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
                <th scope="col" className="px-3 py-2.5">Next follow-up</th>
                <th scope="col" className="px-3 py-2.5">Converted</th>
                <th scope="col" className="sticky right-0 z-1 w-12 bg-page px-2 py-2.5 shadow-[inset_1px_0_0_var(--color-border)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loaded ? (
                rows.map((work) => (
                  // Keyed by the last update too, so a row starts fresh once its saved change has reloaded.
                  <WorkRow
                    key={`${work.id}-${work.updated_at}`}
                    work={work}
                    selected={selection.isSelected(work.id)}
                    onToggle={() => selection.toggle(work.id)}
                    assignees={assignees.data}
                    actions={actions}
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
        <Pagination page={page} pageSize={pageSize} count={data?.count} loading={loading} />
      </>
    );
  }

  // The bulk actions' confirmations. Each closes on success, shows the API's message on failure, and reports per Work.
  const count = selection.count;
  const worksWord = count === 1 ? "work" : "works";
  const bulkDialog =
    bulkAction === "stage" ? (
      <ChoiceDialog
        title={`Move ${count} selected ${worksWord} to a stage`}
        description="Every selected Work moves to the chosen stage of the Work Pipeline, in either direction, as the row's stage control does for one."
        label="Stage"
        placeholder="Choose a stage"
        options={WORK_STAGES}
        confirmLabel="Update Stage"
        pendingLabel="Updating…"
        onConfirm={(value) => runBulk((ids) => bulkChangeWorkStage(ids, value as WorkStage), "updated")}
        onClose={() => setBulkAction(undefined)}
        onError={(text) => notify({ text, error: true })}
      />
    ) : bulkAction === "delete" ? (
      <ActionDialog
        destructive
        title={`Delete ${count} selected ${worksWord}?`}
        description="This action will permanently remove these Works and their activity history. Each lead stays Won and can be converted again. Users are never affected."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => runBulk(bulkDeleteWorks, "deleted")}
        onClose={() => setBulkAction(undefined)}
        onError={(text) => notify({ text, error: true })}
      />
    ) : null;

  return (
    <div className={fillClass}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Works</h1>
          <p className="mt-0.5 min-h-5 text-sm text-muted-foreground">
            {data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "work" : "works"}` : " "}
          </p>
        </div>
        <ViewSwitch label="Works view" views={WORK_VIEWS} />
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

      {actions.dialogs}
      {bulkDialog}
      {noticeElement}
    </div>
  );
}

type WorkRowProps = {
  work: Work;
  selected: boolean;
  onToggle: () => void;
  assignees?: Assignee[];
  actions: WorkActions;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
};

const chevron = (
  <ChevronLeftIcon className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 -rotate-90 opacity-70" />
);

function WorkRow({ work, selected, onToggle, assignees, actions, onSaved, onError }: WorkRowProps) {
  // A change being saved shows straight away; if the API refuses it, the saved value comes back.
  const [pending, setPending] = useState<WorkChanges>();
  const [saving, setSaving] = useState(false);
  const location = [work.area, work.district].filter(Boolean).join(", ");
  const overdue = isOverdue(work);
  // Sticky cells need an opaque background: the row's own colour (selected or not), and the solid hover colour.
  const stickyCell = `sticky z-1 ${selected ? "bg-primary-softer" : "bg-background"} group-hover:bg-row-hover`;

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
    <tr aria-selected={selected} className={`group border-b border-border last:border-0 hover:bg-row-hover ${selected ? "bg-primary-softer" : ""}`}>
      <td className="px-3 py-1.5">
        <RowCheckbox checked={selected} onChange={onToggle} label={`Select ${work.customer_name}`} />
      </td>
      <td className="px-1.5 py-1.5">
        {/* Unpinned rows show a faint pin until hovered, so the pinned ones stand out. */}
        <WorkPinButton
          work={work}
          actions={actions}
          className="size-8 opacity-40 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">#{work.id}</td>
      <th scope="row" className={`${stickyCell} left-0 px-3 py-2 text-left font-medium`}>
        <Link href={`/works/${work.id}`} className="block max-w-52 truncate hover:underline">
          {work.customer_name}
        </Link>
        {/* On a phone the Stage column is off to the right, so the stage also sits under the name. */}
        <span className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground sm:hidden">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${stage.dot}`} />
          {stage.label}
        </span>
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
            className={`cursor-pointer appearance-none rounded-md py-0.5 pr-6 pl-2 text-xs font-medium hover:ring-1 hover:ring-border-strong pointer-coarse:min-h-11 disabled:cursor-wait disabled:opacity-60 ${stage.header}`}
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
              className={`cursor-pointer appearance-none rounded-md bg-transparent py-1 pr-6 pl-1.5 text-sm hover:bg-muted pointer-coarse:min-h-11 disabled:cursor-wait disabled:opacity-60 ${
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
      <td className="px-3 py-2 whitespace-nowrap">
        <NextFollowUp work={work} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(work.created_at)}</td>
      <td className={`${stickyCell} right-0 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)]`}>
        <WorkMenu work={work} actions={actions} />
      </td>
    </tr>
  );
}

// The earliest due date among the Work's pending activities, linked to them.
function NextFollowUp({ work }: { work: Work }) {
  if (work.pending_activity_count === 0) return <span className="text-muted-foreground">—</span>;
  const overdue = work.next_activity_due !== null && work.next_activity_due < today();
  return (
    <Link
      href={`/works/${work.id}#activities`}
      className={`underline-offset-2 hover:underline ${overdue ? "font-medium text-error" : ""}`}
    >
      {work.next_activity_due ? formatDate(work.next_activity_due) : "No date"}
      {overdue ? " · Overdue" : ""}
      <span className="block text-xs font-normal text-muted-foreground">{work.pending_activity_count} pending</span>
    </Link>
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
      className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3"
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
