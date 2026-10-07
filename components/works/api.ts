import { apiRequest, apiUpload } from "@/lib/api";
import type { ActivityType } from "@/components/leads/api";

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
  is_pinned: boolean; // shared by the whole team: pinned Works are listed first
  // The Work's activities in brief; GET /api/activities/?work={id} has them all.
  activity_count: number;
  pending_activity_count: number;
  next_activity_due: string | null; // the earliest due date among the pending activities
  document_summary: DocumentSummary;
  created_at: string;
  updated_at: string;
};

// How complete a Work's required documents are, computed by the backend from its list of required documents.
export type DocumentSummary = {
  required_count: number;
  completed_count: number;
  missing_count: number;
  is_complete: boolean;
  missing_documents: string[]; // their names, in the Documents page's order
};

// GET /api/works/summary/: every stage with its number of Works and their total confirmed amount.
export type StageSummary = { stage: WorkStage; label: string; count: number; total_amount: string };

// The pipeline fields, the pin and the email change (the email is one of the required documents); the backend accepts
// any stage, in either direction, and validates everything.
export type WorkChanges = Partial<Pick<Work, "stage" | "assigned_to" | "due_date" | "is_pinned" | "email">>;

// GET /api/works/{id}/documents/: every document the Work needs, in groups, as the backend defines them. A file is
// uploaded for most; Email ID and Phone number are the Work's own email and phone.
export type DocumentChecklist = {
  work: Work;
  groups: { key: string; label: string; items: DocumentItem[] }[];
  max_file_size: number; // bytes
  can_delete: boolean; // deleting a document is for admins only
};

export type DocumentItem = {
  key: string;
  name: string;
  required: boolean;
  provided: boolean;
  kind: "file" | "field";
  field: "email" | "phone" | null; // for a "field" item: the Work field that holds it
  accept: string[]; // for a "file" item: the extensions an upload may have, such as ".pdf"
  document: UploadedDocument | null; // for a "file" item: the file uploaded for it, if any
};

// Where the file is stored never reaches the browser: it is shown and downloaded through documentFilePath.
export type UploadedDocument = {
  original_filename: string;
  content_type: string; // read by the backend from the file itself
  file_size: number; // bytes
  uploaded_at: string;
  uploaded_by_name: string | null;
};

// The document's file, sent by the backend after the same access check as the Work (apiBlob / apiDownload).
export const documentFilePath = (workId: number, key: string) => `/works/${workId}/documents/${key}/file/`;

// Uploads a document's file, or replaces the one there, reporting its progress (see apiUpload). Answers the updated
// checklist.
export function uploadWorkDocument(workId: number, key: string, file: File, options: Parameters<typeof apiUpload>[2]) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<DocumentChecklist>(`/works/${workId}/documents/${key}/`, form, options);
}

// Admins only: deletes a document's file. Answers the updated checklist.
export function deleteWorkDocument(workId: number, key: string) {
  return apiRequest<DocumentChecklist>(`/works/${workId}/documents/${key}/`, { method: "DELETE" });
}

// Must match the backend's Activity statuses.
export const ACTIVITY_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "COMPLETED", label: "Completed" },
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]["value"];

// GET /api/activities/?work={id} (paginated: pending first, the soonest due first, then completed, the latest first), and
// GET /api/activities/works/ (every Work's, each Work's together; needs the Activities module). Staff get only theirs.
// The same activity log as the leads', with a Work's activities linked to the Work. Admins add and edit them.
export type WorkActivity = {
  id: number;
  work: number;
  type: ActivityType;
  type_display: string;
  description: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  due_date: string | null; // YYYY-MM-DD
  status: ActivityStatus;
  completed_at: string | null;
  completed_by_name: string | null;
  completion_note: string; // what was done, as noted when it was marked completed ("" if no note)
  created_by_name: string | null;
  created_at: string;
  // The Work it belongs to, for tables that list several Works' activities.
  work_summary: Pick<Work, "id" | "customer_name" | "country_code" | "phone" | "plan_name" | "stage">;
  can_edit: boolean; // editing it (reassigning, reopening): admins
  // Completing it: only the staff member it is assigned to, or an admin (the API refuses anyone else).
  can_update_status: boolean;
};

export type WorkActivityInput = Pick<WorkActivity, "type" | "description" | "assigned_to" | "due_date" | "status">;

export function updateWork(id: number, changes: WorkChanges) {
  return apiRequest<Work>(`/works/${id}/`, { method: "PATCH", json: changes });
}

// The list's bulk actions on the selected rows (BulkResult in components/selection.tsx). Moving Works needs the Work
// module, as the row's stage control does; deleting them (with their activity history) is for admins only.
type BulkResult = { succeeded: number[]; failed: { id: number; name: string | null; reason: string }[] };

export function bulkChangeWorkStage(ids: number[], stage: WorkStage) {
  return apiRequest<BulkResult>("/works/bulk-stage/", { method: "POST", json: { ids, stage } });
}

export function bulkDeleteWorks(ids: number[]) {
  return apiRequest<BulkResult>("/works/bulk-delete/", { method: "POST", json: { ids } });
}

// Completing records when and by whom on the server; setting it back to Pending clears that.
export function saveWorkActivity(input: Partial<WorkActivityInput>, target: { id: number } | { work: number }) {
  return "id" in target
    ? apiRequest<WorkActivity>(`/activities/${target.id}/`, { method: "PATCH", json: input })
    : apiRequest<WorkActivity>("/activities/", { method: "POST", json: { ...input, work: target.work } });
}

// Today in the CRM's time zone (YYYY-MM-DD), to mark what is overdue.
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export const stageFor = (value: WorkStage) => WORK_STAGES.find((stage) => stage.value === value) ?? WORK_STAGES[0];
