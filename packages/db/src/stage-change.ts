import { sql } from "drizzle-orm";

import { getDb } from "./client";

/**
 * Adds a project's stage change (task 101, ADR-0012) inside `withAccess`, after the project's stage is set (the
 * insert policy wants `to_stage` to be the project's stage). The runtime role may insert every column but
 * `changed_at` (migration 0045), and a Drizzle insert names every column, so this lists them itself and the
 * time comes from the database.
 */
export async function recordStageChange(change: {
  projectId: string;
  fromStage: string | null;
  toStage: string;
  changedBy: string;
}) {
  await getDb().execute(
    sql`insert into project_stage_change (id, project_id, from_stage, to_stage, changed_by)
        values (${crypto.randomUUID()}, ${change.projectId}, ${change.fromStage}, ${change.toStage}, ${change.changedBy})`,
  );
}
