import type { CalendarDate } from "@/features/tasks/due-dates";

import type { WhoseMove } from "./stage-checklist";

/**
 * "Needs action" on the overview (task 124): active projects whose move is ours (Ready for next stage included)
 * or the customer's and that have waited more than 7 days (`isLongWait`), counted from the later of the current
 * stage's start and the latest tick among its items (ADR-0014), longest first, at most 10 per group.
 */

/** At most this many projects per group; the rest are on the board. */
export const NEEDS_ACTION_LIMIT = 10;

export const NEEDS_ACTION_GROUPS = ["our_move", "waiting_for_customer"] as const;

export type NeedsActionGroup = (typeof NEEDS_ACTION_GROUPS)[number];

/**
 * The day the wait started: the later of `stageStart` and the latest tick among `stage`'s items, UTC. Other
 * stages' ticks don't count.
 */
export function waitingSince(
  _stage: string,
  _stageStart: CalendarDate,
  _ticks: readonly { item: string; tickedAt: Date }[],
): CalendarDate {
  throw new Error("not implemented");
}

type NeedsActionProject = { id: string; name: string; stage: string; lifecycle: string; createdAt: Date };

export type NeedsActionEntry<T> = T & { move: WhoseMove; days: number };

/**
 * The two groups, Our move first, from the listed projects, their ticks and latest stage changes; `more` when a
 * group had more than `NEEDS_ACTION_LIMIT`.
 */
export function needsAction<T extends NeedsActionProject>(
  _projects: readonly T[],
  _ticks: readonly { projectId: string; item: string; tickedAt: Date }[],
  _changedAt: ReadonlyMap<string, Date>,
  _today: CalendarDate,
): { group: NeedsActionGroup; projects: NeedsActionEntry<T>[]; more: boolean }[] {
  throw new Error("not implemented");
}
