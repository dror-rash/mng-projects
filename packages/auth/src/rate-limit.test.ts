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
  it("is the rightmost x-forwarded-for value (the one Cloud Run appended), and no other header", () => {
    // Better Auth takes the rightmost address that isn't a trusted proxy; loopback is never a Cloud Run client.
    expect(addressOptions()).toEqual({ ipAddress: { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: ["127.0.0.1/32"] } });
  });
});
