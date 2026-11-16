import type { CalendarDate } from "@/features/tasks/due-dates";

import type { NeedsActionList, NeedsActionText } from "./needs-action-section";

type NeedsActionProject = {
  id: string;
  name: string;
  organizationId: string;
  customerName: string | null;
  lifecycle: string;
  stage: string;
  createdAt: Date;
};

/**
 * The overview's "Needs action" groups and text in the request's language (ADR-0011, task 124), from the visible
 * projects, their checklist ticks and latest stage changes, `today` UTC.
 */
export async function needsActionSection(
  _projects: readonly NeedsActionProject[],
  _ticks: readonly { projectId: string; item: string; tickedAt: Date }[],
  _changedAt: ReadonlyMap<string, Date>,
  _today: CalendarDate,
): Promise<{ groups: NeedsActionList[]; text: NeedsActionText }> {
  throw new Error("not implemented");
}
