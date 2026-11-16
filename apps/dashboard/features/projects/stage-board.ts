import { type CalendarDate, todayUtc } from "@/features/tasks/due-dates";

import { PROJECT_STAGES, projectStage, STAGE_PHASES } from "./project-stage";
import { type WhoseMove, whoseMove } from "./stage-checklist";

/**
 * The stage board (task 123): All projects with a column per stage under its phase, each card saying whose move
 * it is (ADR-0014) and how long the project has been at its stage, the longest first.
 */

/** More days than this at one stage is a long wait (fixed, task 123). */
export const LONG_WAIT_DAYS = 7;

/** The day the current stage started: its latest change, or the project's creation without one (task 101). */
export function stageSince(changedAt: Date | null, createdAt: Date): CalendarDate {
  return todayUtc(changedAt ?? createdAt);
}

/** Whole calendar days from `since` to `today` (both "YYYY-MM-DD", UTC), never below 0. */
export function daysInStage(since: CalendarDate, today: CalendarDate): number {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
  return Math.max(0, Math.round(days));
}

export function isLongWait(days: number): boolean {
  return days > LONG_WAIT_DAYS;
}

/** Whose move it is on each project, from the ticks of all the listed projects (one query, grouped here). */
export function movesByProject(
  projects: readonly { id: string; stage: string }[],
  ticks: readonly { projectId: string; item: string }[],
): Map<string, WhoseMove> {
  const done = new Map<string, string[]>();
  for (const tick of ticks) {
    const items = done.get(tick.projectId);
    if (items) items.push(tick.item);
    else done.set(tick.projectId, [tick.item]);
  }
  return new Map(projects.map((p) => [p.id, whoseMove(p.stage, done.get(p.id) ?? [])]));
}

const stageLabelKey = (stage: string) => PROJECT_STAGES.find((s) => s.stage === stage)!.labelKey;

/**
 * The board's phases and columns, every stage's (empty ones too), with each column's projects the longest in the
 * stage first (`days`), then by name; an unknown stored stage counts as Inquiry. Keys are message keys in
 * `projectStage`.
 */
export function boardPhases<T extends { name: string; stage: string; days: number }>(projects: readonly T[]) {
  return STAGE_PHASES.map(({ phase, labelKey, stages }) => ({
    phase,
    labelKey,
    columns: stages.map((stage) => ({
      stage,
      labelKey: stageLabelKey(stage),
      projects: projects.filter((p) => projectStage(p.stage) === stage).sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)),
    })),
  }));
}
