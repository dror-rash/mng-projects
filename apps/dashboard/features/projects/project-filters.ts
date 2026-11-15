import { firstParam } from "@/features/navigation/search-params";

import { parseProjectStage, type ProjectStage, projectStage } from "./project-stage";
import { parseProjectStatus, type ProjectStatus } from "./project-status";

export type ProjectView = "table" | "tiles";

export type ProjectFilters = {
  /** A customer id (every project has one, task 071). */
  customer?: string;
  status?: ProjectStatus;
  /** The stage (task 101); an unknown stored stage counts as Inquiry. */
  stage?: ProjectStage;
  /** Only projects with an open task due before today. */
  overdue: boolean;
  /** Part of the project name, any case. */
  q?: string;
  view: ProjectView;
};

type SearchParams = Record<string, string | string[] | undefined>;

/** Filters from the URL. Values that don't apply (another workspace's customer, a typo) are ignored. */
export function parseProjectFilters(params: SearchParams, customerIds: string[]): ProjectFilters {
  const customer = firstParam(params.customer);
  const status = parseProjectStatus(firstParam(params.status));
  const stage = parseProjectStage(firstParam(params.stage));
  const q = firstParam(params.q);
  return {
    ...(customer && customerIds.includes(customer) && { customer }),
    ...(status && { status }),
    ...(stage && { stage }),
    overdue: firstParam(params.overdue) === "1",
    ...(q && { q }),
    view: firstParam(params.view) === "tiles" ? "tiles" : "table",
  };
}

/** The filters as URL params for `withParams`, leaving out the defaults. */
export function filterParams(filters: ProjectFilters): Record<string, string> {
  return {
    ...(filters.customer && { customer: filters.customer }),
    ...(filters.status && { status: filters.status }),
    ...(filters.stage && { stage: filters.stage }),
    ...(filters.overdue && { overdue: "1" }),
    ...(filters.q && { q: filters.q }),
    ...(filters.view === "tiles" && { view: "tiles" }),
  };
}

type FilterableProject = { name: string; organizationId: string; status: ProjectStatus; stage: string; overdue: number };

/** The projects matching every filter, in their original order. */
export function filterProjects<T extends FilterableProject>(projects: T[], filters: ProjectFilters): T[] {
  const q = filters.q?.toLowerCase();
  return projects.filter(
    (p) =>
      (!filters.customer || p.organizationId === filters.customer) &&
      (!filters.status || p.status === filters.status) &&
      (!filters.stage || projectStage(p.stage) === filters.stage) &&
      (!filters.overdue || p.overdue > 0) &&
      (!q || p.name.toLowerCase().includes(q)),
  );
}
