"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { CalendarIcon, EyeIcon, MapPinIcon, PhoneIcon, PlusIcon } from "@/components/layout/icons";
import { formatDate, formatMoney, formatPhone, type Assignee, type Page } from "@/components/leads/api";
import { menuItemClass } from "@/components/leads/lead-actions";
import { pickParams, updateQuery } from "@/components/leads/leads-toolbar";
import { ErrorState, fillClass, secondaryButton, useNotice } from "@/components/leads/ui";
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
import { toApiError, useApi } from "@/lib/api";
import { WORK_STAGES, stageFor, today, updateWork, type StageSummary, type Work, type WorkStage } from "./api";
import { WorkMenu, WorkPinButton, isOverdue, useWorkActions, type WorkActions } from "./work-actions";
import { DocumentStatus } from "./work-documents";
import { DEFAULT_ORDERING, FILTER_KEYS, SORT_OPTIONS, WorksHeader, WorksToolbar } from "./works-toolbar";

type Stage = (typeof WORK_STAGES)[number];

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100; // the API's largest page

// Every card in a column is in the same stage, so sorting by stage means nothing here.
const PIPELINE_SORT_OPTIONS = SORT_OPTIONS.filter((option) => option.value !== "stage");

// What a card drag carries. Columns accept only this, so a card dropped on a text field doesn't type anything into it.
const WORK_DRAG_TYPE = "application/x-ragno-work";

// A move shown on the board at once. `settled` is the column versions that reload with the saved move: once a column
// has loaded that version, its own data shows the move and the override is no longer needed.
type Move = { work: Work; from: WorkStage; to: WorkStage; saving: boolean; settled?: Partial<Record<WorkStage, number>> };

const without = <T,>(record: Record<number, T>, id: number) =>
  Object.fromEntries(Object.entries(record).filter(([key]) => Number(key) !== id)) as Record<number, T>;

// The Work Pipeline: one column per stage of the installation work, with the same Works, search, filters and actions as
// the list. A Work moves to any stage, in either direction, by dragging its card; the API validates and saves the move.
export function WorkPipeline() {
  const searchParams = useSearchParams();
  // The search and filters the board shares with the list, kept in the URL.
  const filters = pickParams(searchParams, ["search", ...FILTER_KEYS]).toString();
  const chosenOrdering = searchParams.get("ordering");
  const ordering = PIPELINE_SORT_OPTIONS.find((option) => option.value === chosenOrdering)?.value ?? DEFAULT_ORDERING;
  const stageFilter = searchParams.get("stage") || null;
  const unknownStage = stageFilter !== null && !WORK_STAGES.some((stage) => stage.value === stageFilter);
  // Bumped for a stage after a change there, so only the columns involved reload.
  const [versions, setVersions] = useState<Partial<Record<WorkStage, number>>>({});
  // The same versions, readable after an await, when the state above may already be newer.
  const versionsRef = useRef(versions);
  const [moves, setMoves] = useState<Record<number, Move>>({});
  const [dragged, setDragged] = useState<Work>();
  const [dropTarget, setDropTarget] = useState<WorkStage>();
  const [noticeElement, notify] = useNotice();
  const { boardRef, scrollBoard, scrollWhileDragging, stopScrolling } = useBoardScroll();
  const assignees = useApi<Assignee[]>("/works/assignees/");
  const summary = useApi<StageSummary[]>(unknownStage ? null : filters ? `/works/summary/?${filters}` : "/works/summary/");
  const totalWorks = summary.data?.reduce((sum, row) => sum + row.count, 0);
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

  function endDrag() {
    stopScrolling();
    setDragged(undefined);
    setDropTarget(undefined);
  }

  // The list, narrowed to one stage, keeping the board's search and filters.
  const listHref = (stage: WorkStage) => {
    const listQuery = new URLSearchParams(filters);
    listQuery.set("stage", stage);
    return `/works?${listQuery}`;
  };

  let content;
  if (unknownStage) {
    content = (
      <div className="mt-4 rounded-lg border border-border bg-background">
        <ErrorState
          title="Couldn't load Works"
          message={`"${stageFilter}" isn't a Work stage.`}
          onRetry={() => updateQuery({ stage: null })}
          retryLabel="Clear the stage filter"
        />
      </div>
    );
  } else if (summary.error) {
    content = (
      <div className="mt-4 rounded-lg border border-border bg-background">
        <ErrorState
          title="Couldn't load Works"
          message={summary.error.message}
          onRetry={() => refresh(...WORK_STAGES.map((stage) => stage.value))}
        />
      </div>
    );
  } else {
    content = (
      <Board
        boardRef={boardRef}
        dragging={dragged !== undefined}
        onDragOver={(event) => {
          if (dragged) scrollWhileDragging(event.clientX);
        }}
      >
        {WORK_STAGES.map((stage) => {
          const hidden = stageFilter !== null && stageFilter !== stage.value;
          return (
            <StageColumn
              key={stage.value}
              stage={stage}
              filters={filters}
              ordering={ordering}
              version={versions[stage.value] ?? 0}
              summary={summary.data?.find((row) => row.stage === stage.value)}
              hidden={hidden}
              listHref={listHref(stage.value)}
              moves={moveList}
              draggedId={dragged?.id}
              canDrop={!hidden && dragged !== undefined && dragged.stage !== stage.value}
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
          );
        })}
      </Board>
    );
  }

  const hint = "Drag a card to another stage to move the job.";
  return (
    <div className={fillClass}>
      <WorksHeader
        title="Work Pipeline"
        description={
          totalWorks === undefined
            ? hint
            : `${totalWorks.toLocaleString("en-IN")} ${totalWorks === 1 ? "work" : "works"} in the pipeline. ${hint}`
        }
      />
      <PipelineSwitch />
      <WorksToolbar sortOptions={PIPELINE_SORT_OPTIONS} assignees={assignees.data}>
        <BoardScrollButtons onScroll={scrollBoard} />
      </WorksToolbar>
      {content}
      {actions.dialogs}
      {noticeElement}
    </div>
  );
}

type StageColumnProps = {
  stage: Stage;
  filters: string;
  ordering: string;
  version: number;
  summary?: StageSummary;
  /** The Stage filter leaves this stage out: it loads nothing and takes no cards. */
  hidden: boolean;
  listHref: string;
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
  hidden,
  listHref,
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
  const { data, error, loading, reload } = useApi<Page<Work>>(hidden ? null : `/works/?${query}`);

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
    hidden || baseCount === undefined
      ? undefined
      : baseCount +
        moves.filter((move) => move.saving && move.to === stage.value).length -
        moves.filter((move) => move.saving && move.from === stage.value).length;
  const more = data ? data.count - data.results.length : 0;
  const showMore = () => setSize((current) => Math.min(current + PAGE_SIZE, MAX_PAGE_SIZE));

  let body;
  if (hidden) body = <BoardEmpty>Hidden by the Stage filter.</BoardEmpty>;
  else if (error) {
    body = (
      <div className="px-2 py-6 text-center text-xs">
        <p className="text-error">{error.message}</p>
        <button type="button" onClick={reload} className="mt-2 font-medium text-link hover:text-link-hover">
          Try again
        </button>
      </div>
    );
  } else if (!works) body = <BoardSkeleton />;
  else if (works.length === 0) body = isDropTarget ? null : <BoardEmpty>No Works in this stage.</BoardEmpty>;
  else {
    body = works.map((work) => (
      <WorkCard
        key={work.id}
        work={work}
        saving={moves.some((move) => move.saving && move.work.id === work.id)}
        dragging={draggedId === work.id}
        actions={actions}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    ));
  }

  return (
    <BoardColumn
      title={stage.label}
      tone={stage}
      count={count}
      countNoun={count === 1 ? "work" : "works"}
      amount={hidden || !summary ? undefined : formatMoney(summary.total_amount)}
      // No Add here: a Work is created only by converting a Won lead.
      menu={
        <>
          <Link href={listHref} className={menuItemClass}>
            <EyeIcon className="size-4 text-muted-foreground" />
            View in the list
          </Link>
          {more > 0 && size < MAX_PAGE_SIZE && (
            <button type="button" onClick={showMore} className={menuItemClass}>
              <PlusIcon className="size-4 text-muted-foreground" />
              Show more Works
            </button>
          )}
        </>
      }
      drop={isDropTarget && canDrop ? "over" : canDrop ? "available" : undefined}
      busy={loading}
      refreshing={loading && data !== undefined && !pending.length}
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
    >
      {body}
      {data &&
        more > 0 &&
        (size < MAX_PAGE_SIZE ? (
          <button type="button" onClick={showMore} className={`${secondaryButton} w-full`}>
            Show more ({more.toLocaleString("en-IN")} more)
          </button>
        ) : (
          // ponytail: a column shows at most the API's largest page (100); page-by-page loading if stages outgrow it.
          <p className="px-2 py-2 text-center text-xs text-muted-foreground">
            Showing the first {MAX_PAGE_SIZE}. Search or filter to find the others.
          </p>
        ))}
    </BoardColumn>
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
// activities and documents links sit above it, as on the lead cards.
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
      className={`${boardCardClass} cursor-grab active:cursor-grabbing ${dragging ? "opacity-40" : saving ? "opacity-70" : ""}`}
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
      <DocumentStatus work={work} className="relative z-1 mt-2" />

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <CardAssignee name={work.assigned_to_name} />
        <span className={`flex shrink-0 items-center gap-1 ${overdue ? "font-medium text-error" : ""}`}>
          <CalendarIcon className="size-3.5" />
          {work.due_date ? `${overdue ? "Overdue" : "Due"} ${formatDate(work.due_date)}` : `Added ${formatDate(work.created_at)}`}
        </span>
      </div>
    </div>
  );
}
