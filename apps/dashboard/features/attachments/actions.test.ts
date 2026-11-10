import type * as Db from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `startUploadAction` with stand-ins around it: the session, the project access check, the database,
// storage and the unfinished-uploads module (its own DB test covers it). What is checked here is the size
// limit it asks storage to sign into the upload URL (task 085), and that it clears stale uploads and refuses
// one too many unfinished ones (task 087).

vi.mock("@/features/auth/require-session", () => ({
  requireActionSession: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/features/projects/require-project-access", () => ({
  requireProjectWorkAccess: async (_userId: string, projectId: string) => ({ id: projectId, workspaceId: "ws-1" }),
}));
vi.mock("@/features/visits/queries", () => ({ getProjectVisit: async () => ({ id: "visit-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const insert = vi.hoisted(() => vi.fn());
vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof Db>();
  const fake = {
    insert: () => {
      insert();
      return { values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "inserted" }] }) }) };
    },
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

const unfinished = vi.hoisted(() => ({ prepareUpload: vi.fn(), removeStaleObjects: vi.fn() }));
vi.mock("./unfinished-uploads", () => unfinished);

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
  insert.mockReset();
  unfinished.prepareUpload.mockReset().mockResolvedValue({ staleKeys: [], refusal: null });
  unfinished.removeStaleObjects.mockReset().mockResolvedValue(undefined);
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

describe("startUploadAction and unfinished uploads", () => {
  it("clears the workspace's stale uploads before recording the new one, and removes their objects after", async () => {
    unfinished.prepareUpload.mockResolvedValue({ staleKeys: ["ws-1/project-1/a", "ws-1/project-2/b"], refusal: null });

    expect(await start("photo", "image/jpeg")).toMatchObject({ ok: true });

    expect(unfinished.prepareUpload).toHaveBeenCalledWith("user-1", { id: "project-1", workspaceId: "ws-1" });
    expect(unfinished.prepareUpload.mock.invocationCallOrder[0]).toBeLessThan(insert.mock.invocationCallOrder[0]!);
    expect(unfinished.removeStaleObjects).toHaveBeenCalledWith("ws-1", ["ws-1/project-1/a", "ws-1/project-2/b"]);
  });

  it("refuses one too many unfinished uploads with a message, recording and signing nothing", async () => {
    unfinished.prepareUpload.mockResolvedValue({ staleKeys: ["ws-1/project-1/a"], refusal: "Too many uploads in progress. Try again later." });

    expect(await start("photo", "image/jpeg")).toEqual({ ok: false, error: "Too many uploads in progress. Try again later." });

    expect(insert).not.toHaveBeenCalled();
    expect(createUploadUrl).not.toHaveBeenCalled();
    expect(unfinished.removeStaleObjects).toHaveBeenCalledWith("ws-1", ["ws-1/project-1/a"]);
  });

  it("checks the file's limits before clearing anything", async () => {
    expect(await start("photo", "text/plain")).toMatchObject({ ok: false });

    expect(unfinished.prepareUpload).not.toHaveBeenCalled();
  });
});
