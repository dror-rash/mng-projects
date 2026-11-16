import { schema, sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listChecklistTicks, listChecklistTicksForProjects } from "./checklist-queries";
import { copyProject } from "./copy";

// A project's checklist ticks as the project page reads them (task 120), against the migrated database in
// DATABASE_URL, as the runtime role: each tick with who ticked it (their name, or null once their account is
// deleted) and the day; a copy starts with none.

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  admin: `${run}-admin`,
  leaver: `${run}-leaver`,
  customer: `${run}-customer`,
  site: `${run}-site`,
  project: `${run}-project`,
  other: `${run}-other`,
};

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values([
    { id: ids.admin, name: "Dana Admin", email: `${ids.admin}@example.test` },
    { id: ids.leaver, name: "Lee Leaver", email: `${ids.leaver}@example.test` },
  ]);
  await db.insert(schema.workspace).values({ id: ids.workspace, name: `Checklist ${run}` });
  await db.insert(schema.workspaceMember).values({ workspaceId: ids.workspace, userId: ids.admin, role: "admin" });
  await db.insert(schema.organization).values({ id: ids.customer, workspaceId: ids.workspace, name: "Acme Ltd" });
  await db.insert(schema.site).values({ id: ids.site, workspaceId: ids.workspace, organizationId: ids.customer, name: "Yard" });
  await db.insert(schema.project).values({
    id: ids.project, name: "Panel upgrade", workspaceId: ids.workspace, organizationId: ids.customer, siteId: ids.site, stage: "quote",
  });
  await db.insert(schema.project).values({
    id: ids.other, name: "Fire alarm", workspaceId: ids.workspace, organizationId: ids.customer, siteId: ids.site, stage: "ordered",
  });
  await db.execute(sql`insert into project_checklist_tick (project_id, item, ticked_by, ticked_at) values
    (${ids.project}, 'quote.costed', ${ids.admin}, '2026-11-02 10:00'),
    (${ids.project}, 'quote.sent', ${ids.leaver}, '2026-11-03 23:30'),
    (${ids.project}, 'inquiry.logged', ${ids.admin}, '2026-11-01 08:00'),
    (${ids.other}, 'ordered.payment_terms', ${ids.admin}, '2026-11-05 12:00')`);
  await db.execute(sql`delete from "user" where id = ${ids.leaver}`);
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id = ${ids.workspace}`);
  await db.execute(sql`delete from "user" where id in (${ids.admin}, ${ids.leaver})`);
});

describe("listChecklistTicks", () => {
  it("gives every tick of the project with who ticked it and the day", async () => {
    const ticks = await listChecklistTicks(ids.admin, ids.project);
    expect([...ticks].sort((a, b) => a.item.localeCompare(b.item))).toEqual([
      { item: "inquiry.logged", tickedByName: "Dana Admin", tickedOn: "2026-11-01" },
      { item: "quote.costed", tickedByName: "Dana Admin", tickedOn: "2026-11-02" },
      { item: "quote.sent", tickedByName: null, tickedOn: "2026-11-03" },
    ]);
  });

  it("gives nothing to someone who can't see the project", async () => {
    expect(await listChecklistTicks(`${run}-nobody`, ids.project)).toEqual([]);
  });
});

describe("listChecklistTicksForProjects", () => {
  it("gives the listed projects' ticks with each tick's project, item and time", async () => {
    const ticks = await listChecklistTicksForProjects(ids.admin, ids.workspace, [ids.project, ids.other]);
    expect([...ticks].sort((a, b) => a.tickedAt.getTime() - b.tickedAt.getTime())).toEqual([
      { projectId: ids.project, item: "inquiry.logged", tickedAt: new Date("2026-11-01T08:00:00Z") },
      { projectId: ids.project, item: "quote.costed", tickedAt: new Date("2026-11-02T10:00:00Z") },
      { projectId: ids.project, item: "quote.sent", tickedAt: new Date("2026-11-03T23:30:00Z") },
      { projectId: ids.other, item: "ordered.payment_terms", tickedAt: new Date("2026-11-05T12:00:00Z") },
    ]);
  });

  it("gives only the listed projects' ticks", async () => {
    const ticks = await listChecklistTicksForProjects(ids.admin, ids.workspace, [ids.other]);
    expect(ticks.map((t) => t.item)).toEqual(["ordered.payment_terms"]);
  });

  it("gives nothing to someone who can't see the projects, or for no projects", async () => {
    expect(await listChecklistTicksForProjects(`${run}-nobody`, ids.workspace, [ids.project, ids.other])).toEqual([]);
    expect(await listChecklistTicksForProjects(ids.admin, ids.workspace, [])).toEqual([]);
  });
});

describe("copying a project", () => {
  it("starts the copy with no ticks", async () => {
    const id = await copyProject(ids.admin, ids.project, { name: "Panel upgrade 2", ownerPartnerId: null, customerId: ids.customer, siteId: ids.site });
    expect(await listChecklistTicks(ids.admin, id)).toEqual([]);
  });
});
