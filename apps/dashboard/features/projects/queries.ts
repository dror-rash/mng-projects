import { and, customerLabelOf, desc, eq, getDb, getTableColumns, isNull, schema, withAccess } from "@repo/db";

import { canChangeProject, canSeeProject, canWorkOnProject } from "@/features/access/predicates";
import { inCompanyGroup } from "@/features/organizations/queries";

/** The project's customer's label from `customer_name` (its own workspace's only), one lookup per project. */
const projectCustomerName = () => customerLabelOf(schema.project.organizationId, schema.project.workspaceId);

/**
 * Project columns plus the linked customer's name, when the user may see it (null otherwise or without
 * one). Names come from `customer_name` (ADR-0006), so a partner's users see them too. Inside `withAccess`.
 */
function selectWithCustomer() {
  return getDb()
    .select({ ...getTableColumns(schema.project), customerName: projectCustomerName() })
    .from(schema.project);
}

/**
 * The project with its customer's name, whether `userId` may change it and whether they may work on its
 * tasks (task 056), only if they can see it (ADR-0006). Not deleted ones.
 */
export async function getProjectForUser(userId: string, projectId: string) {
  const [project] = await withAccess(userId, () =>
    getDb()
      .select({
        ...getTableColumns(schema.project),
        customerName: projectCustomerName(),
        canChange: canChangeProject(userId, schema.project.id),
        canWork: canWorkOnProject(userId, schema.project.id),
      })
      .from(schema.project)
      .where(and(eq(schema.project.id, projectId), isNull(schema.project.deletedAt), canSeeProject(userId, schema.project.id))),
  );
  return project ?? null;
}

/** SQL condition: the projects `userId` can see in a workspace (not deleted). For queries that join `project`. */
export function visibleProjects(userId: string, workspaceId: string) {
  return and(
    eq(schema.project.workspaceId, workspaceId),
    isNull(schema.project.deletedAt),
    canSeeProject(userId, schema.project.id),
  );
}

/** The workspace's projects `userId` can see, newest first; pass `limit` for just the most recent. */
export async function listProjects(userId: string, workspaceId: string, limit?: number) {
  return withAccess(userId, async () => {
    const query = selectWithCustomer()
      .where(visibleProjects(userId, workspaceId))
      .orderBy(desc(schema.project.createdAt));
    return limit === undefined ? query : query.limit(limit);
  });
}

/**
 * The workspace's projects for one customer and its sub-companies (task 053) that `userId` can see, newest
 * first ("previous projects").
 */
export async function listCustomerProjects(userId: string, workspaceId: string, organizationId: string) {
  return withAccess(userId, async () =>
    selectWithCustomer()
      .where(and(visibleProjects(userId, workspaceId), inCompanyGroup(schema.project.organizationId, organizationId)))
      .orderBy(desc(schema.project.createdAt)),
  );
}

/**
 * The projects at the site `siteId` that `userId` can see (not deleted), newest first: the site page's
 * Projects section (task 072). A partner's users see only their partner's.
 */
export async function listSiteProjects(userId: string, siteId: string) {
  return withAccess(userId, async () =>
    getDb()
      .select({
        id: schema.project.id,
        name: schema.project.name,
        description: schema.project.description,
        createdAt: schema.project.createdAt,
      })
      .from(schema.project)
      .where(and(eq(schema.project.siteId, siteId), isNull(schema.project.deletedAt), canSeeProject(userId, schema.project.id)))
      .orderBy(desc(schema.project.createdAt), desc(schema.project.id)),
  );
}
