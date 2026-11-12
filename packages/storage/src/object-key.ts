const ID = /^[A-Za-z0-9_-]+$/;

/** An id that can be one name in a key: never empty, a `/` or `..`. */
function keyPart(id: string): string {
  if (!ID.test(id)) {
    throw new Error(`Not an id for an object key: "${id}"`);
  }
  return id;
}

/**
 * Where a project's file goes: `<workspace>/<project>/<random id>`. Never built from a file name, so a key
 * (and a signed URL) says nothing about the file, and ids can't change the path.
 */
export function objectKey({ workspaceId, projectId }: { workspaceId: string; projectId: string }): string {
  return `${workspacePrefix(workspaceId)}${keyPart(projectId)}/${crypto.randomUUID()}`;
}

/** The folder every object of a workspace is under (`<workspace>/`, see `objectKey`): what deleting it removes. */
export function workspacePrefix(workspaceId: string): string {
  return `${keyPart(workspaceId)}/`;
}
