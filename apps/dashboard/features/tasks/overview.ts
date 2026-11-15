import { type WeeklyActivity, weekAgo } from "./activity";
import { type CalendarDate, dueSoonUntil, todayUtc } from "./due-dates";
import { type StatusCount, summarizeStatusCounts, type TaskSummary } from "./progress";
import { groupTasksByStatus, parseTaskStatus, type TASK_STATUSES } from "./task-status";

/** The dates the home counts are taken against, from one clock read so they can't straddle midnight. */
export type OverviewWindow = { today: CalendarDate; dueSoonUntil: CalendarDate; since: Date };

export function overviewWindow(now: Date): OverviewWindow {
  const today = todayUtc(now);
  return { today, dueSoonUntil: dueSoonUntil(today), since: weekAgo(now) };
}

/**
 * A `GROUP BY status` row of the workspace's tasks: how many there are, how many have a due date
 * before today / from today through `dueSoonUntil`, and how many were created / completed since `since`.
 */
export type OverviewCount = StatusCount & { overdue: number; dueSoon: number; created: number; completed: number };

export type Overview = {
  summary: TaskSummary;
  overdue: number;
  dueSoon: number;
  thisWeek: WeeklyActivity;
  /** "Tasks by status" segments, each in its status's chart slot. */
  byStatus: { label: string; value: number; slot: (typeof TASK_STATUSES)[number]["chartSlot"] }[];
};

const sum = (rows: OverviewCount[], pick: (row: OverviewCount) => number) => rows.reduce((n, row) => n + pick(row), 0);

/** The home page's numbers. Done tasks are never overdue or due soon (same rule as `dueState`). */
export function summarizeOverview(rows: OverviewCount[]): Overview {
  const open = rows.filter((row) => parseTaskStatus(row.status) !== "done");
  return {
    summary: summarizeStatusCounts(rows),
    overdue: sum(open, (row) => row.overdue),
    dueSoon: sum(open, (row) => row.dueSoon),
    thisWeek: { created: sum(rows, (row) => row.created), completed: sum(rows, (row) => row.completed) },
    byStatus: groupTasksByStatus(rows).map((column) => ({
      label: column.label,
      value: sum(column.tasks, (row) => row.count),
      slot: column.chartSlot,
    })),
  };
}

