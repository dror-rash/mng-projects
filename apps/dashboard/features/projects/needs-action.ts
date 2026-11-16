import { type CalendarDate, todayUtc } from "@/features/tasks/due-dates";

import { isCanceled } from "./project-lifecycle";
import { daysInStage, isLongWait, movesByProject, stageSince } from "./stage-board";
import { checklistFor, type WhoseMove } from "./stage-checklist";

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
  stage: string,
  stageStart: CalendarDate,
  ticks: readonly { item: string; tickedAt: Date }[],
): CalendarDate {
  const items = new Set<string>(checklistFor(stage).map((i) => i.key));
  return ticks
    .filter((t) => items.has(t.item))
    .map((t) => todayUtc(t.tickedAt))
    .reduce((latest, day) => (day > latest ? day : latest), stageStart);
}

type NeedsActionProject = { id: string; name: string; stage: string; lifecycle: string; createdAt: Date };

export type NeedsActionEntry<T> = T & { move: WhoseMove; days: number };

/**
 * The two groups, Our move first, from the listed projects, their ticks and latest stage changes; `more` when a
 * group had more than `NEEDS_ACTION_LIMIT`.
 */
export function needsAction<T extends NeedsActionProject>(
  projects: readonly T[],
  ticks: readonly { projectId: string; item: string; tickedAt: Date }[],
  changedAt: ReadonlyMap<string, Date>,
  today: CalendarDate,
): { group: NeedsActionGroup; projects: NeedsActionEntry<T>[]; more: boolean }[] {
  const active = projects.filter((p) => !isCanceled(p.lifecycle));
  const moves = movesByProject(active, ticks);
  const ticksOf = new Map<string, (typeof ticks)[number][]>();
  for (const t of ticks) ticksOf.set(t.projectId, [...(ticksOf.get(t.projectId) ?? []), t]);
  const entries = active
    .map((p) => {
      const since = waitingSince(p.stage, stageSince(changedAt.get(p.id) ?? null, p.createdAt), ticksOf.get(p.id) ?? []);
      return { ...p, move: moves.get(p.id)!, days: daysInStage(since, today) };
    })
    .filter((p) => isLongWait(p.days))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
  return NEEDS_ACTION_GROUPS.map((group) => {
    const listed = entries.filter((p) => groupOf(p.move) === group);
    return { group, projects: listed.slice(0, NEEDS_ACTION_LIMIT), more: listed.length > NEEDS_ACTION_LIMIT };
  });
}

/** The group of a move: Ready for next stage is ours too; a finished job is in none. */
function groupOf(move: WhoseMove): NeedsActionGroup | null {
  if (move === "our_move" || move === "ready") return "our_move";
  return move === "waiting_for_customer" ? "waiting_for_customer" : null;
}
