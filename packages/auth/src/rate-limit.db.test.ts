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

  // Cloud Run appends the address it sees to any x-forwarded-for the client sent, so the rightmost value is the
  // real client and anything left of it is the client's own claim.
  it("keys a client-supplied x-forwarded-for on the address Cloud Run appended (the rightmost)", async () => {
    const [first, second] = [await serverInstance(), await serverInstance()];
    const client = someAddress();

    const statuses: number[] = [];
    for (const instance of [first, second, first]) statuses.push(await signIn(instance, client));
    statuses.push(await signIn(second, `1.2.3.4, ${client}`));

    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("gives no fresh budget for a changing client-supplied part", async () => {
    const [first, second] = [await serverInstance(), await serverInstance()];
    const client = someAddress();

    const statuses: number[] = [];
    for (const [i, instance] of [first, second, first, second].entries()) {
      statuses.push(await signIn(instance, `203.0.113.${i + 1}, ${client}`));
    }

    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("gives two real addresses behind the same client-supplied value their own budgets", async () => {
    const [first, second] = [await serverInstance(), await serverInstance()];
    const [one, other] = [someAddress(), someAddress()];

    const statuses: number[] = [];
    for (const instance of [first, second, first]) statuses.push(await signIn(instance, `1.2.3.4, ${one}`));
    statuses.push(await signIn(second, `1.2.3.4, ${other}`));

    expect(statuses).toEqual([401, 401, 401, 401]);
  });
});
