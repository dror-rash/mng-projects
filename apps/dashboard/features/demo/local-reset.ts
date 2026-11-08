import { parse } from "pg-connection-string";

// The guard and the kept-account rule of `scripts/reset-local.ts` (task 071): pure, so they are unit tested.

/** The environment variables the guard reads. */
export type ResetEnv = { DATABASE_URL?: string; CLOUD_SQL_CONNECTION_NAME?: string; NODE_ENV?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
/** The local database (`app`) and the lanes' (`app_lane<n>`, scripts/lane.sh). */
const LOCAL_DATABASE = /^app(_lane\d+)?$/;

/**
 * Whether `env` points at a local database the reset may wipe: `DATABASE_URL` is set; its host, after any
 * `host` or `hostaddr` in the query string (read as `pg` reads them, with pg-connection-string), is
 * localhost, 127.0.0.1 or ::1; its database is `app` or a lane's `app_lane<n>`, so other databases on the
 * local server are refused; Cloud SQL isn't configured and this isn't production. Otherwise says why.
 * This reads the environment only: a proxy or tunnel on localhost to a database named `app` passes it.
 * The server check (`isLocalServer`, task 080) is what refuses a tunnel to Cloud SQL.
 */
export function isLocalDatabase(env: ResetEnv): { local: true } | { local: false; reason: string } {
  if (env.NODE_ENV === "production") return { local: false, reason: "NODE_ENV is production." };
  if (env.CLOUD_SQL_CONNECTION_NAME) {
    return { local: false, reason: "CLOUD_SQL_CONNECTION_NAME is set: this is a deployed database." };
  }
  if (!env.DATABASE_URL) return { local: false, reason: "DATABASE_URL is not set." };
  let config: ReturnType<typeof parse>;
  try {
    config = parse(env.DATABASE_URL);
  } catch {
    return { local: false, reason: "DATABASE_URL is not a valid connection string." };
  }
  // `hostaddr` is where libpq connects when it is given; check it and the host both.
  const { hostaddr } = config as { hostaddr?: string };
  for (const host of hostaddr === undefined ? [config.host] : [config.host, hostaddr]) {
    if (!host || !LOCAL_HOSTS.has(host)) {
      return { local: false, reason: `DATABASE_URL points at "${host ?? ""}", not at localhost.` };
    }
  }
  if (!config.database || !LOCAL_DATABASE.test(config.database)) {
    return { local: false, reason: `DATABASE_URL names the database "${config.database ?? ""}", not app or app_lane<n>.` };
  }
  return { local: true };
}

/** Whether `email` is an e2e test account (`@example.com`, any case), which the reset deletes. */
export function isTestAccount(email: string) {
  return email.trim().toLowerCase().endsWith("@example.com");
}

/** Facts about the connected server, read by `scripts/server-facts.ts`: whether it has Cloud SQL's markers. */
export type ServerFacts = { cloudSqlRole: boolean; cloudSqlSettings: boolean };

/**
 * Whether the connected server is one the reset may wipe (task 080): any Cloud SQL marker refuses it, so a
 * proxy or tunnel on localhost to a Cloud SQL instance is refused even when `isLocalDatabase` passes.
 */
export function isLocalServer(facts: ServerFacts): { local: true } | { local: false; reason: string } {
  if (facts.cloudSqlRole || facts.cloudSqlSettings) return { local: false, reason: "the connected server is Cloud SQL." };
  return { local: true };
}

/**
 * Why the server check's query failed, in one line: the cause's message (Drizzle wraps driver errors in
 * "Failed query: <sql>"), or its code when the message is empty (a refused connection to localhost).
 */
export function failureMessage(error: unknown): string {
  const inner = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (!(inner instanceof Error)) return String(inner);
  const { code } = inner as { code?: unknown };
  return inner.message || (typeof code === "string" ? code : inner.name);
}
