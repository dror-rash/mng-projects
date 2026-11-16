"use server";

import { eq, getDb, recordStageChange, schema, withAccess } from "@repo/db";
import { getTranslations } from "next-intl/server";

import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";

import { nextStage, parseStageChoice } from "./project-stage";
import { requireProjectAccess } from "./require-project-access";
import { revalidateOverviews } from "./revalidate";
import { openItemCount } from "./stage-checklist";

/**
 * Move a project to another stage, forward or back (task 101, ADR-0012): whoever can change the project
 * (`can_change_project`); others get the same refusal as for a missing one. The stage and its history row are
 * written in one transaction, the project row locked so two changes at once record the right "from".
 *
 * "Move to <next stage>" (task 121, ADR-0014) posts `from=next`: while the current stage's checklist has open
 * items it changes nothing and returns the question ("2 items are still open in this stage. Move anyway?") on
 * the `confirm` field; "Move anyway" posts again with `confirm=yes`. The open items are counted here, after
 * the lock, never taken from the page; the confirm field only skips the question. A `from=next` post for a
 * stage that isn't the next one any more (a page left open while another tab moved the project) changes nothing
 * and goes back to the project page, without a message. Posts from the stage bar move at once.
 */
export async function changeStageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const project = await requireProjectAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const choice = parseStageChoice(formData);
    if (!choice.ok || !choice.value) {
      return invalid("Choose a stage", formData, "stage");
    }
    const db = getDb();
    const [locked] = await db
      .select({ stage: schema.project.stage })
      .from(schema.project)
      .where(eq(schema.project.id, project.id))
      .for("update");
    const fromNext = formData.get("from") === "next";
    // A "Move to" from a page left open after the project moved on (another tab): nothing to do, the page reloads.
    if (locked && fromNext && choice.value !== nextStage(locked.stage)) {
      return { id: project.id };
    }
    if (locked && fromNext && formData.get("confirm") !== "yes") {
      const ticks = await db
        .select({ item: schema.projectChecklistTick.item })
        .from(schema.projectChecklistTick)
        .where(eq(schema.projectChecklistTick.projectId, project.id));
      const open = openItemCount(locked.stage, ticks.map((t) => t.item));
      if (open > 0) {
        return { ask: { open } };
      }
    }
    if (locked && locked.stage !== choice.value) {
      await db.update(schema.project).set({ stage: choice.value, updatedAt: new Date() }).where(eq(schema.project.id, project.id));
      await recordStageChange({ projectId: project.id, fromStage: locked.stage, toStage: choice.value, changedBy: session.user.id });
    }
    return { id: project.id };
  });
  if ("ask" in result && result.ask) {
    const t = await getTranslations("stageChecklist");
    return { error: t("openItems", { count: result.ask.open }), field: "confirm" };
  }
  if (!("id" in result)) {
    return result;
  }
  revalidateOverviews();
  return redirectFromAction(`/projects/${result.id}`);
}
