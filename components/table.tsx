"use client";

import { useId, useState, type ReactNode } from "react";

import { ChevronLeftIcon, ColumnsIcon } from "@/components/layout/icons";
import { menuItemClass, placeMenu } from "@/components/leads/lead-actions";
import { updateQuery } from "@/components/leads/leads-toolbar";
import {
  ErrorState,
  emptyAreaClass,
  fieldClass,
  fillClass,
  iconButton,
  messageAreaClass,
  paginationFooterClass,
  secondaryButton,
  tableAreaClass,
} from "@/components/leads/ui";
import type { ApiError } from "@/lib/api";

// The CRM's list pages (All Leads, All Works, both Activities pages, Users, the report tables) share what is here: the
// shell that lays a list out under its toolbar, the pagination at its foot and the Columns menu. The toolbar's own
// pieces (search, filter toggle, sort) are in components/leads/leads-toolbar.tsx and row selection with its bottom
// action bar in components/selection.tsx.

// ---- Pagination ----

export const DEFAULT_PAGE_SIZE = 25; // the API's default page size
const PAGE_SIZES = [10, 25, 50, 100];

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
  /** For a list that keeps its page in its own state. Without it the page and the page size live in the URL
      (?page=, ?page_size=), as on the list pages, and the rows-per-page choice is offered. */
  onPage?: (page: number) => void;
};

// The footer of every paginated list. It is always rendered under the list and keeps its place and height while data
// loads, so the page doesn't shift when the data arrives. The total is the server's: the summary and the page buttons
// are placeholders until there is one for this request (the first load has none; while another page or a new search
// loads, the total on hand belongs to the old request). One request at a time: the buttons do nothing meanwhile.
export function Pagination({ page, pageSize, count, loading = false, onPage }: PaginationProps) {
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count ?? 0);
  const go = (target: number) => {
    if (loading) return;
    if (onPage) onPage(target);
    else updateQuery({ page: target > 1 ? String(target) : null });
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
          {!onPage && (
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
          )}
          {/* Wraps rather than running off a phone: with touch-sized buttons, page 5 of 10 needs more than 320px. */}
          <div className="flex flex-wrap items-center gap-1">
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

// ---- The list shell ----

// What a list's empty box says: a title, a hint and (as children) what to do about it.
export function EmptyState({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      {children && <div className="mt-4">{children}</div>}
    </>
  );
}

type ListShellProps = {
  /** What the list holds, in the plural, for its messages: "leads". */
  noun: string;
  error?: ApiError;
  onRetry: () => void;
  page: number;
  pageSize: number;
  /** The server's total; undefined until the first response. */
  count?: number;
  loading: boolean;
  /** Shown in place of the table when nothing matches (an <EmptyState>). */
  empty: ReactNode;
  /** The bulk action bar (components/selection.tsx): between the table and the pagination, at the bottom of the list. */
  bulkBar?: ReactNode;
  /** The table brings its own scroll box (a table component shared with another page). */
  boxed?: boolean;
  /** The <table>. */
  children: ReactNode;
};

// A list page's content under its toolbar: the table in its scroll box, then the bulk action bar and the pagination at
// the bottom of the page; or the list's error or empty state in a box of the same size. The page's root is `fillClass`
// (see components/leads/ui.tsx), so the box grows and the pagination stays at the bottom however few rows there are,
// with no fixed positioning and no set heights.
export function ListShell({ noun, error, onRetry, page, pageSize, count, loading, empty, bulkBar, boxed = false, children }: ListShellProps) {
  if (error) {
    return (
      <div className={`${messageAreaClass} mt-4`}>
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message={`There are fewer ${noun} than before.`}
            onRetry={() => updateQuery({ page: null })}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState title={`Couldn't load ${noun}`} message={error.message} onRetry={onRetry} />
        )}
      </div>
    );
  }
  if (count === 0 && !loading) return <div className={`${emptyAreaClass} mt-4`}>{empty}</div>;
  return (
    <>
      <div className={`${boxed ? fillClass : tableAreaClass} mt-4`}>{children}</div>
      {bulkBar}
      <Pagination page={page} pageSize={pageSize} count={count} loading={loading} />
    </>
  );
}

// A table's body while its first page loads: rows of placeholder cells, one per column shown.
export function SkeletonRows({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} className="border-b border-border last:border-0">
      {Array.from({ length: columns }, (_, cell) => (
        <td key={cell} className="px-3 py-3.5">
          <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
        </td>
      ))}
    </tr>
  ));
}

// ---- Column controls ----

export type ColumnOption<K extends string = string> = { key: K; label: string };

function storedHidden(storageKey: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return []; // storage blocked by browser settings, or nothing valid stored: every column shows
  }
}

// Which of a table's optional columns are shown. The choice is made in the Columns menu and remembered on this device
// for that table (the columns that identify a row, and its actions, always show).
export function useColumns<K extends string>(table: string, options: readonly ColumnOption<K>[]) {
  const storageKey = `ragno:columns:${table}`;
  const [hidden, setHidden] = useState(() => storedHidden(storageKey));

  function save(next: string[]) {
    setHidden(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage blocked: the choice still holds until the page reloads.
    }
  }

  return {
    options,
    hiddenCount: options.filter((option) => hidden.includes(option.key)).length,
    shows: (key: K) => !hidden.includes(key),
    toggle: (key: K) => save(hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key]),
    reset: () => save([]),
  };
}

export type Columns<K extends string> = ReturnType<typeof useColumns<K>>;

// The toolbar's Columns button and its menu of checkboxes, one per optional column.
export function ColumnsButton<K extends string>({ columns }: { columns: Columns<K> }) {
  const menuId = useId();
  const { options, hiddenCount } = columns;

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={(event) => placeMenu(event.currentTarget, menuId)}
        aria-label={hiddenCount > 0 ? `Columns, ${hiddenCount} hidden` : "Columns"}
        title="Choose the columns to show"
        className={secondaryButton}
      >
        <ColumnsIcon className="size-4" />
        <span className="max-sm:sr-only">Columns</span>
        {hiddenCount > 0 && <span className="rounded bg-primary px-1.5 text-xs leading-5 text-white">{hiddenCount} hidden</span>}
      </button>
      <div
        id={menuId}
        popover="auto"
        className="fixed inset-auto m-0 w-56 rounded-md border border-border bg-background p-1 text-foreground shadow-lg"
      >
        <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Show columns</p>
        {options.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-sm hover:bg-muted pointer-coarse:py-3">
            <input
              type="checkbox"
              checked={columns.shows(option.key)}
              onChange={() => columns.toggle(option.key)}
              className="size-4 shrink-0 accent-primary"
            />
            {option.label}
          </label>
        ))}
        {hiddenCount > 0 && (
          <button type="button" onClick={columns.reset} className={`${menuItemClass} border-t border-border font-medium`}>
            Show all columns
          </button>
        )}
      </div>
    </>
  );
}
