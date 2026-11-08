/**
 * Local dev only (task 071): wipes every workspace (with its customers, sites, projects and everything in
 * them) and every e2e test account (email at example.com) from the LOCAL database. Other accounts stay,
 * with their sessions. Refuses to run unless DATABASE_URL is on localhost and names `app` or `app_lane<n>`,
 * Cloud SQL isn't configured and NODE_ENV isn't production (`isLocalDatabase`), and then, before any other
 * query, unless the connected server shows no Cloud SQL markers (`isLocalServer`, task 080). Without --yes
 * it only prints what it would delete.
 *   pnpm --filter @repo/dashboard reset:local [--yes]
 * Files in local storage are left alone.
 */
import path from "node:path";
import { parseArgs } from "node:util";

import { loadEnvConfig } from "@next/env";
import { asc, inArray, schema, sql } from "@repo/db";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { failureMessage, isLocalDatabase, isLocalServer, isTestAccount } from "@/features/demo/local-reset";

import { readServerFacts } from "./server-facts";

// Load the repo-root .env, like seed-demo.ts (tsx runs this as CommonJS, so __dirname is defined).
loadEnvConfig(path.join(__dirname, "../../.."));

/** Rows in `table`, for the summary. */
async function count(table: "workspace" | "project" | "organization" | "site") {
  const { rows } = await getMaintenanceDb().execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`);
  return rows[0]!.n;
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { yes: { type: "boolean", default: false } } });

  const guard = isLocalDatabase(process.env);
  if (!guard.local) {
    console.error(`Refusing to reset: ${guard.reason} reset:local only runs against a local database.`);
    return 1;
  }

  // The maintenance connection: the reset deletes past row-level security, as the owner.
  const db = getMaintenanceDb();

  // The server check, before any other query: a localhost proxy or tunnel to Cloud SQL passes the env guard.
  let server: ReturnType<typeof isLocalServer>;
  try {
    server = isLocalServer(await readServerFacts(db));
  } catch (error) {
    console.error(`Refusing to reset: ${failureMessage(error)}`);
    return 1;
  }
  if (!server.local) {
    console.error(`Refusing to reset: ${server.reason} reset:local only runs against a local database.`);
    return 1;
  }

  const users = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .orderBy(asc(schema.user.email));
  const testUsers = users.filter((u) => isTestAccount(u.email));
  const kept = users.filter((u) => !isTestAccount(u.email));
  const [workspaces, projects, customers, sites] = await Promise.all([
    count("workspace"),
    count("project"),
    count("organization"),
    count("site"),
  ]);

  console.log(`Database: ${new URL(process.env.DATABASE_URL!).pathname.slice(1)} on localhost`);
  console.log(
    `${values.yes ? "Deleting" : "Would delete"}: ${workspaces} workspaces, ${projects} projects, ${customers} customers and other organizations, ${sites} sites, ${testUsers.length} test users (@example.com).`,
  );
  console.log(kept.length > 0 ? `Keeping ${kept.length} accounts:\n${kept.map((u) => `  ${u.email}`).join("\n")}` : "Keeping no accounts.");

  if (!values.yes) {
    console.log("Dry run: nothing was deleted. Run again with --yes to delete.");
    return 0;
  }

  await db.transaction(async (tx) => {
    // The workspace cascade removes members, invites, partners, customers, sites, projects, tasks, visits
    // and attachment rows; customers and sites in use go in the same statement as their projects.
    await tx.delete(schema.workspace);
    // Their sessions and accounts cascade. In batches, to keep the parameter list small.
    const ids = testUsers.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 1000) {
      await tx.delete(schema.user).where(inArray(schema.user.id, ids.slice(i, i + 1000)));
    }
  });

  console.log("Done. Next:");
  console.log("  1. Open the dashboard once, signed in as the account to seed (this creates its personal workspace).");
  console.log("  2. pnpm --filter @repo/dashboard seed:demo --email <that account>");
  return 0;
}

// Exit explicitly: the database pool would otherwise keep this one-shot script alive.
main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
