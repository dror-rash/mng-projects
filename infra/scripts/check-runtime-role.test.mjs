// Tests for check-runtime-role.mjs (task 068) against the migrated database in DATABASE_URL, whose login
// must be able to grant (the owner or a superuser). Every change to roles or tables is rolled back. The
// passing runs connect as a throwaway runtime login (task 074: like app_runtime and preview_runtime, a
// NOINHERIT login whose only membership is app_user with SET), created and dropped around each test.
// Run: node --experimental-strip-types --test infra/scripts/check-runtime-role.test.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildPoolConfig } from "../../packages/db/src/pool-config.ts";
import { checkRuntimeRole, PIN_HEADER } from "./check-runtime-role.mjs";
import { pinMatches } from "./rls-pins.mjs";

const { Client } = createRequire(new URL("../../packages/db/package.json", import.meta.url))("pg");
const script = fileURLToPath(new URL("./check-runtime-role.mjs", import.meta.url));

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to a migrated database.");
const env = { DATABASE_URL: process.env.DATABASE_URL };

/** Runs `fn` with a client opened from `config`, and closes it. */
async function withClient(config, fn) {
  const client = new Client(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** As the login: runs `breakIt`, switches to app_user, checks, and rolls everything back. */
async function checkAfter(breakIt) {
  return withClient(buildPoolConfig(env, null), async (client) => {
    await client.query("begin");
    try {
      await breakIt(client);
      await client.query("set local role app_user");
      return await checkRuntimeRole(client);
    } finally {
      await client.query("rollback");
    }
  });
}

/** A workspace row, so a bypassed row-level security shows in the probe. */
async function insertProbeWorkspace(client) {
  await client.query("insert into workspace (id, name) values ('role-check-probe', 'Role check probe')");
}

let runtimeLogins = 0;

/**
 * Runs `fn(url, login)` with a throwaway runtime login (task 074): LOGIN NOINHERIT, a SET-only member of
 * app_user, nothing else; `setup(client, login)` runs as the DATABASE_URL login first. Dropped afterwards.
 */
async function withRuntimeLogin(fn, setup = async () => {}) {
  const login = `role_check_runtime_${process.pid}_${++runtimeLogins}`;
  const password = `pw_${process.pid}_${Date.now()}`;
  await withClient(buildPoolConfig(env, null), async (client) => {
    await client.query(`create role ${login} login noinherit password '${password}'`);
    await client.query(`grant app_user to ${login} with inherit false, set true`);
    await setup(client, login);
  });
  try {
    const url = new URL(env.DATABASE_URL);
    url.username = login;
    url.password = password;
    return await fn(url.toString(), login);
  } finally {
    await withClient(buildPoolConfig(env, null), (client) => client.query(`drop role ${login}`));
  }
}

/** The role check on a connection opened like the runtime's, as a runtime login. */
const checkAsRuntimeLogin = (setup) =>
  withRuntimeLogin((url) => withClient(buildPoolConfig({ DATABASE_URL: url }), checkRuntimeRole), setup);

function runCli(databaseUrl) {
  return promisify(execFile)(process.execPath, ["--experimental-strip-types", "--no-warnings", script], {
    env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl },
  });
}

test("passes on a connection opened like the runtime's (runtime login, role option on)", async () => {
  assert.deepEqual(await checkAsRuntimeLogin(), []);
});

// Task 074: a login that owns the tables (or can become their owner) leaves row-level security behind with
// one `SET ROLE <owner>` or `RESET ROLE` on a pooled connection.
test("fails on purpose when the runtime connects with the owner login", async () => {
  const failures = await withClient(buildPoolConfig(env), checkRuntimeRole);
  assert.match(failures.join("\n"), /the login \(session_user\) ".+" owns the tables/);
});

test("fails when the runtime login can SET ROLE to the tables' owner", async () => {
  const { rows } = await withClient(buildPoolConfig(env, null), (client) =>
    client.query("select pg_get_userbyid(relowner)::text as owner from pg_class where oid = 'public.workspace'::regclass"),
  );
  const owner = rows[0].owner;
  const failures = await checkAsRuntimeLogin((client, login) => client.query(`grant "${owner}" to ${login} with inherit false, set true`));
  assert.match(failures.join("\n"), new RegExp(`the login \\(session_user\\) "role_check_runtime_[0-9_]+" can SET ROLE "${owner}", which owns`));
});

test("on a runtime login's connection, SET ROLE to the owner is refused", async () => {
  const { rows } = await withClient(buildPoolConfig(env, null), (client) =>
    client.query("select pg_get_userbyid(relowner)::text as owner from pg_class where oid = 'public.workspace'::regclass"),
  );
  await withRuntimeLogin((url) =>
    withClient(buildPoolConfig({ DATABASE_URL: url }), async (client) => {
      await assert.rejects(client.query(`set role "${rows[0].owner}"`), /permission denied to set role/);
    }),
  );
});

test("fails on a connection without the role option (the login user)", async () => {
  const failures = await withClient(buildPoolConfig(env, null), checkRuntimeRole);
  assert.match(failures.join("\n"), /current_user is ".+", not "app_user"/);
});

test("fails when app_user can create temporary tables (migration 0025 not applied)", async () => {
  const failures = await checkAfter(async (client) => {
    const { rows } = await client.query("select current_database() as db");
    await client.query(`grant temporary on database "${rows[0].db}" to app_user`);
  });
  assert.match(failures.join("\n"), /app_user has TEMPORARY/);
});

// The login that owns the tables is itself a member of app_user, so app_user can't be granted the login
// (circular). The bypass that can happen: a table owned by another role app_user is a member of, or by
// app_user itself (a migration run as app_user, an ALTER ... OWNER TO).
test("fails when app_user is a member of a table's owner (row-level security bypassed)", async () => {
  const failures = await checkAfter(async (client) => {
    await insertProbeWorkspace(client);
    await client.query("create role role_check_owner nologin");
    await client.query("grant role_check_owner to app_user");
    await client.query("alter table workspace owner to role_check_owner");
  });
  const text = failures.join("\n");
  assert.match(text, /app_user is a member of the owner of: workspace/);
  assert.match(text, /without app\.user_id, app_user sees [1-9]\d* workspace row/);
});

test("fails when app_user owns a table", async () => {
  const failures = await checkAfter(async (client) => {
    await insertProbeWorkspace(client);
    await client.query("alter table workspace owner to app_user");
  });
  assert.match(failures.join("\n"), /app_user is a member of the owner of: workspace/);
});

test("fails when app_user has BYPASSRLS", async () => {
  const failures = await checkAfter(async (client) => {
    await insertProbeWorkspace(client);
    await client.query("alter role app_user bypassrls");
  });
  assert.match(failures.join("\n"), /app_user has BYPASSRLS/);
});

test("fails when a table outside the Better Auth allowlist has row-level security off", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("alter table workspace disable row level security");
  });
  assert.match(failures.join("\n"), /row-level security is off on: workspace/);
});

// Views, materialized views and SECURITY DEFINER functions run with their owner's rights, and a table outside
// public has no policies of ours: each one app_user can use is a way around row-level security.
test("fails on a view app_user can read that isn't allowlisted", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create view role_check_view as select * from workspace");
    await client.query("grant select on role_check_view to app_user");
  });
  assert.match(failures.join("\n"), /views app_user can use that aren't allowlisted: public\.role_check_view/);
});

test("fails on a materialized view app_user can read", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create materialized view role_check_matview as select * from workspace");
    await client.query("grant select on role_check_matview to app_user");
  });
  assert.match(failures.join("\n"), /views app_user can use that aren't allowlisted: public\.role_check_matview/);
});

test("fails on a table outside public that app_user can use", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create schema role_check_schema");
    await client.query("create table role_check_schema.notes (id int)");
    await client.query("grant usage on schema role_check_schema to app_user");
    await client.query("grant select on role_check_schema.notes to app_user");
  });
  assert.match(failures.join("\n"), /tables outside public app_user can use: role_check_schema\.notes/);
});

test("fails on a SECURITY DEFINER function app_user can run that isn't allowlisted", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create function role_check_definer() returns bigint language sql security definer as 'select count(*) from workspace'");
    await client.query("grant execute on function role_check_definer() to app_user");
  });
  assert.match(failures.join("\n"), /SECURITY DEFINER functions app_user can run that aren't allowlisted: public\.role_check_definer/);
});

test("passes the allowlisted views and access functions of the migrations", async () => {
  const failures = await withClient(buildPoolConfig(env), checkRuntimeRole);
  assert.doesNotMatch(failures.join("\n"), /customer_name|site_choice|has_workspace_role|find_invite/);
});

test("fails when app.user_id is already set (the probe would prove nothing)", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("select set_config('app.user_id', 'someone', true)");
  });
  assert.match(failures.join("\n"), /app\.user_id is set/);
});

test("fails when the login can't SET ROLE app_user", async () => {
  const login = `role_check_noset_${process.pid}`;
  const password = `pw_${process.pid}_${Date.now()}`;
  await withClient(buildPoolConfig(env, null), async (client) => {
    await client.query(`create role ${login} login password '${password}'`);
    await client.query(`grant app_user to ${login} with set false`);
  });
  try {
    const url = new URL(env.DATABASE_URL);
    url.username = login;
    url.password = password;
    const failures = await withClient({ connectionString: url.toString() }, checkRuntimeRole);
    assert.match(failures.join("\n"), /the login \(session_user\) can't SET ROLE app_user/);
  } finally {
    await withClient(buildPoolConfig(env, null), (client) => client.query(`drop role ${login}`));
  }
});

// Round 5. The auditor's construction: the definer functions run with `search_path = public, pg_temp`, and an
// untyped literal (`'{admin}'`) picks an exact `text` overload over `text[]`. An invoker function added in
// public hijacks them without changing any pin, so every function is pinned, whatever its security.
test("fails on any unpinned function, like a text overload of has_workspace_role", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create function public.has_workspace_role(text, text, text) returns boolean language sql as 'select true'");
  });
  const text = failures.join("\n");
  assert.match(text, /functions that aren't pinned: public\.has_workspace_role\(text,text,text\)/);
  assert.equal(failures[0], PIN_HEADER);
});

test("fails when a pinned function's owner or security changes", async () => {
  for (const change of ["alter function public.can_see_project(text, text) owner to role_check_owner", "alter function public.can_see_project(text, text) security invoker"]) {
    const failures = await checkAfter(async (client) => {
      await client.query("create role role_check_owner nologin");
      await client.query(change);
    });
    assert.match(failures.join("\n"), new RegExp(`function public\\.can_see_project\\(text,text\\) changed \\(now ${HASH.source}`), change);
  }
});

test("fails when a table's row-level security is forced or its owner changes", async () => {
  for (const change of ["alter table public.workspace force row level security", "alter table public.workspace owner to role_check_owner"]) {
    const failures = await checkAfter(async (client) => {
      await client.query("create role role_check_owner nologin");
      await client.query(change);
    });
    assert.match(failures.join("\n"), new RegExp(`table public\\.workspace changed \\(now ${HASH.source}`), change);
  }
});

test("fails when a pinned function is gone", async () => {
  const failures = await checkAfter((client) => client.query("drop function public.restore_project(text)"));
  assert.match(failures.join("\n"), /function public\.restore_project\(text\) is gone/);
});

test("a pin may list several hashes (one per Postgres minor that deparses differently)", () => {
  assert.equal(pinMatches(["a", "b"], "b"), true);
  assert.equal(pinMatches("a", "a"), true);
  assert.equal(pinMatches(["a"], "c"), false);
  assert.equal(pinMatches(undefined, "a"), false);
});

// Round 4 (re-audit D, confirmed): rules and definer triggers run with their owner's rights, and policies and
// definer functions decide what app_user sees, so each is pinned. A mismatch prints the computed hash.
const HASH = /sha256 [0-9a-f]{64}/;

test("fails on a rule on a table app_user can reach", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create table public.role_check_log (id text)");
    await client.query("grant insert on public.role_check_log to app_user");
    await client.query("alter table public.role_check_log enable row level security");
    await client.query("create rule role_check_rule as on insert to public.role_check_log do also insert into public.workspace_invite select * from public.workspace_invite");
  });
  assert.match(failures.join("\n"), /rules on tables: public\.role_check_log\.role_check_rule/);
});

test("fails on a trigger whose function is SECURITY DEFINER, even with EXECUTE revoked", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create function public.role_check_trigger() returns trigger language plpgsql security definer as $$ begin return new; end $$");
    await client.query("revoke execute on function public.role_check_trigger() from public");
    await client.query("create trigger role_check_trigger before insert on public.workspace_invite for each row execute function public.role_check_trigger()");
  });
  assert.match(failures.join("\n"), /SECURITY DEFINER triggers that aren't allowlisted: public\.workspace_invite role_check_trigger public\.role_check_trigger\(\)/);
});

test("fails on an added policy (using true) and prints its hash", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create policy role_check_all on public.organization for select to app_user using (true)");
  });
  const text = failures.join("\n");
  assert.match(text, /policy public\.organization\/role_check_all isn't pinned/);
  assert.match(text, HASH);
});

test("fails on a changed policy and prints its new hash", async () => {
  let name;
  const failures = await checkAfter(async (client) => {
    const { rows } = await client.query("select policyname::text as name from pg_policies where tablename = 'organization' order by 1 limit 1");
    name = rows[0].name;
    await client.query(`alter policy "${name}" on public.organization using (true)`);
  });
  assert.match(failures.join("\n"), new RegExp(`policy public\\.organization/${name} changed \\(now ${HASH.source}`));
});

test("fails on a changed allowlisted definer function and prints its new hash", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("alter function public.can_see_project(text, text) set search_path = public");
  });
  assert.match(failures.join("\n"), new RegExp(`function public\\.can_see_project\\(text,text\\) changed \\(now ${HASH.source}`));
});

test("passes the migrations' rules, triggers, policies and functions as they are", async () => {
  assert.deepEqual(await checkAsRuntimeLogin(), []);
});

// The auditor's constructions (re-audit D): each must fail.
test("fails when an allowlisted view is redefined without its access filter", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query(`create or replace view customer_name with (security_barrier) as
      select o.id, o.workspace_id, o.name, p.name as parent_name,
             case when p.name is null then o.name else (p.name || ' › ') || o.name end as label
      from organization o left join organization p on p.id = o.parent_id
      where o.kind = 'customer'`);
  });
  assert.match(failures.join("\n"), /view public\.customer_name isn't the migrations' definition/);
});

test("fails on an overload of an allowlisted definer function", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create function public.can_see_project(p_user text) returns boolean language sql security definer as 'select true'");
  });
  assert.match(failures.join("\n"), /SECURITY DEFINER functions app_user can run that aren't allowlisted: public\.can_see_project\(text\)/);
});

test("fails on a column-only grant on a table outside public", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("create schema role_check_schema");
    await client.query("create table role_check_schema.notes (id int, body text)");
    await client.query("grant usage on schema role_check_schema to app_user");
    await client.query("grant select (id) on role_check_schema.notes to app_user");
  });
  assert.match(failures.join("\n"), /tables outside public app_user can use: role_check_schema\.notes/);
});

test("fails when app_user can TRUNCATE a table", async () => {
  const failures = await checkAfter(async (client) => {
    await client.query("grant truncate on workspace_invite to app_user");
  });
  assert.match(failures.join("\n"), /app_user has TRUNCATE, TRIGGER or REFERENCES on: public\.workspace_invite/);
});

// PR migrations run as preview_owner, which can create functions in app_preview's public schema. Unqualified
// catalog calls could pick such a function (an exact `text` overload wins over pg_catalog's `name` one for an
// untyped parameter), and fake a pass. The planted ones raise, so calling one at all fails the test.
test("functions planted in public are never called and can't fake a pass", async () => {
  const failures = await checkAfter(async (client) => {
    for (const fn of ["pg_has_role(text, oid, text)", "has_table_privilege(text, oid, text)", "has_any_column_privilege(text, oid, text)",
      "has_function_privilege(text, oid, text)", "has_database_privilege(text, text, text)", "has_database_privilege(oid, text, text)",
      "pg_has_role(name, text, text)", "current_setting(text, boolean)"]) {
      await client.query(`create function public.${fn} returns boolean language plpgsql as $$ begin raise exception 'planted function called'; end $$`);
    }
    await client.query("create role role_check_owner nologin");
    await client.query("grant role_check_owner to app_user");
    await client.query("alter table workspace owner to role_check_owner");
  });
  const text = failures.join("\n");
  assert.doesNotMatch(text, /planted/);
  assert.match(text, /app_user is a member of the owner of: workspace/);
});

test("the command exits 0 on the migrated database as a runtime login and prints what it checked", async () => {
  const { stdout } = await withRuntimeLogin((url) => runCli(url));
  assert.match(stdout, /Runtime role check passed/);
  assert.match(stdout, /can't SET ROLE to an owner/);
});

test("the command exits non-zero as the owner login", async () => {
  await assert.rejects(runCli(env.DATABASE_URL), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /owns the tables/);
    return true;
  });
});

test("the command exits non-zero and prints FAILED when it can't check", async () => {
  const missing = env.DATABASE_URL.replace(/\/[^/?]+(\?.*)?$/, "/role_check_no_such_database$1");
  await assert.rejects(runCli(missing), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Runtime role check FAILED/);
    return true;
  });
});
