import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, withAccess } from "./client";
import { CHECK, errorCode, insertCustomerWithSite } from "./db-test-fixtures";
import { getMaintenanceDb } from "./maintenance";
import * as schema from "./schema";

// Deleting a user account (task 088, SEC-18) while their workspace still exists: what they made stays, its
// "created by" becomes null (the user foreign keys' ON DELETE SET NULL), and nothing else changes. An author
// is never reassigned to another user, nor cleared while their account exists, nor re-pointed once it is null.

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  admin: `${run}-admin`,
  worker: `${run}-worker`,
  leaver: `${run}-leaver`,
  uploader: `${run}-uploader`,
  visitor: `${run}-visitor`,
  crewWorker: `${run}-crew-worker`,
  partner: `${run}-partner`,
  acme: `${run}-acme`,
  project: `${run}-project`,
  adminVisit: `${run}-admin-visit`,
};
const users = [ids.admin, ids.worker, ids.leaver, ids.uploader, ids.visitor, ids.crewWorker];

const visit = (id: string, by: string) =>
  sql`insert into site_visit (id, project_id, visited_on, created_by) values (${id}, ${ids.project}, current_date, ${by})`;

const photo = (id: string, by: string, visitId: string | null = null) =>
  sql`insert into attachment (id, workspace_id, project_id, visit_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by, confirmed_at)
      values (${id}, ${ids.workspace}, ${ids.project}, ${visitId}, 'photo', ${`${ids.workspace}/${ids.project}/${id}`}, 'panel.jpg', 'image/jpeg', 10,
              ${by}, now())`;

const deleteUser = (id: string) => getMaintenanceDb().execute(sql`delete from "user" where id = ${id}`);

/** What a function call returns for `userId` (the first column of its one row). */
async function callAs(userId: string, query: ReturnType<typeof sql>) {
  const result = await withAccess(userId, () => getDb().execute<{ ok: unknown }>(query));
  return result.rows[0]?.ok;
}

async function writeAs(userId: string, query: ReturnType<typeof sql>): Promise<number | "refused"> {
  try {
    const result = await withAccess(userId, () => getDb().execute(query));
    return result.rowCount ?? 0;
  } catch {
    return "refused";
  }
}

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values({ id: ids.workspace, name: `User delete ${run}` });
  await db.insert(schema.workspaceMember).values([
    { workspaceId: ids.workspace, userId: ids.admin, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.leaver, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.worker, role: "worker" },
    { workspaceId: ids.workspace, userId: ids.uploader, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.visitor, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.crewWorker, role: "worker" },
  ]);
  const at = await insertCustomerWithSite(ids.workspace, ids.acme, "Acme Ltd");
  await db.insert(schema.project).values({ id: ids.project, name: "Project", workspaceId: ids.workspace, ...at, ownerId: ids.admin });
  await db.execute(visit(ids.adminVisit, ids.admin));
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id = ${ids.workspace}`);
  await db.execute(sql`delete from "user" where id in (${sql.join(users.map((u) => sql`${u}`), sql`, `)})`);
});

describe("deleting a user whose workspace still exists", () => {
  it("keeps the photos they uploaded, with no uploader, and never gives them another", async () => {
    const db = getMaintenanceDb();
    const id = `${run}-uploaded`;
    await db.execute(photo(id, ids.uploader));
    expect(await errorCode(deleteUser(ids.uploader))).toBe("succeeded");
    const rows = await db.execute(sql`select uploaded_by from attachment where id = ${id}`);
    expect(rows.rows).toEqual([{ uploaded_by: null }]);
    const repoint = sql`update attachment set uploaded_by = ${ids.admin} where id = ${id}`;
    expect(await errorCode(db.execute(repoint))).toBe(CHECK);
    expect(await writeAs(ids.admin, repoint)).toBe("refused");
  });

  it("keeps the visits they recorded, with no author, and never gives them another", async () => {
    const db = getMaintenanceDb();
    const id = `${run}-recorded`;
    await db.execute(visit(id, ids.visitor));
    expect(await errorCode(deleteUser(ids.visitor))).toBe("succeeded");
    const rows = await db.execute(sql`select created_by from site_visit where id = ${id}`);
    expect(rows.rows).toEqual([{ created_by: null }]);
    const repoint = sql`update site_visit set created_by = ${ids.admin} where id = ${id}`;
    expect(await errorCode(db.execute(repoint))).toBe(CHECK);
    expect(await writeAs(ids.admin, repoint)).toBe("refused");
  });

  it("takes a worker off their crews and their assigned tasks", async () => {
    const db = getMaintenanceDb();
    const id = `${run}-crew-task`;
    await db.execute(sql`insert into project_worker (project_id, user_id, workspace_id) values (${ids.project}, ${ids.crewWorker}, ${ids.workspace})`);
    await db.insert(schema.task).values({ id, projectId: ids.project, title: "Assigned to the worker", assigneeId: ids.crewWorker });
    expect(await errorCode(deleteUser(ids.crewWorker))).toBe("succeeded");
    expect((await db.execute(sql`select user_id from project_worker where user_id = ${ids.crewWorker}`)).rows).toEqual([]);
    expect((await db.execute(sql`select assignee_id from task where id = ${id}`)).rows).toEqual([{ assignee_id: null }]);
  });

  it("keeps every row they made or touched, clears them from it, and changes nothing else", async () => {
    const db = getMaintenanceDb();
    const by = ids.leaver;
    const r = (name: string) => `${run}-l-${name}`;
    // Everything a member does in the app, as rows: what they made (a customer with a note, a site, a project, a
    // crew member they added, an invite link, a visit with a photo and a reading of a form they made), what they're
    // on (a task assigned to them, a visit they're listed on), and what they deleted (a customer, a note, a
    // contact, a site and a site contact, a project, a task, a visit, a photo, a reading, a partner).
    await db.insert(schema.organization).values({ id: r("customer"), workspaceId: ids.workspace, name: "Leaver's customer", ownerId: by });
    await db.insert(schema.organizationNote).values({ id: r("note"), organizationId: r("customer"), body: "Called them", authorId: by });
    await db.insert(schema.organizationNote).values({
      id: r("deleted-note"), organizationId: ids.acme, body: "Wrong customer", authorId: ids.admin, deletedAt: new Date(), deletedBy: by,
    });
    await db.insert(schema.organization).values({
      id: r("deleted-customer"), workspaceId: ids.workspace, name: "Deleted customer", ownerId: ids.admin, deletedAt: new Date(), deletedBy: by,
    });
    await db.insert(schema.organizationContact).values({
      id: r("contact"), organizationId: r("customer"), name: "Gone", deletedAt: new Date(), deletedBy: by,
    });
    await db.insert(schema.site).values([
      { id: r("site"), workspaceId: ids.workspace, organizationId: r("customer"), name: "Yard", createdBy: by },
      { id: r("deleted-site"), workspaceId: ids.workspace, organizationId: ids.acme, name: "Old yard", deletedAt: new Date(), deletedBy: by },
    ]);
    await db.insert(schema.siteContact).values({ id: r("site-contact"), siteId: r("site"), name: "Gatekeeper", deletedAt: new Date(), deletedBy: by });
    await db.insert(schema.project).values([
      { id: r("project"), name: "Leaver's project", workspaceId: ids.workspace, organizationId: r("customer"), siteId: r("site"), ownerId: by },
      { id: r("deleted-project"), name: "Deleted", workspaceId: ids.workspace, organizationId: r("customer"), siteId: r("site"), ownerId: ids.admin },
    ]);
    await db.execute(sql`insert into project_worker (project_id, user_id, workspace_id, added_by) values (${ids.project}, ${ids.worker}, ${ids.workspace}, ${by})`);
    await db.insert(schema.workspaceInvite).values({
      id: r("invite"), workspaceId: ids.workspace, tokenHash: r("token"), createdBy: by, expiresAt: new Date(Date.now() + 86_400_000),
    });
    await db.insert(schema.partner).values({ id: ids.partner, workspaceId: ids.workspace, name: "Partner", deletedAt: new Date(), deletedBy: by });
    await db.insert(schema.task).values([
      { id: r("assigned"), projectId: ids.project, title: "Assigned to them", assigneeId: by },
      { id: r("deleted-task"), projectId: ids.project, title: "Deleted by them" },
    ]);
    expect(await callAs(by, sql`select delete_task(${r("deleted-task")}) as ok`)).toBe(true);
    expect(await writeAs(by, sql`update project set deleted_at = now(), deleted_by = ${by} where id = ${r("deleted-project")}`)).toBe(1);
    await db.execute(visit(r("visit"), by));
    await db.execute(visit(r("deleted-visit"), by));
    expect(await callAs(by, sql`select delete_visit(${r("deleted-visit")}) as ok`)).toBe(true);
    await db.execute(sql`insert into site_visit_member (visit_id, user_id) values (${ids.adminVisit}, ${by}), (${r("visit")}, ${by})`);
    await db.execute(photo(r("photo"), by, r("visit")));
    await db.execute(photo(r("deleted-photo"), ids.admin, ids.adminVisit));
    expect(await callAs(by, sql`select delete_attachment(${r("deleted-photo")}) as ok`)).toBe(true);
    await db.execute(sql`insert into form_template (id, workspace_id, name, created_by) values (${r("form")}, ${ids.workspace}, 'Form', ${by})`);
    await db.execute(sql`insert into form_template_version (id, template_id, version) values (${r("form-v1")}, ${r("form")}, 1)`);
    await db.execute(sql`insert into form_field (id, version_id, label, type, position) values (${r("form-f1")}, ${r("form-v1")}, 'Voltage', 'number', 1)`);
    await db.execute(sql`update form_template set status = 'published' where id = ${r("form")}`);
    await db.execute(sql`insert into form_submission (id, visit_id, version_id, "values", submitted_by)
      values (${r("reading")}, ${r("visit")}, ${r("form-v1")}, '{"f": 230}'::jsonb, ${by})`);
    // Readings are append-only for now (no delete in the app); the column is there for later tasks.
    await db.execute(sql`insert into form_submission (id, visit_id, version_id, "values", submitted_by, deleted_at, deleted_by)
      values (${r("deleted-reading")}, ${ids.adminVisit}, ${r("form-v1")}, '{}'::jsonb, ${ids.admin}, now(), ${by})`);

    const before = await snapshot();
    expect(await errorCode(deleteUser(by))).toBe("succeeded");
    const after = await snapshot();

    // The account and the rows that are about the user (their membership, being listed on a visit) go; in every
    // other row, the user's id becomes null and nothing else changes.
    const membershipTables = ["workspace_member", "site_visit_member", "project_worker"];
    const expected = before
      .filter(({ table, row }) => !(table === "user" && row.id === by))
      .filter(({ table, row }) => !(membershipTables.includes(table) && row.user_id === by))
      .map(({ table, row }) => ({
        table,
        row: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === by ? null : value])),
      }));
    expect(sorted(after)).toEqual(sorted(expected));
    // The snapshot did see every user column, once per row above.
    const pointsAtUser = (rows: typeof before) =>
      rows.flatMap(({ table, row }) => Object.keys(row).filter((key) => row[key] === by).map((key) => `${table}.${key}`)).sort();
    expect(pointsAtUser(before)).toEqual(
      [
        "user.id",
        "user.name", // the tests name users by their id
        "workspace_member.user_id",
        "workspace_invite.created_by",
        "partner.deleted_by",
        "organization.owner_id",
        "organization.deleted_by",
        "organization_note.author_id",
        "organization_note.deleted_by",
        "organization_contact.deleted_by",
        "site.created_by",
        "site.deleted_by",
        "site_contact.deleted_by",
        "project.owner_id",
        "project.deleted_by",
        "project_worker.added_by",
        "task.assignee_id",
        "task.deleted_by",
        "site_visit.created_by", // the visit with the photo and reading
        "site_visit.created_by", // the deleted visit
        "site_visit.deleted_by",
        "site_visit_member.user_id", // listed on the admin's visit
        "site_visit_member.user_id", // and on their own
        "attachment.uploaded_by",
        "attachment.deleted_by",
        "form_template.created_by",
        "form_submission.submitted_by",
        "form_submission.deleted_by",
      ].sort(),
    );
    expect(pointsAtUser(after)).toEqual([]);
  });
});

describe("changing who made a photo or a visit", () => {
  it("never passes an upload off as another user's, nor clears its uploader while their account exists", async () => {
    const db = getMaintenanceDb();
    await db.execute(photo(`${run}-kept`, ids.admin));
    expect(await errorCode(db.execute(sql`update attachment set uploaded_by = ${ids.worker} where id = ${`${run}-kept`}`))).toBe(CHECK);
    expect(await errorCode(db.execute(sql`update attachment set uploaded_by = null where id = ${`${run}-kept`}`))).toBe(CHECK);
  });

  it("never passes a visit off as another user's, nor clears its author while their account exists", async () => {
    const db = getMaintenanceDb();
    expect(await errorCode(db.execute(sql`update site_visit set created_by = ${ids.worker} where id = ${ids.adminVisit}`))).toBe(CHECK);
    expect(await errorCode(db.execute(sql`update site_visit set created_by = null where id = ${ids.adminVisit}`))).toBe(CHECK);
    expect(await writeAs(ids.admin, sql`update site_visit set created_by = null where id = ${ids.adminVisit}`)).toBe("refused");
  });
});

const snapshotTables = [
  "user", "workspace", "workspace_member", "workspace_invite", "partner", "organization", "organization_contact",
  "organization_note", "site", "site_contact", "project", "project_worker", "task", "site_visit", "site_visit_member", "attachment",
  "form_template", "form_template_version", "form_field", "form_submission",
] as const;

/** Every row of this run (its users and workspace) in the tables above, as JSON. */
async function snapshot() {
  const db = getMaintenanceDb();
  const rows: { table: string; row: Record<string, unknown> }[] = [];
  for (const table of snapshotTables) {
    const result = await db.execute<{ row: Record<string, unknown> }>(
      sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where to_jsonb(t)::text like ${`%${run}%`}`,
    );
    rows.push(...result.rows.map(({ row }) => ({ table, row })));
  }
  return rows;
}

const sorted = (rows: { table: string; row: Record<string, unknown> }[]) =>
  rows.map((r) => JSON.stringify(r)).sort();
