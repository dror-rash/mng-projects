import { describe, expect, it } from "vitest";

import { removePrefix } from "./index";

// The argument checks run before the bucket is touched; deleting for real is in storage.storage.test.ts.
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
});
