import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, withAccess } from "./client";
import { CHECK, errorCode, insertSiteOf } from "./db-test-fixtures";
import { getMaintenanceDb } from "./maintenance";
import * as schema from "./schema";

// Project stages (task 101, ADR-0012) against the migrated database: `project.stage` is one of eight stages,
// new projects start at Inquiry, and `project_stage_change` is the append-only history: whoever sees the
// project reads it, whoever can change the project adds to it, as themselves, and nobody changes or deletes it.

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  otherWorkspace: `${run}-ws2`,
  admin: `${run}-admin`,
  auditor: `${run}-auditor`,
  worker: `${run}-worker`,
  pa: `${run}-pa`,
  pb: `${run}-pb`,
  outsider: `${run}-outsider`,
  partnerA: `${run}-partner-a`,
  partnerB: `${run}-partner-b`,
  acme: `${run}-acme`,
  projectA: `${run}-project-a`,
  projectB: `${run}-project-b`,
  changeA: `${run}-change-a`,
};
const users = [ids.admin, ids.auditor, ids.worker, ids.pa, ids.pb, ids.outsider];

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

const insertChange = (id: string, projectId: string, by: string | null, from: string | null = "inquiry", to = "quote") =>
  sql`insert into project_stage_change (id, project_id, from_stage, to_stage, changed_by)
      values (${id}, ${projectId}, ${from}, ${to}, ${by})`;

const sees = async (userId: string, changeId: string) =>
  (await as(userId, sql`select id from project_stage_change where id = ${changeId}`)).length === 1;

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values([
    { id: ids.workspace, name: `Stages ${run}` },
    { id: ids.otherWorkspace, name: `Stages other ${run}` },
  ]);
  await db.insert(schema.partner).values([
    { id: ids.partnerA, workspaceId: ids.workspace, name: "Partner A" },
    { id: ids.partnerB, workspaceId: ids.workspace, name: "Partner B" },
  ]);
  await db.insert(schema.workspaceMember).values([
    { workspaceId: ids.workspace, userId: ids.admin, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.auditor, role: "auditor" },
    { workspaceId: ids.workspace, userId: ids.worker, role: "worker" },
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
  await db.execute(sql`insert into project_worker (project_id, user_id, workspace_id) values (${ids.projectA}, ${ids.worker}, ${ids.workspace})`);
  await db.execute(insertChange(ids.changeA, ids.projectA, ids.admin));
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id in (${ids.workspace}, ${ids.otherWorkspace})`);
  await db.execute(sql`delete from "user" where id in (${sql.join(users.map((u) => sql`${u}`), sql`, `)})`);
});

describe("a project's stage", () => {
  it("starts at Inquiry", async () => {
    const rows = await as<{ stage: string }>(ids.admin, sql`select stage from project where id = ${ids.projectB}`);
    expect(rows).toEqual([{ stage: "inquiry" }]);
  });

  it("takes only the eight stages", async () => {
    const db = getMaintenanceDb();
    for (const stage of ["inquiry", "quote", "ordered", "scheduled", "in_work", "reporting", "billing", "closed"]) {
      expect(await errorCode(db.execute(sql`update project set stage = ${stage} where id = ${ids.projectB}`))).toBe("succeeded");
    }
    expect(await errorCode(db.execute(sql`update project set stage = 'made_up' where id = ${ids.projectB}`))).toBe(CHECK);
    expect(await errorCode(db.execute(sql`update project set stage = 'In work' where id = ${ids.projectB}`))).toBe(CHECK);
  });

  it("is changed by whoever can change the project, not by auditors, workers or another partner", async () => {
    const setStage = sql`update project set stage = 'ordered' where id = ${ids.projectA}`;
    expect(await writeAs(ids.admin, setStage)).toBe(1);
    expect(await writeAs(ids.pa, setStage)).toBe(1);
    for (const user of [ids.auditor, ids.worker, ids.pb, ids.outsider]) {
      expect(await writeAs(user, setStage)).toBe(0);
    }
  });
});

describe("who sees the stage history", () => {
  it("shows a project's changes to whoever sees the project", async () => {
    for (const user of [ids.admin, ids.auditor, ids.worker, ids.pa]) {
      expect(await sees(user, ids.changeA)).toBe(true);
    }
  });

  it("hides them from another partner and another workspace", async () => {
    for (const user of [ids.pb, ids.outsider]) {
      expect(await sees(user, ids.changeA)).toBe(false);
    }
  });

  it("hides a deleted project's changes like the project", async () => {
    const db = getMaintenanceDb();
    await db.execute(sql`update project set deleted_at = now(), deleted_by = ${ids.admin} where id = ${ids.projectA}`);
    try {
      expect(await sees(ids.pa, ids.changeA)).toBe(false);
      expect(await sees(ids.worker, ids.changeA)).toBe(false);
    } finally {
      await db.execute(sql`update project set deleted_at = null, deleted_by = null where id = ${ids.projectA}`);
    }
  });
});

describe("who records a stage change", () => {
  // A change records the stage the project is now at (the action updates the project first).
  beforeAll(async () => {
    await getMaintenanceDb().execute(sql`update project set stage = 'quote' where id = ${ids.projectA}`);
  });

  it("lets whoever can change the project record one as themselves", async () => {
    expect(await writeAs(ids.admin, insertChange(`${run}-by-admin`, ids.projectA, ids.admin))).toBe(1);
    expect(await writeAs(ids.pa, insertChange(`${run}-by-pa`, ids.projectA, ids.pa))).toBe(1);
  });

  it("refuses auditors, workers, another partner, outsiders and someone else's name", async () => {
    expect(await writeAs(ids.auditor, insertChange(`${run}-by-auditor`, ids.projectA, ids.auditor))).toBe("refused");
    expect(await writeAs(ids.worker, insertChange(`${run}-by-worker`, ids.projectA, ids.worker))).toBe("refused");
    expect(await writeAs(ids.pb, insertChange(`${run}-by-pb`, ids.projectA, ids.pb))).toBe("refused");
    expect(await writeAs(ids.outsider, insertChange(`${run}-by-outsider`, ids.projectA, ids.outsider))).toBe("refused");
    expect(await writeAs(ids.pa, insertChange(`${run}-as-admin`, ids.projectA, ids.admin))).toBe("refused");
    expect(await writeAs(ids.pa, insertChange(`${run}-nobody`, ids.projectA, null))).toBe("refused");
  });

  it("refuses a change to a stage the project isn't at", async () => {
    expect(await writeAs(ids.admin, insertChange(`${run}-not-at`, ids.projectA, ids.admin, "quote", "closed"))).toBe("refused");
    expect(await writeAs(ids.pa, insertChange(`${run}-not-at-pa`, ids.projectA, ids.pa, "inquiry", "ordered"))).toBe("refused");
  });

  it("takes the time of a change from the database, never from the writer", async () => {
    const backdated = sql`insert into project_stage_change (id, project_id, from_stage, to_stage, changed_by, changed_at)
      values (${`${run}-backdated`}, ${ids.projectA}, 'inquiry', 'quote', ${ids.admin}, '2020-01-01')`;
    expect(await writeAs(ids.admin, backdated)).toBe("refused");
    expect(await writeAs(ids.admin, insertChange(`${run}-timed`, ids.projectA, ids.admin))).toBe(1);
    const [row] = await as<{ recent: boolean }>(
      ids.admin,
      sql`select changed_at > now() - interval '1 minute' as recent from project_stage_change where id = ${`${run}-timed`}`,
    );
    expect(row).toEqual({ recent: true });
  });

  it("refuses a made-up project and a made-up stage", async () => {
    expect(await writeAs(ids.admin, insertChange(`${run}-mp`, `${run}-made-up`, ids.admin))).toBe("refused");
    const db = getMaintenanceDb();
    expect(await errorCode(db.execute(insertChange(`${run}-to`, ids.projectA, ids.admin, "inquiry", "made_up")))).toBe(CHECK);
    expect(await errorCode(db.execute(insertChange(`${run}-from`, ids.projectA, ids.admin, "made_up", "quote")))).toBe(CHECK);
    expect(await errorCode(db.execute(insertChange(`${run}-first`, ids.projectA, ids.admin, null, "quote")))).toBe("succeeded");
  });
});

describe("the stage history is append-only", () => {
  it("refuses changes and deletes for anyone at runtime", async () => {
    for (const user of [ids.admin, ids.pa]) {
      expect(await writeAs(user, sql`update project_stage_change set to_stage = 'closed' where id = ${ids.changeA}`)).toBe("refused");
      expect(await writeAs(user, sql`delete from project_stage_change where id = ${ids.changeA}`)).toBe("refused");
    }
    expect(await sees(ids.admin, ids.changeA)).toBe(true);
  });

  it("doesn't let the runtime role update or delete stage changes at all", async () => {
    const rows = await getMaintenanceDb().execute<{ can_update: boolean; can_delete: boolean }>(
      sql`select has_table_privilege('app_user', 'project_stage_change', 'UPDATE') as can_update,
                 has_table_privilege('app_user', 'project_stage_change', 'DELETE') as can_delete`,
    );
    expect(rows.rows[0]).toEqual({ can_update: false, can_delete: false });
  });

  it("keeps a change when its author's account is deleted, with no author", async () => {
    const db = getMaintenanceDb();
    const author = `${run}-leaver`;
    await db.insert(schema.user).values({ id: author, name: author, email: `${author}@example.test` });
    await db.execute(insertChange(`${run}-leavers`, ids.projectA, author));
    await db.execute(sql`delete from "user" where id = ${author}`);
    const rows = await as<{ changed_by: string | null }>(ids.admin, sql`select changed_by from project_stage_change where id = ${`${run}-leavers`}`);
    expect(rows).toEqual([{ changed_by: null }]);
  });

  it("goes with its project when the workspace is deleted", async () => {
    const db = getMaintenanceDb();
    const ws = `${run}-gone`;
    await db.insert(schema.workspace).values({ id: ws, name: ws });
    await db.insert(schema.organization).values({ id: `${ws}-c`, workspaceId: ws, name: "C" });
    const siteId = await insertSiteOf(ws, `${ws}-c`);
    await db.insert(schema.project).values({ id: `${ws}-p`, name: "P", workspaceId: ws, organizationId: `${ws}-c`, siteId });
    await db.execute(insertChange(`${ws}-change`, `${ws}-p`, null));
    await db.execute(sql`delete from workspace where id = ${ws}`);
    const rows = await db.execute(sql`select id from project_stage_change where id = ${`${ws}-change`}`);
    expect(rows.rows).toHaveLength(0);
  });
});

// The migration itself, run again on a copy of the state before it (inside a transaction that is rolled back):
// projects that existed then are In work since they were made, with a first history row, and new ones start at Inquiry.
describe("the migration", () => {
  const migrations = fileURLToPath(new URL("../migrations/", import.meta.url));
  const file = readdirSync(migrations).find((name) => name.endsWith("_project_stages.sql"));

  it("puts existing projects at In work since they were made, canceled ones too, and new ones at Inquiry", async () => {
    expect(file, "no *_project_stages.sql migration").toBeDefined();
    const statements = readFileSync(`${migrations}${file}`, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    const rollback = new Error("rollback");
    const seen: Record<string, unknown> = {};
    await getMaintenanceDb()
      .transaction(async (tx) => {
        await tx.execute(sql`update project set status = 'canceled' where id = ${ids.projectB}`);
        await tx.execute(sql`drop table project_stage_change`);
        await tx.execute(sql`alter table project drop column stage`);
        for (const statement of statements) await tx.execute(sql.raw(statement));
        const projects = await tx.execute<{ id: string; stage: string; status: string }>(
          sql`select id, stage, status from project where id in (${ids.projectA}, ${ids.projectB}) order by id`,
        );
        seen.projects = projects.rows;
        const changes = await tx.execute<{ project_id: string; from_stage: string | null; to_stage: string; changed_by: string | null; since_created: boolean }>(
          sql`select c.project_id, c.from_stage, c.to_stage, c.changed_by, c.changed_at = p.created_at as since_created
              from project_stage_change c join project p on p.id = c.project_id
              where c.project_id in (${ids.projectA}, ${ids.projectB}) order by c.project_id`,
        );
        seen.changes = changes.rows;
        const siteId = `${ids.acme}-site`;
        await tx.execute(sql`insert into project (id, name, workspace_id, organization_id, site_id)
          values (${`${run}-after`}, 'After', ${ids.workspace}, ${ids.acme}, ${siteId})`);
        seen.after = (await tx.execute(sql`select stage from project where id = ${`${run}-after`}`)).rows;
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    expect(seen.projects).toEqual([
      { id: ids.projectA, stage: "in_work", status: "active" },
      { id: ids.projectB, stage: "in_work", status: "canceled" },
    ]);
    expect(seen.changes).toEqual([
      { project_id: ids.projectA, from_stage: null, to_stage: "in_work", changed_by: null, since_created: true },
      { project_id: ids.projectB, from_stage: null, to_stage: "in_work", changed_by: null, since_created: true },
    ]);
    expect(seen.after).toEqual([{ stage: "inquiry" }]);
  });
});
