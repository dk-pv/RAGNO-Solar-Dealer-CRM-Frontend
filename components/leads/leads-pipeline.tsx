"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CalendarIcon, EyeIcon, MapPinIcon, PhoneIcon, PlusIcon } from "@/components/layout/icons";
import {
  Board,
  BoardColumn,
  BoardEmpty,
  BoardScrollButtons,
  BoardSkeleton,
  CardAssignee,
  PipelineSwitch,
  boardCardClass,
  useBoardScroll,
} from "@/components/pipeline";
import { apiRequest, toApiError, useApi, type ApiError } from "@/lib/api";
import {
  LEAD_STATUSES,
  changeLeadStatus,
  formatDate,
  formatMoney,
  formatPhone,
  sourceLabel,
  statusLabel,
  today,
  type Lead,
  type LeadStatus,
  type Page,
  type StatusSummary,
} from "./api";
import { LeadMenu, menuItemClass, useLeadActions, type LeadActions } from "./lead-actions";
import { LeadsHeader, LeadsToolbar, SORT_OPTIONS, VIEW_KEYS, pickParams, updateQuery } from "./leads-toolbar";
import { ErrorState, PinButton, STATUS_DOTS, STATUS_STYLES, fillClass, secondaryButton, useNotice } from "./ui";

const FIRST_CARDS = 25; // the cards a column loads at first; "Show more" adds as many again
const MAX_CARDS = 100; // the API's largest page
// ponytail: a column holds at most its first 100 leads (pinned first, then the chosen order) and links to the paged
// list for the rest; load further pages into the column if a stage ever needs working that deep on the board.

// What a card drag carries. Columns accept only this, so dragging text or files over the board does nothing, and a card
// dropped on a text field doesn't type anything into it.
const LEAD_DRAG_TYPE = "application/x-ragno-lead";

// Every card in a column has the same status, so sorting by status means nothing here.
const PIPELINE_SORT_OPTIONS = SORT_OPTIONS.filter((option) => option.value !== "status");

// The Lead Pipeline's stages, in order: New, Initial Contact, Hot, Superhot, Won. Lost is an outcome, not a stage: a
// lead marked Lost leaves the board. The lane at the board's end counts the lost leads, takes a card dropped on it and
// links to them in the list; it holds no cards.
const STAGES: LeadStatus[] = LEAD_STATUSES.map((status) => status.value).filter((status) => status !== "LOST");

type Sizes = Partial<Record<LeadStatus, number>>;
// Each stage's first page of leads, or null for a stage the Status filter leaves out.
type BoardData = Partial<Record<LeadStatus, Page<Lead> | null>>;
// A drag-and-drop move, shown at once and kept on screen until a board loaded after the API saved it arrives.
type Move = { lead: Lead; from: LeadStatus; to: LeadStatus; saved?: boolean };
type Column = { status: LeadStatus; page: Page<Lead> | null | undefined; leads: Lead[]; count: number };
// Where the focus goes once the board has settled after a change: the lead's card, or the heading of the column (or the
// Lost lane) it went to when the board doesn't show the card (lost, deleted, filtered out, beyond the loaded cards).
type FocusTarget = { id?: number; status: LeadStatus };

// The focus is moved only if it was lost (the focused card or button left the page), never taken from elsewhere.
const focusLost = () => !document.activeElement || document.activeElement === document.body;

// Loads every stage through the leads list API, one request per status, sent together with the page's search, filters
// and sort. The last board stays on screen while the next one loads, and a newer load cancels the older one.
function usePipeline(query: string, sizes: Sizes) {
  const [version, setVersion] = useState(0);
  const key = `${version} ${query} ${JSON.stringify(sizes)}`;
  const [result, setResult] = useState<{ key?: string; board?: BoardData; error?: ApiError }>({});

  useEffect(() => {
    const controller = new AbortController();
    const onlyStatus = new URLSearchParams(query).get("status");
    Promise.all(
      STAGES.map((status) => {
        if (onlyStatus && onlyStatus !== status) return null;
        const params = new URLSearchParams(query);
        params.set("status", status);
        params.set("page_size", String(sizes[status] ?? FIRST_CARDS));
        return apiRequest<Page<Lead>>(`/leads/?${params}`, { signal: controller.signal });
      }),
    ).then(
      (pages) => {
        if (controller.signal.aborted) return;
        setResult({ key, board: Object.fromEntries(STAGES.map((status, i) => [status, pages[i]])) as BoardData });
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

// The Lead Pipeline: one column per stage, with the same leads, search, filters and actions as the list. Dragging a card
// to another column changes the lead's status through the status API, like Update Status does; the API applies the
// pipeline's rules. Reaching Won never creates a Work: Convert to Work, on the card's menu, does that.
export function LeadsPipeline() {
  const searchParams = useSearchParams();
  const query = pickParams(searchParams, VIEW_KEYS).toString();
  const statusFilter = searchParams.get("status") || null;
  const unknownStatus = statusFilter !== null && !LEAD_STATUSES.some(({ value }) => value === statusFilter);
  const [sizes, setSizes] = useState<Sizes>({});
  const { board, error, loading, reload } = usePipeline(query, sizes);
  // Each status's count and total amount under the same search and filters: the column headers and the Lost lane.
  const summary = useApi<StatusSummary[]>(unknownStatus ? null : query ? `/leads/summary/?${query}` : "/leads/summary/");
  const [noticeElement, notify] = useNotice();
  const [dragged, setDragged] = useState<{ id: number; status: LeadStatus }>();
  const [move, setMove] = useState<Move>();
  const [moveBoard, setMoveBoard] = useState(board);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>();
  const { boardRef, scrollBoard, scrollWhileDragging, stopScrolling } = useBoardScroll();
  const reloadSummary = summary.reload;

  function refresh() {
    reload();
    reloadSummary();
  }
  // After any change to a lead (from its menu, its pin or a drop) the board reloads, and the focus follows the lead.
  const changed = (lead?: Lead) => {
    if (lead) setFocusTarget({ id: lead.id, status: lead.status });
    refresh();
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
    refresh();
  }

  const totals = new Map((summary.data ?? []).map((row) => [row.status, row]));
  const columns: Column[] = STAGES.map((status) => {
    const page = board?.[status];
    let leads = page?.results ?? [];
    let count = page?.count ?? 0;
    if (move?.from === status) {
      leads = leads.filter((lead) => lead.id !== move.lead.id);
      count -= 1;
    }
    if (move?.to === status) {
      leads = [move.lead, ...leads.filter((lead) => lead.id !== move.lead.id)];
      count += 1;
    }
    return { status, page, leads, count };
  });
  const shown = columns.flatMap((column) => column.leads);
  const inPipeline = board ? columns.reduce((sum, column) => sum + column.count, 0) : undefined;

  // The dragged card is looked up on the current board, so a drop uses the lead as the API last sent it. If a reload or
  // an error took the card off the board or into another column mid-drag, its dragend never comes: the drag is over.
  const dragging = dragged && shown.find((lead) => lead.id === dragged.id && lead.status === dragged.status);
  if (dragged && (!dragging || error)) setDragged(undefined);

  const focusReady = focusTarget && !loading && !move ? focusTarget : undefined;
  const focusCardId =
    focusReady?.id !== undefined && shown.some((lead) => lead.id === focusReady.id) ? focusReady.id : undefined;
  const focusColumn = focusReady && focusCardId === undefined ? focusReady.status : undefined;

  function endDrag() {
    stopScrolling();
    setDragged(undefined);
  }

  function drop(status: LeadStatus) {
    const lead = dragging;
    endDrag();
    if (lead && !move && lead.allowed_transitions.includes(status)) moveLead(lead, status);
  }

  // The list, narrowed to one status, keeping the board's search and filters.
  const listHref = (status: LeadStatus) => {
    const listQuery = new URLSearchParams(query);
    listQuery.set("status", status);
    return `/leads?${listQuery}`;
  };

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
        <ErrorState title="Couldn't load leads" message={error.message} onRetry={refresh} />
      </div>
    );
  } else {
    const lost = totals.get("LOST")?.count;
    content = (
      <Board
        boardRef={boardRef}
        dragging={dragged !== undefined}
        refreshing={loading && board !== undefined}
        busy={loading}
        onDragOver={(event) => {
          if (dragged) scrollWhileDragging(event.clientX);
        }}
      >
        {columns.map((column) => {
          const total = totals.get(column.status)?.total_amount;
          return (
            <PipelineColumn
              key={column.status}
              column={column}
              amount={column.page === null || total === undefined ? undefined : formatMoney(total)}
              listHref={listHref(column.status)}
              canShowMore={(sizes[column.status] ?? FIRST_CARDS) < MAX_CARDS}
              loading={loading}
              dragging={dragging}
              move={move}
              focusCardId={focusCardId}
              focusHeading={focusColumn === column.status}
              actions={actions}
              onDragStart={(lead) => setDragged({ id: lead.id, status: lead.status })}
              onDragEnd={endDrag}
              onDrop={drop}
              onShowMore={() => {
                // The button may be gone after the load (all shown, or the cap reached): the focus then goes here.
                setFocusTarget({ status: column.status });
                setSizes((current) => ({
                  ...current,
                  [column.status]: Math.min((current[column.status] ?? FIRST_CARDS) + FIRST_CARDS, MAX_CARDS),
                }));
              }}
              onFocused={() => setFocusTarget(undefined)}
              onChanged={changed}
              onError={showError}
            />
          );
        })}
        <LostLane
          // The count reloads once a move is saved; until then it counts the move still saving.
          count={lost === undefined ? undefined : lost + (move?.to === "LOST" && !move.saved ? 1 : 0)}
          listHref={listHref("LOST")}
          dragging={dragging}
          focusHeading={focusColumn === "LOST"}
          onFocused={() => setFocusTarget(undefined)}
          onDrop={() => drop("LOST")}
        />
      </Board>
    );
  }

  const hint = "Drag a card to another stage to update its status.";
  return (
    <div className={fillClass}>
      <LeadsHeader
        title="Lead Pipeline"
        description={
          inPipeline === undefined
            ? hint
            : `${inPipeline.toLocaleString("en-IN")} ${inPipeline === 1 ? "lead" : "leads"} in the pipeline. ${hint}`
        }
        onAdd={actions.add}
      />
      <PipelineSwitch />
      <LeadsToolbar sortOptions={PIPELINE_SORT_OPTIONS}>
        <BoardScrollButtons onScroll={scrollBoard} />
      </LeadsToolbar>
      {content}
      {actions.dialogs}
      {noticeElement}
    </div>
  );
}

type PipelineColumnProps = {
  column: Column;
  amount?: string;
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
  const { column, amount, listHref, canShowMore, loading, dragging, move, focusCardId, focusHeading, onDrop, onShowMore } = props;
  const { actions, onDragStart, onDragEnd, onFocused, onChanged, onError } = props;
  const cardProps = { actions, onDragStart, onDragEnd, onFocused, onChanged, onError };
  const { status, page, leads, count } = column;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!focusHeading) return;
    if (focusLost()) headingRef.current?.focus();
    onFocused();
  }, [focusHeading, onFocused]);
  // Only the moves the API allows for the dragged lead; the API checks the move again when it is dropped.
  const canDrop = Boolean(dragging && page && dragging.allowed_transitions.includes(status));
  const dimmed = Boolean(dragging && !canDrop && dragging.status !== status);
  if (over && !dragging) setOver(false);
  const more = page ? page.count - page.results.length : 0;

  let body;
  if (page === undefined) body = <BoardSkeleton />;
  else if (page === null) body = <BoardEmpty>Hidden by the Status filter.</BoardEmpty>;
  else if (leads.length === 0) body = canDrop && over ? null : <BoardEmpty>No leads in this stage.</BoardEmpty>;
  else {
    body = leads.map((lead) => (
      <PipelineCard
        key={lead.id}
        lead={lead}
        saving={move?.lead.id === lead.id && !move.saved}
        canDrag={!move && lead.allowed_transitions.length > 0}
        focused={lead.id === focusCardId}
        {...cardProps}
      />
    ));
  }

  return (
    <BoardColumn
      title={statusLabel(status)}
      tone={{ dot: STATUS_DOTS[status], header: STATUS_STYLES[status] }}
      count={page ? count : undefined}
      countNoun={count === 1 ? "lead" : "leads"}
      amount={amount}
      // A new lead always starts as New (the API sets it), so that stage is where one is added.
      add={status === "NEW" ? { label: "Add lead", onClick: actions.add } : undefined}
      menu={
        <>
          <Link href={listHref} className={menuItemClass}>
            <EyeIcon className="size-4 text-muted-foreground" />
            View in the list
          </Link>
          {more > 0 && canShowMore && (
            <button type="button" onClick={onShowMore} className={menuItemClass}>
              <PlusIcon className="size-4 text-muted-foreground" />
              Show more leads
            </button>
          )}
        </>
      }
      drop={canDrop ? (over ? "over" : "available") : undefined}
      dimmed={dimmed}
      busy={loading}
      headingRef={headingRef}
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
      footer={
        page &&
        more > 0 && (
          <p className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
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
        )
      }
    >
      {body}
    </BoardColumn>
  );
}

type LostLaneProps = {
  count?: number;
  listHref: string;
  dragging?: Lead;
  focusHeading: boolean;
  onFocused: () => void;
  onDrop: () => void;
};

// Lost, apart from the pipeline's stages: how many leads were lost, where to see them, and where a card is dropped to
// mark its lead Lost (the card's Update Status does the same from the keyboard or on a touch screen). No cards live here.
function LostLane({ count, listHref, dragging, focusHeading, onFocused, onDrop }: LostLaneProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!focusHeading) return;
    if (focusLost()) headingRef.current?.focus();
    onFocused();
  }, [focusHeading, onFocused]);
  const canDrop = Boolean(dragging?.allowed_transitions.includes("LOST"));
  if (over && !dragging) setOver(false);

  return (
    <section
      aria-label="Lost leads"
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
        if (event.dataTransfer.types.includes(LEAD_DRAG_TYPE)) onDrop();
      }}
      className={`flex w-48 shrink-0 snap-start flex-col self-start rounded-lg border bg-background p-3 transition-colors motion-reduce:transition-none ${
        canDrop ? (over ? "border-error bg-error-soft ring-3 ring-error-border" : "border-dashed border-error") : "border-dashed border-border-strong"
      }`}
    >
      <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${STATUS_DOTS.LOST}`} />
        <span className="flex-1">Lost</span>
        <span className="rounded-md bg-muted px-1.5 text-xs leading-5 font-medium tabular-nums">
          {count === undefined ? "–" : count.toLocaleString("en-IN")}
          <span className="sr-only"> {count === 1 ? "lead" : "leads"}</span>
        </span>
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {canDrop ? "Drop the card here to mark the lead Lost." : "Lost leads leave the pipeline. Drag a card here, or use Update Status on the card."}
      </p>
      <Link href={listHref} className={`${secondaryButton} mt-3 w-full`}>
        View lost leads
      </Link>
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

// The whole card opens the lead (its name is a link stretched over the card); the pin and the menu sit above it, as on
// the Work cards.
function PipelineCard(props: PipelineCardProps) {
  const { lead, saving, canDrag, focused, actions, onDragStart, onDragEnd, onFocused, onChanged, onError } = props;
  const location = [lead.area, lead.district].filter(Boolean).join(", ");
  // A follow-up date that has passed on a lead still open in the pipeline.
  const overdue = lead.next_follow_up !== null && lead.next_follow_up < today() && lead.allowed_transitions.length > 0;
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!focused) return;
    if (focusLost()) linkRef.current?.focus();
    onFocused();
  }, [focused, onFocused]);

  return (
    <div
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
      className={`${boardCardClass} ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${saving ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-1">
        <Link
          ref={linkRef}
          href={`/leads/${lead.id}`}
          draggable={false}
          className="min-w-0 flex-1 truncate font-medium text-foreground after:absolute after:inset-0 after:rounded-md"
        >
          {lead.name}
        </Link>
        {/* Unpinned cards show a faint pin until hovered, so the pinned ones stand out. */}
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
      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-secondary-foreground">
        <span className="min-w-0 truncate">{saving ? "Saving…" : lead.source ? sourceLabel(lead.source) : "Lead"}</span>
        <span className="shrink-0 text-faint tabular-nums">#{lead.id}</span>
      </p>

      <p className="mt-2.5 text-xs text-muted-foreground">{lead.plan_name ? `${lead.plan_name} plan` : "No plan"}</p>
      <p className="font-semibold text-foreground tabular-nums">{formatMoney(lead.amount)}</p>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <PhoneIcon className="size-3.5 shrink-0 text-faint" />
        <span className="tabular-nums">{formatPhone(lead)}</span>
      </p>
      {location && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5 shrink-0 text-faint" />
          <span className="truncate">{location}</span>
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <CardAssignee name={lead.assigned_to_name} />
        <span className={`flex shrink-0 items-center gap-1 ${overdue ? "font-medium text-error" : ""}`}>
          <CalendarIcon className="size-3.5" />
          {lead.next_follow_up
            ? `${overdue ? "Overdue" : "Follow-up"} ${formatDate(lead.next_follow_up)}`
            : `Added ${formatDate(lead.created_at)}`}
        </span>
      </div>
    </div>
  );
}
