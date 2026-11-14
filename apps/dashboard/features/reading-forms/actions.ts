"use server";

import { and, desc, eq, getDb, schema, sql, withAccess } from "@repo/db";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/features/access/require-change";
import { type FormState, invalid } from "@/features/forms/form-state";
import { redirectFromAction } from "@/features/navigation/redirect-from-action";
import { requireWorkspaceForAction } from "@/features/workspaces/require-workspace";

import { parseFieldInput, parseFormInput } from "./field-input";
import { type FormStatus, formStatusOf } from "./form-status";

// Reading forms (task 060): admins only. Each action posts the form's workspace (`requireWorkspaceForAction`)
// and its id in hidden fields, does its reads and writes in one `withAccess` transaction and redirects after
// it. Someone who isn't an admin there, or a form that isn't in it, is refused like a missing form; a form
// that is no longer a draft (another tab published it) gets a message. The database refuses the same writes.

const PUBLISHED_CANT_CHANGE = "A published form can't change";

/**
 * The form posted in `formData` (in the posted workspace, where `userId` must be an admin), locked until the
 * transaction ends so publishing and adding a field can't interleave; throws like a missing form. Call it
 * inside `withAccess`.
 */
async function lockForm(userId: string, workspaceId: string, formData: FormData) {
  await requireAdmin(userId, workspaceId);
  const db = getDb();
  const [form] = await db
    .select({ id: schema.formTemplate.id, status: schema.formTemplate.status })
    .from(schema.formTemplate)
    .where(and(eq(schema.formTemplate.id, String(formData.get("formId") ?? "")), eq(schema.formTemplate.workspaceId, workspaceId)))
    .for("update");
  if (!form) {
    throw new Error("Not found");
  }
  const [version] = await db
    .select({ id: schema.formTemplateVersion.id })
    .from(schema.formTemplateVersion)
    .where(eq(schema.formTemplateVersion.templateId, form.id))
    .orderBy(desc(schema.formTemplateVersion.version))
    .limit(1);
  if (!version) {
    throw new Error("Not found");
  }
  return { id: form.id, status: formStatusOf(form.status), versionId: version.id };
}

function revalidateForm(formId: string) {
  revalidatePath("/forms");
  revalidatePath(`/forms/${formId}`);
}

/** Creates a draft form (version 1, no fields) in the posted workspace and opens its page. */
export async function createReadingFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    await requireAdmin(session.user.id, workspace.id);
    const input = parseFormInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    const id = crypto.randomUUID();
    const db = getDb();
    await db.insert(schema.formTemplate).values({ id, workspaceId: workspace.id, createdBy: session.user.id, ...input.value });
    await db.insert(schema.formTemplateVersion).values({ id: crypto.randomUUID(), templateId: id, version: 1 });
    return { id };
  });
  if (!("id" in result)) {
    return result;
  }
  revalidatePath("/forms");
  return redirectFromAction(`/forms/${result.id}`);
}

/** Adds a field at the end of a draft form. */
export async function addFieldAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    const form = await lockForm(session.user.id, workspace.id, formData);
    if (form.status !== "draft") {
      return invalid(PUBLISHED_CANT_CHANGE, formData);
    }
    const input = parseFieldInput(formData);
    if (!input.ok) {
      return invalid(input.error, formData, input.field);
    }
    const db = getDb();
    const [last] = await db
      .select({ position: sql<number>`coalesce(max(${schema.formField.position}), 0)::int` })
      .from(schema.formField)
      .where(eq(schema.formField.versionId, form.versionId));
    const position = (last?.position ?? 0) + 1;
    await db.insert(schema.formField).values({ id: crypto.randomUUID(), versionId: form.versionId, position, ...input.value });
    return { formId: form.id };
  });
  if (!("formId" in result)) {
    return result;
  }
  revalidateForm(result.formId);
  return {};
}

/**
 * Removes a field from a draft form: the row goes (a draft is unpublished editing, not a record to restore). A field
 * that isn't on the form is refused like a missing form.
 */
export async function removeFieldAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    const form = await lockForm(session.user.id, workspace.id, formData);
    if (form.status !== "draft") {
      return invalid(PUBLISHED_CANT_CHANGE, formData);
    }
    const removed = await getDb()
      .delete(schema.formField)
      .where(and(eq(schema.formField.id, String(formData.get("fieldId") ?? "")), eq(schema.formField.versionId, form.versionId)))
      .returning({ id: schema.formField.id });
    if (removed.length === 0) {
      throw new Error("Not found");
    }
    return { formId: form.id };
  });
  if (!("formId" in result)) {
    return result;
  }
  revalidateForm(result.formId);
  return {};
}

/**
 * Publishes a draft form with at least one field. The database publishes (freezes) its latest version with it
 * (`form_template_publish`, migration 0037); a version can't be published on its own.
 */
export async function publishFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    const form = await lockForm(session.user.id, workspace.id, formData);
    if (form.status !== "draft") {
      return invalid(PUBLISHED_CANT_CHANGE, formData);
    }
    const db = getDb();
    const [field] = await db
      .select({ id: schema.formField.id })
      .from(schema.formField)
      .where(eq(schema.formField.versionId, form.versionId))
      .limit(1);
    if (!field) {
      return invalid("Add a field before publishing", formData);
    }
    await db
      .update(schema.formTemplate)
      .set({ status: "published" satisfies FormStatus, updatedAt: new Date() })
      .where(eq(schema.formTemplate.id, form.id));
    return { formId: form.id };
  });
  if (!("formId" in result)) {
    return result;
  }
  revalidateForm(result.formId);
  return {};
}

/** Archives a published form; an archived one stays archived. */
export async function archiveFormAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { session, workspace } = await requireWorkspaceForAction(formData);
  const result = await withAccess(session.user.id, async () => {
    const form = await lockForm(session.user.id, workspace.id, formData);
    if (form.status === "draft") {
      return invalid("Only a published form can be archived", formData);
    }
    if (form.status === "published") {
      await getDb()
        .update(schema.formTemplate)
        .set({ status: "archived" satisfies FormStatus, updatedAt: new Date() })
        .where(eq(schema.formTemplate.id, form.id));
    }
    return { formId: form.id };
  });
  if (!("formId" in result)) {
    return result;
  }
  revalidateForm(result.formId);
  return {};
}
