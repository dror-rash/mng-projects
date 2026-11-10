import { randomBytes, randomUUID } from "node:crypto";

import { getPoolDb, inArray, schema, sql } from "@repo/db";
import { afterAll, describe, expect, it, vi } from "vitest";

// The sign-in lockout (task 090, SEC-10) with the zones' options and the database store, against the migrated
// database in DATABASE_URL. Rate limiting off, as on the Playwright servers: the lockout must work without it.
// Reads and cleans up through the pool, like Better Auth (its tables and sign_in_lockout have no row-level security).

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const env = {
  ...process.env,
  BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  AUTH_DISABLE_RATE_LIMIT: "true",
};
const password = "correct-horse-battery";
const LOCKED = { status: 429, message: "Too many failed sign-ins. Try again in 15 minutes." };

/** A new server instance (fresh in-memory state, like another Cloud Run instance) with the zones' options. */
async function serverInstance() {
  vi.resetModules();
  const { betterAuth } = await import("better-auth");
  const { authOptions } = await import("./options");
  return betterAuth(authOptions(env));
}

type Instance = Awaited<ReturnType<typeof serverInstance>>;

const emails: string[] = [];
const someEmail = () => {
  const email = `lockout-${randomUUID()}@example.com`;
  emails.push(email);
  return email;
};

async function post(instance: Instance, path: string, body: Record<string, string>) {
  const response = await instance.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json()) as { message?: string };
  return { status: response.status, message: json.message };
}

const signIn = (instance: Instance, email: string, withPassword = "not-the-password") =>
  post(instance, "/sign-in/email", { email, password: withPassword });

async function signUp(instance: Instance) {
  const email = someEmail();
  expect((await post(instance, "/sign-up/email", { name: "Someone", email, password })).status).toBe(200);
  return email;
}

afterAll(async () => {
  if (emails.length) await getPoolDb().delete(schema.user).where(inArray(schema.user.email, emails));
});

describe("the sign-in lockout in the database", () => {
  it("locks an account after 5 wrong passwords spread over two server instances", async () => {
    const [first, second] = [await serverInstance(), await serverInstance()];
    const email = await signUp(first);

    for (const instance of [first, second, first, second, first]) {
      expect((await signIn(instance, email)).status).toBe(401);
    }

    expect(await signIn(second, email, password)).toEqual(LOCKED);
    expect(await signIn(first, email, password)).toEqual(LOCKED);
  });

  it("doesn't lock another account", async () => {
    const instance = await serverInstance();
    const [locked, other] = [await signUp(instance), await signUp(instance)];
    for (let i = 0; i < 5; i++) await signIn(instance, locked);

    expect((await signIn(instance, other, password)).status).toBe(200);
  });

  it("answers an email without an account like one with an account, before and after the lock", async () => {
    const instance = await serverInstance();
    const [existing, nobody] = [await signUp(instance), someEmail()];

    const answers = async () => [await signIn(instance, existing), await signIn(instance, nobody)];
    const [firstExisting, firstNobody] = await answers();
    expect(firstNobody).toEqual(firstExisting);
    for (let i = 0; i < 4; i++) await answers();
    const [lockedExisting, lockedNobody] = await answers();
    expect(lockedExisting).toEqual(LOCKED);
    expect(lockedNobody).toEqual(LOCKED);
  });

  it("resets the count when the right password is used before the limit", async () => {
    const instance = await serverInstance();
    const email = await signUp(instance);
    for (let i = 0; i < 4; i++) await signIn(instance, email);
    expect((await signIn(instance, email, password)).status).toBe(200);
    for (let i = 0; i < 4; i++) await signIn(instance, email);

    expect((await signIn(instance, email, password)).status).toBe(200);
  });

  it("never stores the email, only a keyed hash of it", async () => {
    const instance = await serverInstance();
    const email = someEmail();
    await signIn(instance, email);

    const { rows } = await getPoolDb().execute<{ row: string }>(sql`select t::text as row from sign_in_lockout t`);
    expect(rows.length).toBeGreaterThan(0);
    for (const { row } of rows) {
      expect(row.toLowerCase()).not.toContain(email.split("@")[0]);
    }
  });

  it("removes rows whose window and lock have passed when it writes", async () => {
    const stale = `stale-${randomUUID()}`;
    await getPoolDb().execute(sql`
      insert into sign_in_lockout (key, failures, window_start, locked_until, removable_after)
      values (${stale}, 5, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour')`);

    await signIn(await serverInstance(), someEmail());

    const { rows } = await getPoolDb().execute(sql`select key from sign_in_lockout where key = ${stale}`);
    expect(rows).toEqual([]);
  });

  it("refuses all but 5 of many parallel wrong passwords before checking them", async () => {
    const instance = await serverInstance();
    const email = await signUp(instance);

    const statuses = await Promise.all(Array.from({ length: 12 }, () => signIn(instance, email)));

    expect(statuses.filter((s) => s.status === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s.status === 429)).toHaveLength(7);
  });
});
