import { createHash } from "node:crypto";

import { inArray, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb, withAccess } from "./client";
import { insertCustomerWithSite } from "./db-test-fixtures";
import { getMaintenanceDb } from "./maintenance";
import { buildPoolConfig } from "./pool-config";
import * as schema from "./schema";

// Hardening after the final review of M12 (task 052) against the migrated database: the runtime pool,
// the SECURITY DEFINER functions' guards, and coverage checks that keep new tables and functions honest.

const run = crypto.randomUUID().slice(0, 8);
const ids = {
  workspace: `${run}-ws`,
  admin: `${run}-admin`,
  attacker: `${run}-attacker`,
  demoted: `${run}-demoted`,
  project: `${run}-project`,
  revoked: `${run}-revoked`,
  expired: `${run}-expired`,
};
const users = [ids.admin, ids.attacker, ids.demoted];
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** The database's own message, under Drizzle's "Failed query" wrapper. */
function cause(error: unknown): string {
  const e = error as { message?: string; cause?: { message?: string } };
  return e.cause?.message ?? e.message ?? String(error);
}

/** Runs `query` as `userId` and returns the database's message when it throws. */
async function refusalAs(userId: string, query: ReturnType<typeof sql>) {
  try {
    await withAccess(userId, () => getDb().execute(query));
    return "allowed";
  } catch (error) {
    return cause(error);
  }
}

/** Throws to roll a `withAccess` transaction back, so a test leaves nothing behind on the pooled connection. */
class Rollback extends Error {}

beforeAll(async () => {
  const db = getMaintenanceDb();
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(schema.workspace).values({ id: ids.workspace, name: `Hardening ${run}` });
  await db.insert(schema.workspaceMember).values([
    { workspaceId: ids.workspace, userId: ids.admin, role: "admin" },
    { workspaceId: ids.workspace, userId: ids.demoted, role: "admin" },
  ]);
  const customer = await insertCustomerWithSite(ids.workspace, `${run}-customer`);
  await db.insert(schema.project).values({ id: ids.project, name: "Secret", workspaceId: ids.workspace, ...customer });
  await db.insert(schema.task).values([
    { id: `${run}-task-1`, projectId: ids.project, title: "One", assigneeId: ids.demoted },
    { id: `${run}-task-2`, projectId: ids.project, title: "Two", assigneeId: ids.demoted },
  ]);
  const week = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await db.insert(schema.workspaceInvite).values([
    { id: ids.revoked, workspaceId: ids.workspace, tokenHash: hash(ids.revoked), expiresAt: week, revokedAt: new Date(), role: "admin" },
    { id: ids.expired, workspaceId: ids.workspace, tokenHash: hash(ids.expired), expiresAt: new Date(Date.now() - 60_000), role: "admin" },
  ]);
});

afterAll(async () => {
  const db = getMaintenanceDb();
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, [ids.workspace]));
  await db.delete(schema.user).where(inArray(schema.user.id, users));
});

describe("temp tables can't shadow the access tables", () => {
  it("a temp workspace_member with a fake admin row shows the attacker nothing", async () => {
    // The attack from the final review: Postgres looks in pg_temp first for tables, so a temp table named
    // like a real one replaced it inside the SECURITY DEFINER functions. Workspace ids are knowable.
    let outcome: string | number = "not run";
    try {
      await withAccess(ids.attacker, async () => {
        const db = getDb();
        try {
          await db.execute(sql`create temp table workspace_member (workspace_id text, user_id text, role text, partner_id text) on commit drop`);
        } catch (error) {
          outcome = `refused: ${cause(error)}`;
          return;
        }
        await db.execute(sql`insert into workspace_member values (${ids.workspace}, ${ids.attacker}, 'admin', null)`);
        const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from project where workspace_id = ${ids.workspace}`);
        outcome = rows[0]!.n;
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    expect(String(outcome)).toMatch(/^refused: permission denied to create temporary tables/);
  });

  it("app_user may not create temp tables at all", async () => {
    const { rows } = await getMaintenanceDb().execute<{ temp: boolean }>(
      sql`select has_database_privilege('app_user', current_database(), 'TEMPORARY') as temp`,
    );

    expect(rows[0]?.temp).toBe(false);
  });

  it("every SECURITY DEFINER function pins search_path to public, pg_temp", async () => {
    const { rows } = await getMaintenanceDb().execute<{ fn: string; config: string[] | null }>(sql`
      select p.oid::regprocedure::text as fn, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by 1`);

    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.filter((r) => !r.config?.includes("search_path=public, pg_temp")).map((r) => r.fn)).toEqual([]);
  });
});

describe("the runtime pool", () => {
  it("runs as app_user", async () => {
    const { rows } = await getDb().execute<{ user: string }>(sql`select current_user as user`);

    expect(rows[0]?.user).toBe("app_user");
  });

  it("refuses to serve a query from a connection that isn't app_user (fail closed)", async () => {
    // The runtime config without the startup option that switches the role: the login user, who owns the tables.
    const pool = new Pool({ ...buildPoolConfig(process.env), options: undefined, max: 1 });
    try {
      await expect(pool.query("select count(*) from project")).rejects.toThrow(/app_user/);
    } finally {
      await pool.end();
    }
  });
});

describe("the definer functions' own guards", () => {
  it("create_workspace refuses to create one for another user", async () => {
    expect(await refusalAs(ids.attacker, sql`select create_workspace(${ids.admin}, 'Not mine')`)).toMatch(/only for the current user/);
  });

  it("join_workspace refuses to join another user", async () => {
    expect(await refusalAs(ids.attacker, sql`select join_workspace(${ids.admin}, ${hash(ids.revoked)})`)).toMatch(/only for the current user/);
  });

  it("join_workspace refuses revoked and expired invites", async () => {
    const join = (token: string) =>
      withAccess(ids.attacker, async () => {
        const { rows } = await getDb().execute<{ result: string }>(sql`select join_workspace(${ids.attacker}, ${hash(token)}) as result`);
        return rows[0]?.result;
      });

    expect(await join(ids.revoked)).toBe("invalid");
    expect(await join(ids.expired)).toBe("invalid");
    const { rows } = await getMaintenanceDb().execute(
      sql`select 1 from workspace_member where workspace_id = ${ids.workspace} and user_id = ${ids.attacker}`,
    );
    expect(rows).toEqual([]);
  });
});

describe("role changes", () => {
  it("a demotion to auditor clears all their assignments, though auditors see every task (rule 7)", async () => {
    // As changeMembership does it: change the role, then clear in the same transaction.
    await withAccess(ids.admin, async () => {
      await getDb().execute(sql`update workspace_member set role = 'auditor' where workspace_id = ${ids.workspace} and user_id = ${ids.demoted}`);
      await getDb().execute(sql`select clear_unseen_assignments(${ids.workspace}, ${ids.demoted})`);
    });

    const { rows } = await getMaintenanceDb().execute<{ id: string }>(sql`select id from task where assignee_id = ${ids.demoted}`);
    expect(rows).toEqual([]);
  });
});

describe("coverage guards", () => {
  // Better Auth's tables: the app reads them through the pool, outside withAccess (ADR-0006). rate_limit holds
  // its rate-limit counts (task 089), which only Better Auth reads.
  const withoutRls = ["account", "rate_limit", "session", "user", "verification"];

  it("every table in public has row-level security, except Better Auth's", async () => {
    const { rows } = await getMaintenanceDb().execute<{ name: string }>(sql`
      select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      order by 1`);

    expect(rows.map((r) => r.name)).toEqual(withoutRls);
  });

  it("no SECURITY DEFINER function in public is executable by PUBLIC", async () => {
    // A null ACL means the default, which lets PUBLIC execute.
    const { rows } = await getMaintenanceDb().execute<{ fn: string }>(sql`
      select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
      order by 1`);

    expect(rows.map((r) => r.fn)).toEqual([]);
  });
});
