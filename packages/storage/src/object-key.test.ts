import { describe, expect, it } from "vitest";

import { objectKey, workspacePrefix } from "./object-key";

describe("objectKey", () => {
  it("puts a random id under the workspace and project, never a file name", () => {
    const key = objectKey({ workspaceId: "ws-1", projectId: "p-1" });
    expect(key).toMatch(/^ws-1\/p-1\/[0-9a-f-]{36}$/);
    expect(objectKey({ workspaceId: "ws-1", projectId: "p-1" })).not.toBe(key);
  });

  it("refuses ids that would change the path", () => {
    expect(() => objectKey({ workspaceId: "ws/1", projectId: "p-1" })).toThrow();
    expect(() => objectKey({ workspaceId: "ws-1", projectId: ".." })).toThrow();
    expect(() => objectKey({ workspaceId: "", projectId: "p-1" })).toThrow();
  });
});

describe("workspacePrefix", () => {
  it("is the folder every object key of the workspace starts with", () => {
    const prefix = workspacePrefix("ws-1");
    expect(prefix).toBe("ws-1/");
    expect(objectKey({ workspaceId: "ws-1", projectId: "p-1" }).startsWith(prefix)).toBe(true);
    expect(objectKey({ workspaceId: "ws-10", projectId: "p-1" }).startsWith(prefix)).toBe(false);
  });

  it("refuses ids that would change the path", () => {
    expect(() => workspacePrefix("")).toThrow();
    expect(() => workspacePrefix("ws/1")).toThrow();
    expect(() => workspacePrefix("..")).toThrow();
  });
});
