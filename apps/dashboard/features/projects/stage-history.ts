import { desc, eq, getDb, schema, withAccess } from "@repo/db";

import type { ProjectStage } from "./project-stage";

/**
 * A new project's first history row (from nothing to its first stage), by its creator (task 101). Inside the
 * action's `withAccess`, after the project's insert: the policy needs `can_change_project`.
 */
export async function recordFirstStage(projectId: string, stage: ProjectStage, userId: string) {
  await getDb()
    .insert(schema.projectStageChange)
    .values({ id: crypto.randomUUID(), projectId, fromStage: null, toStage: stage, changedBy: userId });
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
