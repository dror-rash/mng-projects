import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, withAccess } from "./client";
import { insertCustomerWithSite, insertSiteOf } from "./db-test-fixtures";
import { getMaintenanceDb } from "./maintenance";
import * as schema from "./schema";

// Photos and files (task 059, ADR-0008) against the migrated database: they follow their project; whoever
// can work on it uploads as themselves; unconfirmed uploads are the uploader's alone; the uploader and admins
// delete. Uploads left unconfirmed for over an hour are cleared by whoever works on a project of the
// workspace (task 087).

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  admin: `${run}-admin`,
  auditor: `${run}-auditor`,
  worker: `${run}-worker`,
  otherWorker: `${run}-worker2`,
  pa: `${run}-pa`,
  pb: `${run}-pb`,
  partnerA: `${run}-partner-a`,
  partnerB: `${run}-partner-b`,
  acme: `${run}-acme`,
  projectA: `${run}-project-a`,
  projectB: `${run}-project-b`,
  visitA: `${run}-visit-a`,
  visitB: `${run}-visit-b`,
  adminPhoto: `${run}-admin-photo`,
  workerPhoto: `${run}-worker-photo`,
  pending: `${run}-pending`,
  photoB: `${run}-photo-b`,
  otherWorkspace: `${run}-ws2`,
  outsider: `${run}-outsider`,
  otherCustomer: `${run}-other-customer`,
  otherProject: `${run}-other-project`,
};
const users = [ids.admin, ids.auditor, ids.worker, ids.otherWorker, ids.pa, ids.pb, ids.outsider];

async function as<T extends Record<string, unknown>>(userId: string, query: ReturnType<typeof sql>) {
  const result = await withAccess(userId, () => getDb().execute<T>(query));
  return result.rows;
}

async function writeAs(userId: string, query: ReturnType<typeof sql>): Promise<number | "refused"> {
  try {
    const result = await withAccess(userId, () => getDb().execute(query));
    return result.rowCount ?? 0;
  } catch {
    return "refused";
  }
}

const insertAttachment = (
  id: string,
  projectId: string,
  uploadedBy: string,
  { visitId = null, confirmed = true }: { visitId?: string | null; confirmed?: boolean } = {},
) =>
  sql`insert into attachment (id, workspace_id, project_id, visit_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by, confirmed_at)
      values (${id}, ${ids.workspace}, ${projectId}, ${visitId}, 'photo', ${`${ids.workspace}/${projectId}/${id}`}, 'panel.jpg', 'image/jpeg', 10,
              ${uploadedBy}, ${confirmed ? sql`now()` : sql`null`})`;

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values([
    { id: ids.workspace, name: `Attachments ${run}` },
    { id: ids.otherWorkspace, name: `Other attachments ${run}` },
  ]);
  await db.insert(schema.partner).values([
    { id: ids.partnerA, workspaceId: ids.workspace, name: "Partner A" },
    { id: ids.partnerB, workspaceId: ids.workspace, name: "Partner B" },
  ]);
  await db.insert(schema.workspaceMember).values([
    { workspaceId: ids.workspace, userId: ids.admin, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.auditor, role: "auditor" },
    { workspaceId: ids.workspace, userId: ids.worker, role: "worker" },
    { workspaceId: ids.workspace, userId: ids.otherWorker, role: "worker" },
    { workspaceId: ids.workspace, userId: ids.pa, role: "partner", partnerId: ids.partnerA },
    { workspaceId: ids.workspace, userId: ids.pb, role: "partner", partnerId: ids.partnerB },
    { workspaceId: ids.otherWorkspace, userId: ids.outsider, role: "admin" },
  ]);
  await db.insert(schema.organization).values({ id: ids.acme, workspaceId: ids.workspace, name: "Acme Ltd" });
  await db.insert(schema.customerPartner).values([
    { organizationId: ids.acme, partnerId: ids.partnerA, workspaceId: ids.workspace },
    { organizationId: ids.acme, partnerId: ids.partnerB, workspaceId: ids.workspace },
  ]);
  const at = { organizationId: ids.acme, siteId: await insertSiteOf(ids.workspace, ids.acme) };
  await db.insert(schema.project).values([
    { id: ids.projectA, name: "A", workspaceId: ids.workspace, ...at, visibility: "partner", partnerId: ids.partnerA },
    { id: ids.projectB, name: "B", workspaceId: ids.workspace, ...at, visibility: "partner", partnerId: ids.partnerB },
  ]);
  const other = await insertCustomerWithSite(ids.otherWorkspace, ids.otherCustomer);
  await db.insert(schema.project).values({ id: ids.otherProject, name: "Other", workspaceId: ids.otherWorkspace, ...other });
  await db.execute(sql`insert into project_worker (project_id, user_id, workspace_id) values
    (${ids.projectA}, ${ids.worker}, ${ids.workspace}), (${ids.projectA}, ${ids.otherWorker}, ${ids.workspace})`);
  await db.execute(sql`insert into site_visit (id, project_id, visited_on, created_by) values
    (${ids.visitA}, ${ids.projectA}, current_date, ${ids.admin}), (${ids.visitB}, ${ids.projectB}, current_date, ${ids.admin})`);
  await db.execute(insertAttachment(ids.adminPhoto, ids.projectA, ids.admin, { visitId: ids.visitA }));
  await db.execute(insertAttachment(ids.workerPhoto, ids.projectA, ids.worker));
  await db.execute(insertAttachment(ids.pending, ids.projectA, ids.worker, { confirmed: false }));
  await db.execute(insertAttachment(ids.photoB, ids.projectB, ids.pb));
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id in (${ids.workspace}, ${ids.otherWorkspace})`);
  await db.execute(sql`delete from "user" where id in (${sql.join(users.map((u) => sql`${u}`), sql`, `)})`);
});

describe("who sees photos and files", () => {
  const seen = (user: string) =>
    as<{ id: string }>(user, sql`select id from attachment where workspace_id = ${ids.workspace} order by id`).then((rows) =>
      rows.map((r) => r.id).sort(),
    );

  it("shows a project's confirmed ones to whoever sees the project, and unconfirmed ones only to their uploader", async () => {
    expect(await seen(ids.worker)).toEqual([ids.adminPhoto, ids.pending, ids.workerPhoto].sort());
    expect(await seen(ids.otherWorker)).toEqual([ids.adminPhoto, ids.workerPhoto].sort());
    expect(await seen(ids.pa)).toEqual([ids.adminPhoto, ids.workerPhoto].sort());
    expect(await seen(ids.auditor)).toEqual([ids.adminPhoto, ids.photoB, ids.workerPhoto].sort());
  });

  it("hides another partner's", async () => {
    expect(await seen(ids.pb)).toEqual([ids.photoB]);
  });
});

describe("what may be stored where", () => {
  it("keeps a visit's attachment on the visit's own project", async () => {
    await expect(getMaintenanceDb().execute(insertAttachment(`${run}-x`, ids.projectA, ids.admin, { visitId: ids.visitB }))).rejects.toThrow();
  });

  it("never moves an attachment to another project or visit", async () => {
    expect(await writeAs(ids.admin, sql`update attachment set project_id = ${ids.projectB} where id = ${ids.adminPhoto}`)).toBe("refused");
    expect(await writeAs(ids.admin, sql`update attachment set visit_id = null where id = ${ids.adminPhoto}`)).toBe("refused");
  });
});

describe("who uploads, confirms and deletes", () => {
  it("lets whoever works on the project upload, as themselves and unconfirmed", async () => {
    expect(await writeAs(ids.worker, insertAttachment(`${run}-w`, ids.projectA, ids.worker, { confirmed: false }))).toBe(1);
    expect(await writeAs(ids.worker, insertAttachment(`${run}-c`, ids.projectA, ids.worker))).toBe("refused");
    expect(await writeAs(ids.worker, insertAttachment(`${run}-as`, ids.projectA, ids.admin, { confirmed: false }))).toBe("refused");
    expect(await writeAs(ids.auditor, insertAttachment(`${run}-au`, ids.projectA, ids.auditor, { confirmed: false }))).toBe("refused");
    expect(await writeAs(ids.pa, insertAttachment(`${run}-pb`, ids.projectB, ids.pa, { confirmed: false }))).toBe("refused");
  });

  it("lets the uploader confirm or remove their unconfirmed upload, nobody else", async () => {
    const id = `${run}-mine`;
    await getMaintenanceDb().execute(insertAttachment(id, ids.projectA, ids.worker, { confirmed: false }));
    expect(await writeAs(ids.otherWorker, sql`update attachment set confirmed_at = now() where id = ${id}`)).toBe(0);
    expect(await writeAs(ids.otherWorker, sql`delete from attachment where id = ${id}`)).toBe(0);
    expect(await writeAs(ids.worker, sql`update attachment set confirmed_at = now() where id = ${id}`)).toBe(1);
    expect(await writeAs(ids.worker, sql`delete from attachment where id = ${id}`)).toBe(0);
  });

  it("lets the uploader and admins delete, and admins restore", async () => {
    const del = async (user: string, id: string) => (await as<{ ok: boolean }>(user, sql`select delete_attachment(${id}) as ok`))[0]?.ok;
    expect(await del(ids.otherWorker, ids.workerPhoto)).toBe(false);
    expect(await del(ids.worker, ids.adminPhoto)).toBe(false);
    expect(await del(ids.pa, ids.workerPhoto)).toBe(false);
    expect(await del(ids.worker, ids.workerPhoto)).toBe(true);
    expect(await as(ids.worker, sql`select id from attachment where id = ${ids.workerPhoto}`)).toHaveLength(0);
    expect(await writeAs(ids.admin, sql`update attachment set deleted_at = null, deleted_by = null where id = ${ids.workerPhoto}`)).toBe(1);
    expect(await del(ids.admin, ids.workerPhoto)).toBe(true);
  });

  it("hides the photos of a deleted visit, except from admins and auditors", async () => {
    const db = getMaintenanceDb();
    await db.execute(sql`update site_visit set deleted_at = now() where id = ${ids.visitA}`);
    expect(await as(ids.pa, sql`select id from attachment where id = ${ids.adminPhoto}`)).toHaveLength(0);
    expect(await as(ids.worker, sql`select id from attachment where id = ${ids.adminPhoto}`)).toHaveLength(0);
    expect(await as(ids.auditor, sql`select id from attachment where id = ${ids.adminPhoto}`)).toHaveLength(1);
    await db.execute(sql`update site_visit set deleted_at = null where id = ${ids.visitA}`);
  });

  it("lets the app change only whether an upload is confirmed or deleted, and its checked size", async () => {
    const id = `${run}-cols`;
    await getMaintenanceDb().execute(insertAttachment(id, ids.projectA, ids.worker, { confirmed: false }));
    expect(await writeAs(ids.worker, sql`update attachment set kind = 'file' where id = ${id}`)).toBe("refused");
    expect(await writeAs(ids.worker, sql`update attachment set file_name = 'x.exe' where id = ${id}`)).toBe("refused");
    expect(await writeAs(ids.worker, sql`update attachment set content_type = 'text/html' where id = ${id}`)).toBe("refused");
    expect(await writeAs(ids.worker, sql`update attachment set size_bytes = 11, confirmed_at = now() where id = ${id}`)).toBe(1);
  });

  it("can't call the attachment functions as PUBLIC", async () => {
    const { rows } = await getMaintenanceDb().execute<{ ok: boolean }>(
      sql`select has_function_privilege('public', 'can_change_attachment(text, text)', 'EXECUTE')
             or has_function_privilege('public', 'delete_attachment(text)', 'EXECUTE')
             or has_function_privilege('public', 'clear_stale_uploads(text)', 'EXECUTE') as ok`,
    );
    expect(rows[0]?.ok).toBe(false);
  });
});

describe("clearing stale uploads", () => {
  /** An upload in `workspace`'s `project`, recorded `minutes` ago. */
  const upload = (
    id: string,
    { workspace = ids.workspace, project = ids.projectA, by = ids.worker as string | null, minutes = 61, confirmed = false, deleted = false } = {},
  ) =>
    getMaintenanceDb().execute(
      sql`insert into attachment (id, workspace_id, project_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by, created_at, confirmed_at, deleted_at)
          values (${id}, ${workspace}, ${project}, 'photo', ${`${workspace}/${project}/${id}`}, 'panel.jpg', 'image/jpeg', 10, ${by},
                  localtimestamp - make_interval(mins => ${minutes}),
                  ${confirmed ? sql`localtimestamp` : sql`null`}, ${deleted ? sql`localtimestamp` : sql`null`})`,
    );
  const clear = (user: string, project: string) =>
    as<{ key: string }>(user, sql`select clear_stale_uploads(${project}) as key`).then((rows) => rows.map((r) => r.key).sort());
  const remaining = (prefix: string) =>
    getMaintenanceDb()
      .execute<{ id: string }>(sql`select id from attachment where id like ${`${prefix}%`} order by id`)
      .then(({ rows }) => rows.map((r) => r.id));
  const keyOf = (id: string, project = ids.projectA, workspace = ids.workspace) => `${workspace}/${project}/${id}`;

  it("deletes the workspace's uploads left unconfirmed for over an hour, whoever left them, and returns their keys", async () => {
    const p = `${run}-stale1-`;
    await upload(`${p}mine`);
    await upload(`${p}other-partner`, { project: ids.projectB, by: ids.pb });
    await upload(`${p}deleted-uploader`, { by: null });
    await upload(`${p}recent`, { minutes: 59 });
    await upload(`${p}old-confirmed`, { confirmed: true, minutes: 600 });
    await upload(`${p}old-deleted`, { confirmed: true, deleted: true, minutes: 600 });
    await upload(`${p}other-workspace`, { workspace: ids.otherWorkspace, project: ids.otherProject, by: ids.outsider });

    expect(await clear(ids.otherWorker, ids.projectA)).toEqual(
      [keyOf(`${p}mine`), keyOf(`${p}other-partner`, ids.projectB), keyOf(`${p}deleted-uploader`)].sort(),
    );
    expect(await remaining(p)).toEqual([`${p}old-confirmed`, `${p}old-deleted`, `${p}other-workspace`, `${p}recent`]);
    await getMaintenanceDb().execute(sql`delete from attachment where id like ${`${p}%`}`);
  });

  it("clears nothing for someone who can't work on the project", async () => {
    const p = `${run}-stale2-`;
    await upload(`${p}a`);
    await upload(`${p}b`, { project: ids.projectB, by: ids.pb });

    expect(await clear(ids.auditor, ids.projectA)).toEqual([]);
    expect(await clear(ids.pa, ids.projectB)).toEqual([]);
    expect(await clear(ids.outsider, ids.projectA)).toEqual([]);
    expect(await clear(ids.worker, `${run}-made-up`)).toEqual([]);
    expect(await remaining(p)).toEqual([`${p}a`, `${p}b`]);

    expect(await clear(ids.pb, ids.projectB)).toEqual([keyOf(`${p}a`), keyOf(`${p}b`, ids.projectB)].sort());
  });
});
