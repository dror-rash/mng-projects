import { getTranslations } from "next-intl/server";

import { formatDueDate } from "@/features/tasks/due-dates";

import type { ChecklistTick } from "./checklist-queries";
import type { NextStepItem } from "./next-step-card";
import { nextStage, projectStageLabelKey } from "./project-stage";
import { checklistFor, whoseMove, whoseMoveLabelKey } from "./stage-checklist";

/**
 * The "Next step" card's text in the request's language (ADR-0011, task 120): the current stage's items with
 * their party and who ticked them, whose move it is and "N of M done", and "Move to <next stage>" (task 121; none
 * at Closed). `ticks` are the project's, every stage's.
 */
export async function nextStep(stage: string, ticks: ChecklistTick[]) {
  const t = await getTranslations("stageChecklist");
  const stages = await getTranslations("projectStage");
  const next = nextStage(stage);
  const byItem = new Map(ticks.map((tick) => [tick.item, tick]));
  const items: NextStepItem[] = checklistFor(stage).map((item) => {
    const tick = byItem.get(item.key);
    return {
      key: item.key,
      label: t(`items.${item.labelKey}`),
      party: t(`party.${item.party}`),
      done: Boolean(tick),
      tickedBy: tick?.tickedByName ?? null,
      tickedOn: tick?.tickedOn ?? null,
      tickedOnText: tick ? formatDueDate(tick.tickedOn) : null,
    };
  });
  const move = whoseMove(stage, ticks.map((tick) => tick.item));
  return {
    heading: t("heading"),
    move,
    moveLabel: t(`move.${whoseMoveLabelKey(move)}`),
    progress: t("progress", { done: items.filter((i) => i.done).length, total: items.length }),
    doneLabel: t("done"),
    openLabel: t("open"),
    items,
    moveTo: next
      ? {
          stage: next,
          label: t("moveTo", { stage: stages(projectStageLabelKey(next)) }),
          moveAnyway: t("moveAnyway"),
          cancel: t("cancel"),
        }
      : undefined,
  };
}
