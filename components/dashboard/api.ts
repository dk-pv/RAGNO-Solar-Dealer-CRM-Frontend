import type { LeadStatus } from "@/components/leads/api";
import type { ActivityStatus, WorkStage } from "@/components/works/api";

// The Dashboard API (apps/dashboard). Every section the user has no module for is null, never zero.

export type FollowUpCounts = { pending: number; overdue: number; today: number; upcoming: number };
// Work follow-ups are pending Work activities; lead follow-ups are the next follow-up date scheduled on open leads.
export type FollowUpTotals = { total: FollowUpCounts; works: FollowUpCounts | null; leads: FollowUpCounts | null };

// GET /api/dashboard/summary/
export type DashboardSummary = {
  today: string; // YYYY-MM-DD in Asia/Kolkata
  leads: {
    total: number;
    active: number; // New to Superhot
    confirmed: number; // Won
    lost: number;
    by_status: { status: LeadStatus; label: string; count: number }[];
  } | null;
  works: { total: number; active: number; completed: number } | null;
  follow_ups: FollowUpTotals;
  // The signed-in user's own: open leads and active Works assigned to them, and follow-ups assigned to them.
  mine: { leads: number | null; works: number | null; follow_ups: FollowUpTotals };
};

export const FOLLOW_UP_BUCKETS = [
  { value: "overdue", label: "Overdue", empty: "No overdue follow-ups" },
  { value: "today", label: "Due today", empty: "No follow-ups due today" },
  { value: "upcoming", label: "Upcoming", empty: "No upcoming follow-ups" },
  { value: "pending", label: "All pending", empty: "No pending follow-ups" },
  { value: "completed", label: "Completed", empty: "No completed follow-ups yet" },
] as const;
export type FollowUpBucket = (typeof FOLLOW_UP_BUCKETS)[number]["value"];

// GET /api/dashboard/follow-ups/?bucket=&mine=&limit=: `count` is the whole group, `results` its first items.
export type FollowUp = {
  key: string;
  source: "work" | "lead";
  activity: number | null;
  lead: number | null;
  work: number | null;
  title: string; // the activity type, or "Next follow-up" for a lead
  description: string;
  customer_name: string;
  assigned_to_name: string | null;
  due_date: string | null;
  status: ActivityStatus;
  created_at: string | null; // null for a lead's follow-up date: when it was scheduled isn't recorded
  created_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
};

export type LatestActivity = { type_display: string; at: string } | null;

export type LeadSummary = {
  id: number;
  customer_name: string;
  status: LeadStatus;
  status_display: string;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  latest_activity: LatestActivity; // null: no activity yet
};

export type WorkSummary = {
  id: number;
  lead: number;
  customer_name: string;
  stage: WorkStage;
  stage_display: string;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  latest_activity: LatestActivity;
};

// GET /api/dashboard/recent/
export type RecentRecords = { leads: LeadSummary[] | null; works: WorkSummary[] | null };

// GET /api/dashboard/timeline/ (paginated, newest first)
export type TimelineEvent = {
  key: string;
  kind: "lead_created" | "work_created" | "activity_added" | "activity_completed";
  at: string; // the exact moment stored on the record
  user: { id: number; name: string | null } | null;
  lead: LeadSummary | null; // lead events and a lead's activities
  work: WorkSummary | null; // Work events and a Work's activities
  activity: { id: number; type: string; type_display: string; description: string; status: ActivityStatus; due_date: string | null } | null;
};

const ZONE = "Asia/Kolkata";
const timeFormat = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: ZONE });
const exactFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "medium", timeZone: ZONE });
const shortDateTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ZONE });
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE });
const dayHeading = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: ZONE });

export const formatTime = (value: string) => timeFormat.format(new Date(value));
// The full moment, seconds included, for a title or screen readers.
export const formatExact = (value: string) => exactFormat.format(new Date(value));
export const formatShortDateTime = (value: string) => shortDateTime.format(new Date(value));
// YYYY-MM-DD of a moment in the CRM's time zone.
export const dayOf = (value: Date | string) => dayKeyFormat.format(typeof value === "string" ? new Date(value) : value);
export const formatDayHeading = (day: string) => dayHeading.format(new Date(`${day}T12:00:00+05:30`));

// A calendar day `offset` days from `day` (both YYYY-MM-DD).
export function shiftDay(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
