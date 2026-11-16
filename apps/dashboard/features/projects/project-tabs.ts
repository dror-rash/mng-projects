import type { ProjectStage } from "./project-stage";

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

export function parseProjectTab(_value: unknown): ProjectTab | null {
  throw new Error("Not implemented");
}

export function tabForStage(_stage: ProjectStage | string): ProjectTab {
  throw new Error("Not implemented");
}

export function openProjectTab(_value: unknown, _stage: string): ProjectTab {
  throw new Error("Not implemented");
}

export function projectTabPath(_projectId: string, _tab: ProjectTab | null): string {
  throw new Error("Not implemented");
}
