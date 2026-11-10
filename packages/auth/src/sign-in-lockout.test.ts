import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";

import {
  countAttempt,
  isLocked,
  LOCKED_MESSAGE,
  lockoutKey,
  type LockoutState,
  type LockoutStore,
  removableAfter,
  signInLockout,
} from "./sign-in-lockout";

// The sign-in lockout rule (task 090, SEC-10): 5 failed sign-ins to one email within 15 minutes lock it for
// 15 minutes. Every attempt is counted before the password is checked (so parallel guesses can't slip past the
// count) and a success resets it, so an attempt counts as a failure unless it succeeds. The clock is `now`.

const start = new Date("2026-11-10T12:00:00.000Z");
const minutes = (n: number) => new Date(start.getTime() + n * 60_000);

/** Counts `times` attempts one minute apart from `from`, starting with `state`. */
function attempts(times: number, from = start, state?: LockoutState): LockoutState {
  let current = state;
  for (let i = 0; i < times; i++) current = countAttempt(current, new Date(from.getTime() + i * 60_000));
  if (!current) throw new Error("no attempts");
  return current;
}

describe("the sign-in lockout rule", () => {
  it("doesn't lock an email nobody has tried", () => {
    expect(isLocked(undefined, start)).toBe(false);
  });

  it("doesn't lock after 4 failures", () => {
    expect(isLocked(attempts(4), minutes(4))).toBe(false);
  });

  it("locks on the 5th failure within 15 minutes", () => {
    expect(isLocked(attempts(5), minutes(4))).toBe(true);
  });

  it("keeps the lock for 15 minutes from the 5th failure", () => {
    const locked = attempts(5); // the 5th at minute 4
    expect(isLocked(locked, new Date(minutes(19).getTime() - 1))).toBe(true);
    expect(isLocked(locked, minutes(19))).toBe(false);
  });

  it("doesn't lock when the failures are spread over more than 15 minutes", () => {
    const four = attempts(4); // minutes 0–3
    const fifth = countAttempt(four, minutes(15)); // the window that started at minute 0 has passed
    expect(fifth.failures).toBe(1);
    expect(isLocked(fifth, minutes(15))).toBe(false);
  });

  it("starts a new count after the lock ends", () => {
    const locked = attempts(5);
    const next = countAttempt(locked, minutes(19));
    expect(next).toEqual({ failures: 1, windowStart: minutes(19), lockedUntil: null });
    expect(isLocked(next, minutes(19))).toBe(false);
  });

  it("counts from a placeholder row with no failures (the store's first insert)", () => {
    const placeholder: LockoutState = { failures: 0, windowStart: start, lockedUntil: null };
    expect(countAttempt(placeholder, start)).toEqual({ failures: 1, windowStart: start, lockedUntil: null });
  });

  it("says which rows can be removed: after the window and after any lock", () => {
    expect(removableAfter(attempts(1))).toEqual(minutes(15));
    expect(removableAfter(attempts(5))).toEqual(minutes(19));
  });

  it("has the message the login form shows", () => {
    expect(LOCKED_MESSAGE).toBe("Too many failed sign-ins. Try again in 15 minutes.");
  });
});

describe("the lockout key", () => {
  const secret = "a-test-secret-that-is-long-enough";

  it("is the same for the same email in any case or surrounding spaces", () => {
    expect(lockoutKey(" Someone@Example.com ", secret)).toBe(lockoutKey("someone@example.com", secret));
  });

  it("never contains the email", () => {
    const key = lockoutKey("someone@example.com", secret);
    expect(key).not.toContain("someone");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("depends on the secret, so it can't be computed from an email alone", () => {
    expect(lockoutKey("someone@example.com", secret)).not.toBe(lockoutKey("someone@example.com", `${secret}-other`));
  });

  it("differs between emails", () => {
    expect(lockoutKey("one@example.com", secret)).not.toBe(lockoutKey("two@example.com", secret));
  });
});

// The rule through Better Auth's sign-in (hooks around /sign-in/email), with the in-memory adapter, a store in
// memory and a fake clock. The database store is tested in sign-in-lockout.db.test.ts.
describe("sign-in with the lockout", () => {
  const baseURL = "http://localhost:3000";
  const password = "correct-horse-battery";

  function memoryStore(): LockoutStore {
    const rows = new Map<string, LockoutState>();
    return {
      async attempt(key, now) {
        const row = rows.get(key);
        if (isLocked(row, now)) return "locked";
        rows.set(key, countAttempt(row, now));
        return "allowed";
      },
      async reset(key) {
        rows.delete(key);
      },
    };
  }

  async function setUp() {
    const clock = { now: start };
    const auth = betterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      secret: "a-test-secret-that-is-long-enough-for-better-auth",
      baseURL,
      emailAndPassword: { enabled: true },
      rateLimit: { enabled: false },
      plugins: [signInLockout({ store: memoryStore(), now: () => clock.now })],
    });
    const email = `someone-${Math.random().toString(36).slice(2)}@example.com`;
    await auth.api.signUpEmail({ body: { name: "Someone", email, password } });

    async function post(path: string, body: Record<string, string>) {
      const response = await auth.handler(
        new Request(`${baseURL}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: baseURL },
          body: JSON.stringify(body),
        }),
      );
      const json = (await response.json()) as { message?: string };
      return { status: response.status, message: json.message };
    }
    const signIn = (as: string, withPassword: string) => post("/sign-in/email", { email: as, password: withPassword });
    const fail = async (times: number, as = email) => {
      for (let i = 0; i < times; i++) expect((await signIn(as, "not-the-password")).status).toBe(401);
    };
    return { clock, email, post, signIn, fail };
  }

  it("refuses the right password after 5 wrong ones, with the lock message", async () => {
    const { email, signIn, fail } = await setUp();
    await fail(5);

    expect(await signIn(email, password)).toEqual({ status: 429, message: LOCKED_MESSAGE });
  });

  it("lets the right password in again 15 minutes after the last failure", async () => {
    const { clock, email, signIn, fail } = await setUp();
    await fail(5);

    clock.now = new Date(start.getTime() + 15 * 60_000 - 1);
    expect((await signIn(email, password)).status).toBe(429);
    clock.now = minutes(15);
    expect((await signIn(email, password)).status).toBe(200);
  });

  it("resets the count on a successful sign-in before the limit", async () => {
    const { email, signIn, fail } = await setUp();
    await fail(4);
    expect((await signIn(email, password)).status).toBe(200);
    await fail(4);

    expect((await signIn(email, password)).status).toBe(200);
  });

  it("counts the same email in another case", async () => {
    const { email, signIn, fail } = await setUp();
    await fail(5, email.toUpperCase());

    expect((await signIn(email, password)).status).toBe(429);
  });

  it("answers an email without an account exactly like one with an account", async () => {
    const { signIn, fail, email } = await setUp();
    const nobody = `nobody-${Math.random().toString(36).slice(2)}@example.com`;

    expect(await signIn(nobody, "not-the-password")).toEqual(await signIn(email, "not-the-password"));
    await fail(4, nobody);
    await fail(4, email);
    expect(await signIn(nobody, "not-the-password")).toEqual(await signIn(email, "not-the-password"));
  });

  it("leaves other paths alone", async () => {
    const { email, post, fail } = await setUp();
    await fail(5);

    // Sign-up with the locked email answers as before (the account exists), not with the lock.
    const signUp = await post("/sign-up/email", { name: "Someone", email, password });
    expect(signUp.status).not.toBe(429);
    expect(signUp.message).not.toBe(LOCKED_MESSAGE);
  });
});
