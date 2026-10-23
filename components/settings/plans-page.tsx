"use client";

import { useContext, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { PlusIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatMoney, type Plan } from "@/components/leads/api";
import { Field, FormDialog } from "@/components/leads/lead-dialogs";
import { ErrorState, emptyAreaClass, ghostButton, inputClass, primaryButton, tableBoxClass, useNotice } from "@/components/leads/ui";
import { ActionDialog } from "@/components/selection";
import { apiRequest, toApiError, useApi } from "@/lib/api";
import { activeBadge, badgeClass, inactiveBadge } from "./users-page";

// "5.00" -> "5", as a form shows a stored number.
const plain = (value: string) => String(Number(value));

// Settings → Solar Plans (admins): the plans offered for new leads and their default prices. A price change is for new
// leads only: every lead, Work and offer keeps its own amount. A plan no longer sold is deactivated, not deleted, so the
// leads and Works that have it keep it. The API checks everything again and refuses anyone but an admin.
export function PlansPage() {
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  const plans = useApi<Plan[]>(isAdmin ? "/plans/" : null);
  const [dialog, setDialog] = useState<{ mode: "add" | "edit" | "status"; plan?: Plan }>();
  const [noticeElement, notify] = useNotice();

  // The API refuses plan changes to anyone else; this only avoids requests that can't succeed.
  if (!isAdmin) {
    return <ErrorState title="Only admins can manage solar plans" message="Ask an admin if a plan or its price needs to change." />;
  }

  const addButton = (
    <button type="button" onClick={() => setDialog({ mode: "add" })} className={primaryButton}>
      <PlusIcon className="size-4" />
      Add plan
    </button>
  );
  const status = dialog?.mode === "status" ? dialog.plan : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-base font-semibold">Solar Plans</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The plans offered for new leads, with their default prices. Changing a price applies to new leads only: leads
            and Works keep their own amounts.
          </p>
        </div>
        {addButton}
      </div>

      {plans.error ? (
        <div className="mt-4 rounded-lg border border-border bg-background">
          <ErrorState title="Couldn't load plans" message={plans.error.message} onRetry={plans.reload} />
        </div>
      ) : plans.data?.length === 0 ? (
        <div className={`${emptyAreaClass} mt-4`}>
          <p className="text-sm font-medium">No plans yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add the plans you sell, so they can be chosen for leads.</p>
          <div className="mt-4">{addButton}</div>
        </div>
      ) : (
        <div className={`${tableBoxClass} relative mt-4`}>
          <table aria-busy={plans.loading} data-stack className="w-full min-w-160 text-sm">
            <caption className="sr-only">Solar plans</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="px-3 py-2.5">Plan</th>
                <th scope="col" className="px-3 py-2.5">Capacity</th>
                <th scope="col" className="px-3 py-2.5 text-right">Default price</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.data
                ? plans.data.map((plan) => (
                    <tr key={plan.id} className="border-b border-border last:border-0 hover:bg-row-hover">
                      <th scope="row" data-slot="title" className="px-3 py-2.5 text-left font-medium">
                        <span className="block max-w-[max(13rem,14cqw)] truncate">{plan.name}</span>
                      </th>
                      <td data-label="Capacity" className="px-3 py-2.5 whitespace-nowrap tabular-nums">{plain(plan.capacity)} kW</td>
                      <td data-label="Default price" className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                        {formatMoney(plan.amount)}
                      </td>
                      <td data-label="Status" className="px-3 py-2.5">
                        <span className={`${badgeClass} ${plan.is_active ? activeBadge : inactiveBadge}`}>
                          {plan.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td data-slot="actions" className="px-2 py-1.5 text-right whitespace-nowrap text-label">
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: "edit", plan })}
                          aria-label={`Edit the ${plan.name} plan`}
                          className={ghostButton}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: "status", plan })}
                          aria-label={`${plan.is_active ? "Deactivate" : "Activate"} the ${plan.name} plan`}
                          className={ghostButton}
                        >
                          {plan.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))
                : Array.from({ length: 5 }, (_, row) => (
                    <tr key={row} data-skeleton className="border-b border-border last:border-0">
                      {Array.from({ length: 5 }, (_, cell) => (
                        <td key={cell} className="px-3 py-3.5">
                          <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {(dialog?.mode === "add" || dialog?.mode === "edit") && (
        <PlanDialog
          plan={dialog.plan}
          onClose={() => setDialog(undefined)}
          onSaved={(saved) => {
            const before = dialog.plan;
            notify({
              text: !before
                ? `Added the ${saved.name} plan at ${formatMoney(saved.amount)}.`
                : Number(before.amount) !== Number(saved.amount)
                  ? `Saved the ${saved.name} plan. New leads start at ${formatMoney(saved.amount)}; existing leads and Works keep their amounts.`
                  : `Saved the ${saved.name} plan.`,
            });
            plans.reload();
          }}
        />
      )}
      {status && (
        // Deactivating takes the plan out of the lead form, so it is confirmed first; reactivating too, as for users.
        <ActionDialog
          destructive={status.is_active}
          title={status.is_active ? `Deactivate the ${status.name} plan?` : `Activate the ${status.name} plan?`}
          description={
            status.is_active
              ? "It won't be offered for new leads. Leads and Works that already have it keep it, with their own amounts. You can activate it again at any time."
              : `It will be offered for new leads again, at its default price of ${formatMoney(status.amount)}.`
          }
          confirmLabel={status.is_active ? "Deactivate" : "Activate"}
          pendingLabel={status.is_active ? "Deactivating…" : "Activating…"}
          onConfirm={async () => {
            const saved = await apiRequest<Plan>(`/plans/${status.id}/`, { method: "PATCH", json: { is_active: !status.is_active } });
            notify({
              text: saved.is_active
                ? `Activated the ${saved.name} plan.`
                : `Deactivated the ${saved.name} plan. It isn't offered for new leads now.`,
            });
            plans.reload();
          }}
          onClose={() => setDialog(undefined)}
          onError={(text) => notify({ text, error: true })}
        />
      )}
      {noticeElement}
    </div>
  );
}

type Values = { capacity: string; name: string; amount: string };
type FieldErrors = Partial<Record<keyof Values, string>>;
// Form order, used to focus the first field with an error.
const FIELD_ORDER: (keyof Values)[] = ["capacity", "name", "amount"];

// Quick checks so people get a helpful message before saving. The API validates everything again (a duplicate capacity
// or name, a plan in use whose capacity would change) and has the final say.
function validate({ capacity, name, amount }: Values) {
  const errors: FieldErrors = {};
  if (!capacity) errors.capacity = "Enter the capacity in kW.";
  else if (!/^\d{1,3}(\.\d{1,2})?$/.test(capacity)) errors.capacity = "Enter the capacity in kW, such as 5 or 7.5.";
  else if (Number(capacity) <= 0) errors.capacity = "Enter a capacity greater than zero.";
  if (!name) errors.name = "Enter the plan's name.";
  if (!amount) errors.amount = "Enter the default price.";
  else if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) errors.amount = "Enter the price in rupees, using digits only.";
  else if (Number(amount) <= 0) errors.amount = "Enter a price greater than zero.";
  return errors;
}

type PlanDialogProps = { plan?: Plan; onClose: () => void; onSaved: (plan: Plan) => void };

// Add plan (plan undefined) and Edit plan share this form.
function PlanDialog({ plan, onClose, onSaved }: PlanDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [values, setValues] = useState<Values>({
    capacity: plan ? plain(plan.capacity) : "",
    name: plan?.name ?? "",
    amount: plan ? plain(plan.amount) : "",
  });
  // A new plan is named after its capacity ("6 kW") until a name is typed by hand.
  const [nameTyped, setNameTyped] = useState(plan !== undefined);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const fieldId = (field: keyof Values) => `${formId}-${field}`;
  const firstId = fieldId("capacity");

  useEffect(() => {
    // Start in the first field rather than on the close button (FormDialog has opened by now).
    document.getElementById(firstId)?.focus();
  }, [firstId]);

  function bind(field: keyof Values) {
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setValues((current) => ({
          ...current,
          [field]: value,
          ...(field === "capacity" && !nameTyped && { name: /^\d{1,3}(\.\d{1,2})?$/.test(value.trim()) ? `${Number(value)} kW` : "" }),
        }));
        if (field === "name") setNameTyped(true);
        // A corrected field stops showing its old error.
        setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
      },
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${fieldId(field)}-error` : undefined,
      autoComplete: "off",
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const input = { capacity: values.capacity.trim(), name: values.name.trim(), amount: values.amount.trim() };
    const found = validate(input);
    setErrors(found);
    setFormError(undefined);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid) as HTMLElement | null)?.focus();
      return;
    }
    setSaving(true);
    try {
      onSaved(
        plan
          ? await apiRequest<Plan>(`/plans/${plan.id}/`, { method: "PATCH", json: input })
          : await apiRequest<Plan>("/plans/", { method: "POST", json: input }),
      );
      dialogRef.current?.close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      // Messages for fields this form doesn't show are added to the summary, so none are lost.
      const others = Object.entries(apiError.fields)
        .filter(([field]) => !FIELD_ORDER.includes(field as keyof Values))
        .map(([, text]) => text);
      setFormError([apiError.message, ...others].join(" "));
      setSaving(false);
      (form.elements.namedItem(FIELD_ORDER.find((field) => apiError.fields[field]) ?? "") as HTMLElement | null)?.focus();
    }
  }

  return (
    <FormDialog
      ref={dialogRef}
      title={plan ? "Edit plan" : "Add plan"}
      subtitle={plan ? `${plan.name} · ${plan.is_active ? "Active" : "Inactive"}` : "It can be chosen for new leads straight away."}
      width="max-w-md"
      busy={saving}
      error={formError}
      submitLabel={plan ? "Save changes" : "Add plan"}
      busyLabel="Saving…"
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field
          label="Capacity"
          id={fieldId("capacity")}
          required
          error={errors.capacity}
          hint={plan ? "It can't change once leads or Works use the plan: add a new plan for a new size." : "The system size."}
        >
          <div className="relative">
            <input {...bind("capacity")} inputMode="decimal" className={`${inputClass} pr-10 tabular-nums`} />
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
              kW
            </span>
          </div>
        </Field>
        <Field label="Name" id={fieldId("name")} required error={errors.name} hint="As the lead form lists it, such as 5 kW.">
          <input {...bind("name")} maxLength={50} className={inputClass} />
        </Field>
        <Field
          label="Default price"
          id={fieldId("amount")}
          required
          error={errors.amount}
          hint="Filled in when the plan is chosen for a new lead. Leads and Works keep their own amounts when it changes."
        >
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              ₹
            </span>
            <input {...bind("amount")} inputMode="decimal" className={`${inputClass} pl-7 tabular-nums`} />
          </div>
        </Field>
      </div>
    </FormDialog>
  );
}
