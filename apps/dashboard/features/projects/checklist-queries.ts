import { and, eq, getDb, inArray, schema, sql, withAccess } from "@repo/db";

import { todayUtc } from "@/features/tasks/due-dates";

import { visibleProjects } from "./queries";

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

/** A tick as the stage board reads it (task 123): which project and item, and when. */
export type ProjectChecklistTick = { projectId: string; item: string; tickedAt: Date };

/**
 * The ticked checklist items of the listed projects' current stages, in one query (the stage board, task 123; Needs
 * action, task 124): the caller groups them by project. Item keys start with their stage ("quote.sent"), so other
 * stages' ticks, which don't count for whose move or the wait (ADR-0014), stay in the database; a project at an
 * unknown stored stage gets none. Only the workspace's projects `userId` can see and not deleted, whatever ids are
 * asked for (`visibleProjects`, on top of RLS).
 */
export async function listChecklistTicksForProjects(userId: string, workspaceId: string, projectIds: string[]): Promise<ProjectChecklistTick[]> {
  if (projectIds.length === 0) return [];
  return withAccess(userId, () =>
    getDb()
      .select({
        projectId: schema.projectChecklistTick.projectId,
        item: schema.projectChecklistTick.item,
        tickedAt: schema.projectChecklistTick.tickedAt,
      })
      .from(schema.projectChecklistTick)
      .innerJoin(schema.project, eq(schema.projectChecklistTick.projectId, schema.project.id))
      .where(
        and(
          inArray(schema.projectChecklistTick.projectId, projectIds),
          visibleProjects(userId, workspaceId),
          sql`starts_with(${schema.projectChecklistTick.item}, ${schema.project.stage} || '.')`,
        ),
      ),
  );
}
