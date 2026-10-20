"use client";

import { useId, useState } from "react";

import { CloseIcon } from "@/components/layout/icons";
import { initials } from "@/components/layout/navbar";
import type { Assignee } from "@/components/leads/api";

// The order the CRM lists people in, as the API does: by name.
const byName = (a: Assignee, b: Assignee) => a.name.localeCompare(b.name) || a.id - b.id;

type AssigneePickerProps = {
  /** The search box's id, for the field's label. */
  id: string;
  /** The search box's name, so a form can move the focus to it when the field has an error. */
  name: string;
  value: Assignee[];
  onChange: (value: Assignee[]) => void;
  /** Who can be chosen (the active users the API lists); undefined while they load. */
  options?: Assignee[];
  /** Why the options couldn't be loaded. */
  optionsError?: string;
  /** Shows who is chosen, without a way to change it (staff, for a lead). */
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

// Chooses any number of people: the chosen ones as chips, each with its own remove button, and a search box that lists
// who else can be chosen. A combobox: type to narrow the list, arrow keys to move, Enter to add, Escape to close the
// list, Backspace in the empty box to remove the last chip. Someone already chosen who can't be chosen now (deactivated)
// stays until removed. The lead form, both follow-up forms and the Work activity form use it.
export function AssigneePicker({ id, name, value, onChange, options, optionsError, disabled, invalid, describedBy }: AssigneePickerProps) {
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const chosen = new Set(value.map((person) => person.id));
  const term = text.trim().toLocaleLowerCase();
  const matches = (options ?? []).filter((person) => !chosen.has(person.id) && person.name.toLocaleLowerCase().includes(term));
  const showList = open && !disabled && matches.length > 0;
  const current = Math.min(active, matches.length - 1);

  function add(person: Assignee) {
    onChange([...value, person].sort(byName));
    setText("");
    setActive(0);
    setAnnouncement(`${person.name} added.`);
  }

  function remove(person: Assignee) {
    onChange(value.filter((other) => other.id !== person.id));
    setAnnouncement(`${person.name} removed.`);
  }

  const placeholder = optionsError
    ? "Staff couldn't be loaded"
    : !options
      ? "Loading staff…"
      : value.length > 0
        ? "Add someone else"
        : "Search staff to assign";

  return (
    <div className="relative">
      <div
        aria-invalid={invalid || undefined}
        aria-disabled={disabled || undefined}
        className="flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1 rounded-md border border-input bg-field px-1.5 py-1 text-sm text-foreground hover:border-input-hover focus-within:border-primary focus-within:ring-3 focus-within:ring-ring aria-disabled:bg-disabled-surface aria-disabled:hover:border-input aria-[invalid=true]:border-error touch:min-h-11"
      >
        {value.length > 0 && (
          <ul aria-label="Assigned" className="contents">
            {value.map((person) => (
              <li
                key={person.id}
                className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs font-medium"
              >
                <span className="truncate">{person.name}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(person)}
                    aria-label={`Remove ${person.name}`}
                    className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-subtle hover:text-foreground touch:min-h-11 touch:min-w-11"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {disabled ? (
          value.length === 0 && <span className="px-1.5 py-1 text-muted-foreground">Unassigned</span>
        ) : (
          <input
            id={id}
            name={name}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={showList ? listId : undefined}
            aria-activedescendant={showList ? `${listId}-${current}` : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Adds the highlighted person; never submits the form from the search box.
                event.preventDefault();
                if (showList) add(matches[current]);
              } else if (event.key === "Escape" && showList) {
                // Closes the list, not the dialog.
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "Backspace" && text === "" && value.length > 0) {
                remove(value[value.length - 1]);
              } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length > 0) {
                event.preventDefault();
                setOpen(true);
                const next = (current + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
                setActive(next);
                document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            // The box around the chips shows the focus (its border and ring), as a field's own border does.
            className="h-7 min-w-32 flex-1 bg-transparent px-1.5 text-sm placeholder:text-placeholder focus-visible:outline-none touch:h-9 touch:text-base"
          />
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Staff"
          aria-multiselectable="true"
          // Keeps the focus in the search box, so choosing (or dragging the list's scrollbar) doesn't close the list.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg"
        >
          {matches.map((person, index) => (
            <li
              key={person.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              onClick={() => add(person)}
              className={`flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-sm touch:py-3 ${index === current ? "bg-muted" : "hover:bg-muted"}`}
            >
              <Initials name={person.name} />
              <span className="min-w-0 truncate">{person.name}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !disabled && options && term !== "" && matches.length === 0 && (
        <p role="status" className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg">
          No one else matches.
        </p>
      )}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

function Initials({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-[0.625rem] font-semibold ring-1 ring-border touch:text-xs"
    >
      {initials(name)}
    </span>
  );
}

// The people a record is assigned to, in a table cell or a details list: one per line with their initials, the first
// three and then "+N more" (every name is in the title), or `empty` for no one. Each name has the cap other table text
// has, so one long name can't widen the table.
export function AssigneeNames({ people, empty = "Unassigned" }: { people: Assignee[]; empty?: string }) {
  if (people.length === 0) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul title={people.map((person) => person.name).join(", ")} className="space-y-1">
      {people.slice(0, 3).map((person) => (
        <li key={person.id} className="flex items-center gap-2">
          <Initials name={person.name} />
          <span className="max-w-[max(12rem,13cqw)] truncate">{person.name}</span>
        </li>
      ))}
      {people.length > 3 && <li className="pl-8 text-xs text-muted-foreground">+{people.length - 3} more</li>}
    </ul>
  );
}
