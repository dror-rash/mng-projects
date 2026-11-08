import type { getMaintenanceDb } from "@repo/db/maintenance";

import type { ServerFacts } from "@/features/demo/local-reset";

/** Not yet implemented (task 080, red). */
export async function readServerFacts(_db: ReturnType<typeof getMaintenanceDb>): Promise<ServerFacts> {
  throw new Error("readServerFacts is not implemented yet.");
}
