"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useContext, useState } from "react";

import { ChevronLeftIcon, DownloadIcon, PinIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { toApiError, useApi } from "@/lib/api";
import { exportLeads, formatDate, formatMoney, formatPhone, type Lead, type Page } from "./api";
import { LeadMenu, useLeadActions, type LeadActions } from "./lead-actions";
import { FILTER_KEYS, LeadsHeader, LeadsToolbar, VIEW_KEYS, pickParams, updateQuery } from "./leads-toolbar";
import { ErrorState, PinButton, StatusBadge, fieldClass, iconButton, secondaryButton, useNotice } from "./ui";

// The URL query and the API query use the same names.
const QUERY_KEYS = [...VIEW_KEYS, "page", "page_size"];
const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const PAGE_SIZES = [10, 25, 50, 100];
const COLUMN_COUNT = 11;

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
      <div className="mt-4 rounded-lg border border-border">
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
      <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-12 text-center">
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
    const rows = data && data.results.length > 0 ? data.results : undefined;
    content = (
      <>
        <div className="scrollbar-none mt-4 overflow-x-auto rounded-lg border border-border">
          <table
            aria-busy={loading}
            className={`w-full min-w-270 text-sm transition-opacity ${loading && rows ? "opacity-60" : ""}`}
          >
            <caption className="sr-only">Leads</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
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
              {rows ? (
                rows.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} actions={actions} onChanged={reload} onError={showError} />
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
      <LeadsHeader
        title="Leads"
        description={data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "lead" : "leads"}` : undefined}
        onAdd={actions.add}
      />
      <LeadsToolbar key={clears}>
        {isAdmin && (
          <button type="button" onClick={exportCsv} disabled={exporting} className={`${secondaryButton} sm:ml-auto`}>
            <DownloadIcon className="size-4" />
            {exporting ? "Exporting…" : "Export"}
          </button>
        )}
      </LeadsToolbar>
      {content}
      {actions.dialogs}
      {noticeElement}
    </div>
  );
}

type LeadRowProps = {
  lead: Lead;
  actions: LeadActions;
  onChanged: () => void;
  onError: (message: string) => void;
};

function LeadRow({ lead, actions, onChanged, onError }: LeadRowProps) {
  const location = [lead.area, lead.district].filter(Boolean).join(", ");
  // Sticky cells need an opaque background, so the row hover colour is the solid muted colour.
  const stickyCell = "sticky z-1 bg-background group-hover:bg-row-hover";

  return (
    <tr className="group border-b border-border last:border-0 hover:bg-row-hover">
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
      </th>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatPhone(lead)}</td>
      <td className="px-3 py-2">
        <span className="block max-w-48 truncate">{location || "—"}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{lead.plan_name ?? "—"}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatMoney(lead.amount)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={lead.status} />
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

export function Pagination({ page, pageSize, count }: { page: number; pageSize: number; count: number }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);
  const go = (target: number) => {
    updateQuery({ page: target > 1 ? String(target) : null });
    window.scrollTo({ top: 0 });
  };
  const pageButton = "grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm tabular-nums";

  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">
        Showing {first.toLocaleString("en-IN")}–{last.toLocaleString("en-IN")} of {count.toLocaleString("en-IN")}
      </p>
      <div className="flex flex-wrap items-center gap-4">
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
            aria-label="Next page"
            className={`${iconButton} size-8`}
          >
            <ChevronLeftIcon className="size-4 rotate-180" />
          </button>
        </div>
      </div>
    </nav>
  );
}
