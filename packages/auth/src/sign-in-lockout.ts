// Sign-in lockout (task 090): not implemented yet (red).
import type { BetterAuthPlugin } from "better-auth";

export const LOCKED_MESSAGE = "";

export type LockoutState = { failures: number; windowStart: Date; lockedUntil: Date | null };

export type LockoutStore = {
  attempt(key: string, now: Date): Promise<"allowed" | "locked">;
  reset(key: string): Promise<void>;
};

export function isLocked(_state: LockoutState | undefined, _now: Date): boolean {
  throw new Error("not implemented");
}

export function countAttempt(_state: LockoutState | undefined, _now: Date): LockoutState {
  throw new Error("not implemented");
}

export function removableAfter(_state: LockoutState): Date {
  throw new Error("not implemented");
}

export function lockoutKey(_email: string, _secret: string): string {
  throw new Error("not implemented");
}

export function signInLockout(_options: { store?: LockoutStore; now?: () => Date } = {}): BetterAuthPlugin {
  return { id: "sign-in-lockout" };
}
