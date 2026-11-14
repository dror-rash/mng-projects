import { describe, expect, it } from "vitest";

import { withBasePath } from "./base-path";

describe("withBasePath", () => {
  it("puts a path of this zone under /dashboard", () => {
    expect(withBasePath("/sites/site-1?tab=contacts")).toBe("/dashboard/sites/site-1?tab=contacts");
  });

  it("turns this zone's root into /dashboard, without a trailing slash", () => {
    expect(withBasePath("/")).toBe("/dashboard");
  });
});
