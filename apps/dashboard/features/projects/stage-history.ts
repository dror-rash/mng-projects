import { desc, eq, getDb, inArray, recordStageChange, schema, sql, withAccess } from "@repo/db";

import type { ProjectStage } from "./project-stage";

/**
 * A new project's first history row (from nothing to its first stage), by its creator (task 101). Inside the
 * action's `withAccess`, after the project's insert: the policy needs `can_change_project` and the project's stage.
 */
export async function recordFirstStage(projectId: string, stage: ProjectStage, userId: string) {
  await recordStageChange({ projectId, fromStage: null, toStage: stage, changedBy: userId });
}

/**
 * When the project's latest stage change happened ("<Stage> since <date>"), or null without one (projects
 * made before their history, by seeds or fixtures). Rows follow the project's visibility (RLS).
 */
export async function getStageChangedAt(userId: string, projectId: string): Promise<Date | null> {
  const [latest] = await withAccess(userId, () =>
    getDb()
      .select({ changedAt: schema.projectStageChange.changedAt })
      .from(schema.projectStageChange)
      .where(eq(schema.projectStageChange.projectId, projectId))
      .orderBy(desc(schema.projectStageChange.changedAt))
      .limit(1),
  );
  return latest?.changedAt ?? null;
}

/**
 * Each listed project's latest stage change, in one query (the stage board, task 123); a project without history
 * has none. Rows follow the project's visibility (RLS).
 */
export async function listStageChangedAt(userId: string, projectIds: string[]): Promise<Map<string, Date>> {
  if (projectIds.length === 0) return new Map();
  const rows = await withAccess(userId, () =>
    getDb()
      .select({
        projectId: schema.projectStageChange.projectId,
        changedAt: sql<Date>`max(${schema.projectStageChange.changedAt})`.mapWith(schema.projectStageChange.changedAt),
      })
      .from(schema.projectStageChange)
      .where(inArray(schema.projectStageChange.projectId, projectIds))
      .groupBy(schema.projectStageChange.projectId),
  );
  return new Map(rows.map((r) => [r.projectId, r.changedAt]));
}
