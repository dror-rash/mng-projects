import { describe, expect, it } from "vitest";

import { addressOptions, rateLimitOptions } from "./rate-limit";

describe("rateLimitOptions", () => {
  it("keeps the counts in the database, shared by every instance, when the test flag is not set", () => {
    expect(rateLimitOptions({})).toEqual({ rateLimit: { storage: "database" } });
  });

  it("keeps Better Auth's default windows and limits (no custom rules)", () => {
    expect(rateLimitOptions({}).rateLimit).not.toHaveProperty("customRules");
    expect(rateLimitOptions({}).rateLimit).not.toHaveProperty("max");
  });

  it("turns rate limiting off only when AUTH_DISABLE_RATE_LIMIT is exactly 'true'", () => {
    expect(rateLimitOptions({ AUTH_DISABLE_RATE_LIMIT: "true" })).toEqual({ rateLimit: { enabled: false } });
  });

  it("ignores other values", () => {
    expect(rateLimitOptions({ AUTH_DISABLE_RATE_LIMIT: "1" })).toEqual({ rateLimit: { storage: "database" } });
    expect(rateLimitOptions({ AUTH_DISABLE_RATE_LIMIT: "false" })).toEqual({ rateLimit: { storage: "database" } });
  });
});

describe("the client address the rate limit counts by", () => {
  it("comes from x-forwarded-for only, with no trusted proxies", () => {
    expect(addressOptions()).toEqual({ ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } });
  });
});
