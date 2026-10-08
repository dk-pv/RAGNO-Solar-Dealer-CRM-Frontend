"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { toApiError, useApi } from "@/lib/api";
import { addActivity, formatPhone, updateActivity, type Activity, type Assignee, type Lead, type Page } from "./api";
import {
  FOLLOW_UP_FIELDS,
  Field,
  FollowUpFields,
  FormDialog,
  StartsPending,
  emptyFollowUp,
  followUpDraft,
  toFollowUpInput,
  validateFollowUp,
  type FollowUpDraft,
  type FollowUpErrors,
} from "./lead-dialogs";
import { inputClass } from "./ui";

type LeadChoice = Pick<Lead, "id" | "name" | "assigned_to">;

type LeadPickerProps = {
  id: string;
  value?: Pick<Lead, "id" | "name">;
  onChange: (lead?: Lead) => void;
  error?: string;
  /** Which of the leads found can be chosen (all of them unless given), and what to say when none can. */
  selectable?: (lead: Lead) => boolean;
  noneText?: string;
};

// Finds a lead by name, phone or ID through the leads search (a few matches at a time, never the whole list), among the
// leads this user works with: the API lists no others. A combobox: type to search, arrow keys to move, Enter to choose,
// Escape to close the list. The follow-up form and the WhatsApp message both choose their lead with it.
export function LeadPicker({ id, value, onChange, error: fieldError, selectable, noneText = "No leads match." }: LeadPickerProps) {
  const listId = useId();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [refocus, setRefocus] = useState(false); // after Change, the search box takes the focus back
  const { data, error, loading, reload } = useApi<Page<Lead>>(
    term ? `/leads/?search=${encodeURIComponent(term)}&page_size=8` : null,
  );
  // Results for an older term (typed ahead of the pause, still on their way, or kept after a failed search) are never
  // offered.
  const stale = text.trim() !== term || loading || error !== undefined;
  const options = stale ? [] : (data?.results ?? []).filter((lead) => selectable?.(lead) ?? true);
  const searching = open && text.trim() !== "";
  const showList = searching && options.length > 0;

  // Search once the user pauses typing.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  function choose(lead: Lead) {
    onChange(lead);
    setText("");
    setTerm("");
    setOpen(false);
  }

  if (value) {
    return (
      <p className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-medium">{value.name}</span>
          <span className="text-muted-foreground"> #{value.id}</span>
        </span>
        {/* It replaces the search box, so it takes the focus: the user's place isn't lost. */}
        <button
          type="button"
          autoFocus
          aria-label={`Change lead (${value.name} #${value.id})`}
          onClick={() => {
            setRefocus(true);
            onChange(undefined);
          }}
          className="font-medium underline-offset-2 hover:underline pointer-coarse:py-2"
        >
          Change
        </button>
      </p>
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        name="lead"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        autoFocus={refocus}
        aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
        aria-required="true"
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? `${id}-error` : undefined}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && searching) {
            // Chooses the active lead, or retries a failed search; never submits the form from the search box.
            event.preventDefault();
            if (options[active]) choose(options[active]);
            else if (error && text.trim() === term) reload();
          } else if (event.key === "Escape" && searching) {
            // Closes the list, not the dialog.
            event.preventDefault();
            setOpen(false);
          } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && showList) {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            const next = (active + step + options.length) % options.length;
            setActive(next);
            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
          }
        }}
        placeholder="Search by name, phone or ID"
        autoComplete="off"
        className={inputClass}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Leads"
          // Keeps the focus in the input, so choosing (or dragging the list's scrollbar) doesn't close the list first.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg"
        >
          {options.map((lead, index) => (
            <li
              key={lead.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onClick={() => choose(lead)}
              className={`cursor-pointer rounded px-2.5 py-2 text-sm ${index === active ? "bg-muted" : "hover:bg-muted"}`}
            >
              <span className="font-medium">{lead.name}</span>
              <span className="text-muted-foreground">
                {" "}
                #{lead.id} · {formatPhone(lead)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {searching && !showList && (
        <p
          role="status"
          className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground shadow-lg"
        >
          {error && text.trim() === term ? "Couldn't search leads. Press Enter to try again." : stale ? "Searching…" : noneText}
        </p>
      )}
    </div>
  );
}

type FollowUpDialogProps = {
  activity?: Activity; // editing this follow-up
  lead?: LeadChoice; // adding one to this lead (Lead Detail); without it, the lead is searched for here
  onClose: () => void;
  // `stillOpen`: the dialog was open when the save finished (not dismissed while it was saving).
  onSaved: (activity: Activity, stillOpen: boolean) => void;
  onError: (message: string) => void; // a save that failed after the dialog was closed
};

// Add Follow-up (for a lead chosen here or given by the page) and Edit Follow-up. A new one starts Pending: the API
// sets it. The API checks the lead, the assigned staff and the user's permissions again.
export function FollowUpDialog({ activity, lead: fixedLead, onClose, onSaved, onError }: FollowUpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const assignees = useApi<Assignee[]>("/leads/assignees/");
  const [lead, setLead] = useState<LeadChoice | undefined>(fixedLead);
  const [values, setValues] = useState<FollowUpDraft>(() => (activity ? followUpDraft(activity) : emptyFollowUp()));
  const [errors, setErrors] = useState<FollowUpErrors & { lead?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  const options = assignees.data ?? [];
  // A new one starts with the lead's staff, when they can be chosen (an admin can't pick a deactivated user); staff can
  // assign a follow-up only to themselves, so their one choice is made for them.
  const leadStaff = options.some((person) => person.id === lead?.assigned_to) ? String(lead?.assigned_to) : "";
  const draft = {
    ...values,
    assigned_to: values.assigned_to || leadStaff || (options.length === 1 ? String(options[0].id) : ""),
  };
  // Whoever it's assigned to stays a choice when editing, even if this user couldn't pick them.
  const keepAssignee =
    activity?.assigned_to ? { id: activity.assigned_to, name: activity.assigned_to_name ?? `User #${activity.assigned_to}` } : undefined;

  function chooseLead(choice?: LeadChoice) {
    setLead(choice);
    setErrors((current) => ({ ...current, lead: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const found: FollowUpErrors & { lead?: string } = validateFollowUp(draft);
    if (!activity && !lead) found.lead = "Choose the lead this follow-up is for.";
    setErrors(found);
    setFormError(undefined);
    const firstInvalid = found.lead ? "lead" : FOLLOW_UP_FIELDS.find((field) => found[field]);
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid === "lead" ? "lead" : `follow_up_${firstInvalid}`) as HTMLElement | null)?.focus();
      return;
    }

    setPending(true);
    try {
      const input = toFollowUpInput(draft);
      const saved = activity ? await updateActivity(activity.id, input) : await addActivity(lead!.id, input);
      // Closed first: closing hands the focus back to where it was, and the page may then move it.
      const stillOpen = Boolean(dialogRef.current?.open);
      dialogRef.current?.close();
      onSaved(saved, stillOpen);
    } catch (error) {
      const apiError = toApiError(error);
      // Closed while saving (a browser lets a second Escape through): the page says it failed instead.
      if (!dialogRef.current?.open) {
        onError(`The follow-up wasn't saved: ${[apiError.message, ...Object.values(apiError.fields)].join(" ")}`);
        return;
      }
      const fieldErrors: FollowUpErrors & { lead?: string } = {};
      const others: string[] = [];
      for (const [field, text] of Object.entries(apiError.fields)) {
        if (field === "lead" || FOLLOW_UP_FIELDS.includes(field as keyof FollowUpDraft))
          fieldErrors[field as keyof typeof fieldErrors] = text;
        // Messages for fields this form doesn't show are added to the summary, so none are lost.
        else others.push(text);
      }
      setErrors(fieldErrors);
      setFormError([apiError.message, ...others].join(" "));
      setPending(false);
    }
  }

  return (
    <FormDialog
      ref={dialogRef}
      title={activity ? "Edit follow-up" : "Add follow-up"}
      busy={pending}
      error={formError}
      submitLabel={activity ? "Save changes" : "Create follow-up"}
      busyLabel="Saving…"
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Lead" id={`${formId}-lead`} required={!activity && !fixedLead} error={errors.lead} wide>
          {activity || fixedLead ? (
            <p id={`${formId}-lead`} className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              <span className="font-medium">{activity?.lead_name ?? fixedLead?.name}</span>
              <span className="text-muted-foreground"> #{activity?.lead ?? fixedLead?.id}</span>
            </p>
          ) : (
            <LeadPicker
              id={`${formId}-lead`}
              value={lead}
              onChange={chooseLead}
              error={errors.lead}
              selectable={(found) => found.can_edit}
              noneText="No leads you can work on match."
            />
          )}
        </Field>
        <FollowUpFields
          idPrefix={`${formId}-follow-up`}
          values={draft}
          errors={errors}
          onChange={(field, value) => {
            setValues((current) => ({ ...current, [field]: value }));
            setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
          }}
          assignees={assignees.data}
          assigneesError={assignees.error?.message}
          keepAssignee={keepAssignee}
        />
        {!activity && <StartsPending />}
      </div>
    </FormDialog>
  );
}
