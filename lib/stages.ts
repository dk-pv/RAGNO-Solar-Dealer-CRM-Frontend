import { useEffect, useSyncExternalStore } from "react";

import { apiRequest, toApiError, type ApiError } from "./api";

// The stages of the two pipelines, as the backend keeps them (GET /api/pipeline-stages/): the system stages and the ones
// admins add in Settings → Pipeline Stages, in the boards' order. A lead's status and a Work's stage are a stage's key;
// keys are unique across both pipelines, so a key alone names its stage.
export type Pipeline = "LEAD" | "WORK";

export type Stage = {
  id: number;
  pipeline: Pipeline;
  key: string;
  name: string;
  order: number;
  is_system: boolean; // never renamed, moved or deleted
  is_active: boolean;
  is_first: boolean; // where new records start (New, Loan Work / Documents)
  is_last: boolean; // always at the end: Won and Lost, or Completed
  record_count: number | null; // the leads or Works in it now: for admins only
};

// Shown until the first load answers, and if it fails: the system stages, so their names never flash as keys.
function systemStages(pipeline: Pipeline, stages: [string, string][], last: string[]): Stage[] {
  return stages.map(([key, name], order) => ({
    id: 0,
    pipeline,
    key,
    name,
    order,
    is_system: true,
    is_active: true,
    is_first: order === 0,
    is_last: last.includes(key),
    record_count: null,
  }));
}

const SYSTEM_STAGES = [
  ...systemStages(
    "LEAD",
    [
      ["NEW", "New"],
      ["INITIAL_CONTACT", "Initial Contact"],
      ["HOT", "Hot"],
      ["SUPERHOT", "Superhot"],
      ["WON", "Won"],
      ["LOST", "Lost"],
    ],
    ["WON", "LOST"],
  ),
  ...systemStages(
    "WORK",
    [
      ["LOAN_DOCUMENTS", "Loan Work / Documents"],
      ["FEASIBILITY", "Feasibility"],
      ["STRUCTURE", "Structure Work"],
      ["ELECTRICAL", "Electrical Work"],
      ["KSEB_DOCUMENTATION", "KSEB Documentation"],
      ["SUBSIDY_DOCUMENTATION", "Subsidy Documentation"],
      ["COMPLETED", "Completed"],
    ],
    ["COMPLETED"],
  ),
];

type Snapshot = { stages: Stage[]; loaded: boolean; error?: ApiError };

// One copy for the whole app, kept outside React so every screen (and plain helpers such as stageName) reads the same.
let snapshot: Snapshot = { stages: SYSTEM_STAGES, loaded: false };
let request: Promise<void> | undefined;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () => snapshot;

// Loads the stages once for the app; `fresh` asks again (a newer request wins over an older one still on its way).
export function loadStages(fresh = false) {
  if (request && !fresh) return request;
  const current: Promise<void> = apiRequest<Stage[]>("/pipeline-stages/").then(
    (stages) => {
      if (request === current) publish({ stages, loaded: true });
    },
    (error: unknown) => {
      if (request !== current) return;
      request = undefined; // the next screen to ask tries again
      publish({ ...snapshot, error: toApiError(error) });
    },
  );
  request = current;
  return current;
}

// One pipeline's stages as Settings' change answered them, shown everywhere without another request.
export function setStages(pipeline: Pipeline, stages: Stage[]) {
  const others = snapshot.stages.filter((stage) => stage.pipeline !== pipeline);
  publish({ stages: pipeline === "LEAD" ? [...stages, ...others] : [...others, ...stages], loaded: true });
}

// One stage as a rename answered it.
export function replaceStage(saved: Stage) {
  publish({ ...snapshot, stages: snapshot.stages.map((stage) => (stage.id === saved.id ? saved : stage)) });
}

// A pipeline's stages, in order. `fresh` reloads them when the component mounts: the boards and Settings, where a stage
// another admin added since the app loaded should show.
export function useStages(pipeline: Pipeline, { fresh = false } = {}) {
  const current = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    loadStages(fresh);
  }, [fresh]);
  return {
    stages: current.stages.filter((stage) => stage.pipeline === pipeline),
    loaded: current.loaded,
    error: current.error,
    reload: () => loadStages(true),
  };
}

// For the app shell: true once the stages have loaded, or failed to (the system stages then stand in), so pages render
// with every stage's name.
export function useStagesReady(enabled: boolean) {
  const current = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (enabled) loadStages();
  }, [enabled]);
  return current.loaded || current.error !== undefined;
}

// A stage's name, from its key; the key itself for a stage that isn't known (deleted since the page loaded).
export const stageName = (key: string) => snapshot.stages.find((stage) => stage.key === key)?.name ?? key;
