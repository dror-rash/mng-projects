import "server-only";

import { removePrefix, workspacePrefix } from "@repo/storage";

/**
 * Deletes a deleted workspace's photos, files and reports from storage (task 086, SEC-08): everything under
 * its folder. Call it only after the delete has committed, with the id of the row it deleted. A storage
 * failure doesn't fail the delete (the rows are gone and can't come back): it is logged with the workspace
 * id only, never the error (its message can name objects), and the folder is left for a later sweep. So is
 * an id that isn't one (`workspacePrefix` refuses it): nothing here throws after the commit.
 */
export async function removeWorkspaceFiles(workspaceId: string): Promise<void> {
  try {
    await removePrefix(workspacePrefix(workspaceId));
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    console.error("Could not delete a deleted workspace's files from storage", {
      workspaceId,
      ...(typeof code === "number" || typeof code === "string" ? { code } : {}),
    });
  }
}
