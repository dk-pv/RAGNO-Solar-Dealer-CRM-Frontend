import { apiRequest } from "@/lib/api";

// The Work Pipeline, in order. Values and labels must match the backend's WorkStage choices.
// The classes use the stage colour tokens in globals.css: a dot, and the column header's background and text.
export const WORK_STAGES = [
  { value: "LOAN_DOCUMENTS", label: "Loan Work / Documents", dot: "bg-stage-loan", header: "bg-stage-loan-soft text-stage-loan-text" },
  {
    value: "FEASIBILITY",
    label: "Feasibility",
    dot: "bg-stage-feasibility",
    header: "bg-stage-feasibility-soft text-stage-feasibility-text",
  },
  {
    value: "STRUCTURE",
    label: "Structure Work",
    dot: "bg-stage-structure",
    header: "bg-stage-structure-soft text-stage-structure-text",
  },
  {
    value: "ELECTRICAL",
    label: "Electrical Work",
    dot: "bg-stage-electrical",
    header: "bg-stage-electrical-soft text-stage-electrical-text",
  },
  { value: "KSEB_DOCUMENTATION", label: "KSEB Documentation", dot: "bg-stage-kseb", header: "bg-stage-kseb-soft text-stage-kseb-text" },
  {
    value: "SUBSIDY_DOCUMENTATION",
    label: "Subsidy Documentation",
    dot: "bg-stage-subsidy",
    header: "bg-stage-subsidy-soft text-stage-subsidy-text",
  },
  {
    value: "COMPLETED",
    label: "Completed",
    dot: "bg-stage-completed",
    header: "bg-stage-completed-soft text-stage-completed-text",
  },
] as const;
export type WorkStage = (typeof WORK_STAGES)[number]["value"];

// GET /api/works/ (paginated) and PATCH /api/works/{id}/. The customer, plan and amount were copied from the lead when
// it was converted; `amount` is the confirmed price and never follows later plan price changes.
export type Work = {
  id: number;
  lead: number;
  customer_name: string;
  country_code: string;
  phone: string;
  email: string;
  state: string;
  district: string;
  area: string;
  pin_code: string;
  plan: number;
  plan_name: string;
  amount: string;
  stage: WorkStage;
  assigned_to: number | null;
  assigned_to_name: string | null;
  due_date: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
};

// GET /api/works/summary/: every stage with its number of Works and their total confirmed amount.
export type StageSummary = { stage: WorkStage; label: string; count: number; total_amount: string };

// Only the pipeline fields change; the backend accepts any stage, in either direction, and validates it.
export type WorkChanges = Partial<Pick<Work, "stage" | "assigned_to" | "due_date">>;

export function updateWork(id: number, changes: WorkChanges) {
  return apiRequest<Work>(`/works/${id}/`, { method: "PATCH", json: changes });
}

export const stageFor = (value: WorkStage) => WORK_STAGES.find((stage) => stage.value === value) ?? WORK_STAGES[0];
