import { sql } from "drizzle-orm";

import { getDb } from "./client";

/**
 * Ticks a project's checklist item (task 120, ADR-0014) inside `withAccess`, as `tickedBy` (the insert policy
 * wants the current user). The runtime role may insert every column but `ticked_at` (migration 0046), and a
 * Drizzle insert names every column, so this lists them itself and the time comes from the database. An item
 * that is already ticked stays as it was (who ticked it, and when).
 */
export async function tickChecklistItem(tick: { projectId: string; item: string; tickedBy: string }) {
  await getDb().execute(
    sql`insert into project_checklist_tick (project_id, item, ticked_by)
        values (${tick.projectId}, ${tick.item}, ${tick.tickedBy})
        on conflict (project_id, item) do nothing`,
  );
}

/** Unticks a project's checklist item inside `withAccess`; an open item stays open. */
export async function untickChecklistItem(tick: { projectId: string; item: string }) {
  await getDb().execute(
    sql`delete from project_checklist_tick where project_id = ${tick.projectId} and item = ${tick.item}`,
  );
}
