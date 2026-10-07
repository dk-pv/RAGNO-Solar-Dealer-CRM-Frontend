"use client";

import { useId, useRef, useState } from "react";

import { completeActivity } from "@/components/leads/api";
import { inputClass } from "@/components/leads/ui";
import { ActionDialog } from "@/components/selection";
import { ApiError, toApiError } from "@/lib/api";

type CompleteActivityDialogProps<T> = {
  activity: T;
  /** The activity as its row names it: its heading or type, and the lead or customer. */
  label: string;
  /** The activity as the API saved it, completed. */
  onCompleted: (saved: T) => void;
  /** `completed`: it closed after completing the activity, so the button that opened it is gone. */
  onClose: (completed: boolean) => void;
  /** Completing failed after the dialog had been closed (see ActionDialog). */
  onError: (message: string) => void;
};

// Mark as Completed, with an optional note on what was done: the one dialog for a lead's follow-ups and a Work's
// activities, wherever they are listed. ActionDialog sends it once, can't be dismissed while it runs, and shows a refusal
// in place (someone else's activity, or one completed meanwhile).
export function CompleteActivityDialog<T extends { id: number }>({ activity, label, onCompleted, onClose, onError }: CompleteActivityDialogProps<T>) {
  const [note, setNote] = useState("");
  const noteId = useId();
  const completed = useRef(false);

  return (
    <ActionDialog
      title="Mark activity as completed"
      description={`${label} will be marked as completed.`}
      confirmLabel="Mark as Completed"
      pendingLabel="Completing…"
      onConfirm={async () => {
        const saved = await completeActivity<T>(activity.id, note.trim()).catch((error: unknown) => {
          const { message, status, fields } = toApiError(error);
          // A field's refusal (already completed, a note too long) in its own words, not "Some fields need attention."
          throw new ApiError(Object.values(fields).join(" ") || message, status);
        });
        completed.current = true;
        onCompleted(saved);
      }}
      onClose={() => onClose(completed.current)}
      onError={onError}
    >
      <label htmlFor={noteId} className="mt-4 mb-1.5 block text-sm font-medium text-label">
        Completion note <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Add a short note about what was completed..."
        className={`${inputClass} h-auto py-2`}
      />
    </ActionDialog>
  );
}
