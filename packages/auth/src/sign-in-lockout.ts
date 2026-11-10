import { createHmac } from "node:crypto";

import { eq, getPoolDb, lt, schema } from "@repo/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";

/**
 * Sign-in lockout (task 090, register SEC-10): 5 failed sign-ins to one email within 15 minutes refuse sign-in
 * to it for 15 minutes, whatever address the guesses come from. Separate from Better Auth's rate limit (per
 * address, task 089), so AUTH_DISABLE_RATE_LIMIT doesn't turn it off.
 *
 * Every attempt is counted *before* the password is checked, in one locked row update, so parallel guesses
 * can't all pass the check before the count catches up; a successful sign-in deletes the row. So an attempt
 * counts as a failure unless it succeeds, and a success before the limit starts the count again.
 *
 * Counted by a keyed hash of the normalized email, not by user id: an email with no account counts, locks and
 * answers exactly like one with an account (no account-existence oracle), and the table never holds an email.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;
export const LOCKED_MESSAGE = "Too many failed sign-ins. Try again in 15 minutes.";

const SIGN_IN_PATH = "/sign-in/email";

/** One email's count: failures since `windowStart`, and the end of its lock if it has one. */
export type LockoutState = { failures: number; windowStart: Date; lockedUntil: Date | null };

/** Where the counts live: the database in the zones, memory in unit tests. */
export type LockoutStore = {
  /** Refuses (`"locked"`) while `key` is locked; otherwise counts one attempt. */
  attempt(key: string, now: Date): Promise<"allowed" | "locked">;
  /** Forgets `key`'s count (a successful sign-in). */
  reset(key: string): Promise<void>;
};

export function isLocked(state: LockoutState | undefined, now: Date): boolean {
  return state?.lockedUntil != null && now < state.lockedUntil;
}

/** `state` with one more failed attempt at `now`: a new window once the last one has passed; locked at the limit. */
export function countAttempt(state: LockoutState | undefined, now: Date): LockoutState {
  const fresh = !state || now.getTime() - state.windowStart.getTime() >= WINDOW_MS;
  const failures = fresh ? 1 : state.failures + 1;
  const windowStart = fresh ? now : state.windowStart;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null;
  return { failures, windowStart, lockedUntil };
}

/** When a row stops mattering: the end of its window or of its lock, whichever is later. */
export function removableAfter(state: LockoutState): Date {
  const windowEnd = state.windowStart.getTime() + WINDOW_MS;
  return new Date(Math.max(windowEnd, state.lockedUntil?.getTime() ?? 0));
}

/** The row key for `email`: an HMAC-SHA256 (with the auth secret) of it trimmed and lower-cased. */
export function lockoutKey(email: string, secret: string): string {
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

/**
 * The counts in `sign_in_lockout`, through the pool like Better Auth's own tables (no row-level security,
 * ADR-0006). Each attempt locks its row for the update, so concurrent attempts on any instance count one by one.
 */
export function databaseStore(): LockoutStore {
  const table = schema.signInLockout;
  return {
    async attempt(key, now) {
      const db = getPoolDb();
      const result = await db.transaction(async (tx) => {
        // An empty row first, so there is always a row to lock (two first attempts can't both insert).
        const empty = { failures: 0, windowStart: now, lockedUntil: null };
        await tx.insert(table).values({ key, ...empty, removableAfter: removableAfter(empty) }).onConflictDoNothing();
        const [row] = await tx.select().from(table).where(eq(table.key, key)).for("update");
        if (isLocked(row, now)) return "locked" as const;
        const next = countAttempt(row, now);
        await tx.update(table).set({ ...next, removableAfter: removableAfter(next) }).where(eq(table.key, key));
        return "allowed" as const;
      });
      // Rows past their window and lock no longer count; remove them on every write (indexed).
      await db.delete(table).where(lt(table.removableAfter, now));
      return result;
    },
    async reset(key) {
      await getPoolDb().delete(table).where(eq(table.key, key));
    },
  };
}

/** The email a sign-in request names, or undefined when the body has none (Better Auth then refuses it). */
function emailOf(body: unknown): string | undefined {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email : undefined;
}

/**
 * The Better Auth plugin: before /sign-in/email, refuse a locked email (429, with the message the login form
 * shows) or count the attempt; after it, reset the count when the sign-in succeeded. Never logs the email.
 */
export function signInLockout(options: { store?: LockoutStore; now?: () => Date } = {}) {
  const store = options.store ?? databaseStore();
  const now = options.now ?? (() => new Date());
  const isSignIn = (context: { path?: string }) => context.path === SIGN_IN_PATH;

  return {
    id: "sign-in-lockout",
    hooks: {
      before: [
        {
          matcher: isSignIn,
          handler: createAuthMiddleware(async (ctx) => {
            const email = emailOf(ctx.body);
            if (email === undefined) return;
            if ((await store.attempt(lockoutKey(email, ctx.context.secret), now())) === "locked") {
              throw new APIError("TOO_MANY_REQUESTS", { message: LOCKED_MESSAGE });
            }
          }),
        },
      ],
      after: [
        {
          matcher: isSignIn,
          handler: createAuthMiddleware(async (ctx) => {
            const email = emailOf(ctx.body);
            if (email === undefined || isAPIError(ctx.context.returned)) return;
            await store.reset(lockoutKey(email, ctx.context.secret));
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
