"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CalendarIcon, ChevronLeftIcon, MapPinIcon, PhoneIcon, SearchIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { formatDate, formatMoney, formatPhone, type Assignee, type Page, type Plan } from "@/components/leads/api";
import { ErrorState, ViewSwitch, fieldClass, iconButton, inputClass, secondaryButton, useNotice } from "@/components/leads/ui";
import { toApiError, useApi } from "@/lib/api";
import { WORK_STAGES, stageFor, today, updateWork, type StageSummary, type Work, type WorkStage } from "./api";
import { WorkMenu, WorkPinButton, isOverdue, useWorkActions, type WorkActions } from "./work-actions";
import { WORK_VIEWS } from "./works-page";

type Stage = (typeof WORK_STAGES)[number];

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100; // the API's largest page

// Must match the backend's Work orderings.
const SORT_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date" },
  { value: "-amount", label: "Amount: high to low" },
  { value: "amount", label: "Amount: low to high" },
  { value: "customer_name", label: "Customer name" },
];

// What a card drag carries. Columns accept only this, so a card dropped on a text field doesn't type anything into it.
const WORK_DRAG_TYPE = "application/x-ragno-work";

// A move shown on the board at once. `settled` is the column versions that reload with the saved move: once a column
// has loaded that version, its own data shows the move and the override is no longer needed.
type Move = { work: Work; from: WorkStage; to: WorkStage; saving: boolean; settled?: Partial<Record<WorkStage, number>> };

const without = <T,>(record: Record<number, T>, id: number) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => Number(key) !== id)) as Record<number, T>;

export function WorkPipeline() {
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [plan, setPlan] = useState("");
  const [ordering, setOrdering] = useState(SORT_OPTIONS[0].value);
  // Bumped for a stage after a change there, so only the columns involved reload.
  const [versions, setVersions] = useState<Partial<Record<WorkStage, number>>>({});
  // The same versions, readable after an await, when the state above may already be newer.
  const versionsRef = useRef(versions);
  const [moves, setMoves] = useState<Record<number, Move>>({});
  const [dragged, setDragged] = useState<Work>();
  const [dropTarget, setDropTarget] = useState<WorkStage>();
  const [noticeElement, notify] = useNotice();
  const boardRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef({ speed: 0, frame: 0 });
  const assignees = useApi<Assignee[]>("/works/assignees/");
  const plans = useApi<Plan[]>("/plans/");

  // Search as the user types, once they pause.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const filters = new URLSearchParams();
  if (search) filters.set("search", search);
  if (assignedTo) filters.set("assigned_to", assignedTo);
  if (plan) filters.set("plan", plan);
  const summary = useApi<StageSummary[]>(filters.size ? `/works/summary/?${filters}` : "/works/summary/");
  const totalWorks = summary.data?.reduce((sum, row) => sum + row.count, 0);
  const filtered = Boolean(searchText || assignedTo || plan);
  const moveList = Object.values(moves);

  function refresh(...stages: WorkStage[]) {
    const next = { ...versionsRef.current };
    for (const stage of stages) next[stage] = (next[stage] ?? 0) + 1;
    versionsRef.current = next;
    setVersions(next);
    summary.reload();
    return next;
  }

  // After an edit, a new activity or a pin, the columns the Work was and is in reload with it.
  const actions = useWorkActions(
    notify,
    (before, after) => {
      setMoves((current) => without(current, after.id));
      refresh(before.stage, after.stage);
    },
    assignees,
  );

  // The card moves at once; the backend then validates and saves the move. If it refuses, the card goes back.
  async function move(work: Work, to: WorkStage) {
    const from = work.stage;
    if (from === to) return;
    setMoves((current) => ({ ...current, [work.id]: { work: { ...work, stage: to }, from, to, saving: true } }));
    try {
      const saved = await updateWork(work.id, { stage: to });
      const settled = refresh(from, to);
      setMoves((current) => ({ ...current, [work.id]: { work: saved, from, to, saving: false, settled } }));
      notify({ text: `Moved ${work.customer_name} to ${stageFor(to).label}.` });
    } catch (error) {
      setMoves((current) => without(current, work.id));
      notify({ text: `Couldn't move ${work.customer_name}. ${toApiError(error).message}`, error: true });
    }
  }

  // Dragging near the board's left or right edge scrolls it that way, faster nearer the edge, so a card can reach any
  // column in either direction even when the board is wider than the screen.
  function scrollWhileDragging(clientX: number) {
    const board = boardRef.current;
    if (!board) return;
    const { left, right } = board.getBoundingClientRect();
    const zone = Math.min(120, board.clientWidth / 4);
    const depth = clientX < left + zone ? clientX - (left + zone) : clientX > right - zone ? clientX - (right - zone) : 0;
    autoScroll.current.speed = Math.max(-1, Math.min(1, depth / zone)) * 24;
    if (autoScroll.current.speed && !autoScroll.current.frame) {
      const step = () => {
        const target = boardRef.current;
        if (!target || !autoScroll.current.speed) {
          autoScroll.current.frame = 0;
          return;
        }
        target.scrollLeft += autoScroll.current.speed;
        autoScroll.current.frame = requestAnimationFrame(step);
      };
      autoScroll.current.frame = requestAnimationFrame(step);
    }
  }

  // The board has no visible scrollbar, so these buttons scroll it one column at a time.
  function scrollBoard(direction: 1 | -1) {
    const board = boardRef.current;
    const column = board?.querySelector("section");
    if (board && column) board.scrollBy({ left: direction * (column.offsetWidth + 12), behavior: "smooth" });
  }

  function endDrag() {
    autoScroll.current.speed = 0;
    setDragged(undefined);
    setDropTarget(undefined);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Work Pipeline</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Track confirmed solar installation work through each execution stage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {totalWorks !== undefined && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {totalWorks.toLocaleString("en-IN")} {totalWorks === 1 ? "work" : "works"}
            </p>
          )}
          <ViewSwitch label="Works view" views={WORK_VIEWS} />
        </div>
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
        <select
          value={assignedTo}
          onChange={(event) => setAssignedTo(event.target.value)}
          aria-label="Assigned staff"
          className={`${fieldClass} h-9 max-sm:w-full`}
        >
          <option value="">{assignees.error ? "Anyone (staff couldn't be loaded)" : "Anyone"}</option>
          {assignees.data?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <select value={plan} onChange={(event) => setPlan(event.target.value)} aria-label="Plan" className={`${fieldClass} h-9 max-sm:w-full`}>
          <option value="">{plans.error ? "All plans (plans couldn't be loaded)" : "All plans"}</option>
          {plans.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select value={ordering} onChange={(event) => setOrdering(event.target.value)} className={`${fieldClass} h-9`}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1 sm:ml-auto">
          <button
            type="button"
            onClick={() => scrollBoard(-1)}
            aria-label="Scroll to earlier stages"
            title="Earlier stages"
            className={`${iconButton} size-9 border border-input bg-background`}
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBoard(1)}
            aria-label="Scroll to later stages"
            title="Later stages"
            className={`${iconButton} size-9 border border-input bg-background`}
          >
            <ChevronLeftIcon className="size-4 rotate-180" />
          </button>
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setSearchText("");
              setAssignedTo("");
              setPlan("");
            }}
            className={secondaryButton}
          >
            Clear
          </button>
        )}
      </div>

      {summary.error ? (
        <div className="mt-4 rounded-lg border border-border bg-background">
          <ErrorState
            title="Couldn't load Works"
            message={summary.error.message}
            onRetry={() => refresh(...WORK_STAGES.map((stage) => stage.value))}
          />
        </div>
      ) : (
        // The board scrolls sideways and ends at the last column; each column scrolls its own cards. On phones a column
        // snaps into view, except while dragging, when snapping would fight the edge scrolling. `relative` keeps
        // absolutely positioned content (the screen-reader labels) inside the board; otherwise it widens the whole page.
        <div
          ref={boardRef}
          onDragOver={(event) => {
            if (dragged) scrollWhileDragging(event.clientX);
          }}
          className={`scrollbar-none relative mt-4 overflow-x-auto ${dragged ? "" : "snap-x snap-mandatory lg:snap-none"}`}
        >
          <div className="flex gap-3">
            {WORK_STAGES.map((stage) => (
              <StageColumn
                key={stage.value}
                stage={stage}
                filters={filters}
                ordering={ordering}
                version={versions[stage.value] ?? 0}
                summary={summary.data?.find((row) => row.stage === stage.value)}
                moves={moveList}
                draggedId={dragged?.id}
                canDrop={dragged !== undefined && dragged.stage !== stage.value}
                isDropTarget={dropTarget === stage.value}
                actions={actions}
                onDragStart={setDragged}
                onDragEnd={endDrag}
                onDragOverStage={setDropTarget}
                onDrop={() => {
                  if (dragged) move(dragged, stage.value);
                  endDrag();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {actions.dialogs}
      {noticeElement}
    </div>
  );
}

type StageColumnProps = {
  stage: Stage;
  filters: URLSearchParams;
  ordering: string;
  version: number;
  summary?: StageSummary;
  moves: Move[];
  draggedId?: number;
  canDrop: boolean;
  isDropTarget: boolean;
  actions: WorkActions;
  onDragStart: (work: Work) => void;
  onDragEnd: () => void;
  onDragOverStage: (stage: WorkStage | undefined) => void;
  onDrop: () => void;
};

function StageColumn({
  stage,
  filters,
  ordering,
  version,
  summary,
  moves,
  draggedId,
  canDrop,
  isDropTarget,
  actions,
  onDragStart,
  onDragEnd,
  onDragOverStage,
  onDrop,
}: StageColumnProps) {
  const [size, setSize] = useState(PAGE_SIZE);
  const query = new URLSearchParams(filters);
  query.set("stage", stage.value);
  query.set("ordering", ordering);
  query.set("page_size", String(size));
  // `v` only changes the address, so the column reloads after a change here; the API ignores it.
  if (version) query.set("v", String(version));
  const { data, error, loading, reload } = useApi<Page<Work>>(`/works/?${query}`);

  // Moves into or out of this column that its own data doesn't show yet: still saving, or saved but not reloaded.
  const pending = moves.filter((move) => {
    if (move.from !== stage.value && move.to !== stage.value) return false;
    const needed = move.settled?.[stage.value];
    return needed === undefined || version < needed || (version === needed && loading);
  });
  const works = data && [
    ...pending
      .filter((move) => move.to === stage.value && !data.results.some((work) => work.id === move.work.id))
      .map((move) => move.work),
    ...data.results.filter((work) => !pending.some((move) => move.work.id === work.id && move.to !== stage.value)),
  ];
  const baseCount = summary?.count ?? data?.count;
  // The stage counts reload once a move is saved; until then they count the moves still saving.
  const count =
    baseCount === undefined
      ? undefined
      : baseCount +
        moves.filter((move) => move.saving && move.to === stage.value).length -
        moves.filter((move) => move.saving && move.from === stage.value).length;

  return (
    <section
      aria-label={stage.label}
      onDragOver={(event) => {
        if (!canDrop || !event.dataTransfer.types.includes(WORK_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverStage(stage.value);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragOverStage(undefined);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (canDrop) onDrop();
      }}
      className={`flex max-h-[calc(100dvh-15rem)] min-h-72 min-w-[min(18rem,85vw)] flex-1 snap-start flex-col rounded-lg border bg-muted transition-colors ${
        isDropTarget ? "border-primary ring-3 ring-ring" : "border-border"
      }`}
    >
      <header className={`shrink-0 rounded-t-lg border-b border-border px-3 py-2.5 ${stage.header}`}>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${stage.dot}`} />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{stage.label}</h2>
          <span className="rounded-md bg-background/70 px-1.5 text-xs font-medium tabular-nums">
            {count === undefined ? "–" : count}
            <span className="sr-only"> works</span>
          </span>
        </div>
        <p className="mt-0.5 pl-4 text-xs tabular-nums opacity-80">
          {summary ? formatMoney(summary.total_amount) : " "}
          <span className="sr-only"> confirmed in this stage</span>
        </p>
      </header>

      <div
        aria-busy={loading}
        className={`scrollbar-none flex-1 space-y-2 overflow-y-auto p-2 transition-opacity ${loading && data && !pending.length ? "opacity-60" : ""}`}
      >
        {isDropTarget && (
          <p className="rounded-md border-2 border-dashed border-primary/50 bg-primary-softer px-3 py-3 text-center text-xs font-medium text-primary-strong">
            Move here
          </p>
        )}
        {error ? (
          <div className="px-2 py-6 text-center text-xs">
            <p className="text-error">{error.message}</p>
            <button type="button" onClick={reload} className="mt-2 font-medium text-link hover:text-link-hover">
              Try again
            </button>
          </div>
        ) : works ? (
          works.length > 0 ? (
            works.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                saving={moves.some((move) => move.saving && move.work.id === work.id)}
                dragging={draggedId === work.id}
                actions={actions}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))
          ) : (
            !isDropTarget && (
              <p className="rounded-md border border-dashed border-border-strong px-3 py-8 text-center text-xs text-muted-foreground">
                No Works here yet.
              </p>
            )
          )
        ) : (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-2 rounded-md border border-border bg-background p-3">
              <span className="block h-3 w-3/5 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
              <span className="block h-3 w-2/5 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
              <span className="block h-3 w-4/5 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
            </div>
          ))
        )}

        {data &&
          data.results.length < data.count &&
          (size < MAX_PAGE_SIZE ? (
            <button
              type="button"
              onClick={() => setSize((current) => Math.min(current + PAGE_SIZE, MAX_PAGE_SIZE))}
              className={`${secondaryButton} w-full`}
            >
              Show more ({(data.count - data.results.length).toLocaleString("en-IN")} more)
            </button>
          ) : (
            // ponytail: a column shows at most the API's largest page (100); page-by-page loading if stages outgrow it.
            <p className="px-2 py-2 text-center text-xs text-muted-foreground">
              Showing the first {MAX_PAGE_SIZE}. Search or filter to find the others.
            </p>
          ))}
      </div>
    </section>
  );
}

type WorkCardProps = {
  work: Work;
  saving: boolean;
  dragging: boolean;
  actions: WorkActions;
  onDragStart: (work: Work) => void;
  onDragEnd: () => void;
};

// The whole card opens the Work (its customer name is a link stretched over the card); the pin, the menu and the
// activities link sit above it, as on the lead cards.
function WorkCard({ work, saving, dragging, actions, onDragStart, onDragEnd }: WorkCardProps) {
  const stage = stageFor(work.stage);
  const location = [work.area, work.district].filter(Boolean).join(", ");
  const overdue = isOverdue(work);
  const followUpOverdue = work.next_activity_due !== null && work.next_activity_due < today();

  return (
    <div
      draggable={!saving}
      onDragStart={(event) => {
        // A drag that starts inside the open menu is a slipped click, not a move; one from the card closes the menu.
        const menu = event.currentTarget.querySelector<HTMLElement>(":popover-open");
        if (menu?.contains(document.elementFromPoint(event.clientX, event.clientY))) {
          event.preventDefault();
          return;
        }
        menu?.hidePopover();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(WORK_DRAG_TYPE, String(work.id));
        onDragStart(work);
      }}
      onDragEnd={onDragEnd}
      aria-busy={saving || undefined}
      className={`group relative cursor-grab rounded-md border border-border bg-background p-3 text-sm shadow-xs transition-[opacity,border-color] hover:border-border-strong active:cursor-grabbing ${
        dragging ? "opacity-40" : saving ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <Link
          href={`/works/${work.id}`}
          draggable={false}
          className="min-w-0 flex-1 truncate font-medium text-foreground after:absolute after:inset-0 after:rounded-md"
        >
          {work.customer_name}
        </Link>
        {/* Unpinned cards show a faint pin until hovered, so the pinned ones stand out. */}
        <WorkPinButton
          work={work}
          actions={actions}
          className="relative z-1 -my-1 size-7 opacity-40 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        />
        <div className="relative z-1 -my-1.5 -mr-1.5">
          <WorkMenu work={work} actions={actions} />
        </div>
      </div>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-secondary-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${stage.dot}`} />
          {saving ? "Saving…" : stage.label}
        </span>
        <span className="shrink-0 text-faint tabular-nums">#{work.id}</span>
      </p>

      <p className="mt-2.5 text-xs text-muted-foreground">{work.plan_name} plan</p>
      <p className="font-semibold text-foreground tabular-nums">{formatMoney(work.amount)}</p>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <PhoneIcon className="size-3.5 shrink-0 text-faint" />
        <span className="tabular-nums">{formatPhone(work)}</span>
      </p>
      {location && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5 shrink-0 text-faint" />
          <span className="truncate">{location}</span>
        </p>
      )}

      {work.activity_count > 0 && (
        <Link
          href={`/works/${work.id}#activities`}
          draggable={false}
          className={`relative z-1 mt-2 flex w-fit max-w-full items-center gap-1.5 rounded text-xs underline-offset-2 hover:underline ${
            work.pending_activity_count > 0 && followUpOverdue ? "font-medium text-error" : "text-secondary-foreground"
          }`}
        >
          <CalendarIcon className="size-3.5 shrink-0" />
          <span className="truncate">
            <span className="sr-only">Activities: </span>
            {work.pending_activity_count > 0
              ? `${work.pending_activity_count} pending · ${
                  work.next_activity_due
                    ? `${followUpOverdue ? "overdue" : "next"} ${formatDate(work.next_activity_due)}`
                    : "no date set"
                }`
              : `${work.activity_count} ${work.activity_count === 1 ? "activity" : "activities"} · all done`}
          </span>
        </Link>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        {work.assigned_to_name ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-secondary-foreground"
            >
              {initials(work.assigned_to_name)}
            </span>
            <span className="truncate">
              <span className="sr-only">Assigned to </span>
              {work.assigned_to_name}
            </span>
          </span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className={`flex shrink-0 items-center gap-1 ${overdue ? "font-medium text-error" : ""}`}>
          <CalendarIcon className="size-3.5" />
          {work.due_date ? `${overdue ? "Overdue" : "Due"} ${formatDate(work.due_date)}` : `Added ${formatDate(work.created_at)}`}
        </span>
      </div>
    </div>
  );
}
