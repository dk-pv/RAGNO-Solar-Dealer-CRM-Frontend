"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useState } from "react";

import { ChevronLeftIcon, ConvertIcon, DownloadIcon, FlagIcon, PinIcon, SpinnerIcon, TrashIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
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
  LEAD_STATUSES,
  bulkChangeLeadStatus,
  bulkConvertLeads,
  bulkDeleteLeads,
  changeLeadStatus,
  exportLeads,
  formatDate,
  formatMoney,
  formatPhone,
  statusLabel,
  type Lead,
  type LeadStatus,
  type Page,
} from "./api";
import { LeadMenu, useLeadActions, type LeadActions } from "./lead-actions";
import { FILTER_KEYS, LeadsHeader, LeadsToolbar, VIEW_KEYS, pickParams, updateQuery } from "./leads-toolbar";
import {
  Busy,
  ErrorState,
  PinButton,
  STATUS_STYLES,
  StatusBadge,
  emptyAreaClass,
  fieldClass,
  fillClass,
  iconButton,
  messageAreaClass,
  paginationFooterClass,
  secondaryButton,
  secondaryDangerButton,
  tableAreaClass,
  useNotice,
} from "./ui";

// The URL query and the API query use the same names.
const QUERY_KEYS = [...VIEW_KEYS, "page", "page_size"];
const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const PAGE_SIZES = [10, 25, 50, 100];
const COLUMN_COUNT = 12;

type BulkAction = "status" | "convert" | "delete";

// The Works list imports these from here.
export { menuItemClass, placeMenu } from "./lead-actions";
export { updateQuery } from "./leads-toolbar";

export function LeadsPage() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, QUERY_KEYS);
  const { data, error, loading, reload } = useApi<Page<Lead>>(query.toString() ? `/leads/?${query}` : "/leads/");

  const [exporting, setExporting] = useState(false);
  const [clears, setClears] = useState(0);
  const [noticeElement, notify] = useNotice();
  const actions = useLeadActions(notify, reload);
  // Exporting the whole customer list is admin-only on the API, so only admins are offered it.
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

  const search = searchParams.get("search") ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const activeFilters = FILTER_KEYS.filter((key) => searchParams.get(key)).length;
  const showError = (text: string) => notify({ text, error: true });

  // The rows selected on this page, for the bulk actions. A new search, filter, sort or page starts with none selected.
  const rows = data?.results ?? [];
  const selection = useSelection(rows.map((lead) => lead.id), query.toString());
  const selectedLeads = rows.filter((lead) => selection.isSelected(lead.id));
  const [bulkAction, setBulkAction] = useState<BulkAction>();
  // Offered when they could apply to at least one selected lead; the API decides lead by lead.
  const canBulkChange = selectedLeads.some((lead) => lead.can_edit);
  const canBulkConvert = selectedLeads.some((lead) => lead.can_convert);
  const canBulkDelete = selectedLeads.some((lead) => lead.can_delete);

  // Runs a bulk action on the selected leads and reports what went through and what didn't. The selection is kept when
  // nothing went through, so the user can change it and try again.
  async function runBulk(request: (ids: number[]) => Promise<BulkResult>, noun: string, past: string) {
    const result = await request(selection.selected);
    notify(describeBulkResult(result, noun, past));
    if (result.succeeded.length > 0) selection.clear();
    reload();
  }

  async function exportCsv() {
    // Same search, filters and sort as the table, without paging.
    const exportQuery = new URLSearchParams(query);
    exportQuery.delete("page");
    exportQuery.delete("page_size");
    setExporting(true);
    try {
      await exportLeads(exportQuery);
    } catch (err) {
      showError(toApiError(err).message);
    } finally {
      setExporting(false);
    }
  }

  let content;
  if (error) {
    content = (
      <div className={`${messageAreaClass} mt-4`}>
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message="There are fewer leads than before."
            onRetry={() => updateQuery({ page: null })}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState
            title="Couldn't load leads"
            message={error.status === 404 ? "The leads service isn't available on the server yet." : error.message}
            onRetry={reload}
          />
        )}
      </div>
    );
  } else if (data && data.count === 0 && !loading) {
    const filtered = Boolean(search) || activeFilters > 0;
    content = (
      <div className={`${emptyAreaClass} mt-4`}>
        <p className="text-sm font-medium">{filtered ? "No leads match your search or filters." : "No leads yet."}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered ? "Try a different search, or clear the filters." : "Add a lead to start tracking it through the pipeline."}
        </p>
        <button
          type="button"
          onClick={
            filtered
              ? () => {
                  updateQuery(Object.fromEntries(["search", ...FILTER_KEYS].map((key) => [key, null])));
                  // A fresh toolbar also drops a search still being typed (not yet in the URL).
                  setClears((count) => count + 1);
                }
              : actions.add
          }
          className={`${secondaryButton} mt-4`}
        >
          {filtered ? "Clear search and filters" : "Add Lead"}
        </button>
      </div>
    );
  } else {
    const loaded = rows.length > 0;
    content = (
      <>
        <SelectionAnnouncement count={selection.count} />
        {selection.count > 0 && (
          <BulkBar count={selection.count} onClear={selection.clear}>
            <button type="button" onClick={() => setBulkAction("status")} disabled={!canBulkChange} className={secondaryButton}>
              <FlagIcon className="size-4" />
              Update Status
            </button>
            <button
              type="button"
              onClick={() => setBulkAction("convert")}
              disabled={!canBulkConvert}
              title={canBulkConvert ? undefined : "Only Won leads that don't have a Work yet can be converted."}
              className={secondaryButton}
            >
              <ConvertIcon className="size-4" />
              Convert to Work
            </button>
            {canBulkDelete && (
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
            className={`w-full min-w-280 text-sm transition-opacity ${loading && loaded ? "opacity-60" : ""}`}
          >
            <caption className="sr-only">Leads</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="w-10 px-3 py-2.5">
                  <SelectAllCheckbox
                    checked={selection.allSelected}
                    indeterminate={selection.someSelected}
                    onChange={selection.toggleAll}
                    disabled={!loaded}
                    label="Select all leads on this page"
                  />
                </th>
                <th scope="col" className="w-11 px-3 py-2.5">
                  <PinIcon className="size-3.5" />
                  <span className="sr-only">Pinned</span>
                </th>
                <th scope="col" className="sticky left-0 z-1 bg-page px-3 py-2.5">
                  Customer
                </th>
                <th scope="col" className="px-3 py-2.5">Phone</th>
                <th scope="col" className="px-3 py-2.5">Location</th>
                <th scope="col" className="px-3 py-2.5">Plan</th>
                <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Assigned</th>
                <th scope="col" className="px-3 py-2.5">Created</th>
                <th scope="col" className="px-3 py-2.5">Next follow-up</th>
                <th scope="col" className="sticky right-0 z-1 w-12 bg-page px-2 py-2.5 shadow-[inset_1px_0_0_var(--color-border)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loaded ? (
                rows.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    selected={selection.isSelected(lead.id)}
                    onToggle={() => selection.toggle(lead.id)}
                    actions={actions}
                    onChanged={reload}
                    onStatusChanged={(updated) => {
                      notify({ text: `${updated.name} is now ${statusLabel(updated.status)}.` });
                      reload();
                    }}
                    onError={showError}
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

  // The bulk actions' confirmations. Each closes on success, shows the API's message on failure, and reports per lead.
  const count = selection.count;
  const leadsWord = count === 1 ? "lead" : "leads";
  const bulkDialog =
    bulkAction === "status" ? (
      <ChoiceDialog
        title={`Update the status of ${count} selected ${leadsWord}`}
        description="Each lead moves only where the pipeline allows: forward, or to Won or Lost, which are final. Leads that can't move are listed afterwards and left as they are. Reaching Won doesn't create a Work: convert the lead for that."
        label="New status"
        placeholder="Choose a status"
        options={LEAD_STATUSES}
        confirmLabel="Update Status"
        pendingLabel="Updating…"
        onConfirm={(value) => runBulk((ids) => bulkChangeLeadStatus(ids, value as LeadStatus), "lead", "updated")}
        onClose={() => setBulkAction(undefined)}
        onError={showError}
      />
    ) : bulkAction === "convert" ? (
      <ActionDialog
        title={`Convert ${count} selected ${leadsWord} to Work?`}
        description="Only Won leads that don't have a Work yet are converted, each once; a Work is created for each with its plan and amount. Any other selected lead is left as it is and listed afterwards."
        confirmLabel="Convert to Work"
        pendingLabel="Converting…"
        onConfirm={() => runBulk(bulkConvertLeads, "lead", "converted to Work")}
        onClose={() => setBulkAction(undefined)}
        onError={showError}
      />
    ) : bulkAction === "delete" ? (
      <ActionDialog
        destructive
        title={`Delete ${count} selected ${leadsWord}?`}
        description="This action will permanently remove these CRM records and related CRM activity data. A lead that has been converted keeps its Work and is not deleted."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => runBulk(bulkDeleteLeads, "lead", "deleted")}
        onClose={() => setBulkAction(undefined)}
        onError={showError}
      />
    ) : null;

  return (
    <div className={fillClass}>
      <LeadsHeader
        title="Leads"
        description={data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "lead" : "leads"}` : undefined}
        onAdd={actions.add}
      />
      <LeadsToolbar key={clears}>
        {isAdmin && (
          <button type="button" onClick={exportCsv} disabled={exporting} className={`${secondaryButton} sm:ml-auto`}>
            {exporting ? <Busy>Exporting…</Busy> : <><DownloadIcon className="size-4" />Export</>}
          </button>
        )}
      </LeadsToolbar>
      {content}
      {actions.dialogs}
      {bulkDialog}
      {noticeElement}
    </div>
  );
}

type LeadRowProps = {
  lead: Lead;
  selected: boolean;
  onToggle: () => void;
  actions: LeadActions;
  onChanged: () => void;
  onStatusChanged: (lead: Lead) => void;
  onError: (message: string) => void;
};

function LeadRow({ lead, selected, onToggle, actions, onChanged, onStatusChanged, onError }: LeadRowProps) {
  const location = [lead.area, lead.district].filter(Boolean).join(", ");
  // Sticky cells need an opaque background: the row's own colour (selected or not), and the solid hover colour.
  const stickyCell = `sticky z-1 ${selected ? "bg-primary-softer" : "bg-background"} group-hover:bg-row-hover`;

  return (
    <tr aria-selected={selected} className={`group border-b border-border last:border-0 hover:bg-row-hover ${selected ? "bg-primary-softer" : ""}`}>
      <td className="px-3 py-1.5">
        <RowCheckbox checked={selected} onChange={onToggle} label={`Select ${lead.name}`} />
      </td>
      <td className="px-1.5 py-1.5">
        {/* Unpinned rows show a faint pin until hovered, so the pinned ones stand out. */}
        <PinButton
          lead={lead}
          onChanged={onChanged}
          onError={onError}
          className="size-8 opacity-40 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        />
      </td>
      <th scope="row" className={`${stickyCell} left-0 px-3 py-2 text-left font-medium`}>
        <Link href={`/leads/${lead.id}`} className="block max-w-52 truncate hover:underline">
          {lead.name}
        </Link>
        {/* On a phone the Status column is off to the right, so the status also sits under the name. */}
        <span className="mt-1 block sm:hidden">
          <StatusBadge status={lead.status} />
        </span>
      </th>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatPhone(lead)}</td>
      <td className="px-3 py-2">
        <span className="block max-w-48 truncate">{location || "—"}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{lead.plan_name ?? "—"}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(lead.amount)}</td>
      <td className="px-3 py-2">
        <InlineStatus lead={lead} onSaved={onStatusChanged} onError={onError} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {lead.assigned_to_name ? (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-full bg-background text-[10px] font-semibold ring-1 ring-border"
            >
              {initials(lead.assigned_to_name)}
            </span>
            {lead.assigned_to_name}
          </span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(lead.created_at)}</td>
      <td className="px-3 py-2 whitespace-nowrap">{formatDate(lead.next_follow_up)}</td>
      <td className={`${stickyCell} right-0 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)]`}>
        <LeadMenu lead={lead} actions={actions} />
      </td>
    </tr>
  );
}

type InlineStatusProps = { lead: Lead; onSaved: (lead: Lead) => void; onError: (message: string) => void };

// The row's status, changed in place through the same status API as Update Status (the pipeline rules apply: only the
// moves the API allows can be chosen, and reaching Won never converts the lead). A final lead, or one this user can't
// change, shows the plain badge. While a change saves, the control is disabled and shows a spinner; if the API refuses
// it, the saved status comes back.
function InlineStatus({ lead, onSaved, onError }: InlineStatusProps) {
  // The status being saved, and the lead's last change when it started: the control stays busy until the list reloads a
  // changed lead (the saved one, or someone else's change), or the API refuses the move.
  const [saving, setSaving] = useState<{ status: LeadStatus; since: string }>();
  if (saving !== undefined && saving.since !== lead.updated_at) setSaving(undefined);
  if (lead.allowed_transitions.length === 0) return <StatusBadge status={lead.status} />;

  const busy = saving !== undefined && saving.since === lead.updated_at;
  const shown = busy ? saving.status : lead.status;

  async function change(next: LeadStatus) {
    if (busy || next === lead.status) return;
    setSaving({ status: next, since: lead.updated_at });
    try {
      onSaved(await changeLeadStatus(lead.id, next));
    } catch (error) {
      setSaving(undefined); // back to the saved status
      onError(`Couldn't update ${lead.name}. ${toApiError(error).message}`);
    }
  }

  return (
    <span className="relative inline-flex items-center">
      <select
        value={shown}
        onChange={(event) => change(event.target.value as LeadStatus)}
        disabled={busy}
        aria-label={`Status for ${lead.name}`}
        aria-busy={busy || undefined}
        className={`cursor-pointer appearance-none rounded-md py-0.5 pr-6 pl-2 text-xs font-medium ring-1 ring-inset transition-colors hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary pointer-coarse:min-h-11 disabled:cursor-wait disabled:opacity-70 ${STATUS_STYLES[shown]}`}
      >
        {LEAD_STATUSES.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.value !== lead.status && !lead.allowed_transitions.includes(option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
      {busy ? (
        <SpinnerIcon className="pointer-events-none absolute right-1.5 size-3" />
      ) : (
        <ChevronLeftIcon className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 -rotate-90 opacity-70" />
      )}
    </span>
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

// Page numbers to show: the first, the last and the current page with its neighbours; null marks a gap.
function pageNumbers(current: number, total: number) {
  const shown = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [null, n] : [n]));
}

type PaginationProps = {
  page: number;
  pageSize: number;
  /** The server's total; undefined until the first response. */
  count?: number;
  /** A request is in flight. */
  loading?: boolean;
};

// The footer of every paginated list. It is always rendered under the list and keeps its place and height while data
// loads, so the page doesn't shift when the data arrives. The total is the server's: the summary and the page buttons
// are placeholders until there is one for this request (the first load has none; while another page or a new search
// loads, the total on hand belongs to the old request). One request at a time: the buttons do nothing meanwhile.
export function Pagination({ page, pageSize, count, loading = false }: PaginationProps) {
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count ?? 0);
  const go = (target: number) => {
    if (loading) return;
    updateQuery({ page: target > 1 ? String(target) : null });
    window.scrollTo({ top: 0 });
  };
  const pageButton = "grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm tabular-nums transition-colors aria-disabled:cursor-wait pointer-coarse:min-h-11 pointer-coarse:min-w-11";
  const placeholder = "block animate-pulse rounded bg-subtle motion-reduce:animate-none";

  return (
    <nav aria-label="Pagination" aria-busy={loading} className={`${paginationFooterClass} justify-between`}>
      {count === undefined || loading ? (
        <span aria-hidden="true" className={`${placeholder} h-4 w-40`} />
      ) : (
        <p className="text-muted-foreground tabular-nums">
          Showing {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of {count.toLocaleString("en-IN")}
        </p>
      )}
      {count === undefined ? (
        <span aria-hidden="true" className={`${placeholder} h-8 w-56 max-w-full pointer-coarse:h-11`} />
      ) : (
        <div className={`flex flex-wrap items-center gap-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <label className="flex items-center gap-2 text-muted-foreground">
            Rows per page
            <select
              value={pageSize}
              onChange={(event) =>
                updateQuery({ page_size: Number(event.target.value) === DEFAULT_PAGE_SIZE ? null : event.target.value })
              }
              className={`${fieldClass} h-8 text-foreground`}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              // aria-disabled, not disabled, while loading: a disabled button would drop the keyboard focus.
              aria-disabled={loading || undefined}
              aria-label="Previous page"
              className={`${iconButton} size-8`}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            {pageNumbers(page, pages).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => go(n)}
                  aria-disabled={loading || undefined}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? "page" : undefined}
                  className={`${pageButton} ${n === page ? "bg-primary font-medium text-white" : "hover:bg-muted"}`}
                >
                  {n}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page >= pages}
              aria-disabled={loading || undefined}
              aria-label="Next page"
              className={`${iconButton} size-8`}
            >
              <ChevronLeftIcon className="size-4 rotate-180" />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
