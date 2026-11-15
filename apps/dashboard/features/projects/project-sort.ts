import { firstParam } from "@/features/navigation/search-params";

import { stageOrder } from "./project-stage";
import { PROJECT_STATUSES, type ProjectStatus } from "./project-status";

export type SortDirection = "asc" | "desc";

/** The projects table's columns, in order, with the direction a first click sorts them. */
export const PROJECT_SORTS = [
  { column: "name", label: "Project", first: "asc" },
  { column: "customer", label: "Customer", first: "asc" },
  { column: "status", label: "Status", first: "asc" },
  { column: "stage", label: "Stage", first: "asc" },
  { column: "progress", label: "Progress", first: "desc" },
  { column: "overdue", label: "Overdue", first: "desc" },
  { column: "started", label: "Started", first: "desc" },
] as const satisfies readonly { column: string; label: string; first: SortDirection }[];

export type ProjectSortColumn = (typeof PROJECT_SORTS)[number]["column"];

export type ProjectSort = { column: ProjectSortColumn; dir: SortDirection };

/** Newest first: the order projects are listed in. */
export const DEFAULT_SORT: ProjectSort = { column: "started", dir: "desc" };

function firstDirection(column: ProjectSortColumn): SortDirection {
  return PROJECT_SORTS.find((s) => s.column === column)!.first;
}

type SearchParams = Record<string, string | string[] | undefined>;

/** The sort from the URL. An unknown column or direction is ignored. */
export function parseProjectSort(params: SearchParams): ProjectSort {
  const column = PROJECT_SORTS.find((s) => s.column === firstParam(params.sort))?.column ?? DEFAULT_SORT.column;
  const dir = firstParam(params.dir);
  return { column, dir: dir === "asc" || dir === "desc" ? dir : firstDirection(column) };
}

/** The sort as URL params for `withParams`, leaving out the defaults. */
export function sortParams(sort: ProjectSort): Record<string, string> {
  return {
    ...(sort.column !== DEFAULT_SORT.column && { sort: sort.column }),
    ...(sort.dir !== firstDirection(sort.column) && { dir: sort.dir }),
  };
}

/** What clicking a column header does: reverse the sorted column, or sort another one its first way. */
export function nextSort(current: ProjectSort, column: ProjectSortColumn): ProjectSort {
  if (current.column === column) return { column, dir: current.dir === "asc" ? "desc" : "asc" };
  return { column, dir: firstDirection(column) };
}

type SortableProject = {
  name: string;
  /** Null only when the user may not see the customer's name; sorts as an empty name. */
  customerName: string | null;
  status: ProjectStatus;
  /** The stored stage (task 101); sorts in the flow's order. */
  stage: string;
  /** Percent of tasks done. */
  progress: number;
  overdue: number;
  createdAt: Date;
};

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const statusOrder = (status: ProjectStatus) => PROJECT_STATUSES.findIndex((s) => s.status === status);

const compare: Record<ProjectSortColumn, (a: SortableProject, b: SortableProject) => number> = {
  name: (a, b) => byText(a.name, b.name),
  customer: (a, b) => byText(a.customerName ?? "", b.customerName ?? ""),
  status: (a, b) => statusOrder(a.status) - statusOrder(b.status),
  stage: (a, b) => stageOrder(a.stage) - stageOrder(b.stage),
  progress: (a, b) => a.progress - b.progress,
  overdue: (a, b) => a.overdue - b.overdue,
  started: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
};

/** A sorted copy. Ties keep their order. */
export function sortProjects<T extends SortableProject>(projects: T[], sort: ProjectSort): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => sign * compare[sort.column](a, b));
}
