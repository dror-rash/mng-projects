"use server";

import { eq, getDb, schema, withAccess } from "@repo/db";

import { requireActionSession } from "@/features/auth/require-session";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { requireWorkspaceForAction } from "@/features/workspaces/require-workspace";

import { parseProjectInput } from "./project-input";
import { parseProjectLifecycle } from "./project-lifecycle";
import { checkCustomerAndSite, newProjectOwner } from "./project-owner-check";
import { requireProjectAccess } from "./require-project-access";
import { revalidateOverviews } from "./revalidate";

// Each action does its reads and writes in one `withAccess` transaction, and redirects after it commits.

export async function createProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    const owner = await newProjectOwner(session.user.id, workspace, formData);
    if (!owner) {
      return invalid("Choose an owner", formData, "owner");
    }
    const input = parseProjectInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData);
    }
    // An admin's choice of a partner and a customer that don't go together; otherwise a tampered form.
    const customerError = owner.partnerId && workspace.role === "admin" ? "Choose a customer assigned to this partner" : "Choose one of your customers";
    const checked = await checkCustomerAndSite(workspace.id, owner.partnerId, input.value, formData, customerError);
    if (!checked.ok) {
      return checked.state;
    }

    const id = crypto.randomUUID();
    await getDb()
      .insert(schema.project)
      .values({ id, ...checked.value, ...owner, ownerId: session.user.id, workspaceId: workspace.id });
    return { id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateOverviews();
  return redirectFromAction(`/projects/${result.id}`);
}

/** The owner never changes (rule 4a); the customer must still suit it, and the site the customer (task 055). */
export async function updateProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireActionSession();
  const result = await withAccess(session.user.id, async () => {
    const project = await requireProjectAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const input = parseProjectInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData);
    }
    const checked = await checkCustomerAndSite(project.workspaceId, project.partnerId, input.value, formData, "Choose one of your customers");
    if (!checked.ok) {
      return checked.state;
    }

    await getDb()
      .update(schema.project)
      .set({ ...checked.value, updatedAt: new Date() })
      .where(eq(schema.project.id, project.id));
    return { id: project.id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidateOverviews();
  return redirectFromAction(`/projects/${result.id}`);
}

/**
 * Cancel or reopen a project (rule 4b): the Cancel / Reopen buttons post the lifecycle to set. Anyone who
 * can change the project (`can_change_project`); others get the same refusal as for a missing one.
 */
export async function setProjectLifecycleAction(formData: FormData) {
  const session = await requireActionSession();
  const lifecycle = parseProjectLifecycle(formData.get("lifecycle"));
  if (!lifecycle) {
    throw new Error("Invalid lifecycle");
  }
  const id = await withAccess(session.user.id, async () => {
    const project = await requireProjectAccess(session.user.id, String(formData.get("projectId") ?? ""));
    await getDb()
      .update(schema.project)
      .set({ lifecycle, updatedAt: new Date() })
      .where(eq(schema.project.id, project.id));
    return project.id;
  });
  revalidateOverviews();
  return redirectFromAction(`/projects/${id}`);
}

/**
 * Soft delete (design rule 8a): the project disappears, and its tasks with it (`can_see_project` and the
 * list filters); an admin restores it from the Deleted page. Whoever can change the project.
 */
export async function deleteProjectAction(formData: FormData) {
  const session = await requireActionSession();
  await withAccess(session.user.id, async () => {
    const project = await requireProjectAccess(session.user.id, String(formData.get("projectId") ?? ""));
    await getDb()
      .update(schema.project)
      .set({ deletedAt: new Date(), deletedBy: session.user.id })
      .where(eq(schema.project.id, project.id));
  });
  revalidateOverviews();
  return redirectFromAction("/");
}
