import { type ProjectStage, projectStage } from "./project-stage";

/**
 * The project page's tabs (task 122), in the flow's order. Each is its own address, `?tab=<tab>`. `labelKey` is a
 * key in the `projectTabs` messages (ADR-0011): the caller translates it.
 */
export const PROJECT_TABS = [
  { tab: "overview", labelKey: "overview" },
  { tab: "sales", labelKey: "sales" },
  { tab: "work", labelKey: "work" },
  { tab: "reports", labelKey: "reports" },
  { tab: "billing", labelKey: "billing" },
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number]["tab"];

/** A tab of the list, or null for anything else (no tab, a made-up one, a repeated `?tab=`). */
export function parseProjectTab(value: unknown): ProjectTab | null {
  return PROJECT_TABS.find((t) => t.tab === value)?.tab ?? null;
}

/** Where each stage's work is (ADR-0014): the page opens there when the address names no tab. */
const STAGE_TABS: Record<ProjectStage, ProjectTab> = {
  inquiry: "overview",
  quote: "sales",
  ordered: "sales",
  scheduled: "work",
  in_work: "work",
  reporting: "reports",
  billing: "billing",
  closed: "reports",
};

/** The tab a stored stage opens on (an unknown value counts as Inquiry). */
export function tabForStage(stage: string): ProjectTab {
  return STAGE_TABS[projectStage(stage)];
}

/** The open tab: the address's `?tab=` when it is one of the list, else the stage's tab. */
export function openProjectTab(value: unknown, stage: string): ProjectTab {
  return parseProjectTab(value) ?? tabForStage(stage);
}

/** The project page at a tab's address (a path in this zone); without a tab it opens on the stage's tab. */
export function projectTabPath(projectId: string, tab: ProjectTab | null): string {
  return tab ? `/projects/${projectId}?tab=${tab}` : `/projects/${projectId}`;
}
