import { schema, sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { copyProject } from "./copy";
import { getStageChangedAt } from "./stage-history";

// The stage history's writers other than the stage action (task 101), against the migrated database in
// DATABASE_URL, as the runtime role: a copy starts over at Inquiry with its first history row.

const run = crypto.randomUUID().slice(0, 8);
const ids = { workspace: `${run}-ws`, admin: `${run}-admin`, customer: `${run}-customer`, site: `${run}-site`, source: `${run}-source` };

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values({ id: ids.admin, name: ids.admin, email: `${ids.admin}@example.test` });
  await db.insert(schema.workspace).values({ id: ids.workspace, name: `Stage history ${run}` });
  await db.insert(schema.workspaceMember).values({ workspaceId: ids.workspace, userId: ids.admin, role: "admin" });
  await db.insert(schema.organization).values({ id: ids.customer, workspaceId: ids.workspace, name: "Acme Ltd" });
  await db.insert(schema.site).values({ id: ids.site, workspaceId: ids.workspace, organizationId: ids.customer, name: "Yard" });
  await db.insert(schema.project).values({
    id: ids.source, name: "Panel upgrade", workspaceId: ids.workspace, organizationId: ids.customer, siteId: ids.site, stage: "billing",
  });
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id = ${ids.workspace}`);
  await db.execute(sql`delete from "user" where id = ${ids.admin}`);
});

describe("copying a project", () => {
  it("starts the copy at Inquiry, with a first history row by me, whatever the source's stage", async () => {
    const id = await copyProject(ids.admin, ids.source, { name: "Panel upgrade 2", ownerPartnerId: null, customerId: ids.customer, siteId: ids.site });
    const db = getMaintenanceDb();
    const [copy] = (await db.execute<{ stage: string }>(sql`select stage from project where id = ${id}`)).rows;
    expect(copy).toEqual({ stage: "inquiry" });
    const changes = await db.execute(sql`select from_stage, to_stage, changed_by from project_stage_change where project_id = ${id}`);
    expect(changes.rows).toEqual([{ from_stage: null, to_stage: "inquiry", changed_by: ids.admin }]);
    expect(await getStageChangedAt(ids.admin, id)).toBeInstanceOf(Date);
  });
});
