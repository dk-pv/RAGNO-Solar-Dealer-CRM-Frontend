"use client";

import Link from "next/link";
import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { CalendarIcon, ChevronLeftIcon, CloseIcon, MapPinIcon, PhoneIcon, SearchIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatDate, formatMoney, formatPhone, telHref, type Assignee, type Page, type Plan } from "@/components/leads/api";
import { Field, Section, dialogClass } from "@/components/leads/lead-dialogs";
import { ErrorState, fieldClass, iconButton, inputClass, primaryButton, secondaryButton, useNotice } from "@/components/leads/ui";
import { toApiError, useApi, type ApiError } from "@/lib/api";
import { WORK_STAGES, stageFor, updateWork, type StageSummary, type Work, type WorkChanges, type WorkStage } from "./api";

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

// Today in the CRM's time zone (YYYY-MM-DD), to mark overdue Works.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export const isOverdue = (work: Work) => work.due_date !== null && work.stage !== "COMPLETED" && work.due_date < today();

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
  const [openWork, setOpenWork] = useState<Work>();
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
        {totalWorks !== undefined && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {totalWorks.toLocaleString("en-IN")} {totalWorks === 1 ? "work" : "works"}
          </p>
        )}
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
          className={`${fieldClass} h-9`}
        >
          <option value="">{assignees.error ? "Anyone (staff couldn't be loaded)" : "Anyone"}</option>
          {assignees.data?.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <select value={plan} onChange={(event) => setPlan(event.target.value)} aria-label="Plan" className={`${fieldClass} h-9`}>
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
            title="Unable to load Works"
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
                onOpen={setOpenWork}
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

      {openWork && (
        <WorkDialog
          work={openWork}
          assignees={assignees}
          onClose={() => setOpenWork(undefined)}
          onSaved={(before, after) => {
            notify({ text: `Saved changes to ${after.customer_name}.` });
            setMoves((current) => without(current, after.id));
            refresh(before.stage, after.stage);
          }}
        />
      )}
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
  onOpen: (work: Work) => void;
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
  onOpen,
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
        if (!canDrop) return;
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
                onOpen={onOpen}
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
  onOpen: (work: Work) => void;
  onDragStart: (work: Work) => void;
  onDragEnd: () => void;
};

function WorkCard({ work, saving, dragging, onOpen, onDragStart, onDragEnd }: WorkCardProps) {
  const stage = stageFor(work.stage);
  const location = [work.area, work.district].filter(Boolean).join(", ");
  const overdue = isOverdue(work);

  return (
    <button
      type="button"
      draggable={!saving}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(work.id));
        onDragStart(work);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(work)}
      aria-busy={saving || undefined}
      aria-label={`${work.customer_name}, Work #${work.id}. Open details`}
      className={`block w-full cursor-grab rounded-md border border-border bg-background p-3 text-left text-sm shadow-xs transition-[opacity,border-color] hover:border-border-strong active:cursor-grabbing ${
        dragging ? "opacity-40" : saving ? "opacity-70" : ""
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-medium text-foreground">{work.customer_name}</span>
        <span className="shrink-0 text-xs text-faint tabular-nums">#{work.id}</span>
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-xs text-secondary-foreground">
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${stage.dot}`} />
        {saving ? "Saving…" : stage.label}
      </span>

      <span className="mt-2.5 block text-xs text-muted-foreground">{work.plan_name} plan</span>
      <span className="block font-semibold text-foreground tabular-nums">{formatMoney(work.amount)}</span>

      <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <PhoneIcon className="size-3.5 shrink-0 text-faint" />
        <span className="tabular-nums">{formatPhone(work)}</span>
      </span>
      {location && (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5 shrink-0 text-faint" />
          <span className="truncate">{location}</span>
        </span>
      )}

      <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        {work.assigned_to_name ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-secondary-foreground"
            >
              {initials(work.assigned_to_name)}
            </span>
            <span className="truncate">{work.assigned_to_name}</span>
          </span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className={`flex shrink-0 items-center gap-1 ${overdue ? "font-medium text-error" : ""}`}>
          <CalendarIcon className="size-3.5" />
          {work.due_date ? `${overdue ? "Overdue" : "Due"} ${formatDate(work.due_date)}` : `Added ${formatDate(work.created_at)}`}
        </span>
      </span>
    </button>
  );
}

type WorkDialogProps = {
  work: Work;
  assignees: { data?: Assignee[]; error?: ApiError };
  onClose: () => void;
  onSaved: (before: Work, after: Work) => void;
};

// A Work's details, and where its stage, assignee and due date change (also the keyboard and touch way to move it).
export function WorkDialog({ work, assignees, onClose, onSaved }: WorkDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [stage, setStage] = useState<WorkStage>(work.stage);
  const [assignedTo, setAssignedTo] = useState(work.assigned_to ? String(work.assigned_to) : "");
  const [dueDate, setDueDate] = useState(work.due_date ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const me = useContext(CurrentUserContext);
  // The lead's page needs the Leads module.
  const canOpenLeads = me?.role === "ADMIN" || me?.modules.includes("leads");
  const close = () => dialogRef.current?.close();
  const fieldId = (field: string) => `${formId}-${field}`;
  const location = [work.area, work.district, work.state, work.pin_code].filter(Boolean).join(", ");
  // Someone no longer active stays visible on a Work that already has them.
  const keepAssignee =
    work.assigned_to && !assignees.data?.some((person) => person.id === work.assigned_to)
      ? { id: work.assigned_to, name: work.assigned_to_name ?? `User #${work.assigned_to}` }
      : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes: WorkChanges = {};
    if (stage !== work.stage) changes.stage = stage;
    const assignee = assignedTo ? Number(assignedTo) : null;
    if (assignee !== work.assigned_to) changes.assigned_to = assignee;
    const due = dueDate || null;
    if (due !== work.due_date) changes.due_date = due;
    if (Object.keys(changes).length === 0) {
      close();
      return;
    }

    setSaving(true);
    setFormError(undefined);
    try {
      onSaved(work, await updateWork(work.id, changes));
      close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      setFormError(apiError.message);
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={`${formId}-title`}
      className={`${dialogClass} max-h-[calc(100dvh-2rem)] max-w-xl overflow-hidden p-0`}
    >
      <form noValidate onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${formId}-title`} className="truncate text-base font-semibold">
              {work.customer_name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Work #{work.id} · from{" "}
              {canOpenLeads ? (
                <Link href={`/leads/${work.lead}`} className="font-medium text-link underline underline-offset-2 hover:text-link-hover">
                  Lead #{work.lead}
                </Link>
              ) : (
                `Lead #${work.lead}`
              )}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className={`${iconButton} -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          {formError && (
            <p role="alert" className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
              {formError}
            </p>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-page px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Plan</dt>
            <dd>{work.plan_name}</dd>
            <dt className="text-muted-foreground">Confirmed amount</dt>
            <dd>
              <span className="font-semibold tabular-nums">{formatMoney(work.amount)}</span>
              <span className="block text-xs text-muted-foreground">Fixed at conversion. Plan price changes don&apos;t affect it.</span>
            </dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>
              <a href={telHref(work)} className="text-link tabular-nums hover:text-link-hover">
                {formatPhone(work)}
              </a>
            </dd>
            {work.email && (
              <>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{work.email}</dd>
              </>
            )}
            {location && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{location}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Added</dt>
            <dd>{formatDate(work.created_at)}</dd>
          </dl>

          <Section title="Pipeline">
            <Field label="Stage" id={fieldId("stage")} error={errors.stage}>
              <select
                id={fieldId("stage")}
                value={stage}
                onChange={(event) => setStage(event.target.value as WorkStage)}
                className={inputClass}
              >
                {WORK_STAGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Assigned staff"
              id={fieldId("assigned_to")}
              error={errors.assigned_to}
              hint={assignees.error && `Staff couldn't be loaded: ${assignees.error.message}`}
            >
              <select
                id={fieldId("assigned_to")}
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {[...(assignees.data ?? []), ...(keepAssignee ? [keepAssignee] : [])].map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date" id={fieldId("due_date")} error={errors.due_date}>
              <input
                id={fieldId("due_date")}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={inputClass}
              />
            </Field>
          </Section>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
