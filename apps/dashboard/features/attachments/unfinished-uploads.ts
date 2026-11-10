// Unfinished uploads (task 087). Not implemented yet.

export async function prepareUpload(userId: string, project: { id: string; workspaceId: string }): Promise<{ staleKeys: string[]; refusal: string | null }> {
  void userId;
  void project;
  throw new Error("Not implemented");
}

export async function removeStaleObjects(workspaceId: string, keys: string[]): Promise<void> {
  void workspaceId;
  void keys;
  throw new Error("Not implemented");
}
