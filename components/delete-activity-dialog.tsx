"use client";

import { deleteActivity } from "@/components/leads/api";
import { ActionDialog } from "@/components/selection";
import { toApiError } from "@/lib/api";

type DeleteActivityDialogProps = {
  activity: { id: number; type_display: string };
  /** What the row shows of it: a lead follow-up's heading, a Work activity's notes. */
  subject?: string;
  customer: string;
  /** The lead or Work it belongs to. */
  record: { label: "Lead" | "Work"; id: number };
  /** It is gone: take it off the list. */
  onDeleted: () => void;
  onClose: () => void;
  /** Deleting failed after the dialog had been closed (see ActionDialog). */
  onError: (message: string) => void;
};

// Delete, for admins: the one confirmation for a lead's follow-ups and a Work's activities on the Activities pages. It
// says what is deleted, and that it is for good. ActionDialog sends it once, can't be dismissed while it runs, and shows a
// refusal in place, leaving the list as it was.
export function DeleteActivityDialog({ activity, subject, customer, record, onDeleted, onClose, onError }: DeleteActivityDialogProps) {
  return (
    <ActionDialog
      destructive
      title="Delete this activity?"
      description={`It will be deleted permanently and can't be undone. ${record.label} #${record.id} and its other activities stay.`}
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      onConfirm={async () => {
        // Not found: someone has deleted it already, which is what was asked.
        await deleteActivity(activity.id).catch((error: unknown) => {
          if (toApiError(error).status !== 404) throw error;
        });
        onDeleted();
      }}
      onClose={onClose}
      onError={onError}
    >
      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-md bg-page px-4 py-3 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd className="font-medium">{activity.type_display}</dd>
        {subject && (
          <>
            <dt className="text-muted-foreground">{record.label === "Lead" ? "Heading" : "Notes"}</dt>
            <dd className="line-clamp-3 break-words">{subject}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Customer</dt>
        <dd className="break-words">{customer}</dd>
        <dt className="text-muted-foreground">{record.label}</dt>
        <dd className="tabular-nums">#{record.id}</dd>
      </dl>
    </ActionDialog>
  );
}
