"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CalendarIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { apiRequest, toApiError, type ApiError } from "@/lib/api";
import {
  LEAD_STATUSES,
  changeLeadStatus,
  formatDate,
  formatMoney,
  formatPhone,
  statusLabel,
  type Lead,
  type LeadStatus,
  type Page,
} from "./api";
import { LeadMenu, useLeadActions, type LeadActions } from "./lead-actions";
import { LeadsHeader, LeadsToolbar, SORT_OPTIONS, VIEW_KEYS, pickParams, updateQuery } from "./leads-toolbar";
import { ErrorState, PinButton, StatusBadge, useNotice } from "./ui";

const FIRST_CARDS = 25; // the cards a column loads at first; "Show more" adds as many again
const MAX_CARDS = 100; // the API's largest page
// ponytail: a column holds at most its first 100 leads (pinned first, then the chosen order) and links to the paged
// list for the rest; load further pages into the column if a stage ever needs working that deep on the board.

// What a card drag carries. Columns accept only this, so dragging text or files over the board does nothing, and a card
// dropped on a text field doesn't type anything into it.
const LEAD_DRAG_TYPE = "application/x-ragno-lead";

// Every card in a column has the same status, so sorting by status means nothing here.
const PIPELINE_SORT_OPTIONS = SORT_OPTIONS.filter((option) => option.value !== "status");

type Sizes = Record<LeadStatus, number>;
// Each column's first page of leads, or null for a column the Status filter leaves out.
type Board = Record<LeadStatus, Page<Lead> | null>;
// A drag-and-drop move, shown at once and kept on screen until a board loaded after the API saved it arrives.
type Move = { lead: Lead; from: LeadStatus; to: LeadStatus; saved?: boolean };
type Column = { status: LeadStatus; page: Page<Lead> | null | undefined; leads: Lead[]; count: number };
// Where the focus goes once the board has settled after a change: the lead's card, or the heading of the column it went
// to when the board doesn't show the card (deleted, filtered out, beyond the loaded cards) or there is no lead.
type FocusTarget = { id?: number; status: LeadStatus };

// The focus is moved only if it was lost (the focused card or button left the page), never taken from elsewhere.
const focusLost = () => !document.activeElement || document.activeElement === document.body;

const FIRST_SIZES = Object.fromEntries(LEAD_STATUSES.map(({ value }) => [value, FIRST_CARDS])) as Sizes;

// Loads every column through the leads list API, one request per status, sent together with the page's search, filters
// and sort. The last board stays on screen while the next one loads, and a newer load cancels the older one.
function usePipeline(query: string, sizes: Sizes) {
  const [version, setVersion] = useState(0);
  const key = `${version} ${query} ${JSON.stringify(sizes)}`;
  const [result, setResult] = useState<{ key?: string; board?: Board; error?: ApiError }>({});

  useEffect(() => {
    const controller = new AbortController();
    const onlyStatus = new URLSearchParams(query).get("status");
    Promise.all(
      LEAD_STATUSES.map(({ value }) => {
        if (onlyStatus && onlyStatus !== value) return null;
        const params = new URLSearchParams(query);
        params.set("status", value);
        params.set("page_size", String(sizes[value]));
        return apiRequest<Page<Lead>>(`/leads/?${params}`, { signal: controller.signal });
      }),
    ).then(
      (pages) => {
        if (controller.signal.aborted) return;
        setResult({ key, board: Object.fromEntries(LEAD_STATUSES.map(({ value }, i) => [value, pages[i]])) as Board });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult((previous) => ({ key, board: previous.board, error: toApiError(error) }));
      },
    );
    return () => controller.abort();
  }, [key, query, sizes]);

  return {
    board: result.board,
    error: result.key === key ? result.error : undefined,
    loading: result.key !== key,
    reload: () => setVersion((current) => current + 1),
  };
}

// The Lead Pipeline: one column per Lead status, with the same leads, search, filters and actions as the list.
// Dragging a card to another column changes the lead's status through the API, like Update Status does.
export function LeadsPipeline() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, VIEW_KEYS).toString();
  const statusFilter = searchParams.get("status") || null;
  const unknownStatus = statusFilter !== null && !LEAD_STATUSES.some(({ value }) => value === statusFilter);
  const [sizes, setSizes] = useState(FIRST_SIZES);
  const { board, error, loading, reload } = usePipeline(query, sizes);
  const [noticeElement, notify] = useNotice();
  const [dragged, setDragged] = useState<{ id: number; status: LeadStatus }>();
  const [move, setMove] = useState<Move>();
  const [moveBoard, setMoveBoard] = useState(board);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>();
  // After any change to a lead (from its menu, its pin or a drop) the board reloads, and the focus follows the lead.
  const changed = (lead?: Lead) => {
    if (lead) setFocusTarget({ id: lead.id, status: lead.status });
    reload();
  };
  const actions = useLeadActions(notify, changed);
  const showError = (text: string) => notify({ text, error: true });

  // A newer board from the API: a saved move has done its job, as the lead is now in its new column. A board from a load
  // that started before the save (still loading) doesn't count.
  if (board !== moveBoard) {
    setMoveBoard(board);
    if (move?.saved && !loading) setMove(undefined);
  }

  async function moveLead(lead: Lead, to: LeadStatus) {
    setMove({ lead, from: lead.status, to });
    setFocusTarget({ id: lead.id, status: to });
    try {
      const updated = await changeLeadStatus(lead.id, to);
      // The saved lead, with its new status and actions, stands in until the reloaded board shows it.
      setMove({ lead: updated, from: lead.status, to, saved: true });
      notify({ text: `${updated.name} moved to ${statusLabel(updated.status)}.` });
    } catch (err) {
      // The card goes back to its column. The reload below also shows any change someone else made to the lead.
      setMove(undefined);
      setFocusTarget({ id: lead.id, status: lead.status });
      showError(`Couldn't move ${lead.name} to ${statusLabel(to)}. ${toApiError(err).message}`);
    }
    reload();
  }

  const columns: Column[] = LEAD_STATUSES.map(({ value }) => {
    const page = board?.[value];
    let leads = page?.results ?? [];
    let count = page?.count ?? 0;
    if (move?.from === value) {
      leads = leads.filter((lead) => lead.id !== move.lead.id);
      count -= 1;
    }
    if (move?.to === value) {
      leads = [move.lead, ...leads.filter((lead) => lead.id !== move.lead.id)];
      count += 1;
    }
    return { status: value, page, leads, count };
  });
  const shown = columns.flatMap((column) => column.leads);
  const total = board ? columns.reduce((sum, column) => sum + column.count, 0) : undefined;

  // The dragged card is looked up on the current board, so a drop uses the lead as the API last sent it. If a reload or
  // an error took the card off the board or into another column mid-drag, its dragend never comes: the drag is over.
  const dragging = dragged && shown.find((lead) => lead.id === dragged.id && lead.status === dragged.status);
  if (dragged && (!dragging || error)) setDragged(undefined);

  const focusReady = focusTarget && !loading && !move ? focusTarget : undefined;
  const focusCardId =
    focusReady?.id !== undefined && shown.some((lead) => lead.id === focusReady.id) ? focusReady.id : undefined;
  const focusColumn = focusReady && focusCardId === undefined ? focusReady.status : undefined;

  function drop(status: LeadStatus) {
    setDragged(undefined);
    if (dragging && !move && dragging.allowed_transitions.includes(status)) moveLead(dragging, status);
  }

  let content;
  if (unknownStatus) {
    content = (
      <div className="mt-4 rounded-lg border border-border bg-background">
        <ErrorState
          title="Couldn't load leads"
          message={`"${statusFilter}" isn't a Lead status.`}
          onRetry={() => updateQuery({ status: null })}
          retryLabel="Clear the status filter"
        />
      </div>
    );
  } else if (error) {
    content = (
      <div className="mt-4 rounded-lg border border-border bg-background">
        <ErrorState title="Couldn't load leads" message={error.message} onRetry={reload} />
      </div>
    );
  } else {
    // Dimmed while a newer search, filter or sort loads, so the old board isn't mistaken for the results.
    const refreshing = loading && board ? "opacity-60" : "";
    content = (
      <>
        <PipelineSummary columns={columns} total={total} className={refreshing} />
        {/* The board scrolls sideways only (wheel, Shift + wheel, trackpad, touch) and shows no scrollbar. The columns grow
            with their cards, so the page is the one vertical scroll. relative: absolutely positioned content
            (screen-reader text) stays inside the board, not the page. */}
        <div
          aria-busy={loading}
          className={`relative mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 transition-opacity [scrollbar-width:none] motion-reduce:transition-none md:snap-none [&::-webkit-scrollbar]:hidden ${refreshing}`}
        >
          {columns.map((column) => {
            const listQuery = new URLSearchParams(query);
            listQuery.set("status", column.status);
            return (
              <PipelineColumn
                key={column.status}
                column={column}
                listHref={`/leads?${listQuery}`}
                canShowMore={sizes[column.status] < MAX_CARDS}
                loading={loading}
                dragging={dragging}
                move={move}
                focusCardId={focusCardId}
                focusHeading={focusColumn === column.status}
                actions={actions}
                onDragStart={(lead) => setDragged({ id: lead.id, status: lead.status })}
                onDragEnd={() => setDragged(undefined)}
                onDrop={drop}
                onShowMore={() => {
                  // The button may be gone after the load (all shown, or the cap reached): the focus then goes here.
                  setFocusTarget({ status: column.status });
                  setSizes((current) => ({
                    ...current,
                    [column.status]: Math.min(current[column.status] + FIRST_CARDS, MAX_CARDS),
                  }));
                }}
                onFocused={() => setFocusTarget(undefined)}
                onChanged={changed}
                onError={showError}
              />
            );
          })}
        </div>
      </>
    );
  }

  return (
    // While the pipeline is open, and only then, the page also scrolls without showing its scrollbar.
    <div className="[:root:has(&)]:[scrollbar-width:none] [:root:has(&)::-webkit-scrollbar]:hidden">
      <LeadsHeader
        title="Lead Pipeline"
        description="Drag a card to another stage to update its status."
        onAdd={actions.add}
      />
      <LeadsToolbar sortOptions={PIPELINE_SORT_OPTIONS} />
      {content}
      {actions.dialogs}
      {noticeElement}
    </div>
  );
}

// How many leads match, in all and in each stage the Status filter leaves on the board.
function PipelineSummary({ columns, total, className }: { columns: Column[]; total?: number; className: string }) {
  const value = (count: number) =>
    total === undefined ? (
      <span className="block h-4 w-6 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
    ) : (
      count.toLocaleString("en-IN")
    );
  const item = "flex items-center gap-2 rounded-md border border-border bg-background py-1 pr-3 pl-1.5";

  return (
    <dl className={`mt-4 flex flex-wrap gap-2 text-sm transition-opacity motion-reduce:transition-none ${className}`}>
      <div className={item}>
        <dt className="pl-1 text-muted-foreground">Total leads</dt>
        <dd className="font-semibold tabular-nums">{value(total ?? 0)}</dd>
      </div>
      {columns
        .filter((column) => column.page !== null)
        .map((column) => (
          <div key={column.status} className={item}>
            <dt>
              <StatusBadge status={column.status} />
            </dt>
            <dd className="font-semibold tabular-nums">{value(column.count)}</dd>
          </div>
        ))}
    </dl>
  );
}

type PipelineColumnProps = {
  column: Column;
  listHref: string;
  canShowMore: boolean;
  loading: boolean;
  dragging?: Lead;
  move?: Move;
  focusCardId?: number;
  focusHeading: boolean;
  actions: LeadActions;
  onDragStart: (lead: Lead) => void;
  onDragEnd: () => void;
  onDrop: (status: LeadStatus) => void;
  onShowMore: () => void;
  onFocused: () => void;
  onChanged: (lead?: Lead) => void;
  onError: (message: string) => void;
};

function PipelineColumn(props: PipelineColumnProps) {
  const { column, listHref, canShowMore, loading, dragging, move, focusCardId, focusHeading, onDrop, onShowMore } = props;
  const { actions, onDragStart, onDragEnd, onFocused, onChanged, onError } = props;
  const cardProps = { actions, onDragStart, onDragEnd, onFocused, onChanged, onError };
  const { status, page, leads, count } = column;
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!focusHeading) return;
    if (focusLost()) headingRef.current?.focus();
    onFocused();
  }, [focusHeading, onFocused]);
  // Only the moves the API allows for the dragged lead; the API checks the move again when it is dropped.
  const canDrop = Boolean(dragging && page && dragging.allowed_transitions.includes(status));
  const dimmed = dragging && !canDrop && dragging.status !== status;
  if (over && !dragging) setOver(false);

  let body;
  if (page === undefined) {
    body = Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="space-y-2 rounded-md border border-border bg-background p-3">
        <span className="block h-3.5 w-3/4 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
        <span className="block h-3 w-1/2 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
        <span className="block h-3 w-2/3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
      </div>
    ));
  } else if (page === null) {
    body = <p className="px-1 py-6 text-center text-sm text-muted-foreground">Hidden by the Status filter.</p>;
  } else if (leads.length === 0) {
    body = (
      <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-sm text-muted-foreground">
        No leads in this stage
      </p>
    );
  } else {
    body = (
      <ol className="flex flex-col gap-2">
        {leads.map((lead) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            saving={move?.lead.id === lead.id && !move.saved}
            canDrag={!move && lead.allowed_transitions.length > 0}
            focused={lead.id === focusCardId}
            {...cardProps}
          />
        ))}
      </ol>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      onDragOver={(event) => {
        if (!canDrop || !event.dataTransfer.types.includes(LEAD_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (event.dataTransfer.types.includes(LEAD_DRAG_TYPE)) onDrop(status);
      }}
      className={`flex w-[min(18rem,85vw)] shrink-0 snap-start flex-col rounded-lg border bg-muted transition-[opacity,border-color,background-color] motion-reduce:transition-none ${
        canDrop ? (over ? "border-primary bg-primary-softer" : "border-dashed border-primary") : "border-border"
      } ${dimmed ? "opacity-50" : ""}`}
    >
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className="flex items-center gap-2 px-3 pt-3 pb-2">
        <StatusBadge status={status} />
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {page ? count.toLocaleString("en-IN") : ""}
          <span className="sr-only">
            {page === undefined ? " loading" : page === null ? " hidden by the Status filter" : count === 1 ? " lead" : " leads"}
          </span>
        </span>
      </h2>
      <div className="min-h-40 flex-1 px-2 pb-2">{body}</div>
      {page && page.count > page.results.length && (
        <p className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Showing {page.results.length.toLocaleString("en-IN")} of {page.count.toLocaleString("en-IN")}
          </span>
          {canShowMore ? (
            // aria-disabled, not disabled, while loading: a disabled button would drop the keyboard focus.
            <button
              type="button"
              onClick={() => {
                if (!loading) onShowMore();
              }}
              aria-disabled={loading || undefined}
              className="font-medium text-foreground underline-offset-2 hover:underline aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              Show more
            </button>
          ) : (
            <Link href={listHref} className="font-medium text-foreground underline-offset-2 hover:underline">
              View all in the list
            </Link>
          )}
        </p>
      )}
    </section>
  );
}

type PipelineCardProps = {
  lead: Lead;
  saving: boolean;
  canDrag: boolean;
  focused: boolean;
  actions: LeadActions;
  onDragStart: (lead: Lead) => void;
  onDragEnd: () => void;
  onFocused: () => void;
  onChanged: (lead?: Lead) => void;
  onError: (message: string) => void;
};

// The whole card opens the lead (its name is a link stretched over the card); the pin and the menu sit above it.
function PipelineCard(props: PipelineCardProps) {
  const { lead, saving, canDrag, focused, actions, onDragStart, onDragEnd, onFocused, onChanged, onError } = props;
  const location = [lead.area, lead.district].filter(Boolean).join(", ");
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!focused) return;
    if (focusLost()) linkRef.current?.focus();
    onFocused();
  }, [focused, onFocused]);

  return (
    <li
      draggable={canDrag}
      onDragStart={(event) => {
        // Text selected on a card that can't move can still be dragged; that drag isn't a card move.
        if (!canDrag) {
          event.preventDefault();
          return;
        }
        // A drag that starts inside the open menu is a slipped click, not a move; one from the card closes the menu.
        const menu = event.currentTarget.querySelector<HTMLElement>(":popover-open");
        if (menu?.contains(document.elementFromPoint(event.clientX, event.clientY))) {
          event.preventDefault();
          return;
        }
        menu?.hidePopover();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(LEAD_DRAG_TYPE, String(lead.id));
        onDragStart(lead);
      }}
      onDragEnd={onDragEnd}
      aria-busy={saving || undefined}
      className={`group relative rounded-md border border-border bg-background p-3 text-sm shadow-xs hover:border-border-strong ${
        saving ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <Link
          ref={linkRef}
          href={`/leads/${lead.id}`}
          draggable={false}
          className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0 after:rounded-md"
        >
          {lead.name}
        </Link>
        <PinButton
          lead={lead}
          onChanged={() => onChanged(lead)}
          onError={onError}
          className="relative z-1 -my-1 size-7 opacity-40 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        />
        <div className="relative z-1 -my-1.5 -mr-1.5">
          <LeadMenu lead={lead} actions={actions} withView />
        </div>
      </div>
      <p className="mt-0.5 text-muted-foreground tabular-nums">{formatPhone(lead)}</p>
      {location && <p className="truncate text-muted-foreground">{location}</p>}
      <p className="mt-2 flex items-baseline justify-between gap-2">
        <span>{lead.plan_name ?? "No plan"}</span>
        <span className="font-medium tabular-nums">{formatMoney(lead.amount)}</span>
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        {lead.assigned_to_name ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-background text-[9px] font-semibold text-foreground ring-1 ring-border"
            >
              {initials(lead.assigned_to_name)}
            </span>
            <span className="truncate">
              <span className="sr-only">Assigned to </span>
              {lead.assigned_to_name}
            </span>
          </span>
        ) : (
          <span>Unassigned</span>
        )}
        {lead.next_follow_up && (
          <span className="flex shrink-0 items-center gap-1" title="Next follow-up">
            <CalendarIcon className="size-3.5" />
            <span className="sr-only">Next follow-up </span>
            {formatDate(lead.next_follow_up)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Added {formatDate(lead.created_at)}</p>
      {saving && <p className="mt-1 text-xs text-muted-foreground">Saving…</p>}
    </li>
  );
}
