import { getTranslations } from "next-intl/server";

import type { CalendarDate } from "@/features/tasks/due-dates";

import { needsAction } from "./needs-action";
import type { NeedsActionList, NeedsActionText } from "./needs-action-section";
import { projectStageLabelKey } from "./project-stage";
import { whoseMoveLabelKey } from "./stage-checklist";

type NeedsActionProject = {
  id: string;
  name: string;
  organizationId: string;
  customerName: string | null;
  lifecycle: string;
  stage: string;
  createdAt: Date;
};

const GROUP_LABEL_KEYS = { our_move: "ourMove", waiting_for_customer: "waitingForCustomer" } as const;

/**
 * The overview's "Needs action" groups and text in the request's language (ADR-0011, task 124), from the visible
 * projects, their checklist ticks and latest stage changes, `today` UTC.
 */
export async function needsActionSection(
  projects: readonly NeedsActionProject[],
  ticks: readonly { projectId: string; item: string; tickedAt: Date }[],
  changedAt: ReadonlyMap<string, Date>,
  today: CalendarDate,
): Promise<{ groups: NeedsActionList[]; text: NeedsActionText }> {
  const [t, stages, board, move] = await Promise.all([
    getTranslations("needsAction"),
    getTranslations("projectStage"),
    getTranslations("stageBoard"),
    getTranslations("stageChecklist.move"),
  ]);
  return {
    groups: needsAction(projects, ticks, changedAt, today).map(({ group, projects: listed, more }) => ({
      group,
      label: t(GROUP_LABEL_KEYS[group]),
      more,
      items: listed.map((p) => ({
        id: p.id,
        name: p.name,
        organizationId: p.organizationId,
        customerName: p.customerName,
        stageLabel: stages(projectStageLabelKey(p.stage)),
        daysText: board("days", { days: p.days }),
        badge: p.move === "ready" ? { move: p.move, label: move(whoseMoveLabelKey(p.move)) } : null,
      })),
    })),
    text: { heading: t("heading"), empty: t("empty"), viewAll: t("viewAll") },
  };
}
