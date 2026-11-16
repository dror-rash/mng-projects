import { eq, getDb, schema, withAccess } from "@repo/db";

import { todayUtc } from "@/features/tasks/due-dates";

/** A ticked checklist item (task 120): who ticked it (null once their account is deleted) and the day, UTC. */
export type ChecklistTick = { item: string; tickedByName: string | null; tickedOn: string };

/**
 * A project's ticked checklist items, every stage's (ticks stay with their stage, ADR-0014). Rows follow the
 * project's visibility (RLS: `can_see_project`), so someone who can't see the project gets none.
 */
export async function listChecklistTicks(userId: string, projectId: string): Promise<ChecklistTick[]> {
  const rows = await withAccess(userId, () =>
    getDb()
      .select({
        item: schema.projectChecklistTick.item,
        tickedByName: schema.user.name,
        tickedAt: schema.projectChecklistTick.tickedAt,
      })
      .from(schema.projectChecklistTick)
      .leftJoin(schema.user, eq(schema.projectChecklistTick.tickedBy, schema.user.id))
      .where(eq(schema.projectChecklistTick.projectId, projectId)),
  );
  return rows.map(({ item, tickedByName, tickedAt }) => ({ item, tickedByName, tickedOn: todayUtc(tickedAt) }));
}
