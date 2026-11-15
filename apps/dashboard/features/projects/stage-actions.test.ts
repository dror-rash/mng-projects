import type * as Db from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `changeStageAction` with stand-ins around it: the session, the project access check (its own DB tests and the
// acceptance scenarios cover who may change a stage) and the database. What is checked here is that a stage is
// changed with its history row, in one transaction, and that an empty or made-up stage changes nothing.

vi.mock("@/features/auth/require-session", () => ({
  requireActionSession: async () => ({ user: { id: "user-1" } }),
}));
const access = vi.hoisted(() => vi.fn());
vi.mock("@/features/projects/require-project-access", () => ({ requireProjectAccess: access }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const redirected = vi.hoisted(() => vi.fn());
vi.mock("@/features/navigation/redirect-from-action", () => ({ redirectFromAction: redirected }));

const db = vi.hoisted(() => ({
  current: "inquiry",
  transactions: 0,
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));
vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof Db>();
  const fake = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ stage: db.current }] }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => void db.updates.push(values) }) }),
  };
  return {
    ...actual,
    getDb: () => fake,
    // The runtime role can't insert changed_at, so the action goes through the helper that leaves it out.
    recordStageChange: async (values: Record<string, unknown>) => void db.inserts.push(values),
    withAccess: async (_userId: string, fn: () => Promise<unknown>) => {
      db.transactions += 1;
      return fn();
    },
  };
});

const { changeStageAction } = await import("./stage-actions");

const post = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return changeStageAction({}, data);
};

beforeEach(() => {
  db.current = "inquiry";
  db.transactions = 0;
  db.updates = [];
  db.inserts = [];
  access.mockReset().mockImplementation(async (_userId: string, projectId: string) => ({ id: projectId }));
  redirected.mockReset();
});

describe("changeStageAction", () => {
  it("sets the stage and records the change, by me, in one transaction, then goes back to the project", async () => {
    await post({ projectId: "project-1", stage: "quote" });
    expect(access).toHaveBeenCalledWith("user-1", "project-1");
    expect(db.transactions).toBe(1);
    expect(db.updates).toEqual([expect.objectContaining({ stage: "quote" })]);
    expect(db.inserts).toEqual([
      expect.objectContaining({ projectId: "project-1", fromStage: "inquiry", toStage: "quote", changedBy: "user-1" }),
    ]);
    expect(redirected).toHaveBeenCalledWith("/projects/project-1");
  });

  it("moves back as well as forward", async () => {
    db.current = "ordered";
    await post({ projectId: "project-1", stage: "quote" });
    expect(db.inserts).toEqual([expect.objectContaining({ fromStage: "ordered", toStage: "quote" })]);
  });

  it("records nothing when the stage stays the same", async () => {
    db.current = "quote";
    await post({ projectId: "project-1", stage: "quote" });
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(redirected).toHaveBeenCalledWith("/projects/project-1");
  });

  it("refuses an empty, missing or made-up stage on the Stage field and changes nothing", async () => {
    for (const entries of [{ stage: "" }, {}, { stage: "Made up" }] as Record<string, string>[]) {
      const state = await post({ projectId: "project-1", ...entries });
      expect(state).toMatchObject({ error: "Choose a stage", field: "stage" });
    }
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(redirected).not.toHaveBeenCalled();
  });

  it("refuses a project I can't change like a missing one, whatever the stage", async () => {
    access.mockRejectedValue(new Error("Not found"));
    await expect(post({ projectId: "someone-elses", stage: "closed" })).rejects.toThrow("Not found");
    await expect(post({ projectId: "someone-elses", stage: "Made up" })).rejects.toThrow("Not found");
    expect(db.updates).toEqual([]);
    expect(db.inserts).toEqual([]);
  });
});
