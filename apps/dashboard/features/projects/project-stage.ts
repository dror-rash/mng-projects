/**
 * Where a job is in the flow (task 101, ADR-0012), set by hand on the project page by whoever can change the
 * project, forward or back; each change is a `project_stage_change` row. Apart from the lifecycle (canceling
 * keeps the stage) and from the status derived from the project's tasks. `labelKey` is a key in the
 * `projectStage` messages (ADR-0011): the caller translates it.
 */
export const PROJECT_STAGES = [
  { stage: "inquiry", labelKey: "inquiry" },
  { stage: "quote", labelKey: "quote" },
  { stage: "ordered", labelKey: "ordered" },
  { stage: "scheduled", labelKey: "scheduled" },
  { stage: "in_work", labelKey: "inWork" },
  { stage: "reporting", labelKey: "reporting" },
  { stage: "billing", labelKey: "billing" },
  { stage: "closed", labelKey: "closed" },
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number]["stage"];

export type ProjectStageLabelKey = (typeof PROJECT_STAGES)[number]["labelKey"];

/**
 * The stages under their phases (ADR-0014), in the flow's order: the stage bar (task 121) and the stage board
 * (task 123). `labelKey` is a key in the `projectStage.phase` messages: the caller translates it.
 */
export const STAGE_PHASES = [
  { phase: "sales", labelKey: "sales", stages: ["inquiry", "quote", "ordered"] },
  { phase: "work", labelKey: "work", stages: ["scheduled", "in_work"] },
  { phase: "closing", labelKey: "closing", stages: ["reporting", "billing", "closed"] },
] as const satisfies readonly { phase: string; labelKey: string; stages: readonly ProjectStage[] }[];

export type StagePhase = (typeof STAGE_PHASES)[number]["phase"];

/** Where new projects and copies start, and what an unknown stored value shows as. */
export const DEFAULT_STAGE: ProjectStage = "inquiry";

export function parseProjectStage(value: unknown): ProjectStage | null {
  return PROJECT_STAGES.find((s) => s.stage === value)?.stage ?? null;
}

/** A stored stage; an unknown value counts as Inquiry. */
export function projectStage(value: string): ProjectStage {
  return parseProjectStage(value) ?? DEFAULT_STAGE;
}

/** The message key for a stored stage (an unknown value shows as Inquiry). */
export function projectStageLabelKey(value: string): ProjectStageLabelKey {
  const stage = projectStage(value);
  return PROJECT_STAGES.find((s) => s.stage === stage)!.labelKey;
}

/** Where a stage sorts: its place in the flow. */
export function stageOrder(value: string): number {
  return PROJECT_STAGES.findIndex((s) => s.stage === projectStage(value));
}

export type StageChoice = { ok: true; value: ProjectStage | undefined } | { ok: false; field: "stage"; error: string };

/** The form's Stage select: undefined when the form has none, an error for an empty or unknown value. */
export function parseStageChoice(formData: FormData): StageChoice {
  const value = formData.get("stage");
  if (value === null) return { ok: true, value: undefined };
  const stage = parseProjectStage(value);
  return stage ? { ok: true, value: stage } : { ok: false, field: "stage", error: "Choose a stage" };
}
