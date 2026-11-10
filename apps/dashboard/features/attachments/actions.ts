"use server";

import { and, eq, getDb, isNull, schema, sql, withAccess } from "@repo/db";
import { createUploadUrl, objectKey, remove, stat } from "@repo/storage";
import { revalidatePath } from "next/cache";

import { requireActionSession } from "@/features/auth/require-session";
import { cleanText } from "@/features/forms/clean-text";
import { requireProjectWorkAccess } from "@/features/projects/require-project-access";
import { getProjectVisit } from "@/features/visits/queries";

import { allowedOnVisit, maxUploadBytes, parseAttachmentKind, uploadRefusal } from "./attachment-limits";
import { prepareUpload, removeStaleObjects } from "./unfinished-uploads";

// Photos and files (task 059) and reports (task 064). The browser uploads straight to storage. An upload's life:
//   1. start: `startUploadAction` checks access and the limits, clears the workspace's stale uploads and
//      checks the user's unfinished ones (task 087, `unfinished-uploads.ts`), records the upload (unconfirmed)
//      and signs a URL;
//   2. upload: the browser sends the file to storage with the URL's headers;
//   3. confirm: `finishUploadAction` checks the stored object and confirms it, or throws it away.
// One that never comes back to step 3 (a dropped connection, a closed tab) counts towards its uploader's 10
// unfinished uploads in the workspace, and is cleared (record and object) by the first upload started in the
// workspace an hour after it began (its URL lasts 15 minutes, so nothing can still arrive).
// The signed URL carries the kind's size limit, so storage refuses a larger body (task 085); the confirm check
// stays (the local server doesn't enforce the limit). Access problems (another partner's project, a made-up
// id, someone else's upload) throw the same not-found error; the limits come back as a message to show.

export type UploadStart = { ok: true; uploadUrl: string; headers: Record<string, string> } | { ok: false; error: string };
export type UploadFinish = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NAME = 200;

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/deleted");
}

export async function startUploadAction(input: {
  attachmentId: string;
  projectId: string;
  visitId: string | null;
  kind: string;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<UploadStart> {
  const session = await requireActionSession();
  const kind = parseAttachmentKind(input.kind);
  const fileName = cleanText(input.fileName).slice(0, MAX_NAME);
  if (!kind || (input.visitId && !allowedOnVisit(kind)) || !UUID.test(String(input.attachmentId)) || !fileName) {
    throw new Error("Not found");
  }
  type Started = { workspaceId: string; staleKeys: string[] } & ({ refusal: string } | { storageKey: string; contentType: string });
  const key = await withAccess(session.user.id, async (): Promise<{ refusal: string } | Started> => {
    const project = await requireProjectWorkAccess(session.user.id, String(input.projectId));
    if (input.visitId && !(await getProjectVisit(session.user.id, project.id, String(input.visitId)))) {
      throw new Error("Not found");
    }
    const refusal = uploadRefusal(kind, String(input.contentType), Number(input.size));
    if (refusal) {
      return { refusal };
    }
    const { staleKeys, refusal: tooMany } = await prepareUpload(session.user.id, project);
    const cleared = { workspaceId: project.workspaceId, staleKeys };
    if (tooMany) {
      return { ...cleared, refusal: tooMany };
    }
    const storageKey = objectKey({ workspaceId: project.workspaceId, projectId: project.id });
    const contentType = String(input.contentType).toLowerCase();
    // An id that is already taken (anyone's upload, anywhere) is refused like a tampered form.
    const inserted = await getDb().insert(schema.attachment).values({
      id: input.attachmentId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      visitId: input.visitId || null,
      kind,
      storageKey,
      fileName,
      contentType,
      sizeBytes: Number(input.size),
      uploadedBy: session.user.id,
    }).onConflictDoNothing().returning({ id: schema.attachment.id });
    if (inserted.length === 0) {
      throw new Error("Not found");
    }
    return { ...cleared, storageKey, contentType };
  });
  // After the transaction: the cleared records are gone for good, so their objects can go too.
  if ("staleKeys" in key && key.staleKeys.length > 0) {
    await removeStaleObjects(key.workspaceId, key.staleKeys);
  }
  if ("refusal" in key) {
    return { ok: false, error: key.refusal };
  }
  // The URL itself refuses a body over the kind's limit (Cloud Storage; task 085), whatever size was declared.
  const signed = await createUploadUrl({ key: key.storageKey, contentType: key.contentType, maxBytes: maxUploadBytes(kind) });
  return { ok: true, uploadUrl: signed.url, headers: signed.headers };
}

/**
 * Confirms the user's own unconfirmed upload once its stored object fits what was asked for (checked again
 * here: the local server doesn't enforce the URL's size range, and it guards the content type). Otherwise
 * removes the object and the record, and says so.
 */
export async function finishUploadAction(input: { attachmentId: string }): Promise<UploadFinish> {
  const session = await requireActionSession();
  const [upload] = await withAccess(session.user.id, () =>
    getDb()
      .select({
        id: schema.attachment.id,
        projectId: schema.attachment.projectId,
        kind: schema.attachment.kind,
        storageKey: schema.attachment.storageKey,
        contentType: schema.attachment.contentType,
        fileName: schema.attachment.fileName,
      })
      .from(schema.attachment)
      .where(
        and(
          eq(schema.attachment.id, String(input.attachmentId)),
          eq(schema.attachment.uploadedBy, session.user.id),
          isNull(schema.attachment.confirmedAt),
          isNull(schema.attachment.deletedAt),
        ),
      ),
  );
  if (!upload) {
    throw new Error("Not found");
  }
  const stored = await stat(upload.storageKey);
  const kind = parseAttachmentKind(upload.kind)!;
  const refusal = !stored
    ? "The upload didn't arrive"
    : stored.contentType !== upload.contentType
      ? "The file isn't what it said it was"
      : uploadRefusal(kind, stored.contentType, stored.size);
  await withAccess(session.user.id, async () => {
    if (refusal) {
      await getDb().delete(schema.attachment).where(eq(schema.attachment.id, upload.id));
    } else {
      await getDb()
        .update(schema.attachment)
        .set({ confirmedAt: new Date(), sizeBytes: stored!.size })
        .where(eq(schema.attachment.id, upload.id));
    }
  });
  if (refusal) {
    await remove(upload.storageKey);
    return { ok: false, error: refusal };
  }
  revalidateProject(upload.projectId);
  return { ok: true };
}

/** Soft delete through `delete_attachment` (its uploader or an admin); an admin restores it from Deleted. */
export async function deleteAttachmentAction(formData: FormData) {
  const session = await requireActionSession();
  const projectId = await withAccess(session.user.id, async () => {
    const project = await requireProjectWorkAccess(session.user.id, String(formData.get("projectId") ?? ""));
    const attachment = getDb()
      .select({ id: schema.attachment.id })
      .from(schema.attachment)
      .where(and(eq(schema.attachment.id, String(formData.get("attachmentId") ?? "")), eq(schema.attachment.projectId, project.id)));
    const { rows } = await getDb().execute<{ deleted: boolean }>(sql`select delete_attachment(a.id) as deleted from (${attachment}) a`);
    if (rows[0]?.deleted !== true) {
      throw new Error("Not found");
    }
    return project.id;
  });
  revalidateProject(projectId);
}
