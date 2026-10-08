"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useState } from "react";

import { ChevronLeftIcon, FlagIcon, PinIcon, TrashIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, formatPhone, type Assignee, type Page } from "@/components/leads/api";
import { pickParams, updateQuery } from "@/components/leads/leads-toolbar";
import { fillClass, secondaryButton, stickyNameClass, useNotice } from "@/components/leads/ui";
import {
  ActionDialog,
  BulkAction,
  BulkActionBar,
  ChoiceDialog,
  RowCheckbox,
  SelectAllCheckbox,
  SelectionAnnouncement,
  describeBulkResult,
  useSelection,
  type BulkResult,
} from "@/components/selection";
import { ColumnsButton, DEFAULT_PAGE_SIZE, EmptyState, ListShell, SkeletonRows, useColumns, type Columns } from "@/components/table";
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
import { DocumentStatus } from "./work-documents";
import { FILTER_KEYS, VIEW_KEYS, WorksHeader, WorksToolbar } from "./works-toolbar";

// The URL query and the API query use the same names.
const QUERY_KEYS = [...VIEW_KEYS, "page", "page_size"];

// The columns the Columns menu can hide. The customer, and the row's selection, pin and actions, always show.
const COLUMNS = [
  { key: "work", label: "Work ID" },
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "plan", label: "Plan" },
  { key: "amount", label: "Confirmed amount" },
  { key: "stage", label: "Stage" },
  { key: "documents", label: "Documents" },
  { key: "assigned", label: "Assigned" },
  { key: "due", label: "Due date" },
  { key: "follow_up", label: "Next follow-up" },
  { key: "converted", label: "Converted" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];
const FIXED_COLUMNS = 4; // selection, pin, customer, actions

type BulkActionName = "stage" | "delete";

// Every Work, as a table: one row per converted lead. The same data as the Work Pipeline board.
export function WorksPage() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, QUERY_KEYS);
  const { data, error, loading, reload } = useApi<Page<Work>>(query.toString() ? `/works/?${query}` : "/works/");
  const assignees = useApi<Assignee[]>("/works/assignees/");
  const [clears, setClears] = useState(0);
  const [noticeElement, notify] = useNotice();
  const actions = useWorkActions(notify, reload, assignees);
  const columns = useColumns("works", COLUMNS);
  // Deleting Works is an admin's decision on the API; only admins are offered it.
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

  // The rows selected on this page, for the bulk actions. A new search, filter, sort or page starts with none selected.
  const rows = data?.results ?? [];
  const selection = useSelection(rows.map((work) => work.id), query.toString());
  const [bulkAction, setBulkAction] = useState<BulkActionName>();
  const [bulkRunning, setBulkRunning] = useState(false);

  // Runs a bulk action on the selected Works and reports what went through and what didn't. The selection is kept when
  // nothing went through, so the user can change it and try again.
  async function runBulk(request: (ids: number[]) => Promise<BulkResult>, past: string) {
    setBulkRunning(true);
    try {
      const result = await request(selection.selected);
      notify(describeBulkResult(result, "Work", past));
      if (result.succeeded.length > 0) selection.clear();
      reload();
    } finally {
      setBulkRunning(false);
    }
  }

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const filtered = Boolean(searchParams.get("search")) || FILTER_KEYS.some((key) => searchParams.get(key));
  const loaded = rows.length > 0;
  const { shows } = columns;

  // The bulk actions' confirmations. Each closes on success, shows the API's message on failure, and reports per Work.
  const count = selection.count;
  const worksWord = count === 1 ? "work" : "works";
  const showError = (text: string) => notify({ text, error: true });
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
        onError={showError}
      />
    ) : bulkAction === "delete" ? (
      <ActionDialog
        destructive
        title={`Delete ${count} selected ${worksWord}?`}
        description="This action will permanently remove these Works with their activity history and documents. Each lead stays Won and can be converted again. Users are never affected."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => runBulk(bulkDeleteWorks, "deleted")}
        onClose={() => setBulkAction(undefined)}
        onError={showError}
      />
    ) : null;

  return (
    <div className={fillClass}>
      <WorksHeader
        title="Works"
        description={data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "work" : "works"}` : undefined}
      />
      <WorksToolbar key={clears} assignees={assignees.data}>
        <ColumnsButton columns={columns} />
      </WorksToolbar>
      <SelectionAnnouncement count={count} />

      <ListShell
        noun="works"
        error={error}
        onRetry={reload}
        page={page}
        pageSize={pageSize}
        count={data?.count}
        loading={loading}
        empty={
          filtered ? (
            <EmptyState title="No works match your search or filters." hint="Try a different search, or clear the filters.">
              <button
                type="button"
                onClick={() => {
                  updateQuery(Object.fromEntries(["search", ...FILTER_KEYS].map((key) => [key, null])));
                  // A fresh toolbar also drops a search still being typed (not yet in the URL).
                  setClears((current) => current + 1);
                }}
                className={secondaryButton}
              >
                Clear search and filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="No works yet." hint="A Work is created when a Won lead is converted. It appears here straight away.">
              <Link href="/leads" className={secondaryButton}>
                Go to Leads
              </Link>
            </EmptyState>
          )
        }
        bulkBar={
          count > 0 && (
            <BulkActionBar count={count} onClear={selection.clear} busy={bulkRunning}>
              <BulkAction icon={FlagIcon} label="Update Stage" onClick={() => setBulkAction("stage")} />
              {isAdmin && <BulkAction icon={TrashIcon} label="Delete" danger onClick={() => setBulkAction("delete")} />}
            </BulkActionBar>
          )
        }
      >
        <table
          aria-busy={loading}
          // With columns hidden the table is as wide as what's left needs, no wider.
          className={`w-full text-sm transition-opacity ${columns.hiddenCount > 0 ? "min-w-max" : "min-w-350"} ${loading && loaded ? "opacity-60" : ""}`}
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
              {shows("work") && (
                <th scope="col" className="w-16 px-3 py-2.5">
                  Work
                </th>
              )}
              <th scope="col" className="sticky left-0 z-1 bg-page px-3 py-2.5">
                Customer
              </th>
              {shows("phone") && <th scope="col" className="px-3 py-2.5">Phone</th>}
              {shows("location") && <th scope="col" className="px-3 py-2.5">Location</th>}
              {shows("plan") && <th scope="col" className="px-3 py-2.5">Plan</th>}
              {shows("amount") && <th scope="col" className="px-3 py-2.5 text-right">Confirmed amount</th>}
              {shows("stage") && <th scope="col" className="px-3 py-2.5">Stage</th>}
              {shows("documents") && <th scope="col" className="px-3 py-2.5">Documents</th>}
              {shows("assigned") && <th scope="col" className="px-3 py-2.5">Assigned</th>}
              {shows("due") && <th scope="col" className="px-3 py-2.5">Due date</th>}
              {shows("follow_up") && <th scope="col" className="px-3 py-2.5">Next follow-up</th>}
              {shows("converted") && <th scope="col" className="px-3 py-2.5">Converted</th>}
              {/* The actions stay in view beside a wide table; on a phone they would cover the customer, so there they
                  scroll with it. */}
              <th scope="col" className="sticky right-0 z-1 w-12 bg-page px-2 py-2.5 shadow-[inset_1px_0_0_var(--color-border)] max-sm:static">
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
                  shows={shows}
                  selected={selection.isSelected(work.id)}
                  onToggle={() => selection.toggle(work.id)}
                  assignees={assignees.data}
                  actions={actions}
                  onSaved={(text) => {
                    notify({ text });
                    reload();
                  }}
                  onError={showError}
                />
              ))
            ) : (
              <SkeletonRows columns={FIXED_COLUMNS + COLUMNS.length - columns.hiddenCount} />
            )}
          </tbody>
        </table>
      </ListShell>

      {actions.dialogs}
      {bulkDialog}
      {noticeElement}
    </div>
  );
}

type WorkRowProps = {
  work: Work;
  shows: Columns<ColumnKey>["shows"];
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

function WorkRow({ work, shows, selected, onToggle, assignees, actions, onSaved, onError }: WorkRowProps) {
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
      {shows("work") && <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">#{work.id}</td>}
      <th scope="row" className={`${stickyCell} left-0 px-3 py-2 text-left font-medium`}>
        <Link href={`/works/${work.id}`} className={`block ${stickyNameClass} truncate hover:underline`}>
          {work.customer_name}
        </Link>
        {/* On a phone the Stage and Documents columns are off to the right, so both also sit under the name. */}
        <span className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground sm:hidden">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${stage.dot}`} />
          {stage.label}
        </span>
        <DocumentStatus work={work} className="mt-1 sm:hidden" />
      </th>
      {shows("phone") && <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatPhone(work)}</td>}
      {shows("location") && (
        <td className="px-3 py-2">
          <span className="block max-w-[max(12rem,13cqw)] truncate">{location || "—"}</span>
        </td>
      )}
      {shows("plan") && <td className="px-3 py-2 whitespace-nowrap">{work.plan_name}</td>}
      {shows("amount") && <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(work.amount)}</td>}
      {shows("stage") && (
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
      )}
      {shows("documents") && (
        <td className="px-3 py-2 whitespace-nowrap">
          <DocumentStatus work={work} />
        </td>
      )}
      {shows("assigned") && (
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {assigneeName && (
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-[0.625rem] font-semibold ring-1 ring-border"
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
      )}
      {shows("due") && (
        <td className={`px-3 py-2 whitespace-nowrap ${overdue ? "font-medium text-error" : ""}`}>
          {work.due_date ? `${formatDate(work.due_date)}${overdue ? " · Overdue" : ""}` : "—"}
        </td>
      )}
      {shows("follow_up") && (
        <td className="px-3 py-2 whitespace-nowrap">
          <NextFollowUp work={work} />
        </td>
      )}
      {shows("converted") && <td className="px-3 py-2 whitespace-nowrap">{formatDate(work.created_at)}</td>}
      <td className={`${stickyCell} right-0 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)] max-sm:static`}>
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
