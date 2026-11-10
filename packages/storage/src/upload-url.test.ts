import { beforeAll, describe, expect, it, vi } from "vitest";

import { createUploadUrl } from "./index";

// Signing needs no network: against a local server the client signs with made-up credentials in memory.
beforeAll(() => {
  vi.stubEnv("STORAGE_BUCKET", "unit-test-files");
  vi.stubEnv("STORAGE_LOCAL_URL", "http://localhost:1");
});

const MB = 1024 * 1024;

describe("createUploadUrl", () => {
  it("signs the allowed size range into the URL and returns it for the browser to send", async () => {
    const { url, headers } = await createUploadUrl({ key: "w/p/photo", contentType: "image/jpeg", maxBytes: 20 * MB });
    const signed = new URL(url).searchParams.get("X-Goog-SignedHeaders")?.split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-type", "x-goog-if-generation-match", "x-goog-content-length-range"]));
    expect(headers).toEqual({
      "Content-Type": "image/jpeg",
      "x-goog-if-generation-match": "0",
      "x-goog-content-length-range": `0,${20 * MB}`,
    });
  });

  it("bounds each URL by the limit it was asked for", async () => {
    const { headers } = await createUploadUrl({ key: "w/p/file", contentType: "application/pdf", maxBytes: 50 * MB });
    expect(headers["x-goog-content-length-range"]).toBe(`0,${50 * MB}`);
  });

  it("refuses a limit that isn't a positive whole number of bytes", async () => {
    for (const maxBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(createUploadUrl({ key: "w/p/x", contentType: "text/plain", maxBytes })).rejects.toThrow("maxBytes");
    }
  });

  it("has no unlimited upload URL", async () => {
    // @ts-expect-error maxBytes is required
    const call = () => createUploadUrl({ key: "w/p/x", contentType: "text/plain" });
    expect(call).toBeTypeOf("function");
  });
});
