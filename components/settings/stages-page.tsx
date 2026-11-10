"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";

import { ChevronLeftIcon, PlusIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { Field, FormDialog } from "@/components/leads/lead-dialogs";
import { ErrorState, ghostButton, ghostDangerButton, iconButton, inputClass, primaryButton, tableBoxClass, useNotice } from "@/components/leads/ui";
import { ActionDialog } from "@/components/selection";
import { ApiError, apiRequest, toApiError } from "@/lib/api";
import { loadStages, replaceStage, setStages, useStages, type Pipeline, type Stage } from "@/lib/stages";
import { badgeClass, inactiveBadge } from "./users-page";

const PIPELINES: { pipeline: Pipeline; title: string; note: string; noun: [string, string] }[] = [
  {
    pipeline: "LEAD",
    title: "Lead Pipeline",
    note: "New is always first. Won and Lost are the final outcomes and always last: only Won leads are converted to Works, and only when someone converts them.",
    noun: ["lead", "leads"],
  },
  {
    pipeline: "WORK",
    title: "Work Pipeline",
    note: "Every new Work starts in Loan Work / Documents, and Completed is always last.",
    noun: ["Work", "Works"],
  },
];

const customBadge = "bg-info-soft text-info ring-info-border";

// Settings → Pipeline Stages (admins): both pipelines' stages, in the boards' order. Admins add stages of their own,
// rename and reorder them, and delete one once its records have gone to another stage of the same pipeline. The system
// stages, which the CRM's rules name, are listed but never change. The API checks everything again and refuses anyone
// but an admin.
export function StagesPage() {
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  // Read again on opening, with each stage's number of records (sent to admins only).
  const leads = useStages("LEAD", { fresh: true });
  const works = useStages("WORK");
  const [dialog, setDialog] = useState<{ mode: "add" | "rename" | "delete"; pipeline: Pipeline; stage?: Stage }>();
  const [moving, setMoving] = useState<number>();
  const [noticeElement, notify] = useNotice();

  if (!isAdmin) {
    return <ErrorState title="Only admins can manage pipeline stages" message="Ask an admin if a stage needs to change." />;
  }

  async function move(stage: Stage, direction: "up" | "down") {
    if (moving !== undefined) return;
    setMoving(stage.id);
    try {
      const stages = await apiRequest<Stage[]>(`/pipeline-stages/${stage.id}/move/`, { method: "POST", json: { direction } });
      setStages(stage.pipeline, stages);
      notify({ text: `Moved ${stage.name} ${direction === "up" ? "earlier" : "later"}.` });
    } catch (error) {
      const apiError = toApiError(error);
      notify({ text: `Couldn't move ${stage.name}. ${apiError.fields.direction ?? apiError.message}`, error: true });
    } finally {
      setMoving(undefined);
    }
  }

  const stagesOf = (pipeline: Pipeline) => (pipeline === "LEAD" ? leads.stages : works.stages);
  const current = dialog?.stage;

  return (
    <div>
      <div className="max-w-3xl">
        <h2 className="text-base font-semibold">Pipeline Stages</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The stages of the Lead and Work Pipelines, in the order the boards show them. Add stages of your own between the
          fixed ones; the system stages can&apos;t be renamed, moved or deleted. A stage with leads or Works in it is
          deleted only after they move to another stage.
        </p>
      </div>

      {!leads.loaded && leads.error ? (
        <div className="mt-4 rounded-lg border border-border bg-background">
          <ErrorState title="Couldn't load the stages" message={leads.error.message} onRetry={leads.reload} />
        </div>
      ) : (
        PIPELINES.map((section) => (
          <PipelineSection
            key={section.pipeline}
            {...section}
            stages={stagesOf(section.pipeline)}
            loaded={leads.loaded}
            moving={moving}
            onAdd={() => setDialog({ mode: "add", pipeline: section.pipeline })}
            onRename={(stage) => setDialog({ mode: "rename", pipeline: section.pipeline, stage })}
            onDelete={(stage) => setDialog({ mode: "delete", pipeline: section.pipeline, stage })}
            onMove={move}
          />
        ))
      )}

      {(dialog?.mode === "add" || dialog?.mode === "rename") && (
        <StageNameDialog
          pipeline={dialog.pipeline}
          stage={current}
          onClose={() => setDialog(undefined)}
          onSaved={(name) =>
            notify({ text: current ? `Renamed ${current.name} to ${name}.` : `Added ${name} to the ${titleOf(dialog.pipeline)}.` })
          }
        />
      )}
      {dialog?.mode === "delete" && current && (
        <DeleteStageDialog
          stage={current}
          stages={stagesOf(dialog.pipeline)}
          noun={nounOf(dialog.pipeline)}
          onClose={() => setDialog(undefined)}
          onDeleted={(text) => notify({ text })}
          onError={(text) => notify({ text, error: true })}
        />
      )}
      {noticeElement}
    </div>
  );
}

const titleOf = (pipeline: Pipeline) => PIPELINES.find((section) => section.pipeline === pipeline)!.title;
const nounOf = (pipeline: Pipeline) => PIPELINES.find((section) => section.pipeline === pipeline)!.noun;

type PipelineSectionProps = {
  pipeline: Pipeline;
  title: string;
  note: string;
  noun: [string, string];
  stages: Stage[];
  loaded: boolean;
  moving?: number;
  onAdd: () => void;
  onRename: (stage: Stage) => void;
  onDelete: (stage: Stage) => void;
  onMove: (stage: Stage, direction: "up" | "down") => void;
};

function PipelineSection({ pipeline, title, note, noun, stages, loaded, moving, onAdd, onRename, onDelete, onMove }: PipelineSectionProps) {
  const headingId = `stages-${pipeline}`;
  const countLabel = noun[1][0].toUpperCase() + noun[1].slice(1); // "Leads", "Works"
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h3 id={headingId} className="text-sm font-semibold">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{note}</p>
        </div>
        <button type="button" onClick={onAdd} className={`${primaryButton} ml-auto`}>
          <PlusIcon className="size-4" />
          Add stage
          <span className="sr-only"> to the {title}</span>
        </button>
      </div>
      <div className={`${tableBoxClass} relative mt-3`}>
        {/* From lg, fixed column widths, so the Lead and Work tables, one above the other, line up; the stage name takes the
            rest. Narrower windows keep sizing the columns by their content, so the name never gets squeezed. */}
        <table aria-busy={!loaded} data-stack className="w-full min-w-160 text-sm lg:table-fixed">
          <caption className="sr-only">{title} stages</caption>
          <thead>
            <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
              <th scope="col" className="w-12 px-3 py-2.5">
                #
              </th>
              <th scope="col" className="px-3 py-2.5">
                Stage
              </th>
              <th scope="col" className="px-3 py-2.5 lg:w-36">
                Type
              </th>
              <th scope="col" className="px-3 py-2.5 text-right lg:w-20">
                {countLabel}
              </th>
              <th scope="col" className="px-3 py-2.5 lg:w-60">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage, index) => {
              const fixedBefore = index === 0 || stages[index - 1].is_first;
              const fixedAfter = index === stages.length - 1 || stages[index + 1].is_last;
              const busy = moving !== undefined;
              return (
                <tr key={stage.key} className="border-b border-border last:border-0 hover:bg-row-hover">
                  <td data-label="Position" className="px-3 py-2.5 text-muted-foreground tabular-nums">
                    {index + 1}
                  </td>
                  <th scope="row" data-slot="title" className="px-3 py-2.5 text-left font-medium">
                    <span className="block max-w-[max(16rem,20cqw)] truncate" title={stage.name}>
                      {stage.name}
                    </span>
                  </th>
                  <td data-label="Type" className="px-3 py-2.5">
                    <span className={`${badgeClass} ${stage.is_system ? inactiveBadge : customBadge}`}>
                      {stage.is_system ? (stage.is_last && pipeline === "LEAD" ? "System · outcome" : "System") : "Custom"}
                    </span>
                  </td>
                  <td data-label={countLabel} className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {stage.record_count ?? "–"}
                  </td>
                  <td data-slot="actions" className="px-2 py-1.5 text-right whitespace-nowrap text-label">
                    {stage.is_system ? (
                      <span className="px-2 text-xs text-muted-foreground">Can&apos;t be changed</span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onMove(stage, "up")}
                          disabled={fixedBefore}
                          aria-disabled={busy || undefined}
                          aria-label={`Move ${stage.name} earlier`}
                          title={fixedBefore ? `${stages[0].name} is always first` : "Move earlier"}
                          className={`${iconButton} size-8`}
                        >
                          <ChevronLeftIcon className="size-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMove(stage, "down")}
                          disabled={fixedAfter}
                          aria-disabled={busy || undefined}
                          aria-label={`Move ${stage.name} later`}
                          title={fixedAfter ? "The last stages stay last" : "Move later"}
                          className={`${iconButton} size-8`}
                        >
                          <ChevronLeftIcon className="size-4 -rotate-90" />
                        </button>
                        <button type="button" onClick={() => onRename(stage)} aria-label={`Rename ${stage.name}`} className={ghostButton}>
                          Rename
                        </button>
                        <button type="button" onClick={() => onDelete(stage)} aria-label={`Delete ${stage.name}`} className={ghostDangerButton}>
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type StageNameDialogProps = { pipeline: Pipeline; stage?: Stage; onClose: () => void; onSaved: (name: string) => void };

// Add stage (stage undefined) and Rename share this form. A new stage goes just before the last ones (Won, or Completed);
// move it from the list.
function StageNameDialog({ pipeline, stage, onClose, onSaved }: StageNameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [name, setName] = useState(stage?.name ?? "");
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.getElementById(inputId)?.focus();
  }, [inputId]);

  async function submit() {
    const value = name.trim();
    if (!value) {
      setFieldError("Enter the stage name.");
      return;
    }
    setSaving(true);
    setFieldError(undefined);
    setFormError(undefined);
    try {
      if (stage) {
        replaceStage(await apiRequest<Stage>(`/pipeline-stages/${stage.id}/`, { method: "PATCH", json: { name: value } }));
      } else {
        setStages(pipeline, await apiRequest<Stage[]>("/pipeline-stages/", { method: "POST", json: { pipeline, name: value } }));
      }
      onSaved(value);
      dialogRef.current?.close();
    } catch (error) {
      const apiError = toApiError(error);
      setFieldError(apiError.fields.name);
      setFormError(apiError.fields.name ? undefined : apiError.message);
      setSaving(false);
    }
  }

  return (
    <FormDialog
      ref={dialogRef}
      title={stage ? "Rename stage" : `Add a stage to the ${titleOf(pipeline)}`}
      subtitle={stage ? `${stage.name} · ${titleOf(pipeline)}` : "It goes just before the last stages; move it from the list."}
      width="max-w-md"
      busy={saving}
      error={formError}
      submitLabel={stage ? "Save name" : "Add stage"}
      busyLabel="Saving…"
      onSubmit={submit}
      onClose={onClose}
    >
      <Field
        label="Stage name"
        id={inputId}
        required
        error={fieldError}
        hint={stage ? "Its leads or Works stay in it; only the name changes." : "Such as: Site Visit, Quotation Sent."}
      >
        <input
          id={inputId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          autoComplete="off"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${inputId}-error` : undefined}
          className={inputClass}
        />
      </Field>
    </FormDialog>
  );
}

type DeleteStageDialogProps = {
  stage: Stage;
  stages: Stage[];
  noun: [string, string];
  onClose: () => void;
  onDeleted: (text: string) => void;
  onError: (text: string) => void;
};

// Deleting a stage: straight away when it is empty; otherwise its records first go to the stage chosen here (another open
// stage of the same pipeline: never Won, Lost or Completed), in the same step on the server. If records arrived since the
// list loaded, the API refuses, the list reloads with their number, and the choice appears.
function DeleteStageDialog({ stage, stages, noun, onClose, onDeleted, onError }: DeleteStageDialogProps) {
  const selectId = useId();
  const [destination, setDestination] = useState("");
  // From the list (record counts are sent to admins), so a reload after a refusal updates it here.
  const count = stages.find((other) => other.key === stage.key)?.record_count ?? stage.record_count ?? 0;
  const options = stages.filter((other) => other.key !== stage.key && !other.is_last);
  const word = count === 1 ? noun[0] : noun[1];

  return (
    <ActionDialog
      destructive
      title={`Delete ${stage.name}?`}
      description={
        count === 0
          ? "The stage has no records, so nothing else changes. This can't be undone."
          : `${count} ${word} ${count === 1 ? "is" : "are"} in ${stage.name}. Choose where ${count === 1 ? "it goes" : "they go"}; then the stage is deleted. This can't be undone.`
      }
      confirmLabel={count === 0 ? "Delete stage" : "Move and delete"}
      pendingLabel="Deleting…"
      disabled={count > 0 && destination === ""}
      onConfirm={async () => {
        const target = options.find((other) => other.key === destination)?.name;
        const query = count > 0 ? `?move_to=${encodeURIComponent(destination)}` : "";
        try {
          setStages(stage.pipeline, await apiRequest<Stage[]>(`/pipeline-stages/${stage.id}/${query}`, { method: "DELETE" }));
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) loadStages(true);
          throw error;
        }
        onDeleted(`Deleted ${stage.name}.${count > 0 ? ` Its ${count} ${word} moved to ${target}.` : ""}`);
      }}
      onClose={onClose}
      onError={onError}
    >
      {count > 0 && (
        <>
          <label htmlFor={selectId} className="mt-4 mb-1.5 block text-sm font-medium text-label">
            Move them to
          </label>
          <select id={selectId} value={destination} onChange={(event) => setDestination(event.target.value)} className={inputClass}>
            <option value="">Choose a stage</option>
            {options.map((other) => (
              <option key={other.key} value={other.key}>
                {other.name}
              </option>
            ))}
          </select>
        </>
      )}
    </ActionDialog>
  );
}
