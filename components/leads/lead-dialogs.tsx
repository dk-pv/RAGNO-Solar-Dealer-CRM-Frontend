"use client";

import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { AssigneePicker } from "@/components/assignee-picker";
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
import { Busy, FollowUpBadge, StatusBadge, fieldClass, iconButton, inputClass, primaryButton, secondaryButton } from "./ui";

// Callers add the padding and width.
export const dialogClass =
  "m-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-background text-foreground shadow-lg backdrop:bg-foreground/30";

type FormDialogProps = {
  /** The dialog element, for a form that closes it itself once its save is done. */
  ref?: RefObject<HTMLDialogElement | null>;
  title: string;
  subtitle?: ReactNode;
  /** The dialog's largest width (a max-w-* class). */
  width?: string;
  /** The form is saving: it can't be dismissed or sent again, and the button shows `busyLabel`. */
  busy: boolean;
  /** The form's own error, above the fields. */
  error?: string;
  submitLabel: string;
  busyLabel: string;
  submitDisabled?: boolean;
  /** At the left of the footer, such as a Clear button. */
  footerStart?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  /** The fields. */
  children: ReactNode;
};

// The CRM's form dialog, the same frame for every form that uses it (both activity forms, the WhatsApp message): a
// title bar with Close, the fields, which scroll when the form is taller than the screen, and a footer with Cancel and
// the save button. It opens itself, fits a phone screen, and while saving it can't be dismissed.
export function FormDialog({
  ref,
  title,
  subtitle,
  width = "max-w-lg",
  busy,
  error,
  submitLabel,
  busyLabel,
  submitDisabled,
  footerStart,
  onSubmit,
  onClose,
  children,
}: FormDialogProps) {
  const ownRef = useRef<HTMLDialogElement>(null);
  const dialogRef = ref ?? ownRef;
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, [dialogRef]);

  const close = () => {
    if (!busy) dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault(); // Escape
      }}
      aria-labelledby={titleId}
      className={`${dialogClass} max-h-[calc(100dvh-2rem)] ${width} overflow-hidden p-0`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit(event);
        }}
        className="flex max-h-[calc(100dvh-2rem)] flex-col"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <button type="button" onClick={close} aria-label="Close" aria-disabled={busy || undefined} className={`${iconButton} -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {error && (
            <p role="alert" className="mb-4 rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          {children}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          {footerStart && <div className="mr-auto">{footerStart}</div>}
          <button type="button" onClick={close} aria-disabled={busy || undefined} className={`${secondaryButton} aria-disabled:opacity-50`}>
            Cancel
          </button>
          {/* aria-disabled, not disabled, while saving: a disabled button would drop the keyboard focus. */}
          <button type="submit" disabled={submitDisabled} aria-disabled={busy || undefined} className={`${primaryButton} aria-disabled:opacity-50`}>
            {busy ? <Busy>{busyLabel}</Busy> : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type FormValues = {
  name: string;
  country_code: string;
  phone: string;
  email: string;
  state: string;
  district: string;
  area: string;
  pin_code: string;
  dealer_name: string;
  plan: string;
  amount: string;
  source: string;
  next_follow_up: string;
  notes: string;
};
// "assignees": the assigned staff, chosen with the AssigneePicker (its search box is named "assignees").
type FieldName = keyof FormValues | "assignees";
type FieldErrors = Partial<Record<FieldName, string>>;

// Form order, used to focus the first field with an error.
const FIELD_ORDER: FieldName[] = [
  "name",
  "country_code",
  "phone",
  "email",
  "dealer_name",
  "state",
  "district",
  "area",
  "pin_code",
  "plan",
  "amount",
  "source",
  "assignees",
  "next_follow_up",
  "notes",
];

// The API names the assignees assignee_ids (or, for older clients, assigned_to); the forms show them as "assignees".
const formField = (field: string) => (field === "assignee_ids" || field === "assigned_to" ? "assignees" : field);

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
    dealer_name: lead?.dealer_name ?? "",
    plan: lead?.plan ? String(lead.plan) : "",
    amount: plainAmount(lead?.amount ?? null),
    source: lead?.source ?? "",
    next_follow_up: lead?.next_follow_up ?? "",
    notes: lead?.notes ?? "",
  };
}

// Quick checks so people get a helpful message before saving. The API validates everything again and has the final say.
// Only the name and the phone number are required; the plan and amount are optional (a plan without an amount gets the
// plan's current price from the API).
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
  if (values.pin_code.trim() && !/^[1-9]\d{5}$/.test(values.pin_code.trim())) errors.pin_code = "Enter a 6-digit PIN code.";
  if (values.amount && !/^\d{1,10}(\.\d{1,2})?$/.test(values.amount))
    errors.amount = "Enter the amount in rupees, using digits only.";
  return errors;
}

// `assignees` is sent only by someone who may assign the lead (an admin): the API keeps a staff member's lead theirs.
function toInput(values: FormValues, assignees?: Assignee[]): LeadInput {
  return {
    name: values.name.trim(),
    country_code: values.country_code,
    phone: nationalNumber(values.phone),
    email: values.email.trim(),
    state: values.state.trim(),
    district: values.district.trim(),
    area: values.area.trim(),
    pin_code: values.pin_code.trim(),
    dealer_name: values.dealer_name.trim(),
    plan: values.plan ? Number(values.plan) : null,
    amount: values.amount || null,
    source: values.source as LeadSource | "",
    ...(assignees && { assignee_ids: assignees.map((person) => person.id) }),
    next_follow_up: values.next_follow_up || null,
    notes: values.notes.trim(),
  };
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
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
export type FollowUpDraft = { title: string; type: ActivityType; assignees: Assignee[]; due_date: string; description: string };
export type FollowUpErrors = Partial<Record<keyof FollowUpDraft, string>>;
export const FOLLOW_UP_FIELDS: (keyof FollowUpDraft)[] = ["title", "type", "assignees", "due_date", "description"];
// The field of a follow-up form an API message is about ("assignee_ids" is the form's "assignees"), if it shows it.
export const followUpField = (field: string) =>
  FOLLOW_UP_FIELDS.find((name) => name === formField(field.replace(/^initial_follow_up\./, "")));

export const emptyFollowUp = (): FollowUpDraft => ({
  title: "",
  type: "PHONE_CALL",
  assignees: [],
  due_date: "",
  description: "",
});

export const followUpDraft = (activity: Activity): FollowUpDraft => ({
  title: activity.title,
  type: activity.type,
  assignees: activity.assignees,
  due_date: activity.due_date ?? "",
  description: activity.description,
});

// Quick checks so people get a helpful message before saving. The API validates everything again.
export function validateFollowUp(draft: FollowUpDraft) {
  const errors: FollowUpErrors = {};
  if (!draft.title.trim()) errors.title = "Enter a heading.";
  if (draft.assignees.length === 0) errors.assignees = "Choose at least one person to do the follow-up.";
  if (!draft.due_date) errors.due_date = "Choose the due date.";
  return errors;
}

export const toFollowUpInput = (draft: FollowUpDraft): ActivityInput => ({
  title: draft.title.trim(),
  type: draft.type,
  assignee_ids: draft.assignees.map((person) => person.id),
  due_date: draft.due_date,
  description: draft.description.trim(),
});

// Who a new follow-up goes to until someone is chosen for it: the lead's own staff who can be chosen (an admin can't
// pick a deactivated user); staff assign a follow-up only to themselves, so their one choice is made for them.
export function defaultFollowUpAssignees(leadAssignees: Assignee[], options: Assignee[] = []) {
  const fromLead = leadAssignees.filter((person) => options.some((option) => option.id === person.id));
  return fromLead.length > 0 ? fromLead : options.length === 1 ? options : [];
}

type FollowUpFieldsProps = {
  idPrefix: string;
  values: FollowUpDraft;
  errors: FollowUpErrors;
  onChange: <K extends keyof FollowUpDraft>(field: K, value: FollowUpDraft[K]) => void;
  assignees?: Assignee[]; // whom this user may assign: anyone active for an admin, only themselves for staff
  assigneesError?: string;
};

// A follow-up's heading, type, assigned staff (one or several), due date and notes. Its status isn't here: a new one
// starts Pending. Someone already assigned who can't be chosen now (deactivated) stays until removed.
export function FollowUpFields({ idPrefix, values, errors, onChange, assignees, assigneesError }: FollowUpFieldsProps) {
  const id = (field: keyof FollowUpDraft) => `${idPrefix}-${field}`;
  const bind = (field: Exclude<keyof FollowUpDraft, "assignees">) => ({
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
      <Field label="Due date" id={id("due_date")} required error={errors.due_date}>
        <input {...bind("due_date")} type="date" />
      </Field>
      <Field
        label="Assigned staff"
        id={id("assignees")}
        required
        error={errors.assignees}
        hint={assigneesError ? `Staff couldn't be loaded: ${assigneesError}` : "One or more people."}
        wide
      >
        <AssigneePicker
          id={id("assignees")}
          name="follow_up_assignees"
          value={values.assignees}
          onChange={(people) => onChange("assignees", people)}
          options={assignees}
          optionsError={assigneesError}
          invalid={Boolean(errors.assignees)}
          describedBy={errors.assignees ? `${id("assignees")}-error` : undefined}
        />
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
  const me = useContext(CurrentUserContext);
  const canAssign = lead ? lead.can_assign : me?.role === "ADMIN";
  const [values, setValues] = useState(() => initialValues(lead));
  const [assigned, setAssigned] = useState<Assignee[]>(
    () => lead?.assignees ?? (canAssign || !me ? [] : [{ id: me.id, name: me.name }]),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  // Add Lead only: the lead's first follow-up, saved with it by the API (both or neither). Its staff follow the lead's
  // until someone is chosen for it (followUpPeople).
  const [addFollowUp, setAddFollowUp] = useState(false);
  const [followUp, setFollowUp] = useState(() => emptyFollowUp());
  const [followUpPeople, setFollowUpPeople] = useState<Assignee[]>();
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

  function bind(field: keyof FormValues) {
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

  const followUpValues = { ...followUp, assignees: followUpPeople ?? defaultFollowUpAssignees(assigned, assignees.data) };

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
      const input = toInput(values, canAssign ? assigned : undefined);
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
        const ofFollowUp = field.startsWith("initial_follow_up.") ? followUpField(field) : undefined;
        if (FIELD_ORDER.includes(formField(field) as FieldName)) leadFields[formField(field) as FieldName] = text;
        else if (ofFollowUp) followUpFields[ofFollowUp] = text;
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
                  // As wide as the chosen country, not the longest one, so the number keeps its room on a phone.
                  className={`${fieldClass} field-sizing-content h-9 shrink-0 rounded-r-none`}
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
            <Field label="Dealer name" id={fieldId("dealer_name")} error={errors.dealer_name}>
              <input {...bind("dealer_name")} maxLength={150} autoComplete="off" />
            </Field>
          </Section>

          <Section title="Location">
            <Field label="State" id={fieldId("state")} error={errors.state}>
              <input {...bind("state")} autoComplete="off" />
            </Field>
            <Field label="District" id={fieldId("district")} error={errors.district}>
              <input {...bind("district")} autoComplete="off" />
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
              error={errors.plan}
              hint={plans.error ? `Plans couldn't be loaded: ${plans.error.message}` : "Needed before the lead is converted to a Work."}
            >
              <select {...bind("plan")} onChange={changePlan} disabled={!plans.data}>
                <option value="">{plans.data ? "No plan yet" : plans.error ? "Plans unavailable" : "Loading plans…"}</option>
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
              error={errors.amount}
              hint={
                selectedPlan && !sameAmount(values.amount, selectedPlan.amount) ? (
                  <>
                    The {selectedPlan.name} plan price is {formatMoney(selectedPlan.amount)}.{" "}
                    <button
                      type="button"
                      onClick={() => setValues((current) => ({ ...current, amount: plainAmount(selectedPlan.amount) }))}
                      className="font-medium text-link underline underline-offset-2 hover:text-link-hover touch:min-h-11"
                    >
                      Use plan price
                    </button>
                  </>
                ) : (
                  !selectedPlan && "Optional. Choosing a plan fills in its current price."
                )
              }
            >
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <input
                  {...bind("amount")}
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
            <Field label="Next follow-up" id={fieldId("next_follow_up")} error={errors.next_follow_up}>
              <input {...bind("next_follow_up")} type="date" />
            </Field>
            <Field
              label="Assigned staff"
              id={fieldId("assignees")}
              error={errors.assignees}
              hint={
                assignees.error
                  ? `Staff couldn't be loaded: ${assignees.error.message}`
                  : canAssign
                    ? "One or more people, or no one yet."
                    : "Only an admin can change who a lead is assigned to."
              }
              wide
            >
              <AssigneePicker
                id={fieldId("assignees")}
                name="assignees"
                value={assigned}
                onChange={(people) => {
                  setAssigned(people);
                  setErrors((current) => (current.assignees ? { ...current, assignees: undefined } : current));
                }}
                options={assignees.data}
                optionsError={assignees.error?.message}
                disabled={!canAssign}
                invalid={Boolean(errors.assignees)}
                describedBy={errors.assignees ? `${fieldId("assignees")}-error` : undefined}
              />
            </Field>
            <Field label="Notes" id={fieldId("notes")} error={errors.notes} wide>
              <textarea {...bind("notes")} rows={3} className={`${fieldClass} w-full py-2`} />
            </Field>
          </Section>

          {!lead && (
            <fieldset>
              <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Initial follow-up</legend>
              <label className="mt-3 flex items-center gap-2 text-sm touch:min-h-11">
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
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FollowUpFields
                    idPrefix={`${formId}-follow-up`}
                    values={followUpValues}
                    errors={followUpErrors}
                    onChange={(field, value) => {
                      if (field === "assignees") setFollowUpPeople(value as Assignee[]);
                      else setFollowUp((current) => ({ ...current, [field]: value }));
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
            {saving ? <Busy>Saving…</Busy> : lead ? "Save changes" : "Save lead"}
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
            {pending ? <Busy>Updating…</Busy> : "Update Status"}
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
        <dd>
          {lead.assignees[0]?.name ?? "Unassigned"}
          {lead.assignees.length > 1 && (
            <span className="block text-xs text-muted-foreground">
              A Work has one assignee: the lead&apos;s first, by name. It can be changed on the Work.
            </span>
          )}
        </dd>
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
          {pending ? <Busy>Converting…</Busy> : "Convert to Work"}
        </button>
      </div>
    </dialog>
  );
}
