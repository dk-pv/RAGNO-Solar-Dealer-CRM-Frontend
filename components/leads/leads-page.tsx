"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useState } from "react";

import { ChevronLeftIcon, ConvertIcon, DownloadIcon, FlagIcon, PinIcon, SpinnerIcon, TrashIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
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
import { Busy, PinButton, STATUS_STYLES, StatusBadge, fillClass, secondaryButton, stickyNameClass, useNotice } from "./ui";

// The URL query and the API query use the same names.
const QUERY_KEYS = [...VIEW_KEYS, "page", "page_size"];

// The columns the Columns menu can hide. The customer, and the row's selection, pin and actions, always show.
const COLUMNS = [
  { key: "phone", label: "Phone" },
  { key: "location", label: "Location" },
  { key: "plan", label: "Plan" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status" },
  { key: "assigned", label: "Assigned" },
  { key: "created", label: "Created" },
  { key: "follow_up", label: "Next follow-up" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];
const FIXED_COLUMNS = 4; // selection, pin, customer, actions

type BulkActionName = "status" | "convert" | "delete";

export function LeadsPage() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, QUERY_KEYS);
  const { data, error, loading, reload } = useApi<Page<Lead>>(query.toString() ? `/leads/?${query}` : "/leads/");

  const [exporting, setExporting] = useState(false);
  const [clears, setClears] = useState(0);
  const [noticeElement, notify] = useNotice();
  const actions = useLeadActions(notify, reload);
  const columns = useColumns("leads", COLUMNS);
  // Exporting the whole customer list is admin-only on the API, so only admins are offered it.
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE;
  const filtered = Boolean(searchParams.get("search")) || FILTER_KEYS.some((key) => searchParams.get(key));
  const showError = (text: string) => notify({ text, error: true });

  // The rows selected on this page, for the bulk actions. A new search, filter, sort or page starts with none selected.
  const rows = data?.results ?? [];
  const selection = useSelection(rows.map((lead) => lead.id), query.toString());
  const selectedLeads = rows.filter((lead) => selection.isSelected(lead.id));
  const [bulkAction, setBulkAction] = useState<BulkActionName>();
  const [bulkRunning, setBulkRunning] = useState(false);
  // What this user may do with the selection, from what the API says of each lead (can_edit, can_convert, can_delete).
  // An action their role doesn't allow isn't offered at all; the API decides lead by lead and checks again.
  const canBulkChange = selectedLeads.some((lead) => lead.can_edit);
  const canBulkConvert = selectedLeads.some((lead) => lead.can_convert);
  const canBulkDelete = selectedLeads.some((lead) => lead.can_delete);

  // Runs a bulk action on the selected leads and reports what went through and what didn't. The selection is kept when
  // nothing went through, so the user can change it and try again.
  async function runBulk(request: (ids: number[]) => Promise<BulkResult>, past: string) {
    setBulkRunning(true);
    try {
      const result = await request(selection.selected);
      notify(describeBulkResult(result, "lead", past));
      if (result.succeeded.length > 0) selection.clear();
      reload();
    } finally {
      setBulkRunning(false);
    }
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

  const loaded = rows.length > 0;
  const { shows } = columns;

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
        onConfirm={(value) => runBulk((ids) => bulkChangeLeadStatus(ids, value as LeadStatus), "updated")}
        onClose={() => setBulkAction(undefined)}
        onError={showError}
      />
    ) : bulkAction === "convert" ? (
      <ActionDialog
        title={`Convert ${count} selected ${leadsWord} to Work?`}
        description="Only Won leads that don't have a Work yet are converted, each once; a Work is created for each with its plan and amount. Any other selected lead is left as it is and listed afterwards."
        confirmLabel="Convert to Work"
        pendingLabel="Converting…"
        onConfirm={() => runBulk(bulkConvertLeads, "converted to Work")}
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
        onConfirm={() => runBulk(bulkDeleteLeads, "deleted")}
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
        <ColumnsButton columns={columns} />
        {isAdmin && (
          <button type="button" onClick={exportCsv} disabled={exporting} className={`${secondaryButton} sm:ml-auto`}>
            {exporting ? <Busy>Exporting…</Busy> : <><DownloadIcon className="size-4" />Export</>}
          </button>
        )}
      </LeadsToolbar>
      <SelectionAnnouncement count={count} />

      <ListShell
        noun="leads"
        error={error}
        onRetry={reload}
        page={page}
        pageSize={pageSize}
        count={data?.count}
        loading={loading}
        empty={
          filtered ? (
            <EmptyState title="No leads match your search or filters." hint="Try a different search, or clear the filters.">
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
            <EmptyState title="No leads yet." hint="Add a lead to start tracking it through the pipeline.">
              <button type="button" onClick={actions.add} className={secondaryButton}>
                Add Lead
              </button>
            </EmptyState>
          )
        }
        bulkBar={
          count > 0 && (
            <BulkActionBar count={count} onClear={selection.clear} busy={bulkRunning}>
              {canBulkChange && <BulkAction icon={FlagIcon} label="Update Status" onClick={() => setBulkAction("status")} />}
              {canBulkChange && (
                <BulkAction
                  icon={ConvertIcon}
                  label="Convert to Work"
                  onClick={() => setBulkAction("convert")}
                  disabled={!canBulkConvert}
                  title={canBulkConvert ? undefined : "Only Won leads that don't have a Work yet can be converted."}
                />
              )}
              {canBulkDelete && <BulkAction icon={TrashIcon} label="Delete" danger onClick={() => setBulkAction("delete")} />}
            </BulkActionBar>
          )
        }
      >
        <table
          aria-busy={loading}
          // With columns hidden the table is as wide as what's left needs, no wider.
          className={`w-full text-sm transition-opacity ${columns.hiddenCount > 0 ? "min-w-max" : "min-w-280"} ${loading && loaded ? "opacity-60" : ""}`}
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
              {shows("phone") && <th scope="col" className="px-3 py-2.5">Phone</th>}
              {shows("location") && <th scope="col" className="px-3 py-2.5">Location</th>}
              {shows("plan") && <th scope="col" className="px-3 py-2.5">Plan</th>}
              {shows("amount") && <th scope="col" className="px-3 py-2.5 text-right">Amount</th>}
              {shows("status") && <th scope="col" className="px-3 py-2.5">Status</th>}
              {shows("assigned") && <th scope="col" className="px-3 py-2.5">Assigned</th>}
              {shows("created") && <th scope="col" className="px-3 py-2.5">Created</th>}
              {shows("follow_up") && <th scope="col" className="px-3 py-2.5">Next follow-up</th>}
              {/* The actions stay in view beside a wide table; on a phone they would cover the customer, so there they
                  scroll with it. */}
              <th scope="col" className="sticky right-0 z-1 w-12 bg-page px-2 py-2.5 shadow-[inset_1px_0_0_var(--color-border)] max-sm:static">
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
                  shows={shows}
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

type LeadRowProps = {
  lead: Lead;
  shows: Columns<ColumnKey>["shows"];
  selected: boolean;
  onToggle: () => void;
  actions: LeadActions;
  onChanged: () => void;
  onStatusChanged: (lead: Lead) => void;
  onError: (message: string) => void;
};

function LeadRow({ lead, shows, selected, onToggle, actions, onChanged, onStatusChanged, onError }: LeadRowProps) {
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
        <Link href={`/leads/${lead.id}`} className={`block ${stickyNameClass} truncate hover:underline`}>
          {lead.name}
        </Link>
        {/* On a phone the Status column is off to the right, so the status also sits under the name. */}
        <span className="mt-1 block sm:hidden">
          <StatusBadge status={lead.status} />
        </span>
      </th>
      {shows("phone") && <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatPhone(lead)}</td>}
      {shows("location") && (
        <td className="px-3 py-2">
          <span className="block max-w-[max(12rem,13cqw)] truncate">{location || "—"}</span>
        </td>
      )}
      {shows("plan") && <td className="px-3 py-2 whitespace-nowrap">{lead.plan_name ?? "—"}</td>}
      {shows("amount") && <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(lead.amount)}</td>}
      {shows("status") && (
        <td className="px-3 py-2">
          <InlineStatus lead={lead} onSaved={onStatusChanged} onError={onError} />
        </td>
      )}
      {shows("assigned") && (
        <td className="px-3 py-2 whitespace-nowrap">
          {lead.assigned_to_name ? (
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full bg-background text-[0.625rem] font-semibold ring-1 ring-border"
              >
                {initials(lead.assigned_to_name)}
              </span>
              {lead.assigned_to_name}
            </span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </td>
      )}
      {shows("created") && <td className="px-3 py-2 whitespace-nowrap">{formatDate(lead.created_at)}</td>}
      {shows("follow_up") && <td className="px-3 py-2 whitespace-nowrap">{formatDate(lead.next_follow_up)}</td>}
      <td className={`${stickyCell} right-0 px-2 py-1.5 shadow-[inset_1px_0_0_var(--color-border)] max-sm:static`}>
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
