import { listMemberships } from "@/features/workspaces/queries";

import { headerWorkspace } from "./header-workspace";

/**
 * `AppFrame` props for a record's page, naming the record's workspace. Looks up memberships only when
 * the record isn't in the current workspace.
 */
export async function recordWorkspace(userId: string, current: { id: string; name: string }, recordWorkspaceId: string) {
  const memberships = recordWorkspaceId === current.id ? [] : await listMemberships(userId);
  return headerWorkspace(current, recordWorkspaceId, memberships);
}
