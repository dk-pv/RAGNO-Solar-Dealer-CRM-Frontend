"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode, type RefObject } from "react";

import { CloseIcon, PinIcon, SpinnerIcon } from "@/components/layout/icons";
import { toApiError } from "@/lib/api";
import { FOLLOW_UP_STATUSES, setLeadPinned, statusLabel, type FollowUpStatus, type Lead, type LeadStatus } from "./api";

// A button's label while its action runs: a spinner, then the text ("Saving…"). The button disables itself.
export function Busy({ children }: { children: ReactNode }) {
  return (
    <>
      <SpinnerIcon className="size-4" />
      {children}
    </>
  );
}

// The page-level loader, shown while a page's required data loads so no page appears empty or half-rendered.
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
      <SpinnerIcon className="size-4" />
      {label}
    </div>
  );
}

// The CRM's controls: compact (36px) for a mouse. On touch screens (pointer-coarse) each one is at least 44px tall, and
// fields use 16px text so phones don't zoom in when one is focused.
const touchTarget = "pointer-coarse:min-h-11";
const buttonBase = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${touchTarget}`;
const outlineBase = `${buttonBase} h-9 border border-input bg-background px-3 hover:border-border-strong hover:bg-muted`;
// Low-emphasis actions in table rows, such as Edit.
const ghostBase = `${buttonBase} h-8 px-2 hover:bg-muted`;
export const primaryButton = `${buttonBase} h-9 bg-primary px-3.5 text-white hover:bg-primary-hover active:bg-primary-active`;
export const secondaryButton = `${outlineBase} text-label`;
export const destructiveButton = `${buttonBase} h-9 bg-destructive px-3.5 text-white hover:bg-destructive-hover`;
export const ghostButton = `${ghostBase} text-label`;
// A delete that sits among other secondary or ghost actions: the same shape, in the error colour.
export const secondaryDangerButton = `${outlineBase} text-error`;
export const ghostDangerButton = `${ghostBase} text-error`;
// Callers add the size (size-8 or size-9).
export const iconButton = `grid shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-muted hover:text-label disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${touchTarget} pointer-coarse:min-w-11`;
// Inputs and selects without a size; inputClass adds the usual full-width size.
export const fieldClass = `min-w-0 rounded-md border border-input bg-field px-3 text-sm text-foreground placeholder:text-placeholder enabled:hover:border-input-hover focus:border-primary focus:ring-3 focus:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-disabled-surface disabled:text-disabled aria-[invalid=true]:border-error ${touchTarget} pointer-coarse:text-base`;
export const inputClass = `${fieldClass} h-9 w-full`;

// A group of toggle buttons or view links; the pressed or current one is filled.
export const segmentedClass = "flex rounded-md border border-input bg-background p-0.5";
export const segmentClass =
  "rounded px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground pointer-coarse:py-2.5";

// A page's sub-navigation (Reports, Settings): the current tab is underlined in the brand colour. The list scrolls
// sideways on narrow screens rather than wrapping.
export const tabListClass = "scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1";
export const tabClass =
  "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground pointer-coarse:py-3";

// ---- Pages that list records ----
// The app shell's <main> is a flex column. A page that lists records fills it, and every wrapper between the page's root
// and the list (`fillClass`) grows with it, so the footer under the list (pagination) sits at the bottom of the page
// whether it follows one row or a full page of them. The data area (the table's box, or the box for an empty or error
// state: `tableAreaClass`, `emptyAreaClass`, `messageAreaClass`) grows as well, so it keeps its size as a page goes
// from loading to data, to nothing found, to an error. The pipeline boards fill it the same way (see Board in
// components/pipeline.tsx). Other pages keep the height of their content.
export const fillClass = "flex flex-1 flex-col";
// The table's scroll box. `tableBoxClass` is the same box without growing, for a page with something else to fill the room.
// A table wider than its box scrolls inside it: a mouse gets a thin scrollbar that shows there is more, a touch screen
// swipes without one. The box is a size container, so a cell's width cap in cqw follows the room the table really has,
// with the sidebar open or not (see stickyNameClass below).
export const tableBoxClass =
  "@container overflow-x-auto rounded-lg border border-border bg-background [scrollbar-color:var(--faint)_transparent] [scrollbar-width:thin] pointer-coarse:scrollbar-none";
export const tableAreaClass = `${tableBoxClass} grow`;
// The box that holds a list's error state, and its empty state.
export const messageAreaClass = "flex grow flex-col justify-center rounded-lg border border-border bg-background";
export const emptyAreaClass =
  "flex grow flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-background px-4 py-12 text-center";
// The footer under a list. `mt-auto` keeps it at the bottom even when nothing above it grows; callers add the alignment.
export const paginationFooterClass = "mt-auto flex min-h-8 flex-wrap items-center gap-3 pt-3 text-sm pointer-coarse:min-h-11";

// Text cut short in a table cell (truncate, line-clamp) has a cap, so a long value can't widen the table past its box.
// The cap is the laptop width it always had (max-w-52 = 13rem, and so on) and grows with the table's box once that is
// wider than about 1500px: max-w-[max(13rem,14cqw)] is 13rem up to there and about 480px in a 4K window (cqw is a
// percentage of tableBoxClass, the box).
// The name in a table's sticky first column is also kept to 40% of the box on a phone, so the columns beside it keep
// room to scroll.
export const stickyNameClass = "max-w-[max(min(13rem,40cqw),14cqw)]";

type PageHeaderProps = {
  title: string;
  /** The line under the title: a count, or what the page is for. Its place is kept while a count loads. */
  description?: string;
  /** To move the keyboard focus to the title when what had it leaves the page. */
  titleRef?: RefObject<HTMLHeadingElement | null>;
  /** On the right: the page's view switch and its main action. */
  children?: ReactNode;
};

// The heading of a list or board page, the same on every one: Leads, Works, both pipelines and both Activities pages.
export function PageHeader({ title, description = " ", titleRef, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="text-xl font-semibold">
          {title}
        </h1>
        {/* min-h-5: the line is reserved while the count loads, so the title doesn't move when it arrives. */}
        <p className="mt-0.5 min-h-5 text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// Switches between a module's List and Pipeline views. `query` carries the search and filters both views share.
export function ViewSwitch({ label, views, query = "" }: { label: string; views: { label: string; href: string }[]; query?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={segmentedClass}>
      {views.map((view) => (
        <Link
          key={view.href}
          href={query ? `${view.href}?${query}` : view.href}
          aria-current={pathname === view.href ? "page" : undefined}
          className={segmentClass}
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}

// Colour carries meaning only: neutral, information, attention, high priority, success, negative. The leads list's
// inline status control wears the same colours as the badge.
export const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-neutral-soft text-neutral ring-neutral-border",
  INITIAL_CONTACT: "bg-info-soft text-info ring-info-border",
  HOT: "bg-warning-soft text-warning ring-warning-border",
  // High priority: the one solid badge, so it stands out in a list.
  SUPERHOT: "bg-warning text-white ring-warning",
  WON: "bg-success-soft text-success ring-success-border",
  LOST: "bg-error-soft text-error ring-error-border",
};

// Each status's dot, for the Lead Pipeline's column headers (as the Work stages have theirs).
export const STATUS_DOTS: Record<LeadStatus, string> = {
  NEW: "bg-neutral",
  INITIAL_CONTACT: "bg-info",
  HOT: "bg-warning",
  SUPERHOT: "bg-white",
  WON: "bg-success",
  LOST: "bg-error",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

const FOLLOW_UP_STYLES: Record<FollowUpStatus, string> = {
  PENDING: "bg-warning-soft text-warning ring-warning-border",
  COMPLETED: "bg-success-soft text-success ring-success-border",
};

export function FollowUpBadge({ status }: { status: FollowUpStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${FOLLOW_UP_STYLES[status]}`}
    >
      {FOLLOW_UP_STATUSES.find((item) => item.value === status)?.label ?? status}
    </span>
  );
}

type PinButtonProps = { lead: Lead; onChanged: () => void; onError: (message: string) => void; className?: string };

// Pinning is stored on the lead by the API, so every user sees the same pinned leads at the top of the list.
export function PinButton({ lead, onChanged, onError, className = "size-8" }: PinButtonProps) {
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      await setLeadPinned(lead.id, !lead.is_pinned);
      onChanged();
    } catch (error) {
      onError(toApiError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // aria-disabled, not disabled, while saving: a disabled button would drop the keyboard focus.
      disabled={!lead.can_edit}
      aria-disabled={pending || undefined}
      aria-pressed={lead.is_pinned}
      aria-label={`Pin ${lead.name}`}
      title={lead.can_edit ? (lead.is_pinned ? "Unpin" : "Pin") : "You can't change this lead"}
      className={`${iconButton} ${className}`}
    >
      <PinIcon className={`size-4 ${lead.is_pinned ? "text-brand" : ""}`} fill={lead.is_pinned ? "currentColor" : "none"} />
    </button>
  );
}

// `persist`: the notice stays until dismissed (a list of rows that need reading, say) instead of going away by itself.
type Notice = { text: string; error?: boolean; persist?: boolean };

// A short confirmation or error in the corner of the page. Returns the element to render and a function to show a notice.
export function useNotice() {
  const [notice, setNotice] = useState<Notice>();

  useEffect(() => {
    if (!notice || notice.persist) return;
    const timer = setTimeout(() => setNotice(undefined), notice.error ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const element = (
    <div aria-live="polite" className="fixed right-4 bottom-4 z-40 max-w-[calc(100vw-2rem)] sm:max-w-sm">
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className="flex max-h-[60vh] items-start gap-3 overflow-y-auto rounded-md border border-border bg-background px-4 py-3 text-sm whitespace-pre-line shadow-lg"
        >
          <span className={notice.error ? "text-error" : undefined}>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(undefined)}
            aria-label="Dismiss"
            className="-m-1 ml-auto p-1 text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="size-4" />
          </button>
        </p>
      )}
    </div>
  );

  return [element, setNotice] as const;
}

type ErrorStateProps = { title: string; message: string; onRetry?: () => void; retryLabel?: string };

export function ErrorState({ title, message, onRetry, retryLabel = "Try again" }: ErrorStateProps) {
  return (
    <div role="alert" className="px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${secondaryButton} mt-4`}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
