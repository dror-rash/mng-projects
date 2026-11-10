import { and, eq, getDb, isNull, schema, sql } from "@repo/db";
import { remove } from "@repo/storage";

import { unfinishedUploadsRefusal } from "./attachment-limits";

// Unfinished uploads (task 087, register SEC-07): an upload is recorded unconfirmed before the browser sends
// the file and confirmed when it comes back. One that never comes back is stale after an hour, and cleared
// (record and stored object) the next time anyone starts an upload in its workspace; until then it counts
// towards its uploader's cap (`MAX_UNFINISHED_UPLOADS`).

/** What follows `<workspace>/` in a key `objectKey` makes: `<project>/<random id>`. */
const PROJECT_AND_ID = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

/**
 * Before recording an upload to `project`: clears the workspace's stale uploads (`clear_stale_uploads`,
 * whoever left them) and says whether `userId` may start another. Call it inside the action's
 * `withAccess(userId, …)`: until that transaction ends it holds a lock on the user's uploads in the
 * workspace, so two starts at once can't both take the last place. Remove `staleKeys` from storage after the
 * transaction (`removeStaleObjects`): a rolled-back clearing must keep its objects.
 */
export async function prepareUpload(
  userId: string,
  project: { id: string; workspaceId: string },
): Promise<{ staleKeys: string[]; refusal: string | null }> {
  const db = getDb();
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`unfinished-uploads/${project.workspaceId}/${userId}`}, 0))`);
  const { rows } = await db.execute<{ key: string }>(sql`select clear_stale_uploads(${project.id}) as key`);
  const [mine] = await db
    .select({ unfinished: sql<number>`count(*)::int` })
    .from(schema.attachment)
    .where(
      and(
        eq(schema.attachment.workspaceId, project.workspaceId),
        eq(schema.attachment.uploadedBy, userId),
        isNull(schema.attachment.confirmedAt),
        isNull(schema.attachment.deletedAt),
      ),
    );
  return { staleKeys: rows.map((row) => row.key), refusal: unfinishedUploadsRefusal(mine?.unfinished ?? 0) };
}

/**
 * Removes the stored objects of cleared uploads, only those under the workspace's own prefix
 * (`<workspace>/<project>/<id>`, as `objectKey` makes them). Never throws: a failure leaves an object behind
 * (its record is gone), and is logged with counts only, never object names.
 */
export async function removeStaleObjects(workspaceId: string, keys: string[]): Promise<void> {
  const prefix = `${workspaceId}/`;
  const own = keys.filter((key) => key.startsWith(prefix) && PROJECT_AND_ID.test(key.slice(prefix.length)));
  const results = await Promise.allSettled(own.map((key) => remove(key)));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (own.length < keys.length) {
    console.error(`Stale uploads: skipped ${keys.length - own.length} object(s) outside the workspace`);
  }
  if (failed > 0) {
    console.error(`Stale uploads: couldn't remove ${failed} of ${own.length} object(s)`);
  }
}
