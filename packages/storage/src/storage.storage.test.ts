import { afterAll, describe, expect, it } from "vitest";

import { createDownloadUrl, createUploadUrl, objectKey, remove, removePrefix, stat, workspacePrefix } from "./index";

// Against the local fake-gcs-server (docker-compose.yml, `pnpm db:up`). Each run uses its own keys.

const keys: string[] = [];
function newKey(workspaceId = `test-${crypto.randomUUID().slice(0, 8)}`, projectId = "p") {
  const key = objectKey({ workspaceId, projectId });
  keys.push(key);
  return key;
}

const MAX_BYTES = 1024 * 1024;

/** Uploads with every header the signed URL asks for, the size range included (task 085). */
async function upload(key: string, body: string, contentType = "text/plain") {
  const { url, headers } = await createUploadUrl({ key, contentType, maxBytes: MAX_BYTES });
  return fetch(url, { method: "PUT", headers, body });
}

afterAll(async () => {
  await Promise.all(keys.map((key) => remove(key)));
});

describe("signed URLs against the local server", () => {
  it("uploads a file that downloads again", async () => {
    const key = newKey();
    expect((await upload(key, "hello site")).ok).toBe(true);
    const response = await fetch(await createDownloadUrl({ key }));
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("hello site");
  });

  it("reports an uploaded file's size and type, and null for a missing one", async () => {
    const key = newKey();
    await upload(key, "12345", "image/jpeg");
    expect(await stat(key)).toEqual({ size: 5, contentType: "image/jpeg" });
    expect(await stat(newKey())).toBeNull();
  });

  it("removes a file, and removing a missing one succeeds", async () => {
    const key = newKey();
    await upload(key, "gone soon");
    await remove(key);
    expect(await stat(key)).toBeNull();
    await expect(remove(key)).resolves.toBeUndefined();
  });

  it("names the file in the download when asked", async () => {
    const key = newKey();
    await upload(key, "report");
    const url = new URL(await createDownloadUrl({ key, fileName: "Site report.pdf" }));
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="Site report.pdf"');
  });
});

describe("removing a workspace's folder", () => {
  it("removes every object under the prefix, page by page, and nothing beside it", async () => {
    const workspace = `test-${crypto.randomUUID().slice(0, 8)}`;
    const inside = [newKey(workspace, "p1"), newKey(workspace, "p1"), newKey(workspace, "p2")];
    // A neighbor whose id starts with the same characters: only the trailing slash keeps it out.
    const beside = [newKey(`${workspace}0`, "p1"), newKey(`test-${crypto.randomUUID().slice(0, 8)}`, "p1")];
    for (const key of [...inside, ...beside]) await upload(key, "site photo");

    await removePrefix(workspacePrefix(workspace), { pageSize: 2 });

    for (const key of inside) expect(await stat(key)).toBeNull();
    for (const key of beside) expect(await stat(key)).not.toBeNull();
  });

  it("succeeds for a prefix with nothing under it", async () => {
    await expect(removePrefix(workspacePrefix(`test-${crypto.randomUUID().slice(0, 8)}`))).resolves.toBeUndefined();
  });
});

describe("what a signed URL allows", () => {
  it("binds an upload to its content type, an object that doesn't exist yet, and a size range", async () => {
    const { url, headers } = await createUploadUrl({ key: newKey(), contentType: "image/jpeg", maxBytes: MAX_BYTES });
    const signed = new URL(url).searchParams.get("X-Goog-SignedHeaders")?.split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-type", "x-goog-if-generation-match", "x-goog-content-length-range"]));
    expect(headers).toEqual({
      "Content-Type": "image/jpeg",
      "x-goog-if-generation-match": "0",
      "x-goog-content-length-range": `0,${MAX_BYTES}`,
    });
  });

  it("expires: 15 minutes for uploads and 5 for downloads by default, or as asked", async () => {
    const key = newKey();
    expect(new URL((await createUploadUrl({ key, contentType: "text/plain", maxBytes: MAX_BYTES })).url).searchParams.get("X-Goog-Expires")).toBe("900");
    expect(new URL(await createDownloadUrl({ key })).searchParams.get("X-Goog-Expires")).toBe("300");
    expect(new URL(await createDownloadUrl({ key, expiresInSeconds: 1 })).searchParams.get("X-Goog-Expires")).toBe("1");
  });
});
