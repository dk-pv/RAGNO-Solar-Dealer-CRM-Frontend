import { apiDownload, apiRequest } from "@/lib/api";

// The Lead Pipeline. Values and labels must match the backend's Lead status choices.
// Work Pipeline statuses belong to Works and never appear in the Leads module.
export const LEAD_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "INITIAL_CONTACT", label: "Initial Contact" },
  { value: "HOT", label: "Hot" },
  { value: "SUPERHOT", label: "Superhot" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];

// Must match the backend's Lead source choices.
export const LEAD_SOURCES = [
  { value: "WALK_IN", label: "Walk-in" },
  { value: "PHONE_CALL", label: "Phone call" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "REFERRAL", label: "Referral" },
  { value: "WEBSITE", label: "Website" },
  { value: "SOCIAL_MEDIA", label: "Social media" },
  { value: "OTHER", label: "Other" },
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number]["value"];

// Calling codes offered in the lead form: India first, then the Gulf countries many customers call from.
export const COUNTRY_CODES = [
  { value: "91", label: "India" },
  { value: "971", label: "UAE" },
  { value: "966", label: "Saudi Arabia" },
  { value: "974", label: "Qatar" },
  { value: "968", label: "Oman" },
  { value: "965", label: "Kuwait" },
  { value: "973", label: "Bahrain" },
];

// GET /api/leads/ (paginated) and GET /api/leads/{id}/. Money is a decimal string, as DRF sends it.
export type Lead = {
  id: number;
  name: string;
  country_code: string; // digits only, for example "91"
  phone: string; // the national number, digits only
  email: string;
  state: string;
  district: string;
  area: string;
  pin_code: string;
  plan: number | null;
  plan_name: string | null;
  amount: string | null; // stored on the lead, so later plan price changes never alter it
  status: LeadStatus;
  // The statuses the backend lets this user move the lead to, Won included (from Superhot).
  allowed_transitions: LeadStatus[];
  source: LeadSource | "";
  assigned_to: number | null;
  assigned_to_name: string | null;
  next_follow_up: string | null; // YYYY-MM-DD
  notes: string;
  is_pinned: boolean;
  // What the signed-in user may do with this lead, decided by the API: an admin everything, the assigned staff member
  // edit (not delete or reassign). These only shape the screens; the API enforces the same rules on every request.
  can_edit: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_convert: boolean; // only for a Won lead, and only for someone who can change it
  work?: number | null; // the Work created by the conversion; sent once the Works module links one
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// POST /api/leads/ and PATCH /api/leads/{id}/. The status is never sent: the server starts every lead as New.
export type LeadInput = Pick<
  Lead,
  | "name"
  | "country_code"
  | "phone"
  | "email"
  | "state"
  | "district"
  | "area"
  | "pin_code"
  | "plan"
  | "amount"
  | "source"
  | "assigned_to"
  | "next_follow_up"
  | "notes"
>;

// GET /api/plans/. The amount is the plan's current default price, configured by an admin in Settings.
export type Plan = { id: number; name: string; amount: string; is_active: boolean };
// GET /api/leads/assignees/: the active users a lead can be assigned to.
export type Assignee = { id: number; name: string };
// Must match the backend's Activity types.
export const ACTIVITY_TYPES = [
  { value: "PHONE_CALL", label: "Phone call" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "SITE_VISIT", label: "Site visit" },
  { value: "MEETING", label: "Customer meeting" },
  { value: "NOTE", label: "Note" },
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

// GET /api/activities/?lead={id} (paginated, newest first). Whoever can edit the lead manages its activities.
export type Activity = {
  id: number;
  type: ActivityType;
  type_display: string;
  description: string;
  created_by_name: string | null;
  created_at: string;
};
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export function saveLead(input: LeadInput, id?: number) {
  return id
    ? apiRequest<Lead>(`/leads/${id}/`, { method: "PATCH", json: input })
    : apiRequest<Lead>("/leads/", { method: "POST", json: input });
}

export function setLeadPinned(id: number, isPinned: boolean) {
  return apiRequest<Lead>(`/leads/${id}/`, { method: "PATCH", json: { is_pinned: isPinned } });
}

export function changeLeadStatus(id: number, status: LeadStatus) {
  return apiRequest<Lead>(`/leads/${id}/status/`, { method: "POST", json: { status } });
}

// Creates the Work for a Won lead; the API refuses any other status (409) and never changes the status itself.
// Until the Works module exists the API refuses every conversion (409) with a message, and nothing changes.
export function convertLead(id: number) {
  return apiRequest<Lead>(`/leads/${id}/convert/`, { method: "POST" });
}

// Admins only (the Leads module doesn't give staff the delete permission). Its activities go with it.
export function deleteLead(id: number) {
  return apiRequest<void>(`/leads/${id}/`, { method: "DELETE" });
}

export function addActivity(lead: number, type: ActivityType, description: string) {
  return apiRequest<Activity>("/activities/", { method: "POST", json: { lead, type, description } });
}

export function updateActivity(id: number, type: ActivityType, description: string) {
  return apiRequest<Activity>(`/activities/${id}/`, { method: "PATCH", json: { type, description } });
}

export function deleteActivity(id: number) {
  return apiRequest<void>(`/activities/${id}/`, { method: "DELETE" });
}

export function exportLeads(query: URLSearchParams) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return apiDownload(query.toString() ? `/leads/export/?${query}` : "/leads/export/", `leads-${today}.csv`);
}

// Why this user can't change the lead's status, or undefined when they can (the API decides allowed_transitions).
export function statusBlocker(lead: Lead) {
  if (lead.allowed_transitions.length > 0) return undefined;
  if (!lead.can_edit) return "You can view this lead but not change it.";
  return `${statusLabel(lead.status)} is a final status.`;
}

// Why this user can't convert the lead, or undefined when they can (the API decides can_convert and enforces it).
export function convertBlocker(lead: Lead) {
  if (lead.can_convert) return undefined;
  if (lead.status === "LOST") return "Lost leads can't be converted.";
  if (lead.status !== "WON") return "Only Won leads can be converted. Move the lead to Won first.";
  return "You can view this lead but not convert it.";
}

export const statusLabel = (status: LeadStatus) =>
  LEAD_STATUSES.find((item) => item.value === status)?.label ?? status;

export const sourceLabel = (source: string) => LEAD_SOURCES.find((item) => item.value === source)?.label ?? source;

const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const exactRupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function formatMoney(value: string | null) {
  if (value === null || value === "") return "—";
  const amount = Number(value);
  return (Number.isInteger(amount) ? wholeRupees : exactRupees).format(amount);
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
// A YYYY-MM-DD value is a calendar date, not a moment, so it is read and shown in UTC to keep the same day.
const calendarDateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function formatDate(value: string | null) {
  if (!value) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? calendarDateFormat.format(new Date(`${value}T00:00:00Z`))
    : dateFormat.format(new Date(value));
}

export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value));

type PhoneFields = Pick<Lead, "country_code" | "phone">;
const digits = (value: string) => value.replace(/\D/g, "");

export function formatPhone({ country_code, phone }: PhoneFields) {
  const number = digits(phone);
  const grouped = country_code === "91" && number.length === 10 ? `${number.slice(0, 5)} ${number.slice(5)}` : number;
  return country_code ? `+${country_code} ${grouped}` : grouped;
}

// The lead's own number, never the company's. WhatsApp needs the full international number,
// so a lead without a country code gets no WhatsApp link rather than a guessed one.
export function whatsappHref({ country_code, phone }: PhoneFields) {
  return country_code && phone ? `https://wa.me/${digits(country_code)}${digits(phone)}` : undefined;
}

export function telHref({ country_code, phone }: PhoneFields) {
  return phone ? `tel:${country_code ? `+${digits(country_code)}` : ""}${digits(phone)}` : undefined;
}
