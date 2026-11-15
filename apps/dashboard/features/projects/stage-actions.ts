"use server";

import { eq, getDb, recordStageChange, schema, withAccess } from "@repo/db";

import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";

import { parseStageChoice } from "./project-stage";
import { requireProjectAccess } from "./require-project-access";
import { revalidateOverviews } from "./revalidate";

/**
 * Move a project to another stage, forward or back (task 101, ADR-0012): whoever can change the project
 * (`can_change_project`); others get the same refusal as for a missing one. The stage and its history row are
 * written in one transaction, the project row locked so two changes at once record the right "from".
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
    if (locked && locked.stage !== choice.value) {
      await db.update(schema.project).set({ stage: choice.value, updatedAt: new Date() }).where(eq(schema.project.id, project.id));
      await recordStageChange({ projectId: project.id, fromStage: locked.stage, toStage: choice.value, changedBy: session.user.id });
    }
    return { id: project.id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateOverviews();
  return redirectFromAction(`/projects/${result.id}`);
}
