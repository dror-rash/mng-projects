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
  stale: `${run}-stale`,
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

describe("clear_stale_uploads (task 087)", () => {
  it("clears nothing without a user, and nothing in a workspace the user isn't in", async () => {
    // An upload left unconfirmed for two hours: stale, so any caller who may clear it would.
    await getMaintenanceDb().execute(
      sql`insert into attachment (id, workspace_id, project_id, kind, storage_key, file_name, content_type, size_bytes, uploaded_by, created_at)
          values (${ids.stale}, ${ids.workspace}, ${ids.project}, 'photo', ${`${ids.workspace}/${ids.project}/${ids.stale}`}, 'x.jpg', 'image/jpeg', 1,
                  ${ids.admin}, localtimestamp - interval '2 hours')`,
    );
    const left = async () => (await getMaintenanceDb().execute(sql`select 1 from attachment where id = ${ids.stale}`)).rows.length;

    const { rows } = await getDb().execute(sql`select clear_stale_uploads(${ids.project})`);
    expect(rows).toEqual([]);
    expect(await withAccess(ids.attacker, () => getDb().execute(sql`select clear_stale_uploads(${ids.project})`)).then((r) => r.rows)).toEqual([]);
    expect(await left()).toBe(1);
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
  // its rate-limit counts (task 089), which only Better Auth reads; sign_in_lockout the failed sign-ins per
  // hashed email (task 090), which only the sign-in hooks in @repo/auth read.
  const withoutRls = ["account", "rate_limit", "session", "sign_in_lockout", "user", "verification"];

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

describe("rate_limit (task 089)", () => {
  it("has an index on last_request, which Better Auth's cleanup deletes by", async () => {
    const { rows } = await getMaintenanceDb().execute<{ definition: string }>(sql`
      select indexdef as definition from pg_indexes where schemaname = 'public' and tablename = 'rate_limit'`);

    expect(rows.some((r) => /\(last_request\)/.test(r.definition))).toBe(true);
  });
});

describe("sign_in_lockout (task 090)", () => {
  it("has an index on removable_after, which the cleanup deletes by", async () => {
    const { rows } = await getMaintenanceDb().execute<{ definition: string }>(sql`
      select indexdef as definition from pg_indexes where schemaname = 'public' and tablename = 'sign_in_lockout'`);

    expect(rows.some((r) => /\(removable_after\)/.test(r.definition))).toBe(true);
  });

  it("has no column that could hold an email: a key, counts and times", async () => {
    const { rows } = await getMaintenanceDb().execute<{ name: string; type: string }>(sql`
      select column_name as name, data_type as type from information_schema.columns
      where table_schema = 'public' and table_name = 'sign_in_lockout' order by ordinal_position`);

    expect(rows).toEqual([
      { name: "key", type: "text" },
      { name: "failures", type: "integer" },
      { name: "window_start", type: "timestamp with time zone" },
      { name: "locked_until", type: "timestamp with time zone" },
      { name: "removable_after", type: "timestamp with time zone" },
    ]);
  });
});
