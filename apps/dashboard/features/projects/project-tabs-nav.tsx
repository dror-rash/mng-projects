import type { ReactNode } from "react";

import type { ProjectTab } from "./project-tabs";

/** A tab's link text, translated by the page. */
export type ProjectTabLink = { tab: ProjectTab; label: string };

export function ProjectTabs(_props: { projectId: string; open: ProjectTab; tabs: ProjectTabLink[]; label: string }): ReactNode {
  throw new Error("Not implemented");
}
