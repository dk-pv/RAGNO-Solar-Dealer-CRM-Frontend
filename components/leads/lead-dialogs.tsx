"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { CloseIcon } from "@/components/layout/icons";
import { toApiError, useApi } from "@/lib/api";
import {
  COUNTRY_CODES,
  LEAD_SOURCES,
  convertLead,
  formatMoney,
  saveLead,
  type Assignee,
  type Lead,
  type LeadInput,
  type LeadSource,
  type Plan,
} from "./api";
import { StatusBadge, fieldClass, iconButton, inputClass, primaryButton, secondaryButton } from "./ui";

// Callers add the padding and width.
const dialogClass =
  "m-auto w-[calc(100%-2rem)] rounded-lg border border-border bg-background text-foreground shadow-xl backdrop:bg-black/50";

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

type FieldProps = { label: string; id: string; error?: string; required?: boolean; hint?: ReactNode; wide?: boolean; children: ReactNode };

function Field({ label, id, error, required, hint, wide, children }: FieldProps) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-red-600 dark:text-red-400">
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

type LeadFormDialogProps = { lead: Lead | null; onClose: () => void; onSaved: (lead: Lead) => void };

// Add Lead (lead = null) and Edit Lead share this form.
export function LeadFormDialog({ lead, onClose, onSaved }: LeadFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const plans = useApi<Plan[]>("/plans/");
  const assignees = useApi<Assignee[]>("/leads/assignees/");
  const [values, setValues] = useState(() => initialValues(lead));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    // Start in the first field rather than on the close button.
    dialogRef.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus();
  }, []);

  const close = () => dialogRef.current?.close();
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validate(values);
    setErrors(found);
    setFormError(undefined);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid) as HTMLElement | null)?.focus();
      return;
    }

    setSaving(true);
    try {
      onSaved(await saveLead(toInput(values), lead?.id));
      close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      // Messages for fields this form doesn't show are added to the summary, so none are lost.
      const others = Object.entries(apiError.fields)
        .filter(([field]) => !(field in values))
        .map(([, text]) => text);
      setFormError([apiError.message, ...others].join(" "));
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
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
          <button type="button" onClick={close} aria-label="Close" className={`${iconButton} -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
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
                      className="font-medium text-foreground underline underline-offset-2"
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
              hint={assignees.error && `Staff couldn't be loaded: ${assignees.error.message}`}
            >
              <select {...bind("assigned_to")}>
                <option value="">Unassigned</option>
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={close} className={secondaryButton}>
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
        {lead.name} will be marked <strong className="font-medium text-foreground">Won</strong> and a Work will be
        created for the installation with this plan and amount.
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
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
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
