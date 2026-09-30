"use client";

import { useEffect, useState } from "react";

import { CloseIcon, PinIcon } from "@/components/layout/icons";
import { toApiError } from "@/lib/api";
import { setLeadPinned, statusLabel, type Lead, type LeadStatus } from "./api";

export const primaryButton =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-foreground px-3.5 text-sm font-medium text-background hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
// Callers add the size (size-8 or size-9).
export const iconButton =
  "grid shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";
// Inputs and selects without a size; inputClass adds the usual full-width size.
export const fieldClass =
  "min-w-0 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500";
export const inputClass = `${fieldClass} h-9 w-full`;

// Colour carries meaning only: neutral, information, attention, high priority, success, negative.
const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-400/10 dark:text-zinc-300 dark:ring-zinc-400/20",
  INITIAL_CONTACT: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30",
  HOT: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25",
  SUPERHOT: "bg-orange-600 text-white ring-orange-600 dark:bg-orange-500 dark:ring-orange-500",
  WON: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  LOST: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25",
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

type PinButtonProps = { lead: Lead; onChanged: () => void; onError: (message: string) => void; className?: string };

// Pinning is stored on the lead by the API, so every user sees the same pinned leads at the top of the list.
export function PinButton({ lead, onChanged, onError, className = "size-8" }: PinButtonProps) {
  const [pending, setPending] = useState(false);

  async function toggle() {
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
      disabled={pending}
      aria-pressed={lead.is_pinned}
      aria-label={`Pin ${lead.name}`}
      title={lead.is_pinned ? "Unpin" : "Pin"}
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
          <span className={notice.error ? "text-red-600 dark:text-red-400" : undefined}>{notice.text}</span>
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
