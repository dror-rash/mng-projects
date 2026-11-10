#!/usr/bin/env node
// Runtime role check (task 068, ADR-0006): after `db:migrate`, open a connection exactly as the runtime pool
// does (the environment's runtime login, `-c role=app_user` from buildPoolConfig) and fail unless
//   - current_user is app_user, and the login may SET ROLE app_user;
//   - app_user isn't a superuser and hasn't BYPASSRLS;
//   - app_user owns no public table and isn't a member of any table's owner (owners bypass row-level
//     security, which isn't forced);
//   - row-level security is on for every public table except Better Auth's (no RLS by design, ADR-0006);
//   - app_user can't create temporary tables (migration 0025);
//   - app_user can use no view, materialized view or SECURITY DEFINER function but the migrations' own, and
//     no table outside public, counting column-only grants (each runs with its owner's rights or has no
//     policies of ours); no rule on any table; no SECURITY DEFINER trigger but the migrations' own;
//   - the views, definer functions, definer trigger functions and policies are the migrations' definitions,
//     pinned by hash (rls-pins.mjs);
//   - app_user has no TRUNCATE, TRIGGER or REFERENCES on any table (TRUNCATE ignores row-level security);
//   - without app.user_id, app_user sees no workspace (the probe: row-level security really applies).
//
// It runs where PR migrations can plant functions (app_preview), so search_path is pinned and catalog calls
// are qualified (pg-safe.mjs): a planted function can't fake a pass.
//
// Usage: DATABASE_URL=postgres://<login>:…@127.0.0.1:5432/<db> node --experimental-strip-types infra/scripts/check-runtime-role.mjs
// (deploy.yml runs it through the Cloud SQL Auth Proxy; CI runs its tests against the migrated database).
import { fileURLToPath } from "node:url";

import { buildPoolConfig, RUNTIME_ROLE } from "../../packages/db/src/pool-config.ts";
import { Client, pinSearchPath, withPinnedSearchPath } from "./pg-safe.mjs";
import { PINS, pinMatches, readPinnable, SYSTEM_SCHEMAS } from "./rls-pins.mjs";

/** The first line of the output whenever a pin fails. */
export const PIN_HEADER =
  "A migration changed RLS-relevant objects: update infra/scripts/rls-pins.mjs (`node --experimental-strip-types infra/scripts/rls-pins.mjs --print`)";

/**
 * Better Auth's tables: grants and no row-level security (ADR-0006). Any other public table needs it.
 * rate_limit: its rate-limit counts, shared by every instance (task 089); only Better Auth reads it.
 * sign_in_lockout: failed sign-ins per hashed email (task 090); only the sign-in hooks in @repo/auth read it.
 */
export const TABLES_WITHOUT_RLS = ["account", "rate_limit", "session", "sign_in_lockout", "user", "verification"];


/**
 * The failed checks on `client` (empty when all pass). Read-only.
 * @param {{ query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }} client
 * @returns {Promise<string[]>}
 */
export async function checkRuntimeRole(client, role = RUNTIME_ROLE) {
  await pinSearchPath(client);
  const failures = [];
  const { rows } = await client.query(
    `select pg_catalog."current_user"()::text as current_user,
            exists (select 1 from pg_catalog.pg_roles where rolname = $1::text) as role_exists`,
    [role],
  );
  const { current_user: currentUser, role_exists: roleExists } = rows[0];

  if (currentUser !== role) failures.push(`current_user is "${currentUser}", not "${role}"`);
  if (!roleExists) {
    failures.push(`role "${role}" doesn't exist (migrations not applied?)`);
    return failures;
  }

  const attributes = await client.query(
    `select pg_catalog.pg_has_role(pg_catalog."session_user"(), r.oid, 'SET') as login_can_set, r.rolsuper, r.rolbypassrls,
            pg_catalog.has_database_privilege(r.oid, pg_catalog.current_database(), 'TEMPORARY') as can_temp
     from pg_catalog.pg_roles r where r.rolname = $1::text`,
    [role],
  );
  const { login_can_set: loginCanSet, rolsuper, rolbypassrls, can_temp: canTemp } = attributes.rows[0];
  if (loginCanSet !== true) failures.push(`the login (session_user) can't SET ROLE ${role}`);
  if (rolsuper !== false) failures.push(`${role} is a superuser`);
  if (rolbypassrls !== false) failures.push(`${role} has BYPASSRLS`);
  if (canTemp !== false) failures.push(`${role} has TEMPORARY on the database (migration 0025's REVOKE didn't apply)`);

  const tables = await client.query(
    `select c.relname::text as name,
            pg_catalog.pg_has_role($1::text::pg_catalog.name, c.relowner, 'MEMBER') as role_has_owner,
            c.relrowsecurity as rls
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
     order by c.relname`,
    [role],
  );
  const ownedTables = tables.rows.filter((t) => t.role_has_owner).map((t) => t.name);
  if (ownedTables.length > 0) failures.push(`${role} is a member of the owner of: ${ownedTables.join(", ")}`);
  const withoutRls = tables.rows.filter((t) => !t.rls && !TABLES_WITHOUT_RLS.includes(t.name)).map((t) => t.name);
  if (withoutRls.length > 0) failures.push(`row-level security is off on: ${withoutRls.join(", ")}`);

  // What else app_user can reach that row-level security doesn't cover, column-only grants included.
  const reachable = await client.query(
    `select n.nspname::text as schema, c.relname::text as name, c.relkind::text as kind,
            pg_catalog.array_to_string(c.reloptions, ',') as options,
            case when c.relkind in ('v', 'm') then pg_catalog.pg_get_viewdef(c.oid) end as definition,
            (c.relkind in ('r', 'p', 'f') and (pg_catalog.has_table_privilege($1::text::pg_catalog.name, c.oid, 'TRUNCATE, TRIGGER, REFERENCES')
              or pg_catalog.has_any_column_privilege($1::text::pg_catalog.name, c.oid, 'REFERENCES'))) as extra_privilege
     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p', 'f', 'v', 'm') and n.nspname <> all ($2::text[])
       and (pg_catalog.has_table_privilege($1::text::pg_catalog.name, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            or pg_catalog.has_any_column_privilege($1::text::pg_catalog.name, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))
     order by 1, 2`,
    [role, SYSTEM_SCHEMAS],
  );
  const qualified = (r) => `${r.schema}.${r.name}`;
  const isView = (r) => r.kind === "v" || r.kind === "m";
  const pinnedView = (r) => r.kind === "v" && Object.hasOwn(PINS.views, qualified(r));
  const views = reachable.rows.filter((r) => isView(r) && !pinnedView(r));
  if (views.length > 0) failures.push(`views ${role} can use that aren't allowlisted: ${views.map(qualified).join(", ")}`);
  const outside = reachable.rows.filter((r) => !isView(r) && r.schema !== "public");
  if (outside.length > 0) failures.push(`tables outside public ${role} can use: ${outside.map(qualified).join(", ")}`);
  const extra = reachable.rows.filter((r) => r.extra_privilege);
  if (extra.length > 0) failures.push(`${role} has TRUNCATE, TRIGGER or REFERENCES on: ${extra.map(qualified).join(", ")}`);

  // Rules on tables run their actions with the table owner's rights (views' own _RETURN rules are views).
  const rules = await client.query(
    `select n.nspname || '.' || c.relname || '.' || r.rulename as name
     from pg_catalog.pg_rewrite r join pg_catalog.pg_class c on c.oid = r.ev_class
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind not in ('v', 'm') and n.nspname <> all ($1::text[]) order by 1`,
    [SYSTEM_SCHEMAS],
  );
  if (rules.rows.length > 0) failures.push(`rules on tables: ${rules.rows.map((r) => r.name).join(", ")}`);

  // Pinned definitions (rls-pins.mjs). Every mismatch prints the computed hash, so a reviewed change is a
  // one-line update of PINS; PIN_HEADER says where.
  const current = await readPinnable(client, role);
  const pinFailures = [];
  const compare = (kind, label, { unpinned }) => {
    for (const [key, hash] of Object.entries(current[kind])) {
      if (!Object.hasOwn(PINS[kind], key)) {
        if (unpinned) unpinned(key, hash);
      } else if (!pinMatches(PINS[kind][key], hash)) {
        pinFailures.push(kind === "views" ? `view ${key} isn't the migrations' definition (now sha256 ${hash})` : `${label} ${key} changed (now sha256 ${hash})`);
      }
    }
    for (const key of Object.keys(PINS[kind]).filter((key) => !Object.hasOwn(current[kind], key))) pinFailures.push(`${label} ${key} is gone`);
  };
  const list = (entries) => entries.map(([key, hash]) => `${key} (sha256 ${hash})`).join(", ");
  const unpinnedDefiners = [];
  const unpinnedFunctions = [];
  const unpinnedTriggers = [];
  compare("views", "view", {}); // an unpinned view app_user can use already fails above
  compare("functions", "function", {
    unpinned: (key, hash) => (current.definerExecutable.includes(key) ? unpinnedDefiners : unpinnedFunctions).push([key, hash]),
  });
  compare("triggers", "trigger function of", { unpinned: (key, hash) => unpinnedTriggers.push([key, hash]) });
  compare("policies", "policy", { unpinned: (key, hash) => pinFailures.push(`policy ${key} isn't pinned (sha256 ${hash})`) });
  compare("tables", "table", { unpinned: (key, hash) => pinFailures.push(`table ${key} isn't pinned (sha256 ${hash})`) });
  if (unpinnedDefiners.length > 0) pinFailures.push(`SECURITY DEFINER functions ${role} can run that aren't allowlisted: ${list(unpinnedDefiners)}`);
  if (unpinnedFunctions.length > 0) pinFailures.push(`functions that aren't pinned: ${list(unpinnedFunctions)}`);
  if (unpinnedTriggers.length > 0) pinFailures.push(`SECURITY DEFINER triggers that aren't allowlisted: ${list(unpinnedTriggers)}`);
  if (pinFailures.length > 0) failures.unshift(PIN_HEADER, ...pinFailures);

  // The probe, last: an error here aborts a surrounding transaction.
  try {
    const probe = await client.query(
      `select coalesce(pg_catalog.current_setting('app.user_id', true), '') as user_id,
              (select pg_catalog.count(*)::int from public.workspace) as visible`,
    );
    const { user_id: userId, visible } = probe.rows[0];
    if (userId !== "") failures.push(`app.user_id is set ("${userId}"), so the probe proves nothing`);
    else if (visible !== 0) failures.push(`without app.user_id, ${currentUser} sees ${visible} workspace row(s), not 0`);
  } catch (error) {
    failures.push(`the workspace probe failed: ${error.message}`);
  }
  return failures;
}

async function main() {
  // The runtime's config, minus the pool-only parts (`onConnect`, `max`): the checks below report more
  // than assertRole's single current_user test.
  const client = new Client(withPinnedSearchPath(buildPoolConfig(process.env)));
  await client.connect();
  try {
    const { rows } = await client.query('select pg_catalog.current_database() as db, pg_catalog."session_user"()::text as login');
    const failures = await checkRuntimeRole(client);
    if (failures.length > 0) {
      console.error(`Runtime role check FAILED on ${rows[0].db} (login ${rows[0].login}):`);
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Runtime role check passed on ${rows[0].db} (login ${rows[0].login}): current_user = ${RUNTIME_ROLE}, no superuser/BYPASSRLS/TEMPORARY, owns no table, RLS on, nothing around it, probe sees no workspace.`,
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Runtime role check FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
