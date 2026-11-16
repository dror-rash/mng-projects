import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, withAccess } from "./client";
import { CHECK, errorCode, insertSiteOf } from "./db-test-fixtures";
import { getMaintenanceDb } from "./maintenance";
import * as schema from "./schema";
import { tickChecklistItem, untickChecklistItem } from "./stage-checklist";

// Stage checklists (task 120, ADR-0014) against the migrated database: `project_checklist_tick` holds one row per
// ticked item of a project. Whoever sees the project reads them; whoever can change the project ticks (as
// themselves, at the database's time) and unticks; nobody changes a tick.

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

const insertTick = (projectId: string, item: string, by: string | null) =>
  sql`insert into project_checklist_tick (project_id, item, ticked_by) values (${projectId}, ${item}, ${by})`;

const deleteTick = (projectId: string, item: string) =>
  sql`delete from project_checklist_tick where project_id = ${projectId} and item = ${item}`;

const ticks = async (userId: string, projectId: string) =>
  (await as<{ item: string }>(userId, sql`select item from project_checklist_tick where project_id = ${projectId} order by item`)).map(
    (row) => row.item,
  );

const clear = (projectId: string) => getMaintenanceDb().execute(sql`delete from project_checklist_tick where project_id = ${projectId}`);

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values([
    { id: ids.workspace, name: `Checklist ${run}` },
    { id: ids.otherWorkspace, name: `Checklist other ${run}` },
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
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.execute(sql`delete from workspace where id in (${ids.workspace}, ${ids.otherWorkspace})`);
  await db.execute(sql`delete from "user" where id in (${sql.join(users.map((u) => sql`${u}`), sql`, `)})`);
});

describe("the checklist's items", () => {
  it("takes only the twenty item keys, once per project", async () => {
    const db = getMaintenanceDb();
    try {
      for (const item of [
        "inquiry.details_recorded", "inquiry.logged", "quote.costed", "quote.sent", "quote.accepted",
        "ordered.work_order", "ordered.payment_terms", "scheduled.date_set", "scheduled.crew_assigned",
        "scheduled.customer_confirmed", "in_work.visits_done", "in_work.materials_reported",
        "in_work.reports_handed_over", "reporting.prepared", "reporting.sent", "reporting.received",
        "billing.prepared", "billing.sent", "billing.received", "closed.completion_report",
      ]) {
        expect(await errorCode(db.execute(insertTick(ids.projectB, item, null)))).toBe("succeeded");
      }
      expect(await errorCode(db.execute(insertTick(ids.projectB, "quote.made_up", null)))).toBe(CHECK);
      expect(await errorCode(db.execute(insertTick(ids.projectB, "Quote sent", null)))).toBe(CHECK);
      expect(await errorCode(db.execute(insertTick(ids.projectB, "quote.sent", null)))).toBe("23505");
    } finally {
      await clear(ids.projectB);
    }
  });
});

describe("who sees the ticks", () => {
  beforeAll(async () => {
    await getMaintenanceDb().execute(insertTick(ids.projectA, "quote.costed", ids.admin));
  });
  afterAll(() => clear(ids.projectA));

  it("shows a project's ticks to whoever sees the project", async () => {
    for (const user of [ids.admin, ids.auditor, ids.worker, ids.pa]) {
      expect(await ticks(user, ids.projectA)).toEqual(["quote.costed"]);
    }
  });

  it("hides them from another partner, another workspace, and once the project is deleted", async () => {
    for (const user of [ids.pb, ids.outsider]) {
      expect(await ticks(user, ids.projectA)).toEqual([]);
    }
    const db = getMaintenanceDb();
    await db.execute(sql`update project set deleted_at = now(), deleted_by = ${ids.admin} where id = ${ids.projectA}`);
    try {
      expect(await ticks(ids.pa, ids.projectA)).toEqual([]);
      expect(await ticks(ids.worker, ids.projectA)).toEqual([]);
    } finally {
      await db.execute(sql`update project set deleted_at = null, deleted_by = null where id = ${ids.projectA}`);
    }
  });
});

describe("who ticks and unticks", () => {
  afterAll(() => clear(ids.projectA));

  it("lets whoever can change the project tick an item as themselves", async () => {
    expect(await writeAs(ids.admin, insertTick(ids.projectA, "quote.costed", ids.admin))).toBe(1);
    expect(await writeAs(ids.pa, insertTick(ids.projectA, "quote.sent", ids.pa))).toBe(1);
    expect(await ticks(ids.admin, ids.projectA)).toEqual(["quote.costed", "quote.sent"]);
  });

  it("refuses auditors, workers, another partner, outsiders and someone else's name", async () => {
    for (const user of [ids.auditor, ids.worker, ids.pb, ids.outsider]) {
      expect(await writeAs(user, insertTick(ids.projectA, "quote.accepted", user))).toBe("refused");
    }
    expect(await writeAs(ids.pa, insertTick(ids.projectA, "quote.accepted", ids.admin))).toBe("refused");
    expect(await writeAs(ids.pa, insertTick(ids.projectA, "quote.accepted", null))).toBe("refused");
    expect(await writeAs(ids.admin, insertTick(`${run}-made-up`, "quote.accepted", ids.admin))).toBe("refused");
    expect(await ticks(ids.admin, ids.projectA)).toEqual(["quote.costed", "quote.sent"]);
  });

  it("lets only whoever can change the project untick an item", async () => {
    for (const user of [ids.auditor, ids.worker, ids.pb, ids.outsider]) {
      expect(await writeAs(user, deleteTick(ids.projectA, "quote.costed"))).not.toBe(1);
    }
    expect(await ticks(ids.admin, ids.projectA)).toEqual(["quote.costed", "quote.sent"]);
    expect(await writeAs(ids.pa, deleteTick(ids.projectA, "quote.costed"))).toBe(1);
    expect(await writeAs(ids.admin, deleteTick(ids.projectA, "quote.sent"))).toBe(1);
    expect(await ticks(ids.admin, ids.projectA)).toEqual([]);
  });

  it("takes the time of a tick from the database, never from the writer", async () => {
    const backdated = sql`insert into project_checklist_tick (project_id, item, ticked_by, ticked_at)
      values (${ids.projectA}, 'billing.sent', ${ids.admin}, '2020-01-01')`;
    expect(await writeAs(ids.admin, backdated)).toBe("refused");
    expect(await writeAs(ids.admin, insertTick(ids.projectA, "billing.sent", ids.admin))).toBe(1);
    const rows = await as<{ recent: boolean }>(
      ids.admin,
      sql`select ticked_at > now() - interval '1 minute' as recent from project_checklist_tick
          where project_id = ${ids.projectA} and item = 'billing.sent'`,
    );
    expect(rows).toEqual([{ recent: true }]);
  });

  it("never changes a tick, for anyone at runtime", async () => {
    await getMaintenanceDb().execute(insertTick(ids.projectA, "closed.completion_report", ids.admin));
    for (const user of [ids.admin, ids.pa]) {
      expect(
        await writeAs(user, sql`update project_checklist_tick set ticked_by = ${user} where project_id = ${ids.projectA}`),
      ).toBe("refused");
    }
    const rows = await getMaintenanceDb().execute<{ can_update: boolean }>(
      sql`select has_table_privilege('app_user', 'project_checklist_tick', 'UPDATE') as can_update`,
    );
    expect(rows.rows[0]).toEqual({ can_update: false });
  });
});

describe("the app's helpers", () => {
  afterAll(() => clear(ids.projectA));

  it("tick an item as the user at the database's time, and leave a ticked one as it was", async () => {
    await withAccess(ids.pa, () => tickChecklistItem({ projectId: ids.projectA, item: "ordered.work_order", tickedBy: ids.pa }));
    await withAccess(ids.admin, () => tickChecklistItem({ projectId: ids.projectA, item: "ordered.work_order", tickedBy: ids.admin }));
    const rows = await as<{ ticked_by: string; recent: boolean }>(
      ids.admin,
      sql`select ticked_by, ticked_at > now() - interval '1 minute' as recent from project_checklist_tick
          where project_id = ${ids.projectA}`,
    );
    expect(rows).toEqual([{ ticked_by: ids.pa, recent: true }]);
  });

  it("untick an item, and leave an open one as it was", async () => {
    await withAccess(ids.admin, () => untickChecklistItem({ projectId: ids.projectA, item: "ordered.work_order" }));
    await withAccess(ids.admin, () => untickChecklistItem({ projectId: ids.projectA, item: "ordered.payment_terms" }));
    expect(await ticks(ids.admin, ids.projectA)).toEqual([]);
  });
});

describe("a tick's lifetime", () => {
  it("keeps a tick when its author's account is deleted, with no author", async () => {
    const db = getMaintenanceDb();
    const author = `${run}-leaver`;
    await db.insert(schema.user).values({ id: author, name: author, email: `${author}@example.test` });
    await db.execute(insertTick(ids.projectA, "reporting.sent", author));
    await db.execute(sql`delete from "user" where id = ${author}`);
    const rows = await as<{ ticked_by: string | null }>(
      ids.admin,
      sql`select ticked_by from project_checklist_tick where project_id = ${ids.projectA} and item = 'reporting.sent'`,
    );
    expect(rows).toEqual([{ ticked_by: null }]);
    await clear(ids.projectA);
  });

  it("goes with its project", async () => {
    const db = getMaintenanceDb();
    const ws = `${run}-gone`;
    await db.insert(schema.workspace).values({ id: ws, name: ws });
    await db.insert(schema.organization).values({ id: `${ws}-c`, workspaceId: ws, name: "C" });
    const siteId = await insertSiteOf(ws, `${ws}-c`);
    await db.insert(schema.project).values({ id: `${ws}-p`, name: "P", workspaceId: ws, organizationId: `${ws}-c`, siteId });
    await db.execute(insertTick(`${ws}-p`, "quote.sent", null));
    await db.execute(sql`delete from project where id = ${`${ws}-p`}`);
    const rows = await db.execute(sql`select item from project_checklist_tick where project_id = ${`${ws}-p`}`);
    expect(rows.rows).toHaveLength(0);
    await db.execute(sql`delete from workspace where id = ${ws}`);
  });
});
