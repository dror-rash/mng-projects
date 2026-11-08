import { sql } from "@repo/db";
import type { getMaintenanceDb } from "@repo/db/maintenance";

import type { ServerFacts } from "@/features/demo/local-reset";

/**
 * Facts about the server `db` is connected to, for reset:local's server check (task 080), in one read-only
 * query. Cloud SQL markers:
 * - the roles `cloudsqlsuperuser` and `cloudsqladmin` (`pg_roles`, readable by every role), which Cloud SQL
 *   creates on every Postgres instance;
 * - any `cloudsql.*` setting (`pg_settings`), Cloud SQL's own flags.
 */
export async function readServerFacts(db: ReturnType<typeof getMaintenanceDb>): Promise<ServerFacts> {
  const { rows } = await db.execute<ServerFacts>(sql`
    select
      exists (select 1 from pg_roles where rolname in ('cloudsqlsuperuser', 'cloudsqladmin')) as "cloudSqlRole",
      exists (select 1 from pg_settings where name like 'cloudsql.%') as "cloudSqlSettings"
  `);
  const facts = rows[0]!;
  return { cloudSqlRole: facts.cloudSqlRole === true, cloudSqlSettings: facts.cloudSqlSettings === true };
}
