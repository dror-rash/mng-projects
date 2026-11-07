// The deploy runs the seed with one connection (DB_POOL_MAX=1, task 076); so do these tests. Set before the
// maintenance pool is made: a query outside the seed's transaction while it runs would wait forever.
process.env.DB_POOL_MAX = "1";

import { isDeepStrictEqual } from "node:util";

import { and, buildPoolConfig, eq, inArray, schema, sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";
import { afterAll, describe, expect, it } from "vitest";

import { planCounts, seedSummary } from "@/features/demo/deploy-seed";
import { buildDemoPlan, DEMO_FORM, DEMO_TAG } from "@/features/demo/seed-plan";
import { parseReadingValues, type ReadingField, fieldInputName, YES_NO } from "@/features/readings/reading-values";

import { runSeedDemo } from "./seed-demo-run";

// The demo seed (task 076) against the migrated database: field data (a published reading form, visits and
// readings) on the demo projects, reruns that replace only demo data, and the deploy mode's skips and refusals.

const run = crypto.randomUUID().slice(0, 8);
const db = getMaintenanceDb();
const now = new Date();
const counts = planCounts(buildDemoPlan(now));
const userIds: string[] = [];
const workspaceIds: string[] = [];

// What the seed sends, seen on the pool's connection (pg's own types aren't a dashboard dependency).
type QueryResult = { rows: Record<string, unknown>[] };
type PgClient = { query: (...args: unknown[]) => unknown };
type PgPool = { on: (event: "acquire", listener: (client: PgClient) => void) => void; query: (text: string, values?: unknown[]) => Promise<QueryResult>; end: () => Promise<void> };
const pool = (db as unknown as { $client: PgPool }).$client;
/** The statements sent since the last reset, and a hook run after each one (while its transaction is open). */
const sent = { statements: [] as string[], after: null as ((text: string) => Promise<void>) | null };
const watched = new WeakSet<PgClient>();
pool.on("acquire", (client) => {
  if (watched.has(client)) return;
  watched.add(client);
  const query = client.query.bind(client);
  client.query = (...args: unknown[]) => {
    const text = typeof args[0] === "string" ? args[0] : String((args[0] as { text?: string })?.text ?? "");
    sent.statements.push(text);
    const result = query(...args);
    const after = sent.after;
    return after && result instanceof Promise ? result.then(async (value) => (await after(text), value)) : result;
  };
});

/** A throwaway account (`@example.test`), in `workspaces` workspaces with `role`, and maybe another member. */
async function account(label: string, { workspaces = 1, role = "admin", otherMember = false } = {}) {
  const id = `${run}-${label}`;
  const email = `${id}@example.test`;
  userIds.push(id);
  await db.insert(schema.user).values({ id, name: label, email });
  const ids: string[] = [];
  for (let i = 0; i < workspaces; i++) {
    const workspaceId = `${id}-ws${i}`;
    ids.push(workspaceId);
    workspaceIds.push(workspaceId);
    await db.insert(schema.workspace).values({ id: workspaceId, name: `${label}'s workspace ${i}` });
    await db.insert(schema.workspaceMember).values({ workspaceId, userId: id, role, joinedAt: new Date(now.getTime() - (workspaces - i) * 60_000) });
  }
  if (otherMember) {
    const other = `${id}-other`;
    userIds.push(other);
    await db.insert(schema.user).values({ id: other, name: "Other", email: `${other}@example.test` });
    await db.insert(schema.workspaceMember).values({ workspaceId: ids[0]!, userId: other, role: "admin" });
  }
  return { id, email, workspaceId: ids[0]!, workspaceIds: ids };
}

async function rowCounts(workspaceId: string) {
  const [row] = await db.execute<{ customers: number; projects: number; tasks: number; visits: number; members: number; readings: number; forms: number }>(sql`
    select
      (select count(*)::int from organization o where o.workspace_id = ${workspaceId}) as customers,
      (select count(*)::int from project p where p.workspace_id = ${workspaceId}) as projects,
      (select count(*)::int from task t join project p on p.id = t.project_id where p.workspace_id = ${workspaceId}) as tasks,
      (select count(*)::int from site_visit v join project p on p.id = v.project_id where p.workspace_id = ${workspaceId}) as visits,
      (select count(*)::int from site_visit_member m join site_visit v on v.id = m.visit_id join project p on p.id = v.project_id
        where p.workspace_id = ${workspaceId}) as members,
      (select count(*)::int from form_submission r join site_visit v on v.id = r.visit_id join project p on p.id = v.project_id
        where p.workspace_id = ${workspaceId}) as readings,
      (select count(*)::int from form_template f where f.workspace_id = ${workspaceId}) as forms`).then((r) => r.rows);
  return row!;
}

/** The workspace's published forms named like the demo form. */
async function demoForms(workspaceId: string) {
  return db
    .select({ id: schema.formTemplate.id, status: schema.formTemplate.status, updatedAt: schema.formTemplate.updatedAt })
    .from(schema.formTemplate)
    .where(and(eq(schema.formTemplate.workspaceId, workspaceId), eq(schema.formTemplate.name, DEMO_FORM.name)));
}

/** A form named like the demo form, with `fields` in version 1, left a draft or published as the app does. */
async function insertForm(workspaceId: string, label: string, fields: Omit<ReadingField, "id">[], publish: boolean) {
  const formId = `${run}-${label}`;
  const versionId = `${formId}-v1`;
  await db.insert(schema.formTemplate).values({ id: formId, workspaceId, name: DEMO_FORM.name });
  await db.insert(schema.formTemplateVersion).values({ id: versionId, templateId: formId, version: 1 });
  await db.insert(schema.formField).values(fields.map((f, i) => ({ id: `${versionId}-f${i}`, versionId, position: i + 1, ...f })));
  if (publish) await db.update(schema.formTemplate).set({ status: "published" }).where(eq(schema.formTemplate.id, formId));
  return { formId, versionId };
}

/** Whether every reading in the workspace has values the reading form accepts for its version's fields. */
async function readingsAccepted(workspaceId: string) {
  const readings = await db.execute<{ version_id: string; values: Record<string, unknown> }>(sql`
    select r.version_id, r.values from form_submission r join site_visit v on v.id = r.visit_id join project p on p.id = v.project_id
    where p.workspace_id = ${workspaceId}`);
  for (const reading of readings.rows) {
    const fields = await db
      .select({ id: schema.formField.id, label: schema.formField.label, type: schema.formField.type, required: schema.formField.required, unit: schema.formField.unit, options: schema.formField.options })
      .from(schema.formField)
      .where(eq(schema.formField.versionId, reading.version_id));
    const formData = new FormData();
    for (const field of fields) {
      const value = reading.values[field.id];
      if (value === undefined) continue;
      formData.set(fieldInputName(field.id), field.type === "yes_no" ? YES_NO.find((o) => o.stored === value)!.value : String(value));
    }
    const parsed = parseReadingValues(formData, fields);
    // jsonb keeps its own key order: compare the values, not their text.
    if (!parsed.ok || !isDeepStrictEqual(parsed.value, reading.values)) return false;
  }
  return readings.rows.length > 0;
}

afterAll(async () => {
  sent.after = null;
  // Deleting a workspace takes its customers, projects, visits, readings and forms with it.
  if (workspaceIds.length > 0) await db.delete(schema.workspace).where(inArray(schema.workspace.id, workspaceIds));
  if (userIds.length > 0) await db.delete(schema.user).where(inArray(schema.user.id, userIds));
});

describe("seed:demo (local)", () => {
  it("uses one connection, as the deploy gives it", () => {
    expect((db as unknown as { $client: { options: { max: number } } }).$client.options.max).toBe(1);
  });

  it("seeds visits with the seeding user there, and readings of the published demo form", async () => {
    const me = await account("local");
    const result = await runSeedDemo(db, { email: me.email, deploy: false }, now);
    expect(result.code).toBe(0);

    const rows = await rowCounts(me.workspaceId);
    expect(rows).toMatchObject({ projects: counts.projects, tasks: counts.tasks, visits: counts.visits, members: counts.visits, readings: counts.readings, forms: 1 });
    const [form] = await demoForms(me.workspaceId);
    expect(form!.status).toBe("published");
    const fields = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from form_field f join form_template_version v on v.id = f.version_id
      where v.template_id = ${form!.id} and v.published_at is not null`);
    expect(fields.rows[0]!.n).toBe(DEMO_FORM.fields.length);
    expect(await readingsAccepted(me.workspaceId)).toBe(true);

    const visits = await db.execute<{ ok: boolean }>(sql`
      select bool_and(v.created_by = ${me.id} and m.user_id = ${me.id} and v.visited_on < (now() at time zone 'utc')::date
        and v.recorded_at::date = v.visited_on and v.notes <> '') as ok
      from site_visit v join site_visit_member m on m.visit_id = v.id join project p on p.id = v.project_id
      where p.workspace_id = ${me.workspaceId}`);
    expect(visits.rows[0]!.ok).toBe(true);
    const readings = await db.execute<{ ok: boolean }>(sql`
      select bool_and(r.submitted_by = ${me.id} and r.recorded_at::date = v.visited_on and r.submitted_at::date = v.visited_on) as ok
      from form_submission r join site_visit v on v.id = r.visit_id join project p on p.id = v.project_id
      where p.workspace_id = ${me.workspaceId}`);
    expect(readings.rows[0]!.ok).toBe(true);
  });

  it("replaces only the demo data on a rerun, and reuses the form", async () => {
    const me = await account("rerun");
    // Not demo data: a customer of the user's own, with a project and a visit.
    await db.insert(schema.organization).values({ id: `${run}-mine`, workspaceId: me.workspaceId, kind: "customer", name: "Mine", tags: ["keep"] });
    await db.insert(schema.site).values({ id: `${run}-mine-site`, workspaceId: me.workspaceId, organizationId: `${run}-mine`, name: "Mine site", address: "1 Road" });
    await db.insert(schema.project).values({ id: `${run}-mine-p`, name: "Mine", workspaceId: me.workspaceId, organizationId: `${run}-mine`, siteId: `${run}-mine-site` });
    await db.insert(schema.siteVisit).values({ id: `${run}-mine-v`, projectId: `${run}-mine-p`, visitedOn: "2026-01-02", createdBy: me.id });

    expect((await runSeedDemo(db, { email: me.email, deploy: false }, now)).code).toBe(0);
    const [form] = await demoForms(me.workspaceId);
    const first = await rowCounts(me.workspaceId);
    const result = await runSeedDemo(db, { email: me.email, deploy: false }, now);
    expect(result).toEqual({ code: 0, message: seedSummary(counts, { workspaceName: "rerun's workspace 0", replaced: counts.customers + counts.subCompanies }) });

    expect(await rowCounts(me.workspaceId)).toEqual(first);
    expect(first).toMatchObject({ customers: counts.customers + counts.subCompanies + 1, projects: counts.projects + 1, visits: counts.visits + 1 });
    expect(await demoForms(me.workspaceId)).toEqual([form]);
    const mine = await db.select({ id: schema.siteVisit.id }).from(schema.siteVisit).where(eq(schema.siteVisit.id, `${run}-mine-v`));
    expect(mine).toHaveLength(1);
  });

  it("fills in a published form of that name that is already there, without changing it", async () => {
    const me = await account("reuse");
    const theirs = await insertForm(
      me.workspaceId,
      "theirs",
      [
        { label: "Checked on", type: "date", required: true, unit: null, options: null },
        { label: "Pressure", type: "number", required: true, unit: "bar", options: null },
      ],
      true,
    );
    const before = await demoForms(me.workspaceId);

    expect((await runSeedDemo(db, { email: me.email, deploy: false }, now)).code).toBe(0);

    expect(await demoForms(me.workspaceId)).toEqual(before);
    const versions = await db.execute<{ version_id: string }>(sql`
      select distinct r.version_id from form_submission r join site_visit v on v.id = r.visit_id join project p on p.id = v.project_id
      where p.workspace_id = ${me.workspaceId}`);
    expect(versions.rows).toEqual([{ version_id: theirs.versionId }]);
    expect(await readingsAccepted(me.workspaceId)).toBe(true);
  });

  it("leaves a draft of that name a draft, and publishes its own form", async () => {
    const me = await account("draft");
    const draft = await insertForm(me.workspaceId, "draft", [{ label: "Voltage", type: "number", required: false, unit: "V", options: null }], false);

    expect((await runSeedDemo(db, { email: me.email, deploy: false }, now)).code).toBe(0);

    const forms = await demoForms(me.workspaceId);
    expect(forms.find((f) => f.id === draft.formId)?.status).toBe("draft");
    expect(forms.filter((f) => f.status === "published")).toHaveLength(1);
  });

  it("finds the account by its email in any case, with spaces around it", async () => {
    const me = await account("case-local");
    expect((await runSeedDemo(db, { email: `  ${me.email.toUpperCase()} `, deploy: false }, now)).code).toBe(0);
    expect(await rowCounts(me.workspaceId)).toMatchObject({ projects: counts.projects });
  });

  it("refuses an email with no account", async () => {
    const result = await runSeedDemo(db, { email: `${run}-nobody@example.test`, deploy: false }, now);
    expect(result.code).toBe(1);
  });
});

describe("seed:demo --deploy", () => {
  it("seeds a fresh demo account once, printing counts only, and skips the next time", async () => {
    const me = await account("deploy");
    const result = await runSeedDemo(db, { email: me.email, deploy: true }, now);
    expect(result).toEqual({ code: 0, message: seedSummary(counts) });
    expect(result.message).not.toContain(me.email);
    expect(result.message).not.toContain("workspace");

    const seeded = await rowCounts(me.workspaceId);
    expect(seeded).toMatchObject({ visits: counts.visits, readings: counts.readings, forms: 1 });
    const ids = await db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.workspaceId, me.workspaceId));

    expect(await runSeedDemo(db, { email: me.email, deploy: true }, now)).toEqual({ code: 0, message: "Skipped: the demo workspace already has demo data." });
    expect(await rowCounts(me.workspaceId)).toEqual(seeded);
    expect(await db.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.workspaceId, me.workspaceId))).toEqual(ids);
  });

  it("skips when the only demo customer left is deleted", async () => {
    const me = await account("deleted");
    await db.insert(schema.organization).values({ id: `${run}-gone`, workspaceId: me.workspaceId, kind: "customer", name: "Gone", tags: [DEMO_TAG], deletedAt: now });

    expect(await runSeedDemo(db, { email: me.email, deploy: true }, now)).toEqual({ code: 0, message: "Skipped: the demo workspace already has demo data." });
    expect(await rowCounts(me.workspaceId)).toMatchObject({ customers: 1, projects: 0, forms: 0 });
  });

  it("skips an email with no account, and an account with no workspace", async () => {
    expect(await runSeedDemo(db, { email: `${run}-nobody@example.test`, deploy: true }, now)).toEqual({
      code: 0,
      message: "Skipped: the demo account hasn't signed up yet.",
    });
    const me = await account("no-workspace", { workspaces: 0 });
    expect(await runSeedDemo(db, { email: me.email, deploy: true }, now)).toEqual({
      code: 0,
      message: "Skipped: the demo account hasn't opened the dashboard yet.",
    });
  });

  it.each([
    ["two workspaces", { workspaces: 2 }],
    ["a worker's workspace", { role: "worker" }],
    ["a shared workspace", { otherMember: true }],
  ])("refuses %s and writes nothing", async (label, setup) => {
    const me = await account(`refuse-${label.replaceAll(" ", "-").replaceAll("'", "")}`, setup);
    const result = await runSeedDemo(db, { email: me.email, deploy: true }, now);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/^Refused: /);
    expect(result.message).not.toContain(me.email);
    for (const workspaceId of me.workspaceIds) {
      expect(await rowCounts(workspaceId)).toMatchObject({ customers: 0, projects: 0, forms: 0 });
    }
  });

  it("refuses --workspace and writes nothing", async () => {
    const me = await account("flag");
    const result = await runSeedDemo(db, { email: me.email, workspace: "flag's workspace 0", deploy: true }, now);
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/--workspace/);
    expect(await rowCounts(me.workspaceId)).toMatchObject({ customers: 0, forms: 0 });
  });

  it("finds the demo account by its email in any case, with spaces around it", async () => {
    const me = await account("case-deploy");
    expect(await runSeedDemo(db, { email: ` ${me.email.toUpperCase()}  `, deploy: true }, now)).toEqual({ code: 0, message: seedSummary(counts) });
  });

  it("never deletes, nor looks for demo data to replace", async () => {
    const me = await account("no-replace");
    sent.statements = [];
    expect((await runSeedDemo(db, { email: me.email, deploy: true }, now)).code).toBe(0);
    expect(sent.statements.filter((text) => /^\s*delete\b/i.test(text))).toEqual([]);
    expect(sent.statements.filter((text) => /^select "id" from "organization"/.test(text))).toEqual([]);
  });

  it("leaves demo customers in another workspace as they are", async () => {
    const other = await account("other-demo");
    expect((await runSeedDemo(db, { email: other.email, deploy: false }, now)).code).toBe(0);
    const before = await db.select().from(schema.organization).where(eq(schema.organization.workspaceId, other.workspaceId));
    const otherRows = await rowCounts(other.workspaceId);

    const me = await account("beside-demo");
    expect((await runSeedDemo(db, { email: me.email, deploy: true }, now)).code).toBe(0);

    expect(await db.select().from(schema.organization).where(eq(schema.organization.workspaceId, other.workspaceId))).toEqual(before);
    expect(await rowCounts(other.workspaceId)).toEqual(otherRows);
  });

  it("holds the workspace row until it commits: a new member or customer (a key-share lock) waits", async () => {
    const me = await account("lock");
    const joiner = `${run}-joiner`;
    userIds.push(joiner);
    await db.insert(schema.user).values({ id: joiner, name: "Joiner", email: `${joiner}@example.test` });
    // A second session, as another request would be.
    const PoolOf = pool.constructor as new (config: unknown) => PgPool;
    const second = new PoolOf(buildPoolConfig({ ...process.env, DB_POOL_MAX: "1" }, null));
    const outcomes: string[] = [];
    const attempt = async (label: string, text: string, values: unknown[]) => {
      try {
        await second.query("begin");
        await second.query("set local lock_timeout = '300ms'");
        await second.query(text, values);
        outcomes.push(`${label}: went through`);
      } catch (error) {
        outcomes.push(`${label}: ${(error as { code?: string }).code}`);
      } finally {
        await second.query("rollback");
      }
    };
    sent.after = async (text) => {
      if (!/for update/i.test(text)) return;
      sent.after = null;
      await attempt("key share", "select id from workspace where id = $1 for key share", [me.workspaceId]);
      await attempt("member", "insert into workspace_member (workspace_id, user_id, role) values ($1, $2, 'admin')", [me.workspaceId, joiner]);
      await attempt("customer", "insert into organization (id, workspace_id, kind, name) values ($1, $2, 'customer', 'Late')", [`${run}-late`, me.workspaceId]);
    };
    try {
      expect((await runSeedDemo(db, { email: me.email, deploy: true }, now)).code).toBe(0);
      expect(outcomes).toEqual(["key share: 55P03", "member: 55P03", "customer: 55P03"]);
      // Once the seed has committed, the same lock is free.
      outcomes.length = 0;
      await attempt("key share", "select id from workspace where id = $1 for key share", [me.workspaceId]);
      expect(outcomes).toEqual(["key share: went through"]);
    } finally {
      sent.after = null;
      await second.end();
    }
  });
});
