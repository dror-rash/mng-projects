import type * as Db from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `toggleChecklistItemAction` with stand-ins around it: the session, the project access check (its own DB tests and
// the acceptance scenarios cover who may tick) and the database helpers. What is checked here is that the form's
// item is ticked or unticked by me inside one `withAccess`, and that a made-up item changes nothing.

vi.mock("@/features/auth/require-session", () => ({
  requireActionSession: async () => ({ user: { id: "user-1" } }),
}));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/features/projects/require-project-access", () => ({ requireProjectAccess: access }));
const redirected = vi.hoisted(() => vi.fn());
vi.mock("@/features/navigation/redirect-from-action", () => ({ redirectFromAction: redirected }));

const db = vi.hoisted(() => ({
  transactions: 0,
  ticks: [] as Record<string, unknown>[],
  unticks: [] as Record<string, unknown>[],
}));
vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof Db>();
  return {
    ...actual,
    tickChecklistItem: async (values: Record<string, unknown>) => void db.ticks.push(values),
    untickChecklistItem: async (values: Record<string, unknown>) => void db.unticks.push(values),
    withAccess: async (_userId: string, fn: () => Promise<unknown>) => {
      db.transactions += 1;
      return fn();
    },
  };
});

const { toggleChecklistItemAction } = await import("./checklist-actions");

const post = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return toggleChecklistItemAction(data);
};

beforeEach(() => {
  db.transactions = 0;
  db.ticks = [];
  db.unticks = [];
  access.mockReset().mockImplementation(async (_userId: string, projectId: string) => ({ id: projectId }));
  redirected.mockReset();
});

describe("toggleChecklistItemAction", () => {
  it("ticks the item as me, in one transaction, then goes back to the project", async () => {
    await post({ projectId: "project-1", item: "quote.sent", done: "true" });
    expect(access).toHaveBeenCalledWith("user-1", "project-1");
    expect(db.transactions).toBe(1);
    expect(db.ticks).toEqual([{ projectId: "project-1", item: "quote.sent", tickedBy: "user-1" }]);
    expect(db.unticks).toEqual([]);
    expect(redirected).toHaveBeenCalledWith("/projects/project-1");
  });

  it("unticks the item", async () => {
    await post({ projectId: "project-1", item: "quote.sent", done: "false" });
    expect(db.unticks).toEqual([{ projectId: "project-1", item: "quote.sent" }]);
    expect(db.ticks).toEqual([]);
    expect(redirected).toHaveBeenCalledWith("/projects/project-1");
  });

  it("takes an item of another stage than the project's", async () => {
    await post({ projectId: "project-1", item: "closed.completion_report", done: "true" });
    expect(db.ticks).toEqual([expect.objectContaining({ item: "closed.completion_report" })]);
  });

  it("refuses a missing or made-up item and changes nothing", async () => {
    for (const entries of [{}, { item: "" }, { item: "quote.made_up" }, { item: "Quote sent" }] as Record<string, string>[]) {
      await expect(post({ projectId: "project-1", done: "true", ...entries })).rejects.toThrow("Choose an item of the checklist");
    }
    expect(db.ticks).toEqual([]);
    expect(db.unticks).toEqual([]);
    expect(redirected).not.toHaveBeenCalled();
  });

  it("refuses a missing or made-up done and changes nothing", async () => {
    for (const entries of [{}, { done: "" }, { done: "yes" }, { done: "TRUE" }] as Record<string, string>[]) {
      await expect(post({ projectId: "project-1", item: "quote.sent", ...entries })).rejects.toThrow("Choose an item of the checklist");
    }
    expect(db.ticks).toEqual([]);
    expect(db.unticks).toEqual([]);
    expect(redirected).not.toHaveBeenCalled();
  });

  it("refuses a project I can't change like a missing one, whatever the item", async () => {
    access.mockRejectedValue(new Error("Not found"));
    await expect(post({ projectId: "someone-elses", item: "quote.sent", done: "true" })).rejects.toThrow("Not found");
    await expect(post({ projectId: "someone-elses", item: "made_up", done: "true" })).rejects.toThrow("Not found");
    expect(db.ticks).toEqual([]);
    expect(db.unticks).toEqual([]);
  });
});
