"use client";

import { useContext, useId, useState } from "react";

import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { ErrorState, destructiveButton, inputClass, secondaryButton, useNotice } from "@/components/leads/ui";
import { ActionDialog } from "@/components/selection";
import { apiRequest, useApi } from "@/lib/api";

// GET /api/maintenance/reset-crm-data/ (admins only): what a reset would delete, and the phrase that confirms it.
type ResetPreview = {
  counts: { leads: number; works: number; activities: number; notifications: number };
  confirmation: string;
};
// POST, with {confirm: <the phrase>}: what was deleted.
type ResetResult = { deleted: ResetPreview["counts"] };

const RECORDS: [keyof ResetPreview["counts"], string][] = [
  ["leads", "Leads"],
  ["works", "Works"],
  ["activities", "Activities"],
  ["notifications", "Notifications"],
];

// Settings → Data: the CRM's record counts and the admin-only reset that clears them. Users, roles, departments and
// plans are never touched by it; the API refuses anyone but an admin.
export function DataPage() {
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  const preview = useApi<ResetPreview>(isAdmin ? "/maintenance/reset-crm-data/" : null);
  const [confirming, setConfirming] = useState(false);
  const [noticeElement, notify] = useNotice();

  // The API refuses the reset to anyone else; this only avoids a request that can't succeed.
  if (!isAdmin) {
    return <ErrorState title="Only admins can manage data" message="Ask an admin if the CRM's data needs to be reset." />;
  }

  return (
    <div>
      <h2 className="text-base font-semibold">Data</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">The CRM&apos;s records, and the reset that clears them for a clean start.</p>

      <section className="mt-4 rounded-lg border border-border bg-background p-5">
        <h3 className="text-sm font-semibold">CRM records</h3>
        {preview.error ? (
          <p role="alert" className="mt-2 flex flex-wrap items-center gap-3 text-sm text-error">
            {preview.error.message}
            <button type="button" onClick={preview.reload} className={secondaryButton}>
              Try again
            </button>
          </p>
        ) : (
          <dl aria-busy={preview.loading} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RECORDS.map(([key, label]) => (
              <div key={key} className="rounded-md bg-page px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                  {preview.data ? (
                    preview.data.counts[key].toLocaleString("en-IN")
                  ) : (
                    <span aria-hidden="true" className="my-1.5 block h-4 w-10 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-error-border bg-background p-5">
        <h3 className="text-sm font-semibold text-error">Reset CRM data</h3>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Deletes every lead, Work (with its documents), activity and notification, so the CRM starts with clean data. It
          keeps every user and their password, the roles and their module access, departments, and the solar plans with
          their prices: everyone can still sign in afterwards. This can&apos;t be undone.
        </p>
        <button type="button" onClick={() => setConfirming(true)} disabled={!preview.data} className={`${destructiveButton} mt-4`}>
          Reset CRM data
        </button>
      </section>

      {confirming && preview.data && (
        <ResetDialog
          preview={preview.data}
          onClose={() => setConfirming(false)}
          onError={(text) => notify({ text, error: true })}
          onDone={({ leads, works, activities }) => {
            notify({
              text: `CRM data reset: ${leads} leads, ${works} works and ${activities} activities were removed. Users and settings were kept.`,
            });
            preview.reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type ResetDialogProps = {
  preview: ResetPreview;
  onClose: () => void;
  onDone: (deleted: ResetResult["deleted"]) => void;
  onError: (message: string) => void;
};

// The confirmation types the phrase, so a slip can't clear the CRM. The API asks for the same phrase again. Typing it in
// any case counts (phone keyboards capitalise as they like); the API gets the phrase as it expects it.
function ResetDialog({ preview, onClose, onDone, onError }: ResetDialogProps) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const { counts, confirmation } = preview;
  const matches = typed.trim().toUpperCase() === confirmation;

  return (
    <ActionDialog
      destructive
      title="Reset all CRM data?"
      description={
        <>
          This permanently deletes{" "}
          <strong className="text-foreground">
            {counts.leads} leads, {counts.works} works, {counts.activities} activities and {counts.notifications} notifications
          </strong>
          , with every Work&apos;s documents. Users, roles, departments and plans are kept.
        </>
      }
      confirmLabel="Reset CRM data"
      pendingLabel="Resetting…"
      disabled={!matches}
      onConfirm={async () => {
        const result = await apiRequest<ResetResult>("/maintenance/reset-crm-data/", { method: "POST", json: { confirm: confirmation } });
        onDone(result.deleted);
      }}
      onClose={onClose}
      onError={onError}
    >
      <label htmlFor={inputId} className="mt-4 mb-1.5 block text-sm font-medium text-label">
        Type <span className="font-mono text-foreground">{confirmation}</span> to confirm
      </label>
      <input
        id={inputId}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-describedby={`${inputId}-hint`}
        className={inputClass}
      />
      <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted-foreground">
        The button enables once the phrase matches.
      </p>
    </ActionDialog>
  );
}
