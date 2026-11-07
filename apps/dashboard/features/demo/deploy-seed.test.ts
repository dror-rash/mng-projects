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

describe("failureText", () => {
  it("is the error's message, not the error object with its details", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { detail: `Key (email)=(${email})`, connection });
    expect(failureText(error)).toBe("Seeding failed: connect ECONNREFUSED 127.0.0.1:5432");
  });

  it("takes something thrown that isn't an Error as text", () => {
    expect(failureText("boom")).toBe("Seeding failed: boom");
  });
});
