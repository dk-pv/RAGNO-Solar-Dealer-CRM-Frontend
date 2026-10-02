"use client";

import { useContext, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { CloseIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { toApiError, useApi } from "@/lib/api";
import {
  ACTIVITY_TYPES,
  COUNTRY_CODES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  changeLeadStatus,
  convertLead,
  formatMoney,
  saveLead,
  type Activity,
  type ActivityInput,
  type ActivityType,
  type Assignee,
  type Lead,
  type LeadInput,
  type LeadSource,
  type LeadStatus,
  type Plan,
} from "./api";
import { FollowUpBadge, StatusBadge, fieldClass, iconButton, inputClass, primaryButton, secondaryButton } from "./ui";

// Callers add the padding and width.
export const dialogClass =
  "m-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-background text-foreground shadow-lg backdrop:bg-foreground/30";

type FormValues = {
  name: string;
  country_code: string;
  phone: string;
  email: string;
  state: string;
  district: string;
  area: string;
  pin_code: string;
  plan: string;
  amount: string;
  source: string;
  assigned_to: string;
  next_follow_up: string;
  notes: string;
};
type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

// Form order, used to focus the first field with an error.
const FIELD_ORDER: FieldName[] = [
  "name",
  "country_code",
  "phone",
  "email",
  "state",
  "district",
  "area",
  "pin_code",
  "plan",
  "amount",
  "source",
  "assigned_to",
  "next_follow_up",
  "notes",
];

const plainAmount = (value: string | null) => (value === null || value === "" ? "" : String(Number(value)));
const sameAmount = (typed: string, price: string) => typed !== "" && Number(typed) === Number(price);
// Spaces, brackets, hyphens and the trunk-prefix 0 are dropped: "098765 43210" -> "9876543210".
const nationalNumber = (value: string) => value.replace(/[\s()-]/g, "").replace(/^0+/, "");

function initialValues(lead: Lead | null): FormValues {
  return {
    name: lead?.name ?? "",
    country_code: lead?.country_code || "91",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    state: lead?.state ?? "",
    district: lead?.district ?? "",
    area: lead?.area ?? "",
    pin_code: lead?.pin_code ?? "",
    plan: lead?.plan ? String(lead.plan) : "",
    amount: plainAmount(lead?.amount ?? null),
    source: lead?.source ?? "",
    assigned_to: lead?.assigned_to ? String(lead.assigned_to) : "",
    next_follow_up: lead?.next_follow_up ?? "",
    notes: lead?.notes ?? "",
  };
}

// Quick checks so people get a helpful message before saving. The API validates everything again and has the final say.
function validate(values: FormValues) {
  const errors: FieldErrors = {};
  const phone = nationalNumber(values.phone);
  if (!values.name.trim()) errors.name = "Enter the customer's name.";
  if (!values.phone.trim()) errors.phone = "Enter the phone number.";
  else if (!/^[\d\s()-]+$/.test(values.phone)) errors.phone = "Use digits only, without the country code.";
  else if (values.country_code === "91" && phone.length !== 10) errors.phone = "Enter the 10-digit phone number.";
  else if (phone.length < 6 || phone.length > 14) errors.phone = "Enter a phone number of 6 to 14 digits.";
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    errors.email = "Enter a valid email address.";
  if (!values.district.trim()) errors.district = "Enter the district.";
  if (values.pin_code.trim() && !/^[1-9]\d{5}$/.test(values.pin_code.trim())) errors.pin_code = "Enter a 6-digit PIN code.";
  if (!values.plan) errors.plan = "Choose a plan.";
  if (!values.amount) errors.amount = "Enter the amount.";
  else if (!/^\d{1,10}(\.\d{1,2})?$/.test(values.amount)) errors.amount = "Enter the amount in rupees, using digits only.";
  return errors;
}

function toInput(values: FormValues): LeadInput {
  return {
    name: values.name.trim(),
    country_code: values.country_code,
    phone: nationalNumber(values.phone),
    email: values.email.trim(),
    state: values.state.trim(),
    district: values.district.trim(),
    area: values.area.trim(),
    pin_code: values.pin_code.trim(),
    plan: values.plan ? Number(values.plan) : null,
    amount: values.amount || null,
    source: values.source as LeadSource | "",
    assigned_to: values.assigned_to ? Number(values.assigned_to) : null,
    next_follow_up: values.next_follow_up || null,
    notes: values.notes.trim(),
  };
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

type FieldProps = { label: string; id: string; error?: string; required?: boolean; hint?: ReactNode; wide?: boolean; children: ReactNode };

export function Field({ label, id, error, required, hint, wide, children }: FieldProps) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-label">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-error">
          {error}
        </p>
      ) : (
        hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

// A follow-up being added or edited, as the form holds it.
export type FollowUpDraft = { title: string; type: ActivityType; assigned_to: string; due_date: string; description: string };
export type FollowUpErrors = Partial<Record<keyof FollowUpDraft, string>>;
export const FOLLOW_UP_FIELDS: (keyof FollowUpDraft)[] = ["title", "type", "assigned_to", "due_date", "description"];

export const emptyFollowUp = (assignedTo = ""): FollowUpDraft => ({
  title: "",
  type: "PHONE_CALL",
  assigned_to: assignedTo,
  due_date: "",
  description: "",
});

export const followUpDraft = (activity: Activity): FollowUpDraft => ({
  title: activity.title,
  type: activity.type,
  assigned_to: activity.assigned_to ? String(activity.assigned_to) : "",
  due_date: activity.due_date ?? "",
  description: activity.description,
});

// Quick checks so people get a helpful message before saving. The API validates everything again.
export function validateFollowUp(draft: FollowUpDraft) {
  const errors: FollowUpErrors = {};
  if (!draft.title.trim()) errors.title = "Enter a heading.";
  if (!draft.assigned_to) errors.assigned_to = "Choose who does the follow-up.";
  if (!draft.due_date) errors.due_date = "Choose the due date.";
  return errors;
}

export const toFollowUpInput = (draft: FollowUpDraft): ActivityInput => ({
  title: draft.title.trim(),
  type: draft.type,
  assigned_to: Number(draft.assigned_to),
  due_date: draft.due_date,
  description: draft.description.trim(),
});

type FollowUpFieldsProps = {
  idPrefix: string;
  values: FollowUpDraft;
  errors: FollowUpErrors;
  onChange: (field: keyof FollowUpDraft, value: string) => void;
  assignees?: Assignee[]; // whom this user may assign: anyone active for an admin, only themselves for staff
  assigneesError?: string;
  keepAssignee?: Assignee; // the current staff member when they aren't one of those (staff editing an admin's choice)
};

// A follow-up's heading, type, assigned staff, due date and notes. Its status isn't here: a new one starts Pending.
export function FollowUpFields({ idPrefix, values, errors, onChange, assignees, assigneesError, keepAssignee }: FollowUpFieldsProps) {
  const id = (field: keyof FollowUpDraft) => `${idPrefix}-${field}`;
  const bind = (field: keyof FollowUpDraft) => ({
    id: id(field),
    name: `follow_up_${field}`,
    value: values[field],
    required: field !== "description",
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      onChange(field, event.target.value),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${id(field)}-error` : undefined,
    className: inputClass,
  });
  const people = [
    ...(assignees ?? []),
    ...(keepAssignee && !assignees?.some((person) => person.id === keepAssignee.id) ? [keepAssignee] : []),
  ];

  return (
    <>
      <Field label="Heading" id={id("title")} required error={errors.title} wide>
        <input {...bind("title")} maxLength={150} autoComplete="off" placeholder="For example: Call about the solar quotation" />
      </Field>
      <Field label="Type" id={id("type")} required error={errors.type}>
        <select {...bind("type")}>
          {ACTIVITY_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Assigned staff"
        id={id("assigned_to")}
        required
        error={errors.assigned_to}
        hint={assigneesError ? `Staff couldn't be loaded: ${assigneesError}` : undefined}
      >
        <select {...bind("assigned_to")}>
          <option value="">{assignees ? "Choose staff" : assigneesError ? "Staff unavailable" : "Loading staff…"}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Due date" id={id("due_date")} required error={errors.due_date}>
        <input {...bind("due_date")} type="date" />
      </Field>
      <Field label="Notes" id={id("description")} error={errors.description} wide>
        <textarea {...bind("description")} rows={3} className={`${fieldClass} w-full py-2`} />
      </Field>
    </>
  );
}

// "Status: Pending", for a follow-up being added: the API starts every new one there.
export function StartsPending() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
      Status <FollowUpBadge status="PENDING" /> New follow-ups start Pending.
    </p>
  );
}

type LeadFormDialogProps = {
  lead: Lead | null;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
  onError: (message: string) => void; // a save that failed after the dialog was closed
};

// Add Lead (lead = null) and Edit Lead share this form.
export function LeadFormDialog({ lead, onClose, onSaved, onError }: LeadFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const plans = useApi<Plan[]>("/plans/");
  const assignees = useApi<Assignee[]>("/leads/assignees/");
  // Only admins assign leads; a lead staff add is assigned to them by the API.
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  const canAssign = lead ? lead.can_assign : isAdmin;
  const [values, setValues] = useState(() => initialValues(lead));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // Add Lead only: the lead's first follow-up, saved with it by the API (both or neither).
  const [addFollowUp, setAddFollowUp] = useState(false);
  const [followUp, setFollowUp] = useState(() => emptyFollowUp());
  const [followUpErrors, setFollowUpErrors] = useState<FollowUpErrors>({});

  useEffect(() => {
    dialogRef.current?.showModal();
    // Start in the first field rather than on the close button.
    dialogRef.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
  }, []);

  // Not while saving: a lead (and its initial follow-up) is being saved.
  const close = () => {
    if (!saving) dialogRef.current?.close();
  };
  const fieldId = (field: FieldName) => `${formId}-${field}`;
  const selectedPlan = plans.data?.find((plan) => String(plan.id) === values.plan);
  // Inactive plans can't be chosen for new leads, but stay visible on a lead that already has one.
  const planOptions = plans.data?.filter((plan) => plan.is_active || String(plan.id) === values.plan) ?? [];
  const assigneeOptions = assignees.data ?? [];
  const keepAssignee =
    lead?.assigned_to && !assigneeOptions.some((person) => person.id === lead.assigned_to)
      ? { id: lead.assigned_to, name: lead.assigned_to_name ?? `User #${lead.assigned_to}` }
      : undefined;

  function bind(field: FieldName) {
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setValues((current) => ({ ...current, [field]: event.target.value }));
        // A corrected field stops showing its old error.
        setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
      },
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${fieldId(field)}-error` : undefined,
      className: inputClass,
    };
  }

  // Choosing a plan fills in its current price, unless the amount was typed by hand: a manual amount is never
  // replaced silently. When the amount differs from the plan price, the hint under the field offers the plan price.
  function changePlan(event: ChangeEvent<HTMLSelectElement>) {
    const next = plans.data?.find((plan) => String(plan.id) === event.target.value);
    const amountFollowsPlan = values.amount === "" || (selectedPlan !== undefined && sameAmount(values.amount, selectedPlan.amount));
    setValues((current) => ({
      ...current,
      plan: event.target.value,
      amount: next && amountFollowsPlan ? plainAmount(next.amount) : current.amount,
    }));
    setErrors((current) => ({ ...current, plan: undefined, amount: next && amountFollowsPlan ? undefined : current.amount }));
  }

  // It goes to the lead's assigned staff until someone is chosen for it; staff can assign a follow-up only to
  // themselves, so their one choice is made for them.
  const followUpValues = {
    ...followUp,
    assigned_to:
      followUp.assigned_to ||
      values.assigned_to ||
      (assigneeOptions.length === 1 ? String(assigneeOptions[0].id) : ""),
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validate(values);
    const foundFollowUp = addFollowUp ? validateFollowUp(followUpValues) : {};
    setErrors(found);
    setFollowUpErrors(foundFollowUp);
    setFormError(undefined);
    const firstInvalid =
      FIELD_ORDER.find((field) => found[field]) ??
      FOLLOW_UP_FIELDS.filter((field) => foundFollowUp[field]).map((field) => `follow_up_${field}`)[0];
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid) as HTMLElement | null)?.focus();
      return;
    }

    setSaving(true);
    try {
      const input = toInput(values);
      if (!lead && addFollowUp) input.initial_follow_up = toFollowUpInput(followUpValues);
      onSaved(await saveLead(input, lead?.id));
      dialogRef.current?.close();
    } catch (error) {
      const apiError = toApiError(error);
      // Closed while saving (a browser lets a second Escape through): the page says it failed instead.
      if (!dialogRef.current?.open) {
        onError(`${lead ? "The changes weren't" : "The lead wasn't"} saved: ${[apiError.message, ...Object.values(apiError.fields)].join(" ")}`);
        return;
      }
      // The follow-up's messages come back as "initial_follow_up.<field>".
      const leadFields: FieldErrors = {};
      const followUpFields: FollowUpErrors = {};
      const others: string[] = [];
      for (const [field, text] of Object.entries(apiError.fields)) {
        const followUpField = field.replace(/^initial_follow_up\./, "") as keyof FollowUpDraft;
        if (field in values) leadFields[field as FieldName] = text;
        else if (field.startsWith("initial_follow_up.") && FOLLOW_UP_FIELDS.includes(followUpField))
          followUpFields[followUpField] = text;
        // Messages for fields this form doesn't show are added to the summary, so none are lost.
        else others.push(text);
      }
      setErrors(leadFields);
      setFollowUpErrors(followUpFields);
      setFormError([apiError.message, ...others].join(" "));
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (saving) event.preventDefault(); // Escape
      }}
      aria-labelledby={`${formId}-title`}
      className={`${dialogClass} max-h-[calc(100dvh-2rem)] max-w-2xl overflow-hidden p-0`}
    >
      <form noValidate onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={`${formId}-title`} className="text-base font-semibold">
              {lead ? "Edit lead" : "Add lead"}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {lead ? (
                <>
                  Status <StatusBadge status={lead.status} /> Change it from the lead&apos;s page.
                </>
              ) : (
                <>
                  New leads start with the status <StatusBadge status="NEW" />
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            aria-disabled={saving || undefined}
            className={`${iconButton} -mr-2 size-9`}
          >
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error"
            >
              {formError}
            </p>
          )}

          <Section title="Customer">
            <Field label="Customer name" id={fieldId("name")} required error={errors.name}>
              <input {...bind("name")} required maxLength={150} autoComplete="off" />
            </Field>
            <Field label="Phone" id={fieldId("phone")} required error={errors.phone ?? errors.country_code}>
              <div className="flex">
                <select
                  {...bind("country_code")}
                  aria-label="Country code"
                  className={`${fieldClass} h-9 shrink-0 rounded-r-none`}
                >
                  {COUNTRY_CODES.map((country) => (
                    <option key={country.value} value={country.value}>
                      {country.label} +{country.value}
                    </option>
                  ))}
                  {!COUNTRY_CODES.some((country) => country.value === values.country_code) && (
                    <option value={values.country_code}>+{values.country_code}</option>
                  )}
                </select>
                <input
                  {...bind("phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  required
                  className={`${inputClass} -ml-px rounded-l-none`}
                />
              </div>
            </Field>
            <Field label="Email" id={fieldId("email")} error={errors.email}>
              <input {...bind("email")} type="email" autoComplete="off" />
            </Field>
          </Section>

          <Section title="Location">
            <Field label="State" id={fieldId("state")} error={errors.state}>
              <input {...bind("state")} autoComplete="off" />
            </Field>
            <Field label="District" id={fieldId("district")} required error={errors.district}>
              <input {...bind("district")} required autoComplete="off" />
            </Field>
            <Field label="Area / locality" id={fieldId("area")} error={errors.area}>
              <input {...bind("area")} autoComplete="off" />
            </Field>
            <Field label="PIN code" id={fieldId("pin_code")} error={errors.pin_code}>
              <input {...bind("pin_code")} inputMode="numeric" maxLength={6} autoComplete="off" />
            </Field>
          </Section>

          <Section title="Solar plan">
            <Field
              label="Plan"
              id={fieldId("plan")}
              required
              error={errors.plan}
              hint={plans.error && `Plans couldn't be loaded: ${plans.error.message}`}
            >
              <select {...bind("plan")} onChange={changePlan} required disabled={!plans.data}>
                <option value="">{plans.data ? "Choose a plan" : plans.error ? "Plans unavailable" : "Loading plans…"}</option>
                {planOptions.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatMoney(plan.amount)}
                    {plan.is_active ? "" : " (inactive)"}
                  </option>
                ))}
                {!plans.data && lead?.plan && <option value={lead.plan}>{lead.plan_name}</option>}
              </select>
            </Field>
            <Field
              label="Amount"
              id={fieldId("amount")}
              required
              error={errors.amount}
              hint={
                selectedPlan && !sameAmount(values.amount, selectedPlan.amount) ? (
                  <>
                    The {selectedPlan.name} plan price is {formatMoney(selectedPlan.amount)}.{" "}
                    <button
                      type="button"
                      onClick={() => setValues((current) => ({ ...current, amount: plainAmount(selectedPlan.amount) }))}
                      className="font-medium text-link underline underline-offset-2 hover:text-link-hover"
                    >
                      Use plan price
                    </button>
                  </>
                ) : (
                  !selectedPlan && "Choosing a plan fills in its current price."
                )
              }
            >
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <input
                  {...bind("amount")}
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  className={`${inputClass} pl-7 tabular-nums`}
                />
              </div>
            </Field>
          </Section>

          <Section title="Follow-up and assignment">
            <Field label="Lead source" id={fieldId("source")} error={errors.source}>
              <select {...bind("source")}>
                <option value="">Not specified</option>
                {LEAD_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>
                    {source.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Assigned staff"
              id={fieldId("assigned_to")}
              error={errors.assigned_to}
              hint={
                assignees.error
                  ? `Staff couldn't be loaded: ${assignees.error.message}`
                  : !canAssign && "Only an admin can change who a lead is assigned to."
              }
            >
              <select {...bind("assigned_to")} disabled={!canAssign}>
                <option value="">{canAssign ? "Unassigned" : "You"}</option>
                {[...assigneeOptions, ...(keepAssignee ? [keepAssignee] : [])].map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Next follow-up" id={fieldId("next_follow_up")} error={errors.next_follow_up}>
              <input {...bind("next_follow_up")} type="date" />
            </Field>
            <Field label="Notes" id={fieldId("notes")} error={errors.notes} wide>
              <textarea {...bind("notes")} rows={3} className={`${fieldClass} w-full py-2`} />
            </Field>
          </Section>

          {!lead && (
            <fieldset>
              <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Initial follow-up</legend>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="add_follow_up"
                  checked={addFollowUp}
                  onChange={(event) => setAddFollowUp(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Add initial follow-up
              </label>
              {addFollowUp && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <FollowUpFields
                    idPrefix={`${formId}-follow-up`}
                    values={followUpValues}
                    errors={followUpErrors}
                    onChange={(field, value) => {
                      setFollowUp((current) => ({ ...current, [field]: value }));
                      setFollowUpErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
                    }}
                    assignees={assignees.data}
                    assigneesError={assignees.error?.message}
                  />
                  <StartsPending />
                </div>
              )}
            </fieldset>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={close}
            aria-disabled={saving || undefined}
            className={`${secondaryButton} aria-disabled:opacity-50`}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving…" : lead ? "Save changes" : "Save lead"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type StatusDialogProps = { lead: Lead; onClose: () => void; onChanged: (lead: Lead) => void };

// Moves the lead to another Lead Pipeline status through the API, which checks the user and the pipeline rules again.
// All six statuses are listed; the ones this lead can't move to (back, or out of Won or Lost) can't be chosen.
export function StatusDialog({ lead, onClose, onChanged }: StatusDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const selectId = useId();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      onChanged(await changeLeadStatus(lead.id, status));
      dialogRef.current?.close();
    } catch (err) {
      setError(toApiError(err).message);
      setPending(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby={titleId} className={`${dialogClass} max-w-sm p-5`}>
      <form onSubmit={submit}>
        <h2 id={titleId} className="text-base font-semibold">
          Update lead status
        </h2>
        <p className="mt-1 truncate text-sm text-muted-foreground">{lead.name}</p>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current status</span>
          <StatusBadge status={lead.status} />
        </div>
        <label htmlFor={selectId} className="mt-4 mb-1.5 block text-sm">
          New status
        </label>
        <select
          id={selectId}
          value={status}
          onChange={(event) => setStatus(event.target.value as LeadStatus)}
          className={inputClass}
        >
          {LEAD_STATUSES.map((item) => (
            <option
              key={item.value}
              value={item.value}
              disabled={item.value !== lead.status && !lead.allowed_transitions.includes(item.value)}
            >
              {item.value === lead.status ? `${item.label} (current)` : item.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted-foreground">
          {status === "WON"
            ? "Won is final. Convert the lead afterwards to create its Work."
            : status === "LOST"
              ? "Lost is final. The lead and its history are kept."
              : "Leads only move forward. Won and Lost are final."}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending || status === lead.status} className={primaryButton}>
            {pending ? "Updating…" : "Update Status"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type ConvertDialogProps = { lead: Lead; onClose: () => void; onConverted: (lead: Lead) => void };

// Conversion is a single backend operation; this dialog only confirms it and shows the result or the API's reason.
export function ConvertDialog({ lead, onClose, onConverted }: ConvertDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function convert() {
    setPending(true);
    setError(undefined);
    try {
      onConverted(await convertLead(lead.id));
      dialogRef.current?.close();
    } catch (err) {
      setError(toApiError(err).message);
      setPending(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby={titleId} className={`${dialogClass} max-w-md p-5`}>
      <h2 id={titleId} className="text-base font-semibold">
        Convert lead to Work
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        A Work will be created for {lead.name}&apos;s installation with this plan and amount.
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-muted px-4 py-3 text-sm">
        <dt className="text-muted-foreground">Plan</dt>
        <dd>{lead.plan_name ?? "Not set"}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd className="tabular-nums">{formatMoney(lead.amount)}</dd>
        <dt className="text-muted-foreground">Assigned</dt>
        <dd>{lead.assigned_to_name ?? "Unassigned"}</dd>
      </dl>
      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => dialogRef.current?.close()} className={secondaryButton}>
          Cancel
        </button>
        <button type="button" onClick={convert} disabled={pending} className={primaryButton}>
          {pending ? "Converting…" : "Convert to Work"}
        </button>
      </div>
    </dialog>
  );
}
