import type * as Storage from "@repo/storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { removeWorkspaceFiles } from "./workspace-files";

// The storage boundary is the only mock: a fake bucket that removes or fails.
const removePrefix = vi.hoisted(() => vi.fn());
vi.mock("@repo/storage", async (importOriginal) => ({ ...(await importOriginal<typeof Storage>()), removePrefix }));

let logged: unknown[][];
beforeEach(() => {
  removePrefix.mockReset();
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void logged.push(args));
});
afterEach(() => vi.restoreAllMocks());

describe("removeWorkspaceFiles", () => {
  it("removes the deleted workspace's folder, and only that one", async () => {
    removePrefix.mockResolvedValue(undefined);
    await removeWorkspaceFiles("ws-1");
    expect(removePrefix).toHaveBeenCalledExactlyOnceWith("ws-1/");
    expect(logged).toEqual([]);
  });

  it("doesn't fail the delete when storage does, and logs the workspace id without the error's paths", async () => {
    removePrefix.mockRejectedValue(Object.assign(new Error("No such object: app-files/ws-1/p-1/0b6e…"), { code: 503 }));
    await expect(removeWorkspaceFiles("ws-1")).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
    const line = JSON.stringify(logged[0]);
    expect(line).toContain("ws-1");
    expect(line).not.toContain("p-1");
    expect(line).not.toContain("No such object");
  });

  it("refuses an id that isn't one, without touching storage", async () => {
    await expect(removeWorkspaceFiles("")).rejects.toThrow();
    await expect(removeWorkspaceFiles("ws/1")).rejects.toThrow();
    expect(removePrefix).not.toHaveBeenCalled();
  });
});
