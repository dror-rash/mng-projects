import { schema, sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listChecklistTicksForProjects } from "./checklist-queries";
import { listStageChangedAt } from "./stage-history";

// The stage board's two batch reads (task 123, reused by task 124) against the migrated database in DATABASE_URL,
// as the runtime role: only the current workspace's projects the user can see, not deleted, whatever ids are asked
// for. The admin administers both workspaces; partner B's user sees only partner B's projects.

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  otherWorkspace: `${run}-ws2`,
  admin: `${run}-admin`,
  pb: `${run}-pb`,
  partnerA: `${run}-partner-a`,
  partnerB: `${run}-partner-b`,
  customer: `${run}-customer`,
  otherCustomer: `${run}-customer2`,
  site: `${run}-site`,
  otherSite: `${run}-site2`,
  projectA: `${run}-project-a`,
  projectB: `${run}-project-b`,
  deleted: `${run}-deleted`,
  elsewhere: `${run}-elsewhere`,
};
const projects = [ids.projectA, ids.projectB, ids.deleted, ids.elsewhere];
const changedAt = new Date("2026-11-04T09:30:00Z");

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values([ids.admin, ids.pb].map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values([
    { id: ids.workspace, name: `Board ${run}` },
    { id: ids.otherWorkspace, name: `Board other ${run}` },
  ]);
  await db.insert(schema.partner).values([
    { id: ids.partnerA, workspaceId: ids.workspace, name: "Partner A" },
    { id: ids.partnerB, workspaceId: ids.workspace, name: "Partner B" },
  ]);
  await db.insert(schema.workspaceMember).values([
    { workspaceId: ids.workspace, userId: ids.admin, role: "admin" },
    { workspaceId: ids.otherWorkspace, userId: ids.admin, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.pb, role: "partner", partnerId: ids.partnerB },
  ]);
  await db.insert(schema.organization).values([
    { id: ids.customer, workspaceId: ids.workspace, name: "Acme Ltd" },
    { id: ids.otherCustomer, workspaceId: ids.otherWorkspace, name: "Globex" },
  ]);
  await db.insert(schema.customerPartner).values([
    { organizationId: ids.customer, partnerId: ids.partnerA, workspaceId: ids.workspace },
    { organizationId: ids.customer, partnerId: ids.partnerB, workspaceId: ids.workspace },
  ]);
  await db.insert(schema.site).values([
    { id: ids.site, workspaceId: ids.workspace, organizationId: ids.customer, name: "Yard" },
    { id: ids.otherSite, workspaceId: ids.otherWorkspace, organizationId: ids.otherCustomer, name: "Depot" },
  ]);
  const here = { workspaceId: ids.workspace, organizationId: ids.customer, siteId: ids.site, stage: "quote" };
  await db.insert(schema.project).values([
    { id: ids.projectA, name: "A", ...here, visibility: "partner", partnerId: ids.partnerA },
    { id: ids.projectB, name: "B", ...here, visibility: "partner", partnerId: ids.partnerB },
    { id: ids.deleted, name: "Deleted", ...here },
    { id: ids.elsewhere, name: "Elsewhere", workspaceId: ids.otherWorkspace, organizationId: ids.otherCustomer, siteId: ids.otherSite, stage: "quote" },
  ]);
  for (const project of projects) {
    await db.execute(sql`insert into project_checklist_tick (project_id, item, ticked_by) values (${project}, 'quote.costed', ${ids.admin})`);
    await db.execute(sql`insert into project_stage_change (id, project_id, from_stage, to_stage, changed_at)
      values (${`${project}-change`}, ${project}, 'inquiry', 'quote', ${changedAt.toISOString()})`);
  }
  await db.execute(sql`update project set deleted_at = now() where id = ${ids.deleted}`);
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id in (${ids.workspace}, ${ids.otherWorkspace})`);
  await db.execute(sql`delete from "user" where id in (${ids.admin}, ${ids.pb})`);
});

const tickedProjects = async (userId: string, projectIds: string[]) =>
  (await listChecklistTicksForProjects(userId, ids.workspace, projectIds)).map((t) => t.projectId).sort();

const changedProjects = async (userId: string, projectIds: string[]) =>
  [...(await listStageChangedAt(userId, ids.workspace, projectIds)).keys()].sort();

describe("listChecklistTicksForProjects", () => {
  it("gives the workspace's visible projects' ticks", async () => {
    expect(await tickedProjects(ids.admin, [ids.projectA, ids.projectB])).toEqual([ids.projectA, ids.projectB].sort());
  });

  it("gives nothing for a deleted project or another workspace's, even to their admin", async () => {
    expect(await tickedProjects(ids.admin, [ids.deleted, ids.elsewhere])).toEqual([]);
  });

  it("gives a partner's user nothing for another partner's project", async () => {
    expect(await tickedProjects(ids.pb, [ids.projectA, ids.projectB])).toEqual([ids.projectB]);
  });
});

describe("listStageChangedAt", () => {
  it("gives the workspace's visible projects' latest changes", async () => {
    expect(await listStageChangedAt(ids.admin, ids.workspace, [ids.projectA])).toEqual(new Map([[ids.projectA, changedAt]]));
  });

  it("gives nothing for a deleted project or another workspace's, even to their admin", async () => {
    expect(await changedProjects(ids.admin, [ids.deleted, ids.elsewhere])).toEqual([]);
  });

  it("gives a partner's user nothing for another partner's project", async () => {
    expect(await changedProjects(ids.pb, [ids.projectA, ids.projectB])).toEqual([ids.projectB]);
  });
});
