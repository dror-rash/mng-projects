import { randomBytes, randomInt } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// The sign-in rate limit across server instances (task 089, register SEC-10), against the migrated database
// in DATABASE_URL. Each instance is a fresh copy of Better Auth and of our options (vitest.db.config.ts
// inlines Better Auth, so `vi.resetModules()` gives it new in-memory state), standing for two Cloud Run
// instances behind one URL. Better Auth's default for /sign-in*: 3 requests per 10 seconds per address.

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const env = {
  ...process.env,
  BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), // throwaway: these tests sign nothing in
};

/** A new server instance with the zones' options, rate limiting on (Better Auth turns it on in production only). */
async function serverInstance() {
  vi.resetModules();
  const { betterAuth } = await import("better-auth");
  const { authOptions } = await import("./options");
  const options = authOptions(env);
  return betterAuth({ ...options, rateLimit: { ...options.rateLimit, enabled: true } });
}

type Instance = Awaited<ReturnType<typeof serverInstance>>;

/** A random private address, so no other test or run shares its bucket. */
const someAddress = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/** A wrong-password sign-in through `instance`'s HTTP handler; its status (401 wrong password, 429 limited). */
async function signIn(instance: Instance, forwardedFor: string): Promise<number> {
  const response = await instance.handler(
    new Request(`${baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL, "x-forwarded-for": forwardedFor },
      body: JSON.stringify({ email: `nobody-${randomInt(1e9)}@example.test`, password: "not-the-password" }),
    }),
  );
  return response.status;
}

describe("the sign-in rate limit across server instances", () => {
  it("counts attempts from one address on two instances against one budget", async () => {
    const [first, second] = [await serverInstance(), await serverInstance()];
    const address = someAddress();

    const statuses: number[] = [];
    for (const instance of [first, second, first, second, first, second]) {
      statuses.push(await signIn(instance, address));
    }

    expect(statuses).toEqual([401, 401, 401, 429, 429, 429]);
  });

  it("gives no fresh budget to a multi-value x-forwarded-for with a changing first address", async () => {
    // Better Auth trusts only a single-value header: a longer chain (a client's own x-forwarded-for, which
    // Cloud Run appends to) falls into one shared bucket per path, whatever its first address says.
    const [first, second] = [await serverInstance(), await serverInstance()];
    const client = someAddress();

    const statuses: number[] = [];
    for (const [i, instance] of [first, second, first, second].entries()) {
      statuses.push(await signIn(instance, `203.0.113.${i + 1}, ${client}`));
    }

    // That bucket may already hold attempts from an earlier run, so at most three get through.
    expect(statuses.filter((status) => status !== 429).length).toBeLessThanOrEqual(3);
    expect(statuses.at(-1)).toBe(429);
  });
});
