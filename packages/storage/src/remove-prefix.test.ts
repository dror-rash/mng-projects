import { beforeEach, describe, expect, it, vi } from "vitest";

import { removePrefix } from "./index";

// A fake bucket in place of Google Cloud Storage: objects by name with a generation, as the listing returns them.
// Deleting for real, against the local server, is in storage.storage.test.ts.
type DeleteOptions = { ignoreNotFound?: boolean; ifGenerationMatch?: number | string };
const bucket = vi.hoisted(() => ({
  objects: new Map<string, number>(),
  deletes: [] as { name: string; options: DeleteOptions }[],
  /** Runs instead of the delete, once per entry, before it reaches the objects (a failure, a re-upload). */
  beforeDelete: [] as ((name: string) => void)[],
}));
vi.mock("./client", () => ({
  getBucket: () => ({
    getFiles: async ({ prefix, maxResults }: { prefix: string; maxResults: number }) => {
      const names = [...bucket.objects.keys()].filter((name) => name.startsWith(prefix)).sort().slice(0, maxResults);
      const files = names.map((name) => ({
        name,
        metadata: { generation: String(bucket.objects.get(name)) },
        delete: async (options: DeleteOptions) => {
          bucket.deletes.push({ name, options });
          bucket.beforeDelete.shift()?.(name);
          const generation = bucket.objects.get(name);
          if (generation === undefined) {
            if (options.ignoreNotFound) return [{}];
            throw Object.assign(new Error("No such object"), { code: 404 });
          }
          if (options.ifGenerationMatch !== undefined && String(options.ifGenerationMatch) !== String(generation)) {
            throw Object.assign(new Error("Precondition failed"), { code: 412 });
          }
          bucket.objects.delete(name);
          return [{}];
        },
      }));
      return [files, null, {}];
    },
  }),
}));

beforeEach(() => {
  bucket.objects = new Map([
    ["ws-1/p-1/a", 1],
    ["ws-1/p-1/b", 1],
    ["ws-1/p-2/c", 1],
    ["ws-10/p-1/d", 1],
  ]);
  bucket.deletes = [];
  bucket.beforeDelete = [];
});

describe("removePrefix", () => {
  it("refuses an empty prefix, which would delete the whole bucket", async () => {
    await expect(removePrefix("")).rejects.toThrow("Not a prefix");
  });

  it("refuses a prefix that doesn't end in a slash, which would also match its neighbors", async () => {
    await expect(removePrefix("ws-1")).rejects.toThrow("Not a prefix");
  });

  it("refuses a prefix with an empty folder", async () => {
    await expect(removePrefix("/")).rejects.toThrow("Not a prefix");
    await expect(removePrefix("ws-1//")).rejects.toThrow("Not a prefix");
  });

  it("deletes each object at the generation it was listed with, so the client may retry the delete", async () => {
    await removePrefix("ws-1/", { pageSize: 2 });
    expect([...bucket.objects.keys()]).toEqual(["ws-10/p-1/d"]);
    expect(bucket.deletes.map((d) => d.options)).toEqual(
      Array(3).fill({ ignoreNotFound: true, ifGenerationMatch: "1" }),
    );
  });

  it("deletes an object written again after the listing on the next pass, at its new generation", async () => {
    bucket.beforeDelete.push((name) => bucket.objects.set(name, 2));
    await removePrefix("ws-1/");
    expect([...bucket.objects.keys()]).toEqual(["ws-10/p-1/d"]);
    expect(bucket.deletes.filter((d) => d.name === "ws-1/p-1/a").map((d) => d.options.ifGenerationMatch)).toEqual(["1", "2"]);
  });

  it("fails when a delete fails for another reason, after the client's own retries", async () => {
    bucket.beforeDelete.push(() => {
      throw Object.assign(new Error("Service unavailable"), { code: 503 });
    });
    await expect(removePrefix("ws-1/")).rejects.toMatchObject({ code: 503 });
  });

  it("stops instead of looping when the same objects come back unchanged", async () => {
    const stuck = () => {
      throw Object.assign(new Error("Precondition failed"), { code: 412 });
    };
    bucket.beforeDelete.push(...Array(10).fill(stuck));
    await expect(removePrefix("ws-1/")).rejects.toThrow("made no progress");
  });
});
