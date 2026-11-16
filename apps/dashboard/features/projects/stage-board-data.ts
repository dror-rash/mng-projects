import { getTranslations } from "next-intl/server";

import type { CalendarDate } from "@/features/tasks/due-dates";

import { isCanceled } from "./project-lifecycle";
import type { StageBoardCard, StageBoardPhase } from "./stage-board-view";
import { boardPhases, daysInStage, isLongWait, LONG_WAIT_DAYS, movesByProject, stageSince } from "./stage-board";
import { whoseMoveLabelKey } from "./stage-checklist";

type BoardProject = {
  id: string;
  name: string;
  organizationId: string;
  customerName: string | null;
  /** The stored lifecycle (`project.status`): a canceled project shows "Canceled" instead of whose move. */
  lifecycle: string;
  stage: string;
  createdAt: Date;
};

/**
 * The stage board's columns and text in the request's language (ADR-0011, task 123): `projects` are the listed
 * (filtered) ones, `ticks` their checklist ticks and `changedAt` their latest stage changes, `today` UTC.
 */
export async function stageBoard(
  projects: readonly BoardProject[],
  ticks: readonly { projectId: string; item: string }[],
  changedAt: ReadonlyMap<string, Date>,
  today: CalendarDate,
): Promise<{ phases: StageBoardPhase[]; text: { label: string; empty: string; longWait: string } }> {
  const [t, stages, move] = await Promise.all([
    getTranslations("stageBoard"),
    getTranslations("projectStage"),
    getTranslations("stageChecklist.move"),
  ]);
  const moves = movesByProject(projects, ticks);
  const withDays = projects.map((p) => ({ ...p, days: daysInStage(stageSince(changedAt.get(p.id) ?? null, p.createdAt), today) }));
  const card = (p: (typeof withDays)[number]): StageBoardCard => {
    const whose = isCanceled(p.lifecycle) ? null : moves.get(p.id)!;
    return {
      id: p.id,
      name: p.name,
      organizationId: p.organizationId,
      customerName: p.customerName,
      move: whose,
      moveLabel: whose ? move(whoseMoveLabelKey(whose)) : t("canceled"),
      daysText: t("days", { days: p.days }),
      longWait: isLongWait(p.days),
    };
  };
  return {
    phases: boardPhases(withDays).map((phase) => ({
      phase: phase.phase,
      label: stages(`phase.${phase.labelKey}`),
      columns: phase.columns.map((column) => ({ stage: column.stage, label: stages(column.labelKey), cards: column.projects.map(card) })),
    })),
    text: { label: t("label"), empty: t("empty"), longWait: t("longWait", { days: LONG_WAIT_DAYS }) },
  };
}
