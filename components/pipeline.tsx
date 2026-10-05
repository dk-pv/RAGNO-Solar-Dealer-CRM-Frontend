"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useId, useRef, type DragEvent, type ReactNode, type RefObject } from "react";

import { ChevronLeftIcon, MoreIcon, PlusIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import { canOpen } from "@/components/layout/navigation";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { placeMenu } from "@/components/leads/lead-actions";
import { iconButton, tabClass, tabListClass } from "@/components/leads/ui";

// What the CRM's two pipeline boards share: the tabs that switch between them, the board with its sideways scrolling,
// the column (header with its count, total, Add and More actions; the cards' scroll area) and the cards' common parts.
// Each board keeps its own data, stages and rules: the Lead Pipeline in components/leads/leads-pipeline.tsx, the Work
// Pipeline in components/works/work-pipeline.tsx.

// ---- The two pipelines ----

const PIPELINES = [
  { label: "Lead Pipeline", href: "/leads/pipeline", module: "leads" },
  { label: "Work Pipeline", href: "/works/pipeline", module: "work" },
];

// Tabs between the two pipelines: leads on their way to Won, and the Works that follow a conversion. They are separate
// boards with their own stages. A tab shows only for a role that has its module; with one pipeline there is no switch.
export function PipelineSwitch() {
  const me = useContext(CurrentUserContext);
  const pathname = usePathname();
  const pipelines = PIPELINES.filter((pipeline) => me && canOpen(me, pipeline));
  if (pipelines.length < 2) return null;

  return (
    <nav aria-label="Pipelines" className={`mt-3 ${tabListClass}`}>
      {pipelines.map((pipeline) => (
        <Link key={pipeline.href} href={pipeline.href} aria-current={pathname === pipeline.href ? "page" : undefined} className={tabClass}>
          {pipeline.label}
        </Link>
      ))}
    </nav>
  );
}

// ---- The board ----

// The board scrolls sideways inside its own box and shows no scrollbar: the buttons scroll it one column at a time, and
// dragging a card near its left or right edge scrolls it that way, faster nearer the edge, so a card can reach any
// column even when the board is wider than the screen.
export function useBoardScroll() {
  const boardRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef({ speed: 0, frame: 0, at: 0 });

  function scrollWhileDragging(clientX: number) {
    const board = boardRef.current;
    if (!board) return;
    const { left, right } = board.getBoundingClientRect();
    const zone = Math.min(120, board.clientWidth / 4);
    const depth = clientX < left + zone ? clientX - (left + zone) : clientX > right - zone ? clientX - (right - zone) : 0;
    autoScroll.current.speed = Math.max(-1, Math.min(1, depth / zone)) * 24;
    autoScroll.current.at = performance.now();
    if (autoScroll.current.speed && !autoScroll.current.frame) {
      const step = () => {
        const target = boardRef.current;
        // A drag reports its position many times a second; silence means it ended (even without a drop), so stop.
        if (!target || !autoScroll.current.speed || performance.now() - autoScroll.current.at > 300) {
          autoScroll.current.speed = 0;
          autoScroll.current.frame = 0;
          return;
        }
        target.scrollLeft += autoScroll.current.speed;
        autoScroll.current.frame = requestAnimationFrame(step);
      };
      autoScroll.current.frame = requestAnimationFrame(step);
    }
  }

  function scrollBoard(direction: 1 | -1) {
    const board = boardRef.current;
    const column = board?.querySelector("section");
    if (board && column) board.scrollBy({ left: direction * (column.offsetWidth + 12), behavior: "smooth" });
  }

  return {
    boardRef,
    scrollBoard,
    scrollWhileDragging,
    stopScrolling: () => {
      autoScroll.current.speed = 0;
    },
  };
}

// The toolbar's pair of buttons that scroll the board to its earlier and later stages.
export function BoardScrollButtons({ onScroll }: { onScroll: (direction: 1 | -1) => void }) {
  const button = `${iconButton} size-9 border border-input bg-background`;
  return (
    <div className="flex gap-1 sm:ml-auto">
      <button type="button" onClick={() => onScroll(-1)} aria-label="Scroll to earlier stages" title="Earlier stages" className={button}>
        <ChevronLeftIcon className="size-4" />
      </button>
      <button type="button" onClick={() => onScroll(1)} aria-label="Scroll to later stages" title="Later stages" className={button}>
        <ChevronLeftIcon className="size-4 rotate-180" />
      </button>
    </div>
  );
}

type BoardProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  /** A card is being dragged: the columns stop snapping, which would fight the edge scrolling. */
  dragging: boolean;
  /** A newer search, filter or sort is loading: the old board is dimmed so it isn't mistaken for the results. */
  refreshing?: boolean;
  busy?: boolean;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  children: ReactNode;
};

// The columns, side by side. Each column scrolls its own cards; the board scrolls sideways and ends at the last column.
// On phones a column snaps into view. `relative` keeps absolutely positioned content (screen-reader labels) inside the
// board; otherwise it would widen the whole page.
export function Board({ boardRef, dragging, refreshing = false, busy, onDragOver, children }: BoardProps) {
  return (
    <div
      ref={boardRef}
      aria-busy={busy}
      onDragOver={onDragOver}
      className={`scrollbar-none relative mt-4 overflow-x-auto transition-opacity motion-reduce:transition-none ${
        dragging ? "" : "snap-x snap-mandatory lg:snap-none"
      } ${refreshing ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

// ---- A column ----

const headerButton =
  "grid size-7 shrink-0 place-items-center rounded-md opacity-70 transition hover:bg-background/60 hover:opacity-100 pointer-coarse:size-9";

type BoardColumnProps = {
  title: string;
  /** The stage's colours: its dot, and the header's background and text. */
  tone: { dot: string; header: string };
  /** How many records the stage holds; undefined while it loads. */
  count?: number;
  /** What it counts, for screen readers: "leads". */
  countNoun: string;
  /** The stage's total amount, formatted; undefined while it loads (the line is kept). */
  amount?: string;
  /** The header's Add button, in a stage where records can be added. */
  add?: { label: string; onClick: () => void };
  /** The More menu's items; the menu closes when one is chosen. */
  menu?: ReactNode;
  /** While a card is dragged: it can be dropped here, or is over this column. */
  drop?: "available" | "over";
  /** While a card is dragged: it can't go here. */
  dimmed?: boolean;
  busy?: boolean;
  /** The column's cards are reloading: they are dimmed until the new ones arrive. */
  refreshing?: boolean;
  /** To move the keyboard focus to the column's heading. */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  /** Under the cards, such as "Showing 25 of 60". */
  footer?: ReactNode;
  /** The cards, or the column's loading, empty or error state. */
  children: ReactNode;
};

export function BoardColumn({
  title,
  tone,
  count,
  countNoun,
  amount,
  add,
  menu,
  drop,
  dimmed = false,
  busy,
  refreshing = false,
  headingRef,
  onDragOver,
  onDragLeave,
  onDrop,
  footer,
  children,
}: BoardColumnProps) {
  const menuId = useId();
  const outline = drop === "over" ? "border-primary ring-3 ring-ring" : drop === "available" ? "border-dashed border-primary" : "border-border";

  return (
    <section
      aria-label={title}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex max-h-[calc(100dvh-15rem)] min-h-72 min-w-[min(18rem,85vw)] flex-1 snap-start flex-col rounded-lg border bg-muted transition-[opacity,border-color,box-shadow] motion-reduce:transition-none ${outline} ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      <header className={`shrink-0 rounded-t-lg border-b border-border py-2 pr-1.5 pl-3 ${tone.header}`}>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${tone.dot}`} />
          <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title}
          </h2>
          <span className="rounded-md bg-background/80 px-1.5 text-xs leading-5 font-medium text-foreground tabular-nums">
            {count === undefined ? "–" : count.toLocaleString("en-IN")}
            <span className="sr-only"> {countNoun}</span>
          </span>
          {add && (
            <button type="button" onClick={add.onClick} aria-label={`${add.label} (${title})`} title={add.label} className={headerButton}>
              <PlusIcon className="size-4" />
            </button>
          )}
          {menu && (
            <>
              <button
                type="button"
                popoverTarget={menuId}
                onClick={(event) => placeMenu(event.currentTarget, menuId, 130)}
                aria-label={`More actions for ${title}`}
                title="More actions"
                className={headerButton}
              >
                <MoreIcon className="size-4" />
              </button>
              <div
                id={menuId}
                popover="auto"
                onClick={(event) => event.currentTarget.hidePopover()}
                className="fixed inset-auto m-0 w-56 rounded-md border border-border bg-background p-1 text-foreground shadow-lg"
              >
                {menu}
              </div>
            </>
          )}
        </div>
        <p className="mt-0.5 min-h-4 pl-3.5 text-xs tabular-nums opacity-80">
          {amount}
          {amount !== undefined && <span className="sr-only"> in this stage</span>}
        </p>
      </header>

      <div
        aria-busy={busy}
        className={`scrollbar-none flex-1 space-y-2 overflow-y-auto p-2 transition-opacity motion-reduce:transition-none ${refreshing ? "opacity-60" : ""}`}
      >
        {drop === "over" && (
          <p className="rounded-md border-2 border-dashed border-primary/50 bg-primary-softer px-3 py-3 text-center text-xs font-medium text-primary-strong">
            Move here
          </p>
        )}
        {children}
      </div>
      {footer}
    </section>
  );
}

// A column while its first cards load.
export function BoardSkeleton() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} className="space-y-2 rounded-md border border-border bg-background p-3">
      <span className="block h-3 w-3/5 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
      <span className="block h-3 w-2/5 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
      <span className="block h-3 w-4/5 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
    </div>
  ));
}

// A column with nothing in it, or a note in place of its cards.
export function BoardEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border-strong px-3 py-8 text-center text-xs text-muted-foreground">{children}</p>
  );
}

// ---- A card ----

// Every card's frame. The whole card opens its record (its name is a link stretched over the card); the pin and the
// menu sit above that link.
export const boardCardClass =
  "group relative rounded-md border border-border bg-background p-3 text-sm shadow-xs transition-[opacity,border-color] hover:border-border-strong";

// Who the card's record is assigned to, at the foot of the card.
export function CardAssignee({ name }: { name: string | null }) {
  if (!name) return <span>Unassigned</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-secondary-foreground">
        {initials(name)}
      </span>
      <span className="truncate">
        <span className="sr-only">Assigned to </span>
        {name}
      </span>
    </span>
  );
}
