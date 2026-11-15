import { and, asc, eq, getDb, isNull, schema, sql, withAccess } from "@repo/db";

import { canSeeCustomerName, partnerServesCustomer } from "@/features/access/predicates";

import { customerAllowed, mayCreateFor, siteAllowed } from "./project-owner-check";
import { DEFAULT_STAGE } from "./project-stage";
import { requireProjectAccess } from "./require-project-access";
import { recordFirstStage } from "./stage-history";

export type CopyProjectInput = {
  name: string;
  /** The new project's owner: one partner, or null for internal. */
  ownerPartnerId: string | null;
  customerId: string;
  /** One of the customer's sites (task 055). */
  siteId: string;
};

/**
 * Copies a project into a new one with its own owner (ADR-0006 rule 4a) and returns the new id. Runs as
 * `userId` in one `withAccess` transaction, so row-level security checks every insert too. The copy takes
 * the source's description and its tasks that aren't deleted (title, description, status, priority, due
 * date), never assignees, and a task's customer only while the new owner may see its name; it records the
 * source in `copied_from_id`.
 *
 * Refuses, with the same error as a missing project: a source `userId` can't change, an owner they may not
 * create for (a partner's user: only their own partner), and a customer or site the new owner may not have. Not an
 * action (it takes `userId`); `copyProjectAction` calls it.
 */
export async function copyProject(userId: string, sourceId: string, input: CopyProjectInput): Promise<string> {
  return withAccess(userId, async () => {
    const source = await requireProjectAccess(userId, sourceId);
    if (
      !(await mayCreateFor(userId, source.workspaceId, input.ownerPartnerId)) ||
      !(await customerAllowed(source.workspaceId, input.ownerPartnerId, input.customerId)) ||
      !(await siteAllowed(source.workspaceId, input.ownerPartnerId, input.customerId, input.siteId))
    ) {
      throw new Error("Not found");
    }

    const id = crypto.randomUUID();
    const db = getDb();
    await db.insert(schema.project).values({
      id,
      name: input.name,
      description: source.description,
      workspaceId: source.workspaceId,
      organizationId: input.customerId,
      siteId: input.siteId,
      ...(input.ownerPartnerId
        ? { visibility: "partner", partnerId: input.ownerPartnerId }
        : { visibility: "internal", partnerId: null }),
      ownerId: userId,
      copiedFromId: source.id,
    });
    // A copy starts over at Inquiry (task 101), whatever the source's stage.
    await recordFirstStage(id, DEFAULT_STAGE, userId);

    // A task's own customer stays only if the new owner may see its name (rule 7a): a partner's customers
    // for a partner's project, any the copier sees for an internal one (only admins create those).
    const keepCustomer = input.ownerPartnerId
      ? partnerServesCustomer(input.ownerPartnerId, schema.task.organizationId)
      : canSeeCustomerName(userId, schema.task.organizationId);
    const tasks = await db
      .select({
        title: schema.task.title,
        description: schema.task.description,
        status: schema.task.status,
        priority: schema.task.priority,
        dueDate: schema.task.dueDate,
        organizationId: sql<string | null>`case when ${keepCustomer} then ${schema.task.organizationId} end`,
      })
      .from(schema.task)
      .where(and(eq(schema.task.projectId, source.id), isNull(schema.task.deletedAt)))
      .orderBy(asc(schema.task.createdAt), asc(schema.task.id));
    if (tasks.length > 0) {
      // A millisecond apart, in the source's order: boards list tasks oldest first.
      const start = Date.now();
      await db.insert(schema.task).values(
        tasks.map((task, i) => ({ ...task, id: crypto.randomUUID(), projectId: id, createdAt: new Date(start + i) })),
      );
    }
    return id;
  });
}
