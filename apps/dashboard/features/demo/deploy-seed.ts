import { normalizeWorkspaceRole } from "@/features/access/roles";

import type { DemoCustomer } from "./seed-plan";

// `seed:demo --deploy` (task 076): the deploy of `main` seeds the demo account's own workspace once. What it
// decides and what it prints are pure, so every branch is unit tested. Nothing here names the account or its
// workspace: the deploy's log is public.

/** What the deploy mode looks up before it seeds. `members` and `demoCustomers` are for the only workspace. */
export type DeploySeedFacts = {
  /** `--workspace` was given (not allowed with `--deploy`). */
  workspaceFlag: boolean;
  userFound: boolean;
  /** The account's memberships, in any workspace. */
  memberships: { role: string }[];
  /** Members of its workspace, the account included. */
  members: number;
  /** Customers tagged demo in its workspace, deleted ones included. */
  demoCustomers: number;
};

/** `--workspace` with `--deploy`: refused before anything is looked up. */
export const WORKSPACE_FLAG_REFUSED = "Refused: --workspace can't be used with --deploy, which seeds the demo account's only workspace.";

export type DeploySeedDecision = { action: "seed" } | { action: "skip"; reason: string } | { action: "refuse"; reason: string };

/**
 * Seed only an account that is the admin and only member of exactly one workspace with no demo data; skip
 * (nothing to do yet, or already done) or refuse (anything else) with a reason that names nobody.
 */
export function decideDeploySeed(facts: DeploySeedFacts): DeploySeedDecision {
  if (facts.workspaceFlag) return { action: "refuse", reason: WORKSPACE_FLAG_REFUSED };
  if (!facts.userFound) return { action: "skip", reason: "Skipped: the demo account hasn't signed up yet." };
  if (facts.memberships.length === 0) return { action: "skip", reason: "Skipped: the demo account hasn't opened the dashboard yet." };
  if (facts.memberships.length > 1) {
    return { action: "refuse", reason: `Refused: the demo account is in ${facts.memberships.length} workspaces; --deploy seeds only an account with one.` };
  }
  if (normalizeWorkspaceRole(facts.memberships[0]!.role) !== "admin") {
    return { action: "refuse", reason: "Refused: the demo account isn't its workspace's admin." };
  }
  if (facts.members > 1) return { action: "refuse", reason: "Refused: the demo account's workspace has other members." };
  if (facts.demoCustomers > 0) return { action: "skip", reason: "Skipped: the demo workspace already has demo data." };
  return { action: "seed" };
}

export type SeedCounts = { customers: number; subCompanies: number; sites: number; projects: number; tasks: number; visits: number; readings: number };

/** What `plan` seeds, row counts for the summary. */
export function planCounts(plan: DemoCustomer[]): SeedCounts {
  const projects = plan.flatMap((c) => c.projects);
  const visits = projects.flatMap((p) => p.visits);
  return {
    customers: plan.length,
    subCompanies: plan.reduce((n, c) => n + c.subCompanies.length, 0),
    sites: plan.reduce((n, c) => n + c.sites.length + c.subCompanies.reduce((m, s) => m + s.sites.length, 0), 0),
    projects: projects.length,
    tasks: projects.reduce((n, p) => n + p.tasks.length, 0),
    visits: visits.length,
    readings: visits.filter((v) => v.reading !== null).length,
  };
}

/**
 * "Seeded 5 customers (+2 sub-companies), …, N readings.": counts only. Local runs add the workspace's name and
 * how many demo customers were replaced; the deploy mode gives neither.
 */
export function seedSummary(counts: SeedCounts, local?: { workspaceName: string; replaced: number }): string {
  const where = local ? ` "${local.workspaceName}":` : "";
  const replaced = local?.replaced ? ` (replaced ${local.replaced} demo customers)` : "";
  return `Seeded${where} ${counts.customers} customers (+${counts.subCompanies} sub-companies), ${counts.sites} sites, ${counts.projects} projects, ${counts.tasks} tasks, ${counts.visits} visits, ${counts.readings} readings${replaced}.`;
}

/**
 * A failure as the deploy mode prints it: a fixed text with the database's or driver's error code and the
 * driver's message (the error's `cause`). Never the error's own message: Drizzle's ("Failed query: …
 * params: …") holds the query's parameters, the email and ids among them.
 */
export function failureText(error: unknown): string {
  const cause = typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined;
  const code = codeOf(cause) ?? codeOf(error);
  const message = cause instanceof Error ? cause.message : undefined;
  return `Seeding failed${code ? ` (${code})` : ""}${message ? `: ${message}` : "."}`;
}

function codeOf(value: unknown): string | undefined {
  const code = typeof value === "object" && value !== null && "code" in value ? value.code : undefined;
  return typeof code === "string" && code ? code : undefined;
}
