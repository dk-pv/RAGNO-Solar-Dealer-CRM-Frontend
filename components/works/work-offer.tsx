"use client";

import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { formatMoney } from "@/components/leads/api";
import { Field, FormDialog } from "@/components/leads/lead-dialogs";
import { inputClass } from "@/components/leads/ui";
import { toApiError } from "@/lib/api";
import { saveWorkOffer, type Work } from "./api";

// "Offer applied", beside a Work's amount: an admin gave this customer a special price.
export function OfferBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-info ring-1 ring-info-border ring-inset">
      Offer applied
    </span>
  );
}

// A Work's amount as the customer pays it (effective_amount): never the standard amount once there is an offer. With an
// offer, a line under it has the badge and, for admins (`standard`), the standard amount struck through, for reference.
// The container styles the amount itself.
export function WorkAmount({ work, standard = true }: { work: Work; standard?: boolean }) {
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  return (
    <>
      {formatMoney(work.effective_amount)}
      {work.offer_amount !== null && (
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <OfferBadge />
            {standard && isAdmin && (
              <span>
                <span className="sr-only">Standard amount: </span>
                <s>{formatMoney(work.amount)}</s>
              </span>
            )}
          </span>
        </span>
      )}
    </>
  );
}

const PRICE = /^\d{1,10}(\.\d{1,2})?$/;

// A quick check of a typed offer price, so the admin gets a helpful message before saving. The API checks it again.
function priceProblem(price: string, standard: string) {
  if (!price) return "Enter the offer price.";
  if (!PRICE.test(price)) return "Enter the price in rupees, using digits only.";
  if (Number(price) <= 0) return "Enter an offer price greater than zero.";
  if (Number(price) > Number(standard)) return `The offer price can't be more than the standard amount, ${formatMoney(standard)}.`;
  return undefined;
}

type OfferDialogProps = { work: Work; onClose: () => void; onSaved: (work: Work) => void };

// Apply Offer (admins): a special price for this one Work, agreed with its customer, with an optional note on why. The
// standard amount is shown for reference and stays as it is, as do the plan's price and every other Work.
export function OfferDialog({ work, onClose, onSaved }: OfferDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [price, setPrice] = useState(work.offer_amount === null ? "" : String(Number(work.offer_amount)));
  const [note, setNote] = useState(work.offer_note);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const fieldId = (field: string) => `${formId}-${field}`;
  const priceId = fieldId("offer_amount");
  const typed = price.trim();
  const below = priceProblem(typed, work.amount) ? undefined : Number(work.amount) - Number(typed);

  useEffect(() => {
    // Start in the price rather than on the close button (FormDialog has opened by now).
    document.getElementById(priceId)?.focus();
  }, [priceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = priceProblem(typed, work.amount);
    if (problem) {
      setErrors({ offer_amount: problem });
      document.getElementById(priceId)?.focus();
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(undefined);
    try {
      // The offer shown here goes too, so the API refuses if someone else changed it meanwhile.
      onSaved(await saveWorkOffer(work.id, { offer_amount: typed, offer_note: note.trim(), expected_offer_amount: work.offer_amount }));
      dialogRef.current?.close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      setFormError(apiError.message);
      setSaving(false);
    }
  }

  return (
    <FormDialog
      ref={dialogRef}
      title={work.offer_amount === null ? "Apply offer" : "Change offer"}
      subtitle={`Work #${work.id} · ${work.customer_name}`}
      width="max-w-md"
      busy={saving}
      error={formError}
      submitLabel="Apply Offer"
      busyLabel="Applying…"
      onSubmit={submit}
      onClose={onClose}
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-md bg-page px-4 py-3 text-sm">
        <dt className="text-muted-foreground">Customer</dt>
        <dd className="break-words">{work.customer_name}</dd>
        <dt className="text-muted-foreground">Work</dt>
        <dd className="tabular-nums">#{work.id}</dd>
        <dt className="text-muted-foreground">Plan</dt>
        <dd>{work.plan_name}</dd>
        <dt className="text-muted-foreground">Standard amount</dt>
        <dd className="font-semibold tabular-nums">{formatMoney(work.amount)}</dd>
        {work.offer_amount !== null && (
          <>
            <dt className="text-muted-foreground">Current offer</dt>
            <dd className="tabular-nums">{formatMoney(work.offer_amount)}</dd>
          </>
        )}
      </dl>
      <div className="mt-5 space-y-4">
        <Field
          label="Offer price"
          id={fieldId("offer_amount")}
          required
          error={errors.offer_amount}
          hint={
            below === undefined
              ? `At most the standard amount, ${formatMoney(work.amount)}.`
              : below === 0
                ? "The same as the standard amount."
                : `${formatMoney(String(below))} below the standard amount.`
          }
        >
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              ₹
            </span>
            <input
              id={fieldId("offer_amount")}
              name="offer_amount"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
                setErrors((current) => (current.offer_amount ? { ...current, offer_amount: "" } : current));
              }}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.offer_amount ? true : undefined}
              aria-describedby={errors.offer_amount ? `${fieldId("offer_amount")}-error` : undefined}
              className={`${inputClass} pl-7 tabular-nums`}
            />
          </div>
        </Field>
        <Field
          label="Reason or note"
          id={fieldId("offer_note")}
          error={errors.offer_note}
          hint="Optional: why this customer gets the price, for the admins."
        >
          <textarea
            id={fieldId("offer_note")}
            name="offer_note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
            aria-invalid={errors.offer_note ? true : undefined}
            aria-describedby={errors.offer_note ? `${fieldId("offer_note")}-error` : undefined}
            className={`${inputClass} h-auto py-2`}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
