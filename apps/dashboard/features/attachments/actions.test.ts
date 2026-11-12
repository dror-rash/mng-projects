import type * as Db from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `startUploadAction` with stand-ins around it: the session, the project access check, the database and
// storage. What is checked here is the size limit it asks storage to sign into the upload URL (task 085).

vi.mock("@/features/auth/require-session", () => ({
  requireActionSession: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/features/projects/require-project-access", () => ({
  requireProjectWorkAccess: async (_userId: string, projectId: string) => ({ id: projectId, workspaceId: "ws-1" }),
}));
vi.mock("@/features/visits/queries", () => ({ getProjectVisit: async () => ({ id: "visit-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof Db>();
  const fake = {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "inserted" }] }) }) }),
  };
  // No transaction to open: `withAccess` just runs its function against the stand-in.
  return { ...actual, getDb: () => fake, withAccess: (_userId: string, fn: () => Promise<unknown>) => fn() };
});

const createUploadUrl = vi.hoisted(() => vi.fn());
vi.mock("@repo/storage", () => ({
  createUploadUrl,
  objectKey: () => "ws-1/project-1/object",
  remove: vi.fn(),
  stat: vi.fn(),
}));

const { startUploadAction } = await import("./actions");

const MB = 1024 * 1024;

function start(kind: string, contentType: string, visitId: string | null = null) {
  return startUploadAction({
    attachmentId: crypto.randomUUID(),
    projectId: "project-1",
    visitId,
    kind,
    fileName: "site.bin",
    contentType,
    size: 1000,
  });
}

beforeEach(() => {
  createUploadUrl.mockReset().mockResolvedValue({ url: "https://storage.example/upload", headers: { "x-test": "1" } });
});

describe("startUploadAction", () => {
  it("asks storage to refuse photos over 20 MB", async () => {
    await start("photo", "image/jpeg", "visit-1");
    expect(createUploadUrl).toHaveBeenCalledWith(expect.objectContaining({ contentType: "image/jpeg", maxBytes: 20 * MB }));
  });

  it("asks storage to refuse files and reports over 50 MB", async () => {
    await start("file", "application/pdf");
    await start("report", "application/pdf");
    expect(createUploadUrl.mock.calls.map(([options]) => options.maxBytes)).toEqual([50 * MB, 50 * MB]);
  });

  it("returns the URL and the headers the browser must send", async () => {
    expect(await start("photo", "image/png")).toEqual({ ok: true, uploadUrl: "https://storage.example/upload", headers: { "x-test": "1" } });
  });
});
