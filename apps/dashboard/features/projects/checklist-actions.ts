"use server";

import { tickChecklistItem, untickChecklistItem, withAccess } from "@repo/db";

import { requireActionSession } from "@/features/auth/require-session";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";

import { requireProjectAccess } from "./require-project-access";
import { parseChecklistItem } from "./stage-checklist";

/**
 * Tick (`done=true`) or untick (`done=false`) a checklist item of a project (task 120, ADR-0014): whoever can
 * change the project (`can_change_project`); others get the same refusal as for a missing one. The form is a
 * single button, so a made-up item or `done` (a tampered form) throws like a made-up task status rather than
 * returning a field error. An item of another stage than the project's is taken (done is done); ticking a
 * ticked item or unticking an open one changes nothing.
 */
export async function toggleChecklistItemAction(formData: FormData) {
  const session = await requireActionSession();
  const projectId = await withAccess(session.user.id, async () => {
    const project = await requireProjectAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const item = parseChecklistItem(formData.get("item"));
    const done = formData.get("done");
    if (!item || (done !== "true" && done !== "false")) {
      throw new Error("Choose an item of the checklist");
    }
    if (done === "true") {
      await tickChecklistItem({ projectId: project.id, item, tickedBy: session.user.id });
    } else {
      await untickChecklistItem({ projectId: project.id, item });
    }
    return project.id;
  });
  return redirectFromAction(`/projects/${projectId}`);
}
