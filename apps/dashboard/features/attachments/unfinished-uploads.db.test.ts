import { getDb, schema, sql, withAccess } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";
import { createUploadUrl, remove, stat } from "@repo/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prepareUpload, removeStaleObjects } from "./unfinished-uploads";

// Unfinished uploads (task 087) against the migrated database in DATABASE_URL and the local storage server
// (STORAGE_BUCKET, STORAGE_LOCAL_URL): stale ones are cleared with their stored objects when an upload
// starts, and a person has at most 10 unfinished ones per workspace, even when two start at once.

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  me: `${run}-me`,
  colleague: `${run}-colleague`,
  customer: `${run}-customer`,
  site: `${run}-site`,
  project: `${run}-project`,
};
const project = { id: ids.project, workspaceId: ids.workspace };
const TOO_MANY = "Too many uploads in progress. Try again later.";

const keyOf = (id: string) => `${ids.workspace}/${ids.project}/${id}`;
const keys: string[] = [];

/** An upload recorded `minutes` ago, with a stored object when `stored`. */
async function upload(id: string, { by = ids.me, minutes = 0, confirmed = false, stored = false } = {}) {
  await getMaintenanceDb().execute(
    sql`insert into attachment (id, workspace_id, project_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by, created_at, confirmed_at)
        values (${id}, ${ids.workspace}, ${ids.project}, 'photo', ${keyOf(id)}, 'panel.jpg', 'image/jpeg', 5, ${by},
                localtimestamp - make_interval(mins => ${minutes}), ${confirmed ? sql`localtimestamp` : sql`null`})`,
  );
  if (stored) await store(keyOf(id));
}

async function store(key: string) {
  keys.push(key);
  const { url, headers } = await createUploadUrl({ key, contentType: "image/jpeg", maxBytes: 100 });
  const response = await fetch(url, { method: "PUT", headers, body: "12345" });
  expect(response.ok).toBe(true);
}

async function rowsLike(prefix: string) {
  const { rows } = await getMaintenanceDb().execute<{ id: string }>(sql`select id from attachment where id like ${`${prefix}%`} order by id`);
  return rows.map((r) => r.id);
}

/** Starts an upload as the action does: prepare, then record it unless refused. */
function startUpload(id: string, beforeInsert: Promise<void> = Promise.resolve(), prepared?: () => void) {
  return withAccess(ids.me, async () => {
    const { refusal } = await prepareUpload(ids.me, project);
    prepared?.();
    if (refusal) return refusal;
    await beforeInsert;
    await getDb()
      .insert(schema.attachment)
      .values({
        id,
        workspaceId: ids.workspace,
        projectId: ids.project,
        kind: "photo",
        storageKey: keyOf(id),
        fileName: "panel.jpg",
        contentType: "image/jpeg",
        sizeBytes: 5,
        uploadedBy: ids.me,
      });
    return "recorded";
  });
}

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values([ids.me, ids.colleague].map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values({ id: ids.workspace, name: `Unfinished uploads ${run}` });
  await db.insert(schema.workspaceMember).values([
    { workspaceId: ids.workspace, userId: ids.me, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.colleague, role: "admin" },
  ]);
  await db.insert(schema.organization).values({ id: ids.customer, workspaceId: ids.workspace, name: "Acme Ltd" });
  await db.insert(schema.site).values({ id: ids.site, workspaceId: ids.workspace, organizationId: ids.customer, name: "Main site" });
  await db.insert(schema.project).values({ id: ids.project, name: "Panel upgrade", workspaceId: ids.workspace, organizationId: ids.customer, siteId: ids.site });
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id = ${ids.workspace}`);
  await db.execute(sql`delete from "user" where id in (${ids.me}, ${ids.colleague})`);
  await Promise.all(keys.map((key) => remove(key)));
});

describe("clearing stale uploads", () => {
  it("removes the workspace's uploads left unconfirmed for over an hour, records and objects, and keeps the rest", async () => {
    const p = `${run}-clear-`;
    await upload(`${p}mine-stale`, { minutes: 61, stored: true });
    await upload(`${p}colleague-stale`, { by: ids.colleague, minutes: 120, stored: true });
    await upload(`${p}mine-recent`, { minutes: 5, stored: true });
    await upload(`${p}confirmed-old`, { minutes: 600, confirmed: true, stored: true });

    const { staleKeys, refusal } = await withAccess(ids.me, () => prepareUpload(ids.me, project));
    await removeStaleObjects(ids.workspace, staleKeys);

    expect(refusal).toBeNull();
    expect([...staleKeys].sort()).toEqual([keyOf(`${p}colleague-stale`), keyOf(`${p}mine-stale`)]);
    expect(await rowsLike(p)).toEqual([`${p}confirmed-old`, `${p}mine-recent`]);
    expect(await stat(keyOf(`${p}mine-stale`))).toBeNull();
    expect(await stat(keyOf(`${p}colleague-stale`))).toBeNull();
    expect(await stat(keyOf(`${p}mine-recent`))).not.toBeNull();
    expect(await stat(keyOf(`${p}confirmed-old`))).not.toBeNull();
    await getMaintenanceDb().execute(sql`delete from attachment where id like ${`${p}%`}`);
  });

  it("never removes an object outside the workspace's own prefix", async () => {
    const outside = `${run}-elsewhere/project/object`;
    await store(outside);

    await removeStaleObjects(ids.workspace, [outside, `${ids.workspace}x/project/object`, `${ids.workspace}/../${outside}`]);

    expect(await stat(outside)).not.toBeNull();
  });
});

describe("the cap on unfinished uploads", () => {
  it("refuses the 11th unfinished upload of mine in the workspace, not counting a colleague's or confirmed ones", async () => {
    const p = `${run}-cap-`;
    for (let i = 0; i < 9; i++) await upload(`${p}${i}`);
    await upload(`${p}colleague`, { by: ids.colleague });
    await upload(`${p}confirmed`, { confirmed: true });

    expect(await startUpload(`${p}10th`)).toBe("recorded");
    expect(await startUpload(`${p}11th`)).toBe(TOO_MANY);
    expect(await rowsLike(`${p}1`)).toEqual([`${p}1`, `${p}10th`]);
    await getMaintenanceDb().execute(sql`delete from attachment where id like ${`${p}%`}`);
  });

  it("lets only one of two uploads started at once take the 10th place", async () => {
    const p = `${run}-race-`;
    for (let i = 0; i < 9; i++) await upload(`${p}${i}`);

    // The first start has counted 9 and holds its transaction open; the second starts and counts meanwhile.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let firstPrepared!: () => void;
    const prepared = new Promise<void>((resolve) => (firstPrepared = resolve));
    const first = startUpload(`${p}a`, gate, firstPrepared);
    await Promise.race([prepared, first.catch(() => undefined)]);
    const second = startUpload(`${p}b`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();

    expect([await first, await second]).toEqual(["recorded", TOO_MANY]);
    await getMaintenanceDb().execute(sql`delete from attachment where id like ${`${p}%`}`);
  });
});
