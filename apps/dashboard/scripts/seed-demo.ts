/**
 * Demo data: fills one user's workspace with demo customers (sub-companies, sites), projects, tasks in every
 * state, visits and readings of a published "Site inspection (demo)" reading form. No photos or files.
 *
 *   pnpm --filter @repo/dashboard seed:demo --email you@example.com [--workspace "Workspace name"]
 *     Local dev. Reruns replace the previous demo data (customers tagged "demo", with their projects, tasks,
 *     visits and readings); nothing else is touched, and the form is reused.
 *
 *   DB_POOL_MAX=1 pnpm --filter @repo/dashboard seed:demo --deploy --email "$DEMO_EMAIL"
 *     The deploy of `main` (task 076). Seeds the demo account's workspace once, and never replaces anything:
 *     skips (exit 0) when the account hasn't signed up or opened the dashboard yet, or its workspace has demo
 *     data (deleted included); refuses (exit 1, nothing written) unless the account is the admin and only
 *     member of exactly one workspace, and with --workspace. Prints counts only: no email, no workspace name.
 */
import path from "node:path";
import { parseArgs } from "node:util";

import { loadEnvConfig } from "@next/env";
import { getMaintenanceDb } from "@repo/db/maintenance";

import { failureText } from "@/features/demo/deploy-seed";

import { runSeedDemo } from "./seed-demo-run";

// Load the repo-root .env, like next.config.ts (tsx runs this as CommonJS, so __dirname is defined).
loadEnvConfig(path.join(__dirname, "../../.."));

const USAGE = 'Usage: pnpm --filter @repo/dashboard seed:demo --email you@example.com [--workspace "Name"] [--deploy]';

let deploy = false;

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { email: { type: "string" }, workspace: { type: "string" }, deploy: { type: "boolean" } } });
  deploy = values.deploy ?? false;
  if (!values.email) {
    console.error(USAGE);
    return 1;
  }
  // The maintenance connection: seeding writes past row-level security, as the owner.
  const result = await runSeedDemo(getMaintenanceDb(), { email: values.email, workspace: values.workspace, deploy });
  (result.code === 0 ? console.log : console.error)(result.message);
  return result.code;
}

// Exit explicitly: the database pool would otherwise keep this one-shot script alive.
main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // The deploy's log is public: the message only, not the error object with its details.
    console.error(deploy ? failureText(error) : error);
    process.exit(1);
  },
);
