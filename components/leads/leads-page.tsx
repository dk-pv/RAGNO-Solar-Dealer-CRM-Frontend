"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ChangeEvent } from "react";

import {
  CalendarIcon,
  ChevronLeftIcon,
  ConvertIcon,
  DownloadIcon,
  FilterIcon,
  MoreIcon,
  PencilIcon,
  PhoneIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  WhatsAppIcon,
} from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { toApiError, useApi } from "@/lib/api";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  canConvert,
  exportLeads,
  formatDate,
  formatMoney,
  formatPhone,
  telHref,
  whatsappHref,
  type Assignee,
  type Lead,
  type Page,
  type Plan,
} from "./api";
import { ConvertDialog, LeadFormDialog } from "./lead-dialogs";
import {
  ErrorState,
  PinButton,
  StatusBadge,
  fieldClass,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
  useNotice,
} from "./ui";

const FILTER_KEYS = ["status", "plan", "assigned_to", "source", "created_after", "created_before"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
// The URL query and the API query use the same names.
const QUERY_KEYS = ["search", ...FILTER_KEYS, "ordering", "page", "page_size"];
const DEFAULT_ORDERING = "-created_at";
const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const PAGE_SIZES = [10, 25, 50, 100];
const COLUMN_COUNT = 11;

// The API always lists pinned leads first, then in the chosen order.
const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "name", label: "Customer name" },
  { value: "status", label: "Status" },
  { value: "next_follow_up", label: "Next follow-up" },
  { value: "-amount", label: "Amount: high to low" },
  { value: "amount", label: "Amount: low to high" },
  { value: "plan__capacity", label: "Plan size" },
  { value: "assigned_to__name", label: "Assigned staff" },
];

// Search, filters, sort and page live in the URL, so a refresh or the back button keeps the view.
// replaceState updates useSearchParams without a server round trip (Next.js integrates the History API).
function updateQuery(changes: Record<string, string | null>) {
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

export function LeadsPage() {
  const searchParams = useSearchParams();
  const query = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) query.set(key, value);
  }
  const { data, error, loading, reload } = useApi<Page<Lead>>(query.toString() ? `/leads/?${query}` : "/leads/");

  const search = searchParams.get("search") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formLead, setFormLead] = useState<Lead | null>(); // null: a new lead; undefined: the form is closed
  const [convertTarget, setConvertTarget] = useState<Lead>();
  const [exporting, setExporting] = useState(false);
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
  const showError = (text: string) => notify({ text, error: true });

  function clearSearchAndFilters() {
    setSearchText("");
    updateQuery(Object.fromEntries(["search", ...FILTER_KEYS].map((key) => [key, null])));
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
          onClick={filtered ? clearSearchAndFilters : () => setFormLead(null)}
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
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table
            aria-busy={loading}
            className={`w-full min-w-270 text-sm transition-opacity ${loading && rows ? "opacity-60" : ""}`}
          >
            <caption className="sr-only">Leads</caption>
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-medium whitespace-nowrap text-muted-foreground">
                <th scope="col" className="w-11 px-3 py-2.5">
                  <PinIcon className="size-3.5" />
                  <span className="sr-only">Pinned</span>
                </th>
                <th scope="col" className="sticky left-0 z-1 bg-muted px-3 py-2.5">
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
                <th scope="col" className="sticky right-0 z-1 w-12 bg-muted px-2 py-2.5 shadow-[inset_1px_0_0_var(--color-border)]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows ? (
                rows.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onChanged={reload}
                    onError={showError}
                    onEdit={setFormLead}
                    onConvert={setConvertTarget}
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
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "lead" : "leads"}` : " "}
          </p>
        </div>
        <button type="button" onClick={() => setFormLead(null)} className={primaryButton}>
          <PlusIcon className="size-4" />
          Add Lead
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search name, phone, email or ID"
            aria-label="Search leads"
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
          {activeFilters > 0 && (
            <span className="rounded bg-foreground px-1.5 text-xs leading-5 text-background">{activeFilters}</span>
          )}
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
        <button type="button" onClick={exportCsv} disabled={exporting} className={`${secondaryButton} sm:ml-auto`}>
          <DownloadIcon className="size-4" />
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      {filtersOpen && <FilterPanel id={filterPanelId} searchParams={searchParams} onDone={() => setFiltersOpen(false)} />}

      {content}

      {formLead !== undefined && (
        <LeadFormDialog
          lead={formLead}
          onClose={() => setFormLead(undefined)}
          onSaved={(saved) => {
            notify({ text: formLead ? `Saved changes to ${saved.name}.` : `Added ${saved.name} as a new lead.` });
            reload();
          }}
        />
      )}
      {convertTarget && (
        <ConvertDialog
          lead={convertTarget}
          onClose={() => setConvertTarget(undefined)}
          onConverted={(converted) => {
            notify({ text: `${converted.name} is now Won${converted.work ? `. Work #${converted.work} was created.` : "."}` });
            reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type LeadRowProps = {
  lead: Lead;
  onChanged: () => void;
  onError: (message: string) => void;
  onEdit: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
};

function LeadRow({ lead, onChanged, onError, onEdit, onConvert }: LeadRowProps) {
  const location = [lead.area, lead.district].filter(Boolean).join(", ");
  // Sticky cells need an opaque background, so the row hover colour is the solid muted colour.
  const stickyCell = "sticky z-1 bg-background group-hover:bg-muted";

  return (
    <tr className="group border-b border-border last:border-0 hover:bg-muted">
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
        <RowActions lead={lead} onEdit={onEdit} onConvert={onConvert} />
      </td>
    </tr>
  );
}

const MENU_WIDTH = 224; // w-56
const MENU_HEIGHT = 240; // ponytail: fixed estimate of the open menu's height; measure it if the menu grows

// The menu opens in the browser's top layer, outside the scrolling table, next to its button.
function placeMenu(button: HTMLElement, menuId: string) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const rect = button.getBoundingClientRect();
  const openUp = rect.bottom + MENU_HEIGHT > window.innerHeight && rect.top > MENU_HEIGHT;
  menu.style.left = `${Math.max(8, rect.right - MENU_WIDTH)}px`;
  menu.style.top = openUp ? "auto" : `${rect.bottom + 4}px`;
  menu.style.bottom = openUp ? `${window.innerHeight - rect.top + 4}px` : "auto";
}

const menuItemClass =
  "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

type RowActionsProps = { lead: Lead; onEdit: (lead: Lead) => void; onConvert: (lead: Lead) => void };

function RowActions({ lead, onEdit, onConvert }: RowActionsProps) {
  const menuId = useId();
  const hide = () => document.getElementById(menuId)?.hidePopover();
  const whatsapp = whatsappHref(lead);
  const tel = telHref(lead);

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={(event) => placeMenu(event.currentTarget, menuId)}
        aria-label={`Actions for ${lead.name}`}
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
            onEdit(lead);
          }}
          className={menuItemClass}
        >
          <PencilIcon className="size-4 text-muted-foreground" />
          Edit
        </button>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={hide} className={menuItemClass}>
          <WhatsAppIcon className="size-4 text-muted-foreground" />
          WhatsApp
        </a>
        <a href={tel} onClick={hide} className={menuItemClass}>
          <PhoneIcon className="size-4 text-muted-foreground" />
          Call
        </a>
        <Link href={`/leads/${lead.id}#activities`} className={menuItemClass}>
          <CalendarIcon className="size-4 text-muted-foreground" />
          Follow-up / Activity
        </Link>
        <div className="my-1 border-t border-border" />
        {lead.status === "WON" ? (
          <p className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted-foreground">
            <ConvertIcon className="size-4" />
            {lead.work ? `Converted to Work #${lead.work}` : "Converted"}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              hide();
              onConvert(lead);
            }}
            disabled={!canConvert(lead)}
            title={canConvert(lead) ? undefined : "Not available in this lead's current status"}
            className={menuItemClass}
          >
            <ConvertIcon className="size-4 text-muted-foreground" />
            Convert to Work
          </button>
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
          <span className="block h-3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </td>
      ))}
    </tr>
  ));
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
      className="mt-3 grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="text-sm">
        <span className="mb-1.5 block font-medium">Status</span>
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
        <span className="mb-1.5 block font-medium">Plan</span>
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
        <span className="mb-1.5 block font-medium">Assigned staff</span>
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
        <span className="mb-1.5 block font-medium">Lead source</span>
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
        <span className="mb-1.5 block font-medium">Created from</span>
        <input type="date" max={draft.created_before || undefined} {...bind("created_after")} />
      </label>
      <label className="text-sm">
        <span className="mb-1.5 block font-medium">Created to</span>
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

// Page numbers to show: the first, the last and the current page with its neighbours; null marks a gap.
function pageNumbers(current: number, total: number) {
  const shown = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  return shown.flatMap((n, i) => (i > 0 && n - shown[i - 1] > 1 ? [null, n] : [n]));
}

function Pagination({ page, pageSize, count }: { page: number; pageSize: number; count: number }) {
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
                className={`${pageButton} ${n === page ? "bg-foreground font-medium text-background" : "hover:bg-muted"}`}
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
