import type { PoolConfig } from "pg";

type Env = Record<string, string | undefined>;

/**
 * The role the app's queries run as (ADR-0006): it owns nothing and can't bypass row-level security.
 * Deployed runtimes log in as their own login (`app_runtime`, `preview_runtime`: owns nothing, a SET-only
 * member of this role, task 074); locally and in CI the one login is the owner. Either way the connection
 * switches to it on connect.
 */
export const RUNTIME_ROLE = "app_user";

/** The part of a pg client `assertRole` needs. */
type Queryable = { query(text: string): Promise<{ rows: Array<Record<string, unknown>> }> };

/**
 * Throws unless the connection runs as `role`. Row-level security isn't forced (ADR-0006): the login user
 * owns the tables and bypasses it, so a connection where the startup option didn't switch the role must
 * never serve a query. The pool calls it on every new connection (`onConnect`); when it throws, the
 * connection is closed and the checkout fails (fail closed).
 */
export async function assertRole(client: Queryable, role: string): Promise<void> {
  const { rows } = await client.query("select current_user as role");
  const actual = rows[0]?.role;
  if (actual !== role) {
    throw new Error(`Refusing a database connection running as ${JSON.stringify(actual)}, not ${role} (ADR-0006).`);
  }
}

/** Connections per instance when `DB_POOL_MAX` is unset (local, CI). */
export const DEFAULT_POOL_MAX = 5;

/**
 * The pool size per instance: `DB_POOL_MAX` (a positive whole number), or `DEFAULT_POOL_MAX` when unset or
 * empty. Deploys set it per environment (infra/scripts/environment.sh, task 075): the logins' connection
 * limits on Cloud SQL are computed from it. Anything else throws at startup. The maintenance pool
 * (`@repo/db/maintenance`: seeds, e2e fixtures, DB tests) honours it too.
 */
export function parsePoolMax(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_POOL_MAX;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`DB_POOL_MAX must be a positive whole number (connections per instance), not ${JSON.stringify(value)}.`);
  }
  return Number(value);
}

/**
 * Cloud Run: Cloud SQL is mounted as a unix socket at /cloudsql/<connection-name>.
 * Local/CI: a plain DATABASE_URL.
 * Every connection switches to `role` on connect and is checked before its first query (`assertRole`);
 * `null` keeps the login user (the maintenance connection), unchecked. `max` comes from `DB_POOL_MAX`.
 */
export function buildPoolConfig(env: Env, role: string | null = RUNTIME_ROLE): PoolConfig {
  const asRole: PoolConfig = role ? { options: `-c role=${role}`, onConnect: (client) => assertRole(client, role) } : {};
  const max = parsePoolMax(env.DB_POOL_MAX);
  const connectionName = env.CLOUD_SQL_CONNECTION_NAME;

  if (connectionName) {
    const { DB_USER, DB_PASSWORD, DB_NAME } = env;
    if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
      throw new Error("CLOUD_SQL_CONNECTION_NAME is set, so DB_USER, DB_PASSWORD and DB_NAME are required.");
    }
    return { host: `/cloudsql/${connectionName}`, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, max, ...asRole };
  }

  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL, max, ...asRole };
  }

  throw new Error("Set DATABASE_URL (local/CI) or CLOUD_SQL_CONNECTION_NAME + DB_USER/DB_PASSWORD/DB_NAME (Cloud Run).");
}
