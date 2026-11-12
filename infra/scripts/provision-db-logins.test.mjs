// Tests for provision-db-logins.mjs (task 068) against the migrated database in DATABASE_URL, whose login must
// be a superuser (it is locally and in CI). Each test runs in a transaction that is rolled back: the current
// database stands in for `app_preview`, and `postgres` for `app`. Deployed, the role and database statements
// run on a connection to `app` and only the lock and schema grant on `app_preview`; here one connection plays
// both, so everything rolls back together. The SCRAM test commits a throwaway role and drops it.
// Run: node --experimental-strip-types --test infra/scripts/provision-db-logins.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

import { buildPoolConfig } from "../../packages/db/src/pool-config.ts";
import {
  CONNECTION_BUDGET,
  CONNECTION_LIMITS,
  migrationLockName,
  provisionMainSide,
  provisionPreviewSide,
  scramVerifier,
  verifyDbLogins,
  verifyMainSide,
} from "./provision-db-logins.mjs";

const { Client } = createRequire(new URL("../../packages/db/package.json", import.meta.url))("pg");

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to a migrated database.");
const loginConfig = buildPoolConfig({ DATABASE_URL: process.env.DATABASE_URL }, null);

/** Provisioning with one connection in both roles (see above), schema grant included. */
async function provisionAll(client, names) {
  await provisionMainSide(client, names);
  await provisionPreviewSide(client, names);
}

const PASSWORDS = {
  previewOwnerPassword: "owner-pw-rolled-back-x1",
  previewRuntimePassword: "runtime-pw-rolled-back-y2",
  mainRuntimePassword: "main-runtime-pw-rolled-back-z3",
};

async function withClient(config, fn) {
  const client = new Client(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** As the superuser login, in a transaction that is always rolled back: `fn(client, names)`. */
async function inRolledBackTransaction(fn) {
  return withClient(loginConfig, async (client) => {
    await client.query("begin");
    try {
      const { rows } = await client.query("select current_database() as db, current_user::text as login");
      const names = {
        mainDb: "postgres",
        previewDb: rows[0].db,
        mainOwner: rows[0].login,
        previewOwner: "role_check_preview_owner",
        previewRuntime: "role_check_preview_runtime",
        mainRuntime: "role_check_main_runtime",
        ...PASSWORDS,
      };
      return await fn(client, names);
    } finally {
      await client.query("rollback");
    }
  });
}

const failuresAfter = (breakIt) =>
  inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await breakIt(client, names);
    return (await verifyDbLogins(client, names)).join("\n");
  });

test("creates the preview logins: no CREATEROLE/CREATEDB, NOINHERIT, only app_user, only the preview database", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    assert.deepEqual(await verifyDbLogins(client, names), []);

    const { rows } = await client.query(
      `select r.rolname::text as name, r.rolcanlogin, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolinherit,
              pg_has_role(r.oid, 'app_user', 'MEMBER') as app_user_member,
              has_database_privilege(r.oid, $2, 'CONNECT') as main_connect,
              has_database_privilege(r.oid, $3, 'CONNECT') as preview_connect
       from pg_roles r where r.rolname = any ($1) order by 1`,
      [[names.previewOwner, names.previewRuntime], names.mainDb, names.previewDb],
    );
    const expected = { rolcanlogin: true, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolinherit: false, app_user_member: true, main_connect: false, preview_connect: true };
    assert.deepEqual(rows, [
      { name: names.previewOwner, ...expected },
      { name: names.previewRuntime, ...expected },
    ]);
  });
});

test("lets the preview owner run the migrations' role and schema statements", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    const { rows } = await client.query(
      `select pg_has_role($1, 'app_user', 'MEMBER WITH ADMIN OPTION') as admin_on_app_user,
              has_database_privilege($1, $2, 'CREATE') as create_schema,
              has_schema_privilege($1, 'public', 'CREATE') as create_in_public,
              pg_has_role($3, 'app_user', 'SET') as runtime_can_set,
              pg_has_role($3, 'app_user', 'MEMBER WITH ADMIN OPTION') as runtime_admin`,
      [names.previewOwner, names.previewDb, names.previewRuntime],
    );
    assert.deepEqual(rows[0], { admin_on_app_user: true, create_schema: true, create_in_public: true, runtime_can_set: true, runtime_admin: false });
  });
});

test("can run on every main deploy (idempotent, existing roles are fine)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await provisionAll(client, names);
    assert.deepEqual(await verifyDbLogins(client, names), []);
  });
});

test("holds the preview migration lock while it provisions (same key as with-db-lock.mjs)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    assert.equal(migrationLockName(names.previewDb), `migrate-${names.previewDb}`);
    const other = await withClient(loginConfig, (second) =>
      second.query("select pg_try_advisory_lock(hashtext($1)) as got", [migrationLockName(names.previewDb)]),
    );
    assert.equal(other.rows[0].got, false);
  });
});

test("never sends a password in plain text; stores SCRAM-SHA-256 verifiers", async () => {
  await inRolledBackTransaction(async (client, names) => {
    const sent = [];
    const spy = { query: (text, values) => (sent.push(String(text)), client.query(text, values)), escapeLiteral: (s) => client.escapeLiteral(s) };
    await provisionAll(spy, names);
    for (const password of Object.values(PASSWORDS)) assert.ok(!sent.some((text) => text.includes(password)));
    const { rows } = await client.query("select rolpassword from pg_authid where rolname = any ($1)", [[names.previewOwner, names.previewRuntime, names.mainRuntime]]);
    assert.equal(rows.length, 3);
    for (const row of rows) assert.match(row.rolpassword, /^SCRAM-SHA-256\$4096:/);
  });
});

test("a SCRAM verifier made in Node logs in with its password", async () => {
  const login = `role_check_scram_${process.pid}`;
  const password = `pw-${process.pid}-${Date.now()}`;
  await withClient(loginConfig, (client) => client.query(`create role ${login} login password '${scramVerifier(password)}'`));
  try {
    const url = new URL(process.env.DATABASE_URL);
    url.username = login;
    url.password = password;
    const { rows } = await withClient({ connectionString: url.toString() }, (client) => client.query("select current_user::text as me"));
    assert.equal(rows[0].me, login);
    url.password = `${password}-wrong`; // the server really checks passwords (not `trust`)
    await assert.rejects(withClient({ connectionString: url.toString() }, () => undefined), /password authentication failed/);
  } finally {
    await withClient(loginConfig, (client) => client.query(`drop role ${login}`));
  }
});

test("runs as a non-superuser CREATEROLE login, like Cloud SQL's owner login", async () => {
  await inRolledBackTransaction(async (client, names) => {
    // Cloud SQL: `app` has CREATEROLE, is a member of cloudsqlsuperuser (which owns the databases) and created
    // app_user (ADMIN on it).
    await client.query("create role role_check_cloudsqlsuperuser nologin");
    await client.query("create role role_check_app login createrole");
    await client.query("grant role_check_cloudsqlsuperuser to role_check_app");
    await client.query(`alter database "${names.previewDb}" owner to role_check_cloudsqlsuperuser`);
    await client.query(`alter database "${names.mainDb}" owner to role_check_cloudsqlsuperuser`);
    await client.query("grant app_user to role_check_app with admin option");
    await client.query("set local role role_check_app");
    const asApp = { ...names, mainOwner: "role_check_app" };
    await provisionAll(client, asApp);
    assert.deepEqual(await verifyDbLogins(client, asApp), []);
    assert.deepEqual(await verifyMainSide(client, asApp), []);
  });
});

test("verification fails when anyone (PUBLIC) can connect to the main database", async () => {
  const failures = await failuresAfter((client, names) => client.query(`grant connect on database "${names.mainDb}" to public`));
  assert.match(failures, /PUBLIC can connect to the main database/);
});

test("verification fails when a preview login can connect to the main database", async () => {
  const failures = await failuresAfter((client, names) => client.query(`grant connect on database "${names.mainDb}" to ${names.previewRuntime}`));
  assert.match(failures, /role_check_preview_runtime can connect to the main database/);
});

test("verification fails when a preview login is a member of another role", async () => {
  const failures = await failuresAfter((client, names) => client.query(`grant "${names.mainOwner}" to ${names.previewOwner}`));
  assert.match(failures, /role_check_preview_owner is a member of roles other than app_user/);
});

test("verification fails when a preview login inherits", async () => {
  const failures = await failuresAfter((client, names) => client.query(`alter role ${names.previewRuntime} inherit`));
  assert.match(failures, /role_check_preview_runtime has rolinherit/);
});

test("verification fails when a preview login can create roles or databases", async () => {
  const failures = await failuresAfter((client, names) => client.query(`alter role ${names.previewOwner} createrole createdb`));
  assert.match(failures, /role_check_preview_owner has rolcreaterole/);
  assert.match(failures, /role_check_preview_owner has rolcreatedb/);
});

test("verification fails when the preview logins are missing (no main deploy yet)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    const failures = (await verifyDbLogins(client, names)).join("\n");
    assert.match(failures, /role_check_preview_owner doesn't exist/);
  });
});

test("verification fails when anyone (PUBLIC) can create temporary tables in the preview database", async () => {
  const failures = await failuresAfter((client, names) => client.query(`grant temporary on database "${names.previewDb}" to public`));
  assert.match(failures, /PUBLIC has TEMPORARY on the preview database/);
});

test("allows preview_owner's own grant of app_user from migration 0020, and nothing else", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await client.query(`set local role ${names.previewOwner}`);
    await client.query("grant app_user to current_user"); // what migration 0020 runs as preview_owner
    await client.query("reset role");
    assert.deepEqual(await verifyDbLogins(client, names), []);

    await client.query(`grant app_user to ${names.previewOwner} with inherit true`); // another grantor, inheriting
    assert.match((await verifyDbLogins(client, names)).join("\n"), /role_check_preview_owner's memberships of app_user aren't the provisioned ones/);
  });
});

test("verification fails when preview_runtime's membership of app_user changes", async () => {
  const failures = await failuresAfter((client, names) => client.query(`grant app_user to ${names.previewRuntime} with admin true`));
  assert.match(failures, /role_check_preview_runtime's memberships of app_user aren't the provisioned ones/);
});

test("limits the preview logins' connections, and verification fails without the limit", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    const { rows } = await client.query("select rolname::text as name, rolconnlimit from pg_roles where rolname = any ($1) order by 1", [
      [names.previewOwner, names.previewRuntime],
    ]);
    assert.deepEqual(rows, [
      { name: names.previewOwner, rolconnlimit: CONNECTION_LIMITS.previewOwner },
      { name: names.previewRuntime, rolconnlimit: CONNECTION_LIMITS.previewRuntime },
    ]);
    await client.query(`alter role ${names.previewRuntime} connection limit -1`);
    assert.match((await verifyDbLogins(client, names)).join("\n"), /role_check_preview_runtime's connection limit is -1/);
  });
});

/** A variable of infra/scripts/environment.sh (the pool sizes are fixed names, the same for both environments). */
function fromEnvironmentSh(name) {
  const script = new URL("./environment.sh", import.meta.url).pathname;
  return execFileSync("bash", ["-c", `. "$1" && printenv ${name}`, "bash", script], {
    env: { ...process.env, PROJECT: "demo", IS_PR: "false" },
  })
    .toString()
    .trim();
}

test("uses the pool sizes the deploys set (environment.sh)", () => {
  assert.equal(String(CONNECTION_BUDGET.previewPoolMax), fromEnvironmentSh("PREVIEW_DB_POOL_MAX"));
  assert.equal(String(CONNECTION_BUDGET.mainPoolMax), fromEnvironmentSh("MAIN_DB_POOL_MAX"));
});

test("counts as many instances per preview revision as Terraform allows (preview_max_instances)", () => {
  const variables = readFileSync(new URL("../variables.tf", import.meta.url), "utf8");
  const block = variables.match(/variable "preview_max_instances" \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.equal(block.match(/^\s*default\s*=\s*(\d+)\s*$/m)?.[1], String(CONNECTION_BUDGET.previewInstances));
});

test("limits preview_runtime to 3 zones x 1 instance x the preview pool (2), plus the role check: 7", () => {
  assert.equal(CONNECTION_LIMITS.previewRuntime, 3 * 1 * 2 + 1);
});

test("leaves main the share environment.sh documents (MAIN_DB_CONNECTIONS) of db-f1-micro's 22 login connections", () => {
  // test-environment.sh checks main's zones x max_instances x pool against this share (task 091).
  const mainShare = 22 - CONNECTION_LIMITS.previewOwner - CONNECTION_LIMITS.previewRuntime;
  assert.equal(String(mainShare), fromEnvironmentSh("MAIN_DB_CONNECTIONS"));
});

test("verification fails while preview_runtime keeps an older limit (until a main deploy provisions it)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await client.query(`alter role ${names.previewRuntime} connection limit 6`);
    assert.match((await verifyDbLogins(client, names)).join("\n"), /role_check_preview_runtime's connection limit is 6, not 7/);
  });
});

// PR migrations run as preview_owner and can plant functions in app_preview's public schema, where main's owner
// login provisions and verifies. Unqualified catalog calls would run them as that login (an exact `text`
// overload wins over pg_catalog's `name` one for an untyped parameter). The planted ones raise when called.
test("functions planted in the preview database's public schema are never called", async () => {
  await inRolledBackTransaction(async (client, names) => {
    for (const fn of ["pg_has_role(oid, text, text)", "pg_has_role(text, text, text)", "has_database_privilege(oid, text, text)",
      "has_schema_privilege(oid, text, text)", "has_database_privilege(text, text, text)"]) {
      await client.query(`create function public.${fn} returns boolean language plpgsql as $$ begin raise exception 'planted function called'; end $$`);
    }
    await provisionAll(client, names);
    assert.deepEqual(await verifyDbLogins(client, names), []);
    await client.query(`grant connect on database "${names.mainDb}" to ${names.previewRuntime}`);
    assert.match((await verifyDbLogins(client, names)).join("\n"), /role_check_preview_runtime can connect to the main database/);
  });
});

// Round 4: main deploys must not stall or fail because of what PR code does in app_preview.
test("the preview side gives up within its bound when the migration lock is held", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionMainSide(client, names);
    await withClient(loginConfig, async (holder) => {
      await holder.query("select pg_advisory_lock(hashtext($1))", [migrationLockName(names.previewDb)]);
      const started = Date.now();
      await assert.rejects(provisionPreviewSide(client, names, { timeoutMs: 300 }), /lock timeout/);
      assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
    });
  });
});

test("the main side removes app_user grants preview_owner made (so a PR can't make preview_runtime inherit)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await client.query(`set local role ${names.previewOwner}`);
    await client.query(`grant app_user to ${names.previewRuntime} with inherit true, set true`);
    await client.query("reset role");
    assert.match((await verifyDbLogins(client, names)).join("\n"), /role_check_preview_runtime's memberships of app_user aren't the provisioned ones/);

    await provisionMainSide(client, names);
    assert.deepEqual(await verifyDbLogins(client, names), []);
  });
});

test("the main side's cleanup works as a non-superuser CREATEROLE login, like Cloud SQL's owner login", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await client.query("create role role_check_app login createrole");
    await client.query("grant app_user to role_check_app with admin option");
    await client.query(`grant connect on database "${names.mainDb}" to role_check_app`);
    const asApp = { ...names, mainOwner: "role_check_app" };
    await client.query("set local role role_check_app");
    await provisionMainSide(client, asApp);
    await client.query(`set local role ${names.previewOwner}`);
    await client.query(`grant app_user to ${names.previewRuntime} with inherit true, set true`);
    await client.query("set local role role_check_app");
    await provisionMainSide(client, asApp);
    await client.query("reset role");
    const { rows } = await client.query(
      "select count(*)::int as n from pg_auth_members m where m.grantor = $1::regrole",
      [names.previewOwner],
    );
    assert.equal(rows[0].n, 0);
  });
});

test("main's own verification covers what protects the main database", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionMainSide(client, names);
    assert.deepEqual(await verifyMainSide(client, names), []);
    await client.query(`grant connect on database "${names.mainDb}" to ${names.previewRuntime}`);
    assert.match((await verifyMainSide(client, names)).join("\n"), /role_check_preview_runtime can connect to the main database/);
  });
});

// Task 074: main's runtime login. Like preview_runtime, a NOINHERIT login whose only membership is app_user
// (SET only); it owns nothing, so there is no owner to `SET ROLE` to, and connects to the main database only.
const mainFailuresAfter = (breakIt) =>
  inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await breakIt(client, names);
    return (await verifyMainSide(client, names)).join("\n");
  });

test("creates main's runtime login: owns nothing, NOINHERIT, SET-only member of app_user, CONNECT to the main database only", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    assert.deepEqual(await verifyMainSide(client, names), []);
    const { rows } = await client.query(
      `select r.rolcanlogin, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication, r.rolinherit,
              array(select g.rolname::text || ':' || m.admin_option || ':' || m.inherit_option || ':' || m.set_option
                    from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = r.oid) as memberships,
              pg_has_role(r.oid, $2, 'SET') as can_set_owner,
              has_database_privilege(r.oid, $3, 'CONNECT') as main_connect,
              has_database_privilege(r.oid, $4, 'CONNECT') as preview_connect,
              (select count(*)::int from pg_shdepend d where d.refobjid = r.oid and d.deptype = 'o') as owned
       from pg_roles r where r.rolname = $1`,
      [names.mainRuntime, names.mainOwner, names.mainDb, names.previewDb],
    );
    assert.deepEqual(rows, [
      {
        rolcanlogin: true, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false,
        rolinherit: false, memberships: ["app_user:false:false:true"], can_set_owner: false, main_connect: true, preview_connect: false, owned: 0,
      },
    ]);
  });
});

test("main's runtime login is provisioned again on every main deploy (idempotent)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    await provisionAll(client, names);
    assert.deepEqual(await verifyMainSide(client, names), []);
  });
});

test("main's verification fails when its runtime login is missing", async () => {
  await inRolledBackTransaction(async (client, names) => {
    assert.match((await verifyMainSide(client, names)).join("\n"), /role_check_main_runtime doesn't exist/);
  });
});

test("main's verification fails when its runtime login can SET ROLE to the owner login", async () => {
  const failures = await mainFailuresAfter((client, names) => client.query(`grant "${names.mainOwner}" to ${names.mainRuntime} with inherit false, set true`));
  assert.match(failures, /role_check_main_runtime can SET ROLE to main's owner login/);
  assert.match(failures, /role_check_main_runtime is a member of roles other than app_user/);
});

test("main's verification fails when its runtime login owns something", async () => {
  const failures = await mainFailuresAfter(async (client, names) => {
    await client.query("create table public.role_check_owned (id int)");
    await client.query(`alter table public.role_check_owned owner to ${names.mainRuntime}`);
  });
  assert.match(failures, /role_check_main_runtime owns 1 object/);
});

test("main's verification fails when its runtime login inherits, or has ADMIN on app_user", async () => {
  const failures = await mainFailuresAfter(async (client, names) => {
    await client.query(`alter role ${names.mainRuntime} inherit`);
    await client.query(`grant app_user to ${names.mainRuntime} with admin true`);
  });
  assert.match(failures, /role_check_main_runtime has rolinherit/);
  assert.match(failures, /role_check_main_runtime's memberships of app_user aren't the provisioned ones/);
});

// Keeping app_runtime out of app_preview revokes CONNECT from PUBLIC there, so it goes with the preview logins'
// own grants, as one best-effort step: a skipped step never locks previews out, and the next preview deploy's
// verification reports it (like every preview-side step).
test("the preview verification fails when main's runtime login can connect to the preview database", async () => {
  const failures = await failuresAfter((client, names) => client.query(`grant connect on database "${names.previewDb}" to ${names.mainRuntime}`));
  assert.match(failures, /role_check_main_runtime can connect to the preview database/);
});

test("the preview verification passes before main's runtime login exists (a preview of the PR that adds it)", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await provisionAll(client, names);
    assert.deepEqual(await verifyDbLogins(client, { ...names, mainRuntime: "role_check_no_such_login" }), []);
  });
});

test("the preview verification fails when a preview login connects only through PUBLIC", async () => {
  const failures = await failuresAfter(async (client, names) => {
    await client.query(`grant connect on database "${names.previewDb}" to public`);
    await client.query(`revoke connect on database "${names.previewDb}" from ${names.previewRuntime}`);
  });
  assert.match(failures, /role_check_preview_runtime has no CONNECT grant of its own on the preview database/);
});

test("when the preview logins' CONNECT grants can't run, PUBLIC keeps CONNECT on the preview database and main goes on", async () => {
  await inRolledBackTransaction(async (client, names) => {
    await withClient(loginConfig, async (holder) => {
      // Holds the preview database's pg_database row (an open GRANT on it), so every grant on it waits.
      await holder.query("begin");
      await holder.query(`grant temporary on database "${names.previewDb}" to public`);
      try {
        const { warnings } = await provisionMainSide(client, names, { timeoutMs: 300 });
        assert.match(warnings.join("\n"), new RegExp(`CONNECT on ${names.previewDb}: .*lock timeout`));
        assert.deepEqual(await verifyMainSide(client, names), []);
        const { rows } = await client.query(
          `select exists (select 1 from pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
                          where d.datname = $1 and a.grantee = 0 and a.privilege_type = 'CONNECT') as public_connect`,
          [names.previewDb],
        );
        assert.equal(rows[0].public_connect, true);
      } finally {
        await holder.query("rollback");
      }
    });
  });
});

test("main's verification fails when its runtime login can't connect to the main database", async () => {
  const failures = await mainFailuresAfter((client, names) => client.query(`revoke connect on database "${names.mainDb}" from ${names.mainRuntime}`));
  assert.match(failures, /role_check_main_runtime can't connect to the main database/);
});

test("main's verification fails when its runtime login has owner-level attributes", async () => {
  const failures = await mainFailuresAfter((client, names) => client.query(`alter role ${names.mainRuntime} createrole bypassrls`));
  assert.match(failures, /role_check_main_runtime has rolcreaterole/);
  assert.match(failures, /role_check_main_runtime has rolbypassrls/);
});
