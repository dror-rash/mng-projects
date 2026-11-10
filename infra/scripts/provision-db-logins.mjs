#!/usr/bin/env node
// Database logins of main's runtime (task 074) and of PR previews (task 068). Main deploys run it as main's owner
// login (`app`); it is idempotent:
//   - app_runtime (main's runtime): LOGIN NOINHERIT, owns nothing, a SET-only member of app_user and of nothing
//     else (the runtime switches with `-c role=app_user`), CONNECT on `app` and not on app_preview (a
//     best-effort preview step, see below). With nothing better to switch
//     to, a `SET ROLE` or `RESET ROLE` on a pooled connection can't leave row-level security behind (the owner
//     login could: ADR-0006, 2026-11 amendment). Fatal: a failure fails the main deploy before any service
//     deploys. No connection limit (main's owner login had none either);
//   - preview_owner: LOGIN NOINHERIT, owns app_preview's objects and runs its migrations. ADMIN on app_user
//     (migration 0020 runs `GRANT app_user TO current_user`), CONNECT and CREATE on app_preview (drizzle-kit
//     creates its schema), USAGE and CREATE on its `public` schema;
//   - preview_runtime: LOGIN NOINHERIT, a SET-only member of app_user (the runtime switches with
//     `-c role=app_user`), CONNECT on app_preview;
//   - both have a CONNECTION LIMIT (db-f1-micro allows 25 connections in all, main's included;
//     CONNECTION_BUDGET below);
//   - neither can connect to `app`: CONNECT on it is revoked from PUBLIC and granted to the owner login and
//     app_runtime; CONNECT on app_preview is revoked from PUBLIC and app_runtime too, in the same step as the
//     preview logins' and the owner's own grants there (grants first; if one can't run, nothing is revoked);
//   - TEMPORARY on app_preview is revoked from PUBLIC here: migration 0025 does it too, but run by
//     preview_owner, which doesn't own the database, it only warns.
// New roles are NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS by default; verification
// checks all of it. Passwords go in as SCRAM-SHA-256 verifiers computed here, never in plain text.
//
// Two connections, because PR migrations can write to app_preview (functions planted in its `public`): the
// role and database statements run on a connection to `app`, which PR code can't touch, and a failure there
// fails the main deploy. Only the schema grant runs on app_preview, under the preview migration lock
// (with-db-lock.mjs, same name), bounded by lock_timeout/statement_timeout; any failure on that side is a
// warning, so nothing a PR does to app_preview can stall or fail a main deploy (the next preview deploy fails
// instead). Both connections pin search_path and call catalog functions qualified (pg-safe.mjs).
//
// Previews run `--verify-only` on app_preview: read-only, and it fails the deploy until a main deploy has
// provisioned.
//
// Why SQL and not Terraform's google_sql_user: Cloud SQL makes every API-created user a member of
// cloudsqlsuperuser (CREATEROLE, CREATEDB, owner of the databases, so CONNECT to `app` whatever PUBLIC has).
// Why not a Drizzle migration: logins differ per environment, and local databases have none.
//
// Usage (names from infra/scripts/environment.sh):
//   MAIN_DATABASE_URL=postgres://app:…@127.0.0.1:5432/app DATABASE_URL=postgres://app:…@127.0.0.1:5432/app_preview \
//   MAIN_DB_NAME=app PREVIEW_DB_NAME=app_preview MAIN_OWNER_LOGIN=app MAIN_RUNTIME_LOGIN=app_runtime \
//   PREVIEW_OWNER_LOGIN=preview_owner PREVIEW_RUNTIME_LOGIN=preview_runtime \
//   MAIN_RUNTIME_PASSWORD=… PREVIEW_OWNER_PASSWORD=… PREVIEW_RUNTIME_PASSWORD=… \
//   node --experimental-strip-types infra/scripts/provision-db-logins.mjs
// Previews: DATABASE_URL=<preview_owner on app_preview> … provision-db-logins.mjs --verify-only
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { buildPoolConfig, RUNTIME_ROLE } from "../../packages/db/src/pool-config.ts";
import { Client, pinSearchPath, withPinnedSearchPath } from "./pg-safe.mjs";

/**
 * What the connection limits are computed from (task 075). db-f1-micro allows 25 connections, 3 reserved for
 * superusers, so 22 for logins. The pool sizes are the deploys' DB_POOL_MAX (infra/scripts/environment.sh;
 * the tests fail when they differ). Every zone (shell, example-zone, dashboard) runs the same pool size.
 *   - zones: 3; previewInstances: every open PR's tagged revision can scale to 1 instance per zone
 *     (preview_max_instances is per revision; provider 6.50 has no service-wide maximum);
 *   - roleCheck: check-runtime-role.mjs's one connection as preview_runtime at deploy time;
 *   - mainPoolMax: main's pool, for its worst case (3 zones × 1 busy instance at POC traffic × 4 = 12).
 */
export const CONNECTION_BUDGET = {
  zones: 3,
  previewInstances: 1,
  previewPoolMax: 2,
  roleCheck: 1,
  mainPoolMax: 4,
};

/**
 * Connection limits: what previews may take from the 22 login connections, keeping the rest for main.
 *   preview_runtime: 3 zones × 1 instance × 2 + the role check 1 = 7, one active PR at its worst case.
 *     Assumed: one preview tested at a time. A second at once may hit this limit and fail its own e2e
 *     ("too many connections for role"), never main.
 *   preview_owner: one PR migrating (lock + migration = 2) and another waiting on the lock (1) = 3.
 * Previews take at most 10; main keeps 12, its worst case (3 zones × 1 busy instance × 4 = 12).
 */
const { zones, previewInstances, previewPoolMax, roleCheck } = CONNECTION_BUDGET;
export const CONNECTION_LIMITS = { previewOwner: 3, previewRuntime: zones * previewInstances * previewPoolMax + roleCheck };

/** The advisory lock name preview migrations take (deploy.yml: with-db-lock.mjs "migrate-$DB_NAME"). */
export const migrationLockName = (database) => `migrate-${database}`;

const ident = (name) => `"${String(name).replaceAll('"', '""')}"`;

/**
 * A SCRAM-SHA-256 verifier for `password`, in the form Postgres stores (RFC 5802/7677, 4096 iterations).
 * Postgres accepts it in `ALTER ROLE … PASSWORD` and never sees the password. The passwords are ASCII
 * (Terraform's random_password, no special characters), so SASLprep leaves them as they are.
 */
export function scramVerifier(password, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/** Creates `login` unless it exists (also when another session creates it first: duplicate_object). */
async function ensureLogin(client, login, connectionLimit) {
  await client.query("savepoint ensure_login");
  try {
    await client.query(`create role ${ident(login)} login`);
    await client.query("release savepoint ensure_login");
  } catch (error) {
    if (error.code !== "42710") throw error;
    await client.query("rollback to savepoint ensure_login");
  }
  await client.query(`alter role ${ident(login)} with login noinherit connection limit ${Number(connectionLimit)}`);
}

async function setPassword(client, login, password) {
  if (!password) throw new Error(`The password of ${login} is empty.`);
  await client.query(`alter role ${ident(login)} password ${client.escapeLiteral(scramVerifier(password))}`);
}

/** How long main's preview-side step may wait (lock, statements) before it gives up with a warning. */
export const PREVIEW_SIDE_TIMEOUT_MS = 30_000;

/** Runs `step` in a savepoint; on failure (a timeout included) rolls it back and records a warning. */
async function bestEffort(client, label, step, warnings) {
  await client.query("savepoint best_effort");
  try {
    await step();
    await client.query("release savepoint best_effort");
  } catch (error) {
    await client.query("rollback to savepoint best_effort");
    warnings.push(`${label}: ${error.message}`);
  }
}

/**
 * Main's own work, on a connection to the main database (PR code can't write there), inside the caller's
 * transaction, bounded by lock_timeout (`timeoutMs`, statements twice that).
 *   Fatal (protects `app`): main's runtime login (created, password, its app_user grant), CONNECT on `app`
 *   revoked from PUBLIC and the preview logins and granted to the owner and main's runtime login.
 *   Best effort: CONNECT on the preview database, granted to the preview logins and the owner, then revoked
 *   from PUBLIC and main's runtime login (one step, so a skipped grant never locks previews out).
 *   Best effort (preview concerns; a preview login can hold its own pg_authid row, so these may time out):
 *   the logins, passwords, connection limits, app_user grants, and the grants on app_preview. A failure is
 *   returned as a warning; the next preview deploy's verification fails with the cause.
 * It also removes every app_user grant preview_owner made (migration 0020's self-grant, or one a PR made,
 * like `grant app_user to preview_runtime with inherit true`): `app` may not revoke `GRANTED BY
 * preview_owner`, but revoking preview_owner's ADMIN option with CASCADE drops every grant made with it; the
 * ADMIN grant is then made again.
 * @param {{ mainDb: string, previewDb: string, mainOwner: string, mainRuntime: string, previewOwner: string,
 *           previewRuntime: string, mainRuntimePassword: string, previewOwnerPassword: string,
 *           previewRuntimePassword: string }} names
 * @returns {Promise<{ warnings: string[] }>}
 */
export async function provisionMainSide(main, names, { timeoutMs = PREVIEW_SIDE_TIMEOUT_MS } = {}) {
  const { mainDb, previewDb, mainOwner, mainRuntime, previewOwner, previewRuntime } = names;
  await pinSearchPath(main);
  await main.query("select pg_catalog.set_config('lock_timeout', $1, true), pg_catalog.set_config('statement_timeout', $2, true)", [
    `${Number(timeoutMs)}ms`,
    `${2 * Number(timeoutMs)}ms`,
  ]);
  const warnings = [];
  const runtimeRole = ident(RUNTIME_ROLE);

  await bestEffort(main, `create ${previewOwner}`, () => ensureLogin(main, previewOwner, CONNECTION_LIMITS.previewOwner), warnings);
  await bestEffort(main, `create ${previewRuntime}`, () => ensureLogin(main, previewRuntime, CONNECTION_LIMITS.previewRuntime), warnings);
  await bestEffort(main, `password of ${previewOwner}`, () => setPassword(main, previewOwner, names.previewOwnerPassword), warnings);
  await bestEffort(main, `password of ${previewRuntime}`, () => setPassword(main, previewRuntime, names.previewRuntimePassword), warnings);
  // Runs outside the preview migration lock: a fresh app_preview migrating 0020 at this very moment may fail
  // its GRANT (ADMIN briefly revoked); rerunning that preview deploy fixes it.
  await bestEffort(main, `${RUNTIME_ROLE} grants of ${previewOwner}`, async () => {
    const ownerAdmin = await main.query(
      `select exists (select 1 from pg_catalog.pg_auth_members m
                      where m.roleid = $1::text::pg_catalog.regrole and m.member = $2::text::pg_catalog.regrole and m.admin_option) as has_admin`,
      [RUNTIME_ROLE, previewOwner],
    );
    if (ownerAdmin.rows[0].has_admin) await main.query(`revoke admin option for ${runtimeRole} from ${ident(previewOwner)} cascade`);
    await main.query(`grant ${runtimeRole} to ${ident(previewOwner)} with admin true, inherit false, set false`);
  }, warnings);
  await bestEffort(main, `${RUNTIME_ROLE} grant of ${previewRuntime}`, () =>
    main.query(`grant ${runtimeRole} to ${ident(previewRuntime)} with inherit false, set true`), warnings);
  await bestEffort(main, `grants on ${previewDb}`, async () => {
    await main.query(`grant create on database ${ident(previewDb)} to ${ident(previewOwner)}`);
    await main.query(`revoke temporary on database ${ident(previewDb)} from public`);
  }, warnings);

  // Fatal: main's runtime login (task 074). NOINHERIT and SET-only: app_user is the one role it can become.
  await ensureLogin(main, mainRuntime, -1);
  await setPassword(main, mainRuntime, names.mainRuntimePassword);
  await main.query(`grant ${runtimeRole} to ${ident(mainRuntime)} with inherit false, set true`);

  // Keeping main's runtime login out of the preview database means revoking CONNECT there from PUBLIC, so the
  // logins that need it get their own grants first, in the same step: if a grant can't run, nothing is revoked
  // and PUBLIC still lets the previews in. Best effort like every preview step: the next preview deploy's
  // verification reports a skipped one (its preview logins' own grants, app_runtime kept out).
  await bestEffort(main, `CONNECT on ${previewDb}`, async () => {
    await main.query(`grant connect on database ${ident(previewDb)} to ${ident(previewOwner)}, ${ident(previewRuntime)}, ${ident(mainOwner)}`);
    await main.query(`revoke connect on database ${ident(previewDb)} from public, ${ident(mainRuntime)}`);
  }, warnings);

  // Fatal: what keeps the preview logins (and everyone else) out of `app`. Only logins that exist.
  const existing = await main.query("select rolname::text as name from pg_catalog.pg_roles where rolname = any ($1::text[])", [
    [previewOwner, previewRuntime],
  ]);
  const revokeFrom = ["public", ...existing.rows.map((row) => ident(row.name))].join(", ");
  await main.query(`revoke connect on database ${ident(mainDb)} from ${revokeFrom}`);
  await main.query(`grant connect on database ${ident(mainDb)} to ${ident(mainOwner)}, ${ident(mainRuntime)}`);
  return { warnings };
}

/**
 * The preview side, on a connection to the preview database, inside the caller's transaction and after main's
 * work committed: the preview migration lock (same name as with-db-lock.mjs), then the schema grant. Bounded:
 * lock_timeout of `timeoutMs` (statements twice that), so PR code holding the lock or a lock on the schema
 * can't stall a main deploy.
 */
export async function provisionPreviewSide(preview, { previewDb, previewOwner }, { timeoutMs = PREVIEW_SIDE_TIMEOUT_MS } = {}) {
  await pinSearchPath(preview);
  // Statements get twice the lock bound, so a held lock reports as a lock timeout.
  await preview.query("select pg_catalog.set_config('lock_timeout', $1, true), pg_catalog.set_config('statement_timeout', $2, true)", [
    `${Number(timeoutMs)}ms`,
    `${2 * Number(timeoutMs)}ms`,
  ]);
  await preview.query("select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext($1::text))", [migrationLockName(previewDb)]);
  await preview.query(`grant usage, create on schema public to ${ident(previewOwner)}`);
}

/**
 * What protects the main database, read on main's own connection (failures fail the main deploy): main's
 * runtime login is what it should be (verifyMainRuntime), the preview logins exist without owner-level
 * attributes, can't connect to the main database, PUBLIC can't either, and main's owner can.
 */
export async function verifyMainSide(main, { mainDb, mainOwner, mainRuntime, previewOwner, previewRuntime }) {
  await pinSearchPath(main);
  const failures = await verifyMainRuntime(main, { mainDb, mainOwner, mainRuntime });
  const { rows } = await main.query(
    `select r.rolname::text as name, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication,
            pg_catalog.pg_has_role(r.oid, $3::text::pg_catalog.name, 'MEMBER') as main_owner_member,
            pg_catalog.has_database_privilege(r.oid, $2::text::pg_catalog.name, 'CONNECT') as main_connect
     from pg_catalog.pg_roles r where r.rolname = any ($1::text[])`,
    [[previewOwner, previewRuntime], mainDb, mainOwner],
  );
  for (const login of [previewOwner, previewRuntime]) {
    const role = rows.find((row) => row.name === login);
    if (!role) continue; // a login that doesn't exist can't connect; the preview verification reports it
    for (const attribute of ["rolsuper", "rolcreaterole", "rolcreatedb", "rolbypassrls", "rolreplication"]) {
      if (role[attribute]) failures.push(`${login} has ${attribute}`);
    }
    if (role.main_owner_member) failures.push(`${login} is a member of main's owner login ${mainOwner}`);
    if (role.main_connect) failures.push(`${login} can connect to the main database ${mainDb}`);
  }
  const database = await main.query(
    `select exists (select 1 from pg_catalog.pg_database d, pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
                    where d.datname = $1::text and a.grantee = 0 and a.privilege_type = 'CONNECT') as public_connect,
            pg_catalog.has_database_privilege($2::text::pg_catalog.name, $1::text::pg_catalog.name, 'CONNECT') as owner_connect`,
    [mainDb, mainOwner],
  );
  if (database.rows[0].public_connect) failures.push(`PUBLIC can connect to the main database ${mainDb}`);
  if (!database.rows[0].owner_connect) failures.push(`main's owner login ${mainOwner} can't connect to ${mainDb}`);
  return failures;
}

/**
 * Main's runtime login (task 074): it logs in, has no owner-level attribute, doesn't inherit, owns nothing in
 * any database (pg_shdepend), its only membership is the provisioned app_user grant (SET only), it can't
 * SET ROLE to main's owner login, and it can connect to the main database.
 */
async function verifyMainRuntime(main, { mainDb, mainOwner, mainRuntime }) {
  const failures = [];
  const { rows } = await main.query(
    `select r.rolcanlogin, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication, r.rolinherit,
            pg_catalog.pg_has_role(r.oid, $3::text::pg_catalog.name, 'SET') as can_set_owner,
            (select pg_catalog.count(*)::int from pg_catalog.pg_shdepend d
              where d.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass and d.refobjid = r.oid and d.deptype = 'o') as owned,
            array(select g.rolname::text from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid
                  where m.member = r.oid and g.rolname <> $2::text order by 1) as other_roles,
            array(select pg_catalog.concat_ws(':', m.admin_option, m.inherit_option, m.set_option)
                  from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid
                  where m.member = r.oid and g.rolname = $2::text order by 1) as runtime_grants,
            pg_catalog.has_database_privilege(r.oid, $4::text::pg_catalog.name, 'CONNECT') as main_connect
     from pg_catalog.pg_roles r where r.rolname = $1::text`,
    [mainRuntime, RUNTIME_ROLE, mainOwner, mainDb],
  );
  const role = rows[0];
  if (!role) return [`${mainRuntime} doesn't exist (main's runtime login)`];
  if (!role.rolcanlogin) failures.push(`${mainRuntime} can't log in`);
  for (const attribute of ["rolsuper", "rolcreaterole", "rolcreatedb", "rolbypassrls", "rolreplication", "rolinherit"]) {
    if (role[attribute]) failures.push(`${mainRuntime} has ${attribute}`);
  }
  if (role.can_set_owner) failures.push(`${mainRuntime} can SET ROLE to main's owner login ${mainOwner}`);
  if (role.owned > 0) failures.push(`${mainRuntime} owns ${role.owned} object(s)`);
  if (role.other_roles.length > 0) failures.push(`${mainRuntime} is a member of roles other than ${RUNTIME_ROLE}: ${role.other_roles.join(", ")}`);
  // "<admin>:<inherit>:<set>": one grant, SET only.
  if (role.runtime_grants.join(",") !== "f:f:t") {
    failures.push(`${mainRuntime}'s memberships of ${RUNTIME_ROLE} aren't the provisioned ones: ${role.runtime_grants.join(",") || "none"}`);
  }
  if (!role.main_connect) failures.push(`${mainRuntime} can't connect to the main database ${mainDb}`);
  return failures; // kept out of the preview database by a preview step: verifyDbLogins checks it
}

/**
 * The failed checks (empty when all pass). Read-only, on a connection to the preview database (the schema
 * privilege is per database); everything else it reads is shared catalogs.
 * @returns {Promise<string[]>}
 */
export async function verifyDbLogins(client, { mainDb, previewDb, mainOwner, mainRuntime, previewOwner, previewRuntime }) {
  await pinSearchPath(client);
  const failures = [];
  const { rows } = await client.query(
    `select r.rolname::text as name, r.rolcanlogin, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls,
            r.rolreplication, r.rolinherit, r.rolconnlimit,
            pg_catalog.pg_has_role(r.oid, $2::text::pg_catalog.name, 'MEMBER') as runtime_member,
            pg_catalog.pg_has_role(r.oid, $3::text::pg_catalog.name, 'MEMBER') as main_owner_member,
            array(select g.rolname::text from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid
                  where m.member = r.oid and g.rolname <> $2::text order by 1) as other_roles,
            array(select pg_catalog.concat_ws(':', case when m.grantor = r.oid then 'self' else 'other' end,
                                               m.admin_option, m.inherit_option, m.set_option)
                  from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid
                  where m.member = r.oid and g.rolname = $2::text order by 1) as runtime_grants,
            pg_catalog.has_database_privilege(r.oid, $4::text::pg_catalog.name, 'CONNECT') as main_connect,
            pg_catalog.has_database_privilege(r.oid, $5::text::pg_catalog.name, 'CONNECT') as preview_connect,
            exists (select 1 from pg_catalog.pg_database d, pg_catalog.aclexplode(d.datacl) a
                    where d.datname = $5::text and a.grantee = r.oid and a.privilege_type = 'CONNECT') as preview_connect_granted,
            pg_catalog.has_database_privilege(r.oid, $5::text::pg_catalog.name, 'CREATE') as preview_create,
            pg_catalog.has_schema_privilege(r.oid, 'public'::pg_catalog.name, 'CREATE') as public_create
     from pg_catalog.pg_roles r where r.rolname = any ($1::text[])`,
    [[previewOwner, previewRuntime], RUNTIME_ROLE, mainOwner, mainDb, previewDb],
  );
  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  // Memberships of app_user, as "<grantor>:<admin>:<inherit>:<set>". preview_owner: the provisioned grant
  // (ADMIN only), plus the one migration 0020 makes as preview_owner itself (SET, no ADMIN) once a preview
  // has migrated. That second one is harmless (preview_owner owns more than app_user can do) and isn't
  // revoked: main deploys would race the next preview's migration.
  const allowedGrants = {
    [previewOwner]: [["other:t:f:f"], ["other:t:f:f", "self:f:f:t"]],
    [previewRuntime]: [["other:f:f:t"]],
  };
  const limits = { [previewOwner]: CONNECTION_LIMITS.previewOwner, [previewRuntime]: CONNECTION_LIMITS.previewRuntime };
  for (const [login, isOwner] of [[previewOwner, true], [previewRuntime, false]]) {
    const role = byName[login];
    if (!role) {
      failures.push(`${login} doesn't exist (run a main deploy first: it provisions the preview logins)`);
      continue;
    }
    if (!role.rolcanlogin) failures.push(`${login} can't log in`);
    for (const attribute of ["rolsuper", "rolcreaterole", "rolcreatedb", "rolbypassrls", "rolreplication", "rolinherit"]) {
      if (role[attribute]) failures.push(`${login} has ${attribute}`);
    }
    if (role.rolconnlimit !== limits[login]) failures.push(`${login}'s connection limit is ${role.rolconnlimit}, not ${limits[login]}`);
    if (role.main_owner_member) failures.push(`${login} is a member of main's owner login ${mainOwner}`);
    if (role.other_roles.length > 0) failures.push(`${login} is a member of roles other than ${RUNTIME_ROLE}: ${role.other_roles.join(", ")}`);
    const grants = role.runtime_grants.join(",");
    if (!allowedGrants[login].some((allowed) => allowed.join(",") === grants)) {
      failures.push(`${login}'s memberships of ${RUNTIME_ROLE} aren't the provisioned ones: ${grants || "none"}`);
    }
    if (role.main_connect) failures.push(`${login} can connect to the main database ${mainDb}`);
    if (!role.preview_connect) failures.push(`${login} can't connect to the preview database ${previewDb}`);
    // Its own grant, not PUBLIC's: main deploys revoke PUBLIC's (task 074).
    else if (!role.preview_connect_granted) failures.push(`${login} has no CONNECT grant of its own on the preview database ${previewDb}`);
    if (isOwner) {
      if (!role.preview_create) failures.push(`${login} can't create schemas in ${previewDb} (drizzle-kit needs one)`);
      if (!role.public_create) failures.push(`${login} can't create in ${previewDb}'s public schema`);
    }
  }

  // Main's runtime login stays out of the preview database (task 074); before a main deploy has created it,
  // there is nothing to check.
  const mainRuntimeConnect = await client.query(
    `select pg_catalog.has_database_privilege(r.oid, $2::text::pg_catalog.name, 'CONNECT') as connect
     from pg_catalog.pg_roles r where r.rolname = $1::text`,
    [mainRuntime, previewDb],
  );
  if (mainRuntimeConnect.rows[0]?.connect) failures.push(`${mainRuntime} can connect to the preview database ${previewDb}`);

  const databases = await client.query(
    `select exists (select 1 from pg_catalog.pg_database d, pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
                    where d.datname = $1::text and a.grantee = 0 and a.privilege_type = 'CONNECT') as public_connect,
            exists (select 1 from pg_catalog.pg_database d, pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
                    where d.datname = $2::text and a.grantee = 0 and a.privilege_type = 'TEMPORARY') as public_temp,
            pg_catalog.has_database_privilege($3::text::pg_catalog.name, $1::text::pg_catalog.name, 'CONNECT') as owner_connect`,
    [mainDb, previewDb, mainOwner],
  );
  const { public_connect: publicConnect, public_temp: publicTemp, owner_connect: ownerConnect } = databases.rows[0];
  if (publicConnect) failures.push(`PUBLIC can connect to the main database ${mainDb}`);
  if (publicTemp) failures.push(`PUBLIC has TEMPORARY on the preview database ${previewDb}`);
  if (!ownerConnect) failures.push(`main's owner login ${mainOwner} can't connect to ${mainDb}`);
  return failures;
}

function namesFromEnv(env, { withPasswords }) {
  const names = {
    mainDb: env.MAIN_DB_NAME,
    previewDb: env.PREVIEW_DB_NAME,
    mainOwner: env.MAIN_OWNER_LOGIN,
    mainRuntime: env.MAIN_RUNTIME_LOGIN,
    previewOwner: env.PREVIEW_OWNER_LOGIN,
    previewRuntime: env.PREVIEW_RUNTIME_LOGIN,
    ...(withPasswords && {
      mainRuntimePassword: env.MAIN_RUNTIME_PASSWORD,
      previewOwnerPassword: env.PREVIEW_OWNER_PASSWORD,
      previewRuntimePassword: env.PREVIEW_RUNTIME_PASSWORD,
    }),
  };
  const missing = Object.entries(names).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) throw new Error(`missing ${missing.join(", ")} (source infra/scripts/environment.sh)`);
  return names;
}

/** An open client from `url` (the login's own connection, no role switch, search_path pinned) on `database`. */
async function connect(url, database, { timeoutMs } = {}) {
  if (!url) throw new Error(`missing the connection URL for ${database}`);
  const config = withPinnedSearchPath(buildPoolConfig({ DATABASE_URL: url }, null));
  const client = new Client(timeoutMs ? { ...config, connectionTimeoutMillis: timeoutMs, statement_timeout: 2 * timeoutMs } : config);
  await client.connect();
  const { rows } = await client.query("select pg_catalog.current_database()::text as db");
  if (rows[0].db !== database) {
    await client.end();
    throw new Error(`expected a connection to ${database}, got ${rows[0].db}`);
  }
  return client;
}

function report(failures, label) {
  console.error(`Database logins check FAILED (${label}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
}

/** Previews: read-only, everything must hold (fails the preview deploy). */
async function verifyOnly(names) {
  const preview = await connect(process.env.DATABASE_URL, names.previewDb);
  try {
    const failures = await verifyDbLogins(preview, names);
    if (failures.length > 0) return report(failures, "preview");
    console.log(`Database logins ok (verified): ${names.previewOwner} and ${names.previewRuntime} reach ${names.previewDb}, not ${names.mainDb}.`);
  } finally {
    await preview.end();
  }
}

/**
 * Main: its own work on the main database must succeed (else the deploy fails). The preview side is bounded
 * and best-effort: whatever PR code did to app_preview, main deploys; it warns, and the next preview deploy
 * fails with the reason (verify-only).
 */
async function provision(names) {
  // One bound for everything a preview login or PR code could hold up (role rows, the preview lock).
  const timeoutMs = Number(process.env.PREVIEW_SIDE_TIMEOUT_MS) || PREVIEW_SIDE_TIMEOUT_MS;
  const main = await connect(process.env.MAIN_DATABASE_URL, names.mainDb);
  try {
    await main.query("begin");
    try {
      const { warnings } = await provisionMainSide(main, names, { timeoutMs });
      for (const warning of warnings) {
        console.log(`::warning::Preview login step skipped, main deploys anyway: ${warning}. The next preview deploy fails until a main deploy completes it.`);
      }
      const failures = await verifyMainSide(main, names);
      if (failures.length > 0) {
        await main.query("rollback");
        return report(failures, "main");
      }
      await main.query("commit");
    } catch (error) {
      await main.query("rollback").catch(() => {});
      throw error;
    }
  } finally {
    await main.end();
  }
  console.log(
    `Database logins provisioned on ${names.mainDb}: ${names.mainRuntime} owns nothing and can only become ${RUNTIME_ROLE}; ` +
      `${names.previewOwner} and ${names.previewRuntime} can't connect to it.`,
  );

  let preview;
  try {
    preview = await connect(process.env.DATABASE_URL, names.previewDb, { timeoutMs });
    await preview.query("begin");
    await provisionPreviewSide(preview, names, { timeoutMs });
    await preview.query("commit");
    const failures = await verifyDbLogins(preview, names);
    if (failures.length > 0) throw new Error(failures.join("; "));
    console.log(`Preview side ok: ${names.previewDb}'s schema grant made, preview logins verified.`);
  } catch (error) {
    await preview?.query("rollback").catch(() => {});
    console.log(
      `::warning::Preview database step skipped, main deploys anyway: ${error.message}. ` +
        "The next preview deploy fails until a main deploy completes this step.",
    );
  } finally {
    await preview?.end().catch(() => {});
  }
}

async function main() {
  const isVerifyOnly = process.argv.includes("--verify-only");
  const names = namesFromEnv(process.env, { withPasswords: !isVerifyOnly });
  await (isVerifyOnly ? verifyOnly(names) : provision(names));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Database logins check FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
