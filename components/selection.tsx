"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";

import { CloseIcon, SpinnerIcon, type IconProps } from "@/components/layout/icons";
import { dialogClass } from "@/components/leads/lead-dialogs";
import { Busy, destructiveButton, iconButton, inputClass, primaryButton, secondaryButton } from "@/components/leads/ui";
import { toApiError } from "@/lib/api";

// ---- Selecting rows ----

// Which rows of a list are selected. Only ids among `visibleIds` (the rows on the current page) count, so a bulk action
// can never reach a row that isn't on screen, and the selection empties whenever `resetKey` (the page's search, filters,
// sort and page) changes. The Leads and Works lists share it.
export function useSelection(visibleIds: number[], resetKey: string) {
  const [state, setState] = useState({ key: resetKey, ids: new Set<number>() });
  // A new key: start afresh (set during render, as React allows for the component's own state).
  if (state.key !== resetKey) setState({ key: resetKey, ids: new Set() });
  const ids = state.key === resetKey ? state.ids : new Set<number>();
  const selected = visibleIds.filter((id) => ids.has(id));
  const allSelected = visibleIds.length > 0 && selected.length === visibleIds.length;

  return {
    selected,
    count: selected.length,
    allSelected,
    someSelected: selected.length > 0 && !allSelected,
    isSelected: (id: number) => ids.has(id),
    toggle: (id: number) =>
      setState((current) => {
        const next = new Set(current.key === resetKey ? current.ids : []);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { key: resetKey, ids: next };
      }),
    // Select all means every row on this page; with every row selected, it clears them.
    toggleAll: () => setState({ key: resetKey, ids: new Set(allSelected ? [] : visibleIds) }),
    clear: () => setState({ key: resetKey, ids: new Set() }),
  };
}

export type Selection = ReturnType<typeof useSelection>;

const checkboxClass = "size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:size-5";
// The box sits in a larger click target, so it is easy to hit with a mouse and at least 44px on touch screens.
const targetClass = "-m-2 grid size-9 cursor-pointer place-items-center rounded-md hover:bg-muted pointer-coarse:size-11";

type CheckboxProps = { checked: boolean; onChange: () => void; label: string; disabled?: boolean };

export function RowCheckbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label className={targetClass}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} className={checkboxClass} />
    </label>
  );
}

// The header's checkbox: checked with every row selected, indeterminate with some, clear with none.
export function SelectAllCheckbox({ checked, indeterminate, onChange, label, disabled }: CheckboxProps & { indeterminate: boolean }) {
  return (
    <label className={targetClass}>
      <input
        type="checkbox"
        ref={(box) => {
          if (box) box.indeterminate = indeterminate;
        }}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        className={checkboxClass}
      />
    </label>
  );
}

// What screen readers hear as rows are selected and cleared. Always mounted (a live region announces changes to text
// that is already on the page), so render it whether or not anything is selected.
export function SelectionAnnouncement({ count }: { count: number }) {
  return (
    <p aria-live="polite" className="sr-only">
      {count > 0 ? `${count.toLocaleString("en-IN")} selected` : "No rows selected"}
    </p>
  );
}

type BulkActionBarProps = {
  count: number;
  onClear: () => void;
  /** A bulk action is running: the actions wait and the bar shows it. */
  busy?: boolean;
  /** The list's <BulkAction>s. Leave out an action the user has no permission for. */
  children: ReactNode;
};

// The one bulk action bar, for every list with row selection. Render it only while rows are selected, as the list
// shell's `bulkBar`: it sits at the bottom of the list, above the pagination, and rides the bottom of the window while
// a long list scrolls. Sticky, not fixed: it belongs to the list's own column, so it never covers the sidebar or leaves
// the content area, on a phone or a wide screen. On narrow screens the actions show their icons only (with their names
// as tooltips and for screen readers), so the bar always fits.
export function BulkActionBar({ count, onClear, busy = false, children }: BulkActionBarProps) {
  const divider = <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />;
  return (
    <div className="pointer-events-none sticky bottom-3 z-5 mt-3 flex justify-center">
      <section
        aria-label="Bulk actions"
        aria-busy={busy}
        className="pointer-events-auto flex max-w-full items-center gap-1 rounded-xl border border-border-strong bg-background p-1.5 shadow-lg"
      >
        <p className="flex items-center gap-2 pr-1.5 pl-1 text-sm font-medium whitespace-nowrap">
          <span className="grid h-6 min-w-6 place-items-center rounded-md bg-primary px-1.5 text-xs font-semibold text-white tabular-nums">
            {busy ? <SpinnerIcon className="size-3.5" /> : count.toLocaleString("en-IN")}
          </span>{" "}
          <span>{busy ? "Working…" : "selected"}</span>
        </p>
        {divider}
        <fieldset disabled={busy} className="flex min-w-0 items-center gap-0.5">
          {children}
        </fieldset>
        {divider}
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label="Clear selection"
          title="Clear selection"
          className={`${iconButton} size-9`}
        >
          <CloseIcon className="size-4" />
        </button>
      </section>
    </div>
  );
}

type BulkActionProps = {
  icon: ComponentType<IconProps>;
  label: string;
  onClick: () => void;
  /** It can't apply to what is selected; `title` then says why. */
  disabled?: boolean;
  title?: string;
  /** A destructive action, in the error colour. Confirm it in a dialog before running it. */
  danger?: boolean;
};

// One action of the bar: its icon and name. The name is the tooltip too, and all a narrow screen shows.
export function BulkAction({ icon: Icon, label, onClick, disabled, title, danger }: BulkActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
        danger ? "text-error" : "text-label"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

// ---- Bulk results ----

// What the bulk endpoints answer: the ids that went through and, for each that didn't, its name and the reason.
export type BulkResult = { succeeded: number[]; failed: { id: number; name: string | null; reason: string }[] };

// A notice for a bulk result: "3 leads deleted successfully.", or what went through and, row by row, what didn't and
// why. A notice with failures stays until dismissed, so the list can be read. `past` is the verb phrase, such as
// "deleted" or "converted to Work".
export function describeBulkResult(result: BulkResult, noun: string, past: string) {
  const plural = (count: number) => `${count.toLocaleString("en-IN")} ${count === 1 ? noun : `${noun}s`}`;
  const done = result.succeeded.length;
  const failed = result.failed.length;
  if (failed === 0) return { text: `${plural(done)} ${past} successfully.` };
  // The reasons are sentences of their own; their full stop goes, the row's name leads.
  const rows = result.failed.map((row) => `• ${row.name ?? `#${row.id}`}: ${row.reason.replace(/\.$/, "")}`).join("\n");
  if (done === 0) return { text: `No ${noun}s were ${past}.\n${rows}`, error: true, persist: true };
  return { text: `${plural(done)} ${past}. ${plural(failed)} couldn't be ${past}:\n${rows}`, persist: true };
}

// ---- Dialogs ----

type ActionDialogProps = {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  // Runs the action; the dialog closes when it resolves and shows the error when it rejects.
  onConfirm: () => Promise<void>;
  onClose: () => void;
  // The action failed after the dialog had been closed (a browser lets a second Escape through while it runs).
  onError: (message: string) => void;
  children?: ReactNode;
};

// A confirmation with one action, in the CRM's dialog style: the action runs with a busy state, can't be dismissed
// meanwhile, and its error shows in place.
export function ActionDialog({ title, description, confirmLabel, pendingLabel, destructive, disabled, onConfirm, onClose, onError, children }: ActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = () => {
    if (!pending) dialogRef.current?.close();
  };

  async function confirm() {
    if (pending || disabled) return;
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
      dialogRef.current?.close();
    } catch (err) {
      const message = toApiError(err).message;
      // Closed while it ran: the page reports the failure instead.
      if (!dialogRef.current?.open) {
        onError(message);
        return;
      }
      setError(message);
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault(); // Escape
      }}
      aria-labelledby={titleId}
      className={`${dialogClass} max-w-md p-5`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button type="button" onClick={close} aria-label="Close" aria-disabled={pending || undefined} className={`${iconButton} -mt-1 -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">{description}</div>
        {children}
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} aria-disabled={pending || undefined} className={`${secondaryButton} aria-disabled:opacity-50`}>
            Cancel
          </button>
          {/* aria-disabled, not disabled, while running: a disabled button would drop the keyboard focus. */}
          <button
            type="submit"
            disabled={disabled}
            aria-disabled={pending || undefined}
            className={`${destructive ? destructiveButton : primaryButton} aria-disabled:opacity-50`}
          >
            {pending ? <Busy>{pendingLabel}</Busy> : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type ChoiceDialogProps = Omit<ActionDialogProps, "onConfirm" | "children" | "disabled"> & {
  label: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  onConfirm: (value: string) => Promise<void>;
};

// A confirmation that first asks for a choice, such as the status or stage to move the selected rows to. Nothing is
// chosen to begin with, so confirming without choosing can't move every row somewhere unintended.
export function ChoiceDialog({ label, placeholder, options, onConfirm, ...props }: ChoiceDialogProps) {
  const [value, setValue] = useState("");
  const selectId = useId();
  return (
    <ActionDialog {...props} disabled={value === ""} onConfirm={() => onConfirm(value)}>
      <label htmlFor={selectId} className="mt-4 mb-1.5 block text-sm font-medium text-label">
        {label}
      </label>
      <select id={selectId} value={value} onChange={(event) => setValue(event.target.value)} className={inputClass}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </ActionDialog>
  );
}
