import { dayOf, shiftDay, type LatestActivity } from "@/components/dashboard/api";
import type { LeadStatus } from "@/components/leads/api";
import type { ActivityStatus, WorkStage } from "@/components/works/api";

// The Reports API (apps/reports). Periods are calendar days in Asia/Kolkata, both ends included; the server filters.

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];
export const DEFAULT_PERIOD: Period = "this_month";

const firstOfMonth = (day: string, monthsBack = 0) => {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  return date.toISOString().slice(0, 10);
};

// The days a period covers. Weeks start on Monday; "Last 3 months" is this month and the two before it.
export function periodDates(period: Period, custom: { from: string; to: string }, today = dayOf(new Date())) {
  const monday = shiftDay(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: shiftDay(today, -1), to: shiftDay(today, -1) };
    case "this_week":
      return { from: monday, to: today };
    case "last_week":
      return { from: shiftDay(monday, -7), to: shiftDay(monday, -1) };
    case "this_month":
      return { from: firstOfMonth(today), to: today };
    case "last_month":
      return { from: firstOfMonth(today, 1), to: shiftDay(firstOfMonth(today), -1) };
    case "last_3_months":
      return { from: firstOfMonth(today, 2), to: today };
    case "last_6_months":
      return { from: firstOfMonth(today, 5), to: today };
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return custom;
  }
}

// The last day of a trend point that starts on `start`.
export function pointEnd(unit: TrendUnit, start: string) {
  if (unit === "day") return start;
  if (unit === "week") return shiftDay(start, 6);
  return shiftDay(firstOfMonth(shiftDay(start, 40)), -1);
}

export type TrendUnit = "day" | "week" | "month";
export type Trend<K extends string> = { unit: TrendUnit; points: ({ start: string } & Record<K, number>)[] };
export type Choice<V extends string = string> = { value: V; label: string; count: number };
export type StaffCount = { id: number | null; name: string | null; count: number };
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

// GET /api/reports/leads/summary/ and /api/reports/leads/ (rows; ?export=csv|xlsx)
export type LeadReportSummary = {
  totals: { created: number; open: number; confirmed: number; lost: number };
  by_status: Choice<LeadStatus>[];
  by_source: Choice[];
  by_staff: (StaffCount & { open: number; confirmed: number })[];
  trend: Trend<"created">;
};
export type LeadReportRow = {
  id: number;
  customer_name: string;
  status: LeadStatus;
  status_display: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  source: string;
  source_display: string;
  plan_name: string;
  amount: string;
  created_at: string;
  updated_at: string;
  latest_activity: LatestActivity;
};

// GET /api/reports/works/summary/ and /api/reports/works/. Amounts are each Work's confirmed amount, fixed at conversion.
export type WorkReportSummary = {
  totals: { created: number; amount: string; completed: number; completed_amount: string };
  by_stage: (Choice<WorkStage> & { amount: string })[];
  by_staff: (StaffCount & { amount: string; completed: number })[];
  trend: { unit: TrendUnit; points: { start: string; created: number; created_value: string }[] };
};
export type WorkReportRow = {
  id: number;
  lead: number;
  customer_name: string;
  stage: WorkStage;
  stage_display: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  plan_name: string;
  amount: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  latest_activity: LatestActivity;
};

// GET /api/reports/activities/summary/ and /api/reports/activities/. Pending, completed and overdue are a Work's
// follow-ups: a lead's activities are its log and have no status (null).
type FollowUpCounts = { pending: number; completed: number; overdue: number };
export type ActivityReportSummary = {
  totals: { total: number; on_leads: number; on_works: number; due_in_period: number; completed_in_period: number } & FollowUpCounts;
  by_staff: (StaffCount & FollowUpCounts)[];
  by_type: Choice[];
  by_record: ({ lead: number | null; work: number | null; count: number; customer_name: string | null } & FollowUpCounts)[];
  trend: Trend<"created" | "completed">;
};
export type ActivityReportRow = {
  id: number;
  type: string;
  type_display: string;
  description: string;
  lead: number | null;
  work: number | null;
  customer_name: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  due_date: string | null;
  status: ActivityStatus | null;
  overdue: boolean;
  created_at: string;
  created_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
};

// GET /api/reports/staff/: per user, for the period. Facts only, listed by name.
export const STAFF_COLUMNS = [
  { key: "leads_assigned", label: "Leads assigned" },
  { key: "works_assigned", label: "Works assigned" },
  { key: "activities_assigned", label: "Activities assigned" },
  { key: "pending", label: "Pending follow-ups" },
  { key: "completed", label: "Completed follow-ups" },
  { key: "overdue", label: "Overdue follow-ups" },
  { key: "leads_added", label: "Leads added" },
  { key: "works_converted", label: "Converted to Works" },
  { key: "activities_added", label: "Activities added" },
  { key: "follow_ups_completed", label: "Follow-ups completed" },
] as const;
export type StaffColumn = (typeof STAFF_COLUMNS)[number]["key"];
export type StaffReportRow = { user: { id: number; name: string; is_active: boolean } | null } & Record<StaffColumn, number>;

export const EVENT_KINDS = [
  { value: "lead_created", label: "Lead added" },
  { value: "work_created", label: "Lead converted to Work" },
  { value: "activity_added", label: "Activity added" },
  { value: "activity_completed", label: "Activity completed" },
] as const;
