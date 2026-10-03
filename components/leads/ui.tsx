"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

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

// Colour carries meaning only: neutral, information, attention, high priority, success, negative.
const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-neutral-soft text-neutral ring-neutral-border",
  INITIAL_CONTACT: "bg-info-soft text-info ring-info-border",
  HOT: "bg-warning-soft text-warning ring-warning-border",
  // High priority: the one solid badge, so it stands out in a list.
  SUPERHOT: "bg-warning text-white ring-warning",
  WON: "bg-success-soft text-success ring-success-border",
  LOST: "bg-error-soft text-error ring-error-border",
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

type Notice = { text: string; error?: boolean };

// A short confirmation or error in the corner of the page. Returns the element to render and a function to show a notice.
export function useNotice() {
  const [notice, setNotice] = useState<Notice>();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), notice.error ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const element = (
    <div aria-live="polite" className="fixed right-4 bottom-4 z-40 max-w-[calc(100vw-2rem)] sm:max-w-sm">
      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm shadow-lg"
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
