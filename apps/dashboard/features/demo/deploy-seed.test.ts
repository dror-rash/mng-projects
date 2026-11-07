import { describe, expect, it } from "vitest";

import { decideDeploySeed, type DeploySeedFacts, failureText, planCounts, seedSummary } from "./deploy-seed";
import { buildDemoPlan } from "./seed-plan";

/** The demo account, alone in the one workspace it administers, with no demo data yet. */
const fresh: DeploySeedFacts = { workspaceFlag: false, userFound: true, memberships: [{ role: "admin" }], members: 1, demoCustomers: 0 };

const email = "demo-owner@example.com";
const workspaceName = "Demo owner's workspace";
const connection = "postgres://app_owner:s3cret@127.0.0.1:5432/app";

describe("decideDeploySeed", () => {
  it("seeds the only workspace of an account that administers it alone and has no demo data", () => {
    expect(decideDeploySeed(fresh)).toEqual({ action: "seed" });
  });

  it("skips when no account has the email", () => {
    expect(decideDeploySeed({ ...fresh, userFound: false, memberships: [], members: 0 })).toEqual({
      action: "skip",
      reason: "Skipped: the demo account hasn't signed up yet.",
    });
  });

  it("skips when the account has no workspace yet", () => {
    expect(decideDeploySeed({ ...fresh, memberships: [], members: 0 })).toEqual({
      action: "skip",
      reason: "Skipped: the demo account hasn't opened the dashboard yet.",
    });
  });

  it("skips when the workspace already has demo customers, deleted ones included", () => {
    expect(decideDeploySeed({ ...fresh, demoCustomers: 1 })).toEqual({
      action: "skip",
      reason: "Skipped: the demo workspace already has demo data.",
    });
  });

  it("refuses --workspace", () => {
    expect(decideDeploySeed({ ...fresh, workspaceFlag: true })).toMatchObject({ action: "refuse", reason: expect.stringMatching(/--workspace/) });
  });

  it("refuses an account in more than one workspace", () => {
    expect(decideDeploySeed({ ...fresh, memberships: [{ role: "admin" }, { role: "admin" }] })).toMatchObject({
      action: "refuse",
      reason: expect.stringMatching(/2 workspaces/),
    });
  });

  it.each(["auditor", "worker", "partner"])("refuses an account that is its workspace's %s, not its admin", (role) => {
    expect(decideDeploySeed({ ...fresh, memberships: [{ role }] })).toMatchObject({ action: "refuse", reason: expect.stringMatching(/admin/) });
  });

  it("refuses a workspace with other members", () => {
    expect(decideDeploySeed({ ...fresh, members: 2 })).toMatchObject({ action: "refuse", reason: expect.stringMatching(/other members/) });
  });

  it("refuses rather than skips a shared workspace that already has demo data", () => {
    expect(decideDeploySeed({ ...fresh, members: 3, demoCustomers: 5 }).action).toBe("refuse");
  });

  it("refuses --workspace before looking anything up", () => {
    expect(decideDeploySeed({ ...fresh, workspaceFlag: true, userFound: false, memberships: [] }).action).toBe("refuse");
  });

  it("says what happened without an email, a workspace name or a connection string", () => {
    const decisions = [
      fresh,
      { ...fresh, userFound: false, memberships: [] },
      { ...fresh, memberships: [] },
      { ...fresh, demoCustomers: 2 },
      { ...fresh, workspaceFlag: true },
      { ...fresh, memberships: [{ role: "admin" }, { role: "worker" }] },
      { ...fresh, memberships: [{ role: "worker" }] },
      { ...fresh, members: 2 },
    ].map(decideDeploySeed);
    for (const decision of decisions) {
      const text = "reason" in decision ? decision.reason : "";
      expect(text).not.toMatch(/@|demo-owner|workspace"|postgres:|s3cret/);
    }
  });
});

describe("seedSummary", () => {
  const counts = planCounts(buildDemoPlan(new Date("2026-10-30T12:00:00Z")));

  it("counts what the plan seeds", () => {
    expect(counts).toMatchObject({ customers: 5, subCompanies: 2, projects: 75 });
    expect(counts.visits).toBeGreaterThan(0);
    expect(counts.readings).toBeGreaterThanOrEqual(5);
    expect(counts.readings).toBeLessThan(counts.visits);
  });

  it("prints counts only", () => {
    expect(seedSummary(counts)).toBe(
      `Seeded ${counts.customers} customers (+${counts.subCompanies} sub-companies), ${counts.sites} sites, ${counts.projects} projects, ${counts.tasks} tasks, ${counts.visits} visits, ${counts.readings} readings.`,
    );
  });

  it("names the workspace and the replaced customers only when asked (local runs)", () => {
    expect(seedSummary(counts, { workspaceName, replaced: 7 })).toMatch(/^Seeded "Demo owner's workspace": 5 customers .* \(replaced 7 demo customers\)\.$/);
    expect(seedSummary(counts, { workspaceName, replaced: 0 })).not.toMatch(/replaced/);
  });
});

/** The shape of Drizzle's `DrizzleQueryError`: the query and its parameters in the message, the driver's error as cause. */
class QueryError extends Error {
  constructor(
    readonly query: string,
    readonly params: unknown[],
    override readonly cause: unknown,
  ) {
    super(`Failed query: ${query}\nparams: ${params}`);
  }
}

describe("failureText", () => {
  const userId = "3f0f1c7e-8a7b-4d7e-9a51-2b7c0f9d1e44";

  it("never shows a failed query's parameters, only the database's code and message", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "site_visit_pkey"'), { code: "23505", detail: `Key (id)=(${userId})` });
    const error = new QueryError('select "id" from "user" where "user"."email" = $1', [email, userId], cause);
    const text = failureText(error);
    expect(text).toBe('Seeding failed (23505): duplicate key value violates unique constraint "site_visit_pkey"');
    expect(text).not.toContain(email);
    expect(text).not.toContain(userId);
    expect(text).not.toMatch(/Failed query|params/);
  });

  it("shows a connection error's code, not its message or details", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED", connection });
    expect(failureText(error)).toBe("Seeding failed (ECONNREFUSED).");
  });

  it("shows nothing of an error with neither a code nor a cause", () => {
    expect(failureText(new Error(`No user ${email}`))).toBe("Seeding failed.");
    expect(failureText("boom")).toBe("Seeding failed.");
  });
});
