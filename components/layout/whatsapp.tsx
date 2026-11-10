"use client";

import { useEffect, useId, useRef, useState } from "react";

import { formatPhone, whatsappHref, type Lead } from "@/components/leads/api";
import { LeadPicker } from "@/components/leads/follow-ups";
import { Field, FormDialog } from "@/components/leads/lead-dialogs";
import { fieldClass, inputClass, secondaryButton } from "@/components/leads/ui";

// The business's own name, as the sidebar and the sign-in page show it: who a message says it is from.
const COMPANY = "Ragno Power System";

// The message templates. In a template's text, {name} stands for the chosen lead's name and {plan} for their solar plan;
// the text stays editable before it is sent.
// ponytail: the templates live here, in code. Keep them in the database, edited from Settings, once the team wants to
// write their own.
export const WHATSAPP_TEMPLATES = [
  {
    key: "introduction",
    name: "Simple introduction",
    text: `Hi {name}, this is ${COMPANY}. I'm reaching out regarding your solar enquiry. Please let me know a convenient time to connect.`,
  },
  {
    key: "quotation",
    name: "Follow-up on the quotation",
    text: `Hi {name}, this is ${COMPANY}. I'm following up on the {plan} solar plan we discussed. Do you have any questions I can help with?`,
  },
  {
    key: "site-visit",
    name: "Site visit",
    text: `Hi {name}, this is ${COMPANY}. We would like to visit your site to plan your solar installation. Which day and time would suit you?`,
  },
];

// A template's text for one lead: {name} is the lead's name and {plan} their plan. A lead without a usable name is
// greeted plainly ("Hi there"), never with a gap.
export function fillTemplate(text: string, lead: Pick<Lead, "name" | "plan_name">) {
  return text.replaceAll("{name}", lead.name.trim() || "there").replaceAll("{plan}", lead.plan_name?.trim() || "chosen");
}

const NO_NUMBER = "This lead has no phone number WhatsApp can use. Add one to the lead first.";

// The WhatsApp link for the lead's OWN number (never the company's) with the message ready to send, or undefined when
// the lead has no number WhatsApp could use: no country code, or not the 6 to 14 digits a phone number has.
function whatsappLink(lead: Pick<Lead, "country_code" | "phone">, message: string) {
  const href = whatsappHref(lead);
  const digits = lead.phone.replace(/\D/g, "").length;
  if (!href || digits < 6 || digits > 14) return undefined;
  return `${href}?text=${encodeURIComponent(message)}`;
}

// The navbar's WhatsApp action: choose a lead (searched through the API, among the leads this user works with), start
// from a template, edit the message, and open WhatsApp with it ready to send to that lead. WhatsApp itself sends it:
// this form only opens the chat, so it says "opened", not "sent".
export function WhatsAppDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const [lead, setLead] = useState<Lead>();
  const [templateKey, setTemplateKey] = useState(WHATSAPP_TEMPLATES[0].key);
  const [message, setMessage] = useState(WHATSAPP_TEMPLATES[0].text);
  const [errors, setErrors] = useState<{ lead?: string; message?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // The message as it will be sent, once a lead is chosen.
  const preview = lead ? fillTemplate(message, lead) : undefined;
  const length = (preview ?? message).length;

  function chooseLead(next?: Lead) {
    setLead(next);
    setOpened(undefined);
    // A lead without a usable number is said so at once, not only on sending.
    setErrors((current) => ({ ...current, lead: next && !whatsappLink(next, "") ? NO_NUMBER : undefined }));
  }

  function clear() {
    setLead(undefined);
    setTemplateKey(WHATSAPP_TEMPLATES[0].key);
    setMessage(WHATSAPP_TEMPLATES[0].text);
    setErrors({});
    setFormError(undefined);
    setOpened(undefined);
  }

  function submit() {
    // Already opening: a second click, even one in the same instant, opens nothing more.
    if (timer.current !== undefined) return;
    const found: typeof errors = {};
    if (!lead) found.lead = "Choose the lead to message.";
    else if (!whatsappLink(lead, "")) found.lead = NO_NUMBER;
    if (!message.trim()) found.message = "Write the message.";
    setErrors(found);
    setFormError(undefined);
    setOpened(undefined);
    const link = lead && !found.lead && !found.message ? whatsappLink(lead, fillTemplate(message, lead).trim()) : undefined;
    if (!lead || !link) {
      document.getElementById(`${formId}-${found.lead ? "lead" : "message"}`)?.focus();
      return;
    }

    setOpening(true);
    // A new tab, opened by this click: WhatsApp (the app, or WhatsApp Web) at the lead's number with the message typed in.
    const tab = window.open(link, "_blank");
    if (tab) tab.opener = null;
    // Held for a moment, so a second click can't open WhatsApp twice.
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setOpening(false);
      if (tab) setOpened(`WhatsApp opened for ${lead.name}. Review the message there and send it.`);
      else setFormError("Your browser blocked WhatsApp from opening. Allow pop-ups for this site and try again.");
    }, 1200);
  }

  return (
    <FormDialog
      title="Send a WhatsApp message"
      subtitle="Opens WhatsApp with the message ready to send to the lead's own number."
      width="max-w-xl"
      busy={opening}
      error={formError}
      submitLabel="Open WhatsApp"
      busyLabel="Opening WhatsApp…"
      footerStart={
        <button type="button" onClick={clear} disabled={opening} className={secondaryButton}>
          Clear
        </button>
      }
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="space-y-4">
        {opened && (
          <p role="status" className="rounded-md border border-success-border bg-success-soft px-3 py-2 text-sm text-success">
            {opened}
          </p>
        )}
        <Field
          label="Lead"
          id={`${formId}-lead`}
          required
          error={errors.lead}
          hint={
            lead && (
              <>
                To <span className="font-medium text-foreground tabular-nums">{formatPhone(lead)}</span>, the lead&apos;s own number.
              </>
            )
          }
        >
          <LeadPicker id={`${formId}-lead`} value={lead} onChange={chooseLead} error={errors.lead} />
        </Field>
        <Field label="Template" id={`${formId}-template`}>
          <select
            id={`${formId}-template`}
            value={templateKey}
            onChange={(event) => {
              const template = WHATSAPP_TEMPLATES.find((item) => item.key === event.target.value) ?? WHATSAPP_TEMPLATES[0];
              setTemplateKey(template.key);
              setMessage(template.text);
              setErrors((current) => ({ ...current, message: undefined }));
            }}
            className={inputClass}
          >
            {WHATSAPP_TEMPLATES.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Message"
          id={`${formId}-message`}
          required
          error={errors.message}
          hint={
            <span className="flex flex-wrap justify-between gap-x-3">
              <span>
                <code>{"{name}"}</code> becomes the lead&apos;s name and <code>{"{plan}"}</code> their plan.
              </span>
              <span className="tabular-nums">{length.toLocaleString("en-IN")} characters</span>
            </span>
          }
        >
          <textarea
            id={`${formId}-message`}
            name="message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setErrors((current) => (current.message ? { ...current, message: undefined } : current));
            }}
            rows={5}
            aria-required="true"
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? `${formId}-message-error` : undefined}
            className={`${fieldClass} w-full py-2`}
          />
        </Field>
        <div>
          <p id={`${formId}-preview`} className="mb-1.5 text-sm font-medium text-label">
            Preview
          </p>
          <p
            aria-labelledby={`${formId}-preview`}
            aria-live="polite"
            className="min-h-16 rounded-md border border-border bg-muted px-3 py-2 text-sm break-words whitespace-pre-line"
          >
            {preview ?? <span className="text-muted-foreground">Choose a lead to see the message as it will be sent.</span>}
          </p>
        </div>
      </div>
    </FormDialog>
  );
}
