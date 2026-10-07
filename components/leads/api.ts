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
  can_convert: boolean; // only for a Won lead not yet converted, and only for someone who can change it
  work?: number | null; // the Work created by converting the lead; null until then
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// POST /api/leads/ and PATCH /api/leads/{id}/. The status is never sent: the server starts every lead as New.
// A new lead can bring its first follow-up (initial_follow_up): the API saves both together, or neither.
export type LeadInput = { initial_follow_up?: ActivityInput } & Pick<
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

// GET /api/leads/summary/: every status with its number of leads and their total amount, for the list's search and
// filters (the Lead Pipeline's column headers). Staff get their own leads' numbers.
export type StatusSummary = { status: LeadStatus; label: string; count: number; total_amount: string };

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

// Must match the backend's follow-up statuses. The API starts every new follow-up as Pending.
export const FOLLOW_UP_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]["value"];

// A lead's follow-up. GET /api/activities/ lists every follow-up the user can see (the Activities page: an admin's
// are all; staff see only those assigned to them); ?lead={id} lists one lead's. Paginated, newest first unless sorted.
// Follow-ups added before headings, staff and due dates existed may lack them.
export type Activity = {
  id: number;
  lead: number;
  lead_name: string;
  lead_country_code: string;
  lead_phone: string;
  title: string; // the heading
  type: ActivityType;
  type_display: string;
  assigned_to: number | null; // the follow-up's own staff, separate from the lead's
  assigned_to_name: string | null;
  due_date: string | null; // YYYY-MM-DD
  description: string; // notes
  status: FollowUpStatus; // Completed is final
  completion_note: string; // what was done, as noted when it was marked completed ("" if no note)
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  // What this user may do with it, as the API decides: edit (admins); delete; open its lead.
  can_edit: boolean;
  can_delete: boolean;
  can_open_lead: boolean;
  // Completing it: only the staff member it is assigned to, or an admin (the API refuses anyone else with 403).
  can_update_status: boolean;
};

// The API's refusal when someone else tries to complete an activity; shown as the reason on the disabled control too.
export const ACTIVITY_NOT_YOURS = "You can only update activities assigned to you.";
// Adding or editing a follow-up: everything but the status, which the API starts at Pending.
export type ActivityInput = { title: string; type: ActivityType; assigned_to: number; due_date: string; description: string };
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

// The page with the saved version of one of its rows: shows a change at once (useApi's replace) while the page reloads.
export const withRow = <T extends { id: number }>(page: Page<T>, saved: T): Page<T> => ({
  ...page,
  results: page.results.map((row) => (row.id === saved.id ? saved : row)),
});

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

// Creates the Work for a Won lead, once; the API refuses any other status and a second conversion (409), and never
// changes the lead's status: it stays Won.
export function convertLead(id: number) {
  return apiRequest<Lead>(`/leads/${id}/convert/`, { method: "POST" });
}

// Admins only (the Leads module doesn't give staff the delete permission). Its activities go with it.
export function deleteLead(id: number) {
  return apiRequest<void>(`/leads/${id}/`, { method: "DELETE" });
}

// The list's bulk actions, on the rows selected on one page. Each lead goes through the same rules as the single
// action (the pipeline, Won-only conversion once, delete with its Work kept), and the API answers which went through
// and which didn't and why (BulkResult in components/selection.tsx).
type BulkResult = { succeeded: number[]; failed: { id: number; name: string | null; reason: string }[] };

export function bulkChangeLeadStatus(ids: number[], status: LeadStatus) {
  return apiRequest<BulkResult>("/leads/bulk-status/", { method: "POST", json: { ids, status } });
}

export function bulkConvertLeads(ids: number[]) {
  return apiRequest<BulkResult>("/leads/bulk-convert/", { method: "POST", json: { ids } });
}

export function bulkDeleteLeads(ids: number[]) {
  return apiRequest<BulkResult>("/leads/bulk-delete/", { method: "POST", json: { ids } });
}

// No status is sent: the API starts every new follow-up as Pending.
export function addActivity(lead: number, input: ActivityInput) {
  return apiRequest<Activity>("/activities/", { method: "POST", json: { lead, ...input } });
}

export function updateActivity(id: number, changes: Partial<ActivityInput>) {
  return apiRequest<Activity>(`/activities/${id}/`, { method: "PATCH", json: changes });
}

// Marks a pending activity completed (a lead's follow-up, or a Work's with T = WorkActivity), with an optional note on
// what was done, and answers the saved activity. Its assignee or an admin, and only once: the API refuses a second time.
export function completeActivity<T = Activity>(id: number, completionNote: string) {
  return apiRequest<T>(`/activities/${id}/complete/`, { method: "POST", json: { completion_note: completionNote } });
}

export function deleteActivity(id: number) {
  return apiRequest<void>(`/activities/${id}/`, { method: "DELETE" });
}

// Today in the CRM's time zone (Asia/Kolkata), as YYYY-MM-DD.
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

// A Pending follow-up whose day has passed.
export const isOverdue = (activity: Pick<Activity, "status" | "due_date">) =>
  activity.status === "PENDING" && activity.due_date !== null && activity.due_date < today();

export function exportLeads(query: URLSearchParams) {
  return apiDownload(query.toString() ? `/leads/export/?${query}` : "/leads/export/", `leads-${today()}.csv`);
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
  if (lead.work) return `Already converted to Work #${lead.work}.`;
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
