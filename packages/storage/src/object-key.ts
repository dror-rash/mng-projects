const ID = /^[A-Za-z0-9_-]+$/;

/**
 * Where a project's file goes: `<workspace>/<project>/<random id>`. Never built from a file name, so a key
 * (and a signed URL) says nothing about the file, and ids can't change the path.
 */
export function objectKey({ workspaceId, projectId }: { workspaceId: string; projectId: string }): string {
  for (const id of [workspaceId, projectId]) {
    if (!ID.test(id)) {
      throw new Error(`Not an id for an object key: "${id}"`);
    }
  }
  return `${workspaceId}/${projectId}/${crypto.randomUUID()}`;
}

/** Stub (task 086, red). */
export function workspacePrefix(workspaceId: string): string {
  throw new Error(`Not implemented: ${workspaceId}`);
}
