import { getTranslations } from "next-intl/server";

import { PROJECT_STAGES, projectStageLabelKey } from "./project-stage";

/**
 * The stages' text in the request's language (ADR-0011, task 101), for server components: every stage as a
 * select option, a stored stage's label (an unknown value shows as Inquiry) and its "<Stage> since" line, the
 * label in its own element so it reads on its own.
 */
export async function stageLabels() {
  const t = await getTranslations("projectStage");
  const label = (stored: string) => t(projectStageLabelKey(stored));
  return {
    options: PROJECT_STAGES.map((s) => ({ value: s.stage, label: t(s.labelKey) })),
    label,
    since: (stored: string) =>
      t.rich("since", { stage: label(stored), label: (chunks) => <span className="font-medium">{chunks}</span> }),
  };
}
