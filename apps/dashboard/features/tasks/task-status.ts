/**
 * Board columns in workflow order. Add a status here and the board, parsing, and grouping follow.
 * `chartSlot` is the status's color in charts (`--chart-N`): In progress is amber, since orange-red is the accent's (task 118).
 */
export const TASK_STATUSES = [
  { status: "todo", label: "To do", chartSlot: 1 },
  { status: "in_progress", label: "In progress", chartSlot: 4 },
  { status: "done", label: "Done", chartSlot: 3 },
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number]["status"];

const DEFAULT_STATUS: TaskStatus = "todo";

export function parseTaskStatus(value: unknown): TaskStatus | null {
  return TASK_STATUSES.find((s) => s.status === value)?.status ?? null;
}

export function groupTasksByStatus<T extends { status: string }>(tasks: T[]) {
  return TASK_STATUSES.map(({ status, label, chartSlot }) => ({
    status,
    label,
    chartSlot,
    tasks: tasks.filter((t) => (parseTaskStatus(t.status) ?? DEFAULT_STATUS) === status),
  }));
}
