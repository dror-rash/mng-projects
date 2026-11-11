"use server";

import { and, type Db, eq, getDb, schema, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAdmin } from "@/features/access/require-change";
import { type FormState, invalid } from "@/features/forms/form-state";

import { WORKSPACE_COOKIE } from "./current-workspace";
import { requireWorkspaceForAction } from "./require-workspace";
import { removeWorkspaceFiles } from "./workspace-files";
import { confirmsWorkspaceName, parseWorkspaceName } from "./workspace-name";

const ADMINS_ONLY = "Only admins can manage this workspace";
const WRONG_NAME = "Type the workspace name exactly to delete it";

/**
 * Locks the workspace row (as `changeMembership` does) and returns its name if `userId` is still an
 * admin under that lock, so an admin demoted in another request can't rename or delete it.
 */
async function lockAsAdmin(tx: Db, workspaceId: string, userId: string): Promise<{ name: string } | null> {
  const [workspace] = await tx
    .select({ name: schema.workspace.name })
    .from(schema.workspace)
    .where(eq(schema.workspace.id, workspaceId))
    .for("update");
  const [me] = await tx
    .select({ role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  return workspace && me?.role === "admin" ? workspace : null;
}

/** Renames the form's workspace. Admins only (ADR-0005, ADR-0006). */
export async function renameWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  if (!(await isAdmin(session.user.id, workspace.id))) {
    return { error: ADMINS_ONLY };
  }
  const name = parseWorkspaceName(formData.get("name"));
  if (!name.ok) {
    return invalid(name.error, formData, "name");
  }
  const renamed = await withAccess(session.user.id, async () => {
    const tx = getDb();
    if (!(await lockAsAdmin(tx, workspace.id, session.user.id))) return false;
    await tx.update(schema.workspace).set({ name: name.value }).where(eq(schema.workspace.id, workspace.id));
    return true;
  });
  if (!renamed) {
    return { error: ADMINS_ONLY };
  }
  revalidatePath("/", "layout");
  return {};
}

/**
 * Deletes the form's workspace and, through `ON DELETE CASCADE`, everything in it: projects (and their
 * tasks, visits, readings and attachments), customers (and their sites, contacts and notes), forms, partners,
 * invite links and memberships. Then, once that has committed, its photos, files and reports in storage
 * (task 086, SEC-08): the folder of the row it deleted, never one from the form. Admins only, after typing
 * its exact name (ADR-0005). Its admin lands in their next workspace, or a new personal one, even if
 * deleting the files fails (`removeWorkspaceFiles` logs it).
 */
export async function deleteWorkspaceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  if (!(await isAdmin(session.user.id, workspace.id))) {
    return { error: ADMINS_ONLY };
  }
  const result = await withAccess(session.user.id, async () => {
    const tx = getDb();
    const locked = await lockAsAdmin(tx, workspace.id, session.user.id);
    if (!locked) return "not-an-admin";
    // Checked against the name under the lock, not the one the page showed (it may have been renamed).
    if (!confirmsWorkspaceName(formData.get("confirmName"), locked.name)) return "wrong-name";
    const [deleted] = await tx
      .delete(schema.workspace)
      .where(eq(schema.workspace.id, workspace.id))
      .returning({ id: schema.workspace.id });
    return deleted ? { deletedId: deleted.id } : "not-an-admin";
  });
  if (result === "not-an-admin") {
    return { error: ADMINS_ONLY };
  }
  if (result === "wrong-name") {
    return invalid(WRONG_NAME, formData, "confirmName");
  }
  await removeWorkspaceFiles(result.deletedId);
  (await cookies()).delete(WORKSPACE_COOKIE);
  redirect("/");
}
