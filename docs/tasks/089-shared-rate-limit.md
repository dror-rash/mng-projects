# Task 089: One sign-in rate limit across all instances

- **Status:** todo (after the POC)
- **Milestone:** cross-cutting (security)
- **Zone / package:** `packages/auth` (`server.ts`, `rate-limit.ts`), `packages/db` (`schema.ts`: Better Auth's rate-limit table; one migration; the RLS-coverage exception list). Commit types `test(auth)` → `fix(auth)` / `feat(db)`.
- **Feature file:** none (end-to-end runs disable the rate limit on purpose, rule 13; DB-backed tests and the release gate's live check cover it)
- **Depends on:** nothing open. Task 090 (lockout) follows this one (same files).

## Why
Better Auth's rate limit keeps its counts in each server instance's memory, so with several Cloud Run instances (up to 5 per zone on `main`) an attacker gets up to 5× the sign-in budget, and every new instance starts at zero. The client address it counts by is also taken implicitly. Keeping the counts in the database makes the limit the same however many instances run. Register **SEC-10** (rate-limit part; account lockout is task 090).

## Scope
- `packages/auth`: `rateLimit.storage: "database"` (Better Auth's `rateLimit` model), keeping Better Auth's default windows and limits for sign-in and sign-up (question 1). `AUTH_DISABLE_RATE_LIMIT=true` still turns it off on the Playwright servers only (`rateLimitOptions`, unchanged contract).
- **Client address:** `advanced.ipAddress` set explicitly to the header Cloud Run sets (`x-forwarded-for`), with a comment on what Better Auth does when the header has more than one value (it counts them in one shared bucket; review SEC-10). No other header is trusted.
- `packages/db`: the rate-limit table in `schema.ts` with Better Auth's columns (key, count, last request), generated migration. Like Better Auth's other tables it has **no row-level security** (ADR-0006: auth tables are outside it); `hardening.db.test.ts`'s exception list gains it with that reason, and the app never reads it.
- The table doesn't grow without bound: either Better Auth replaces a key's row (one row per key) or a cleanup is part of this task (implementer checks and names it in the PR).

## Out of scope
- Account lockout (task 090).
- A Redis or other external store.
- Changing the limits beyond Better Auth's defaults (question 1).
- A future load balancer's `x-forwarded-for` format (revisit with SEC-20's ingress work).

## Acceptance criteria
- [ ] Two separate auth instances (two `betterAuth` objects on the same test database, standing for two Cloud Run instances) share one budget: sign-in attempts from one address over the limit, split between them, get 429. Red first: with the memory store each instance allows its own budget. → DB-backed test in `packages/auth` (against `DATABASE_URL`, like `test:db`).
- [ ] A request with a spoofed multi-value `x-forwarded-for` doesn't get a fresh budget. → same test file.
- [ ] `AUTH_DISABLE_RATE_LIMIT=true` still disables it (existing `rate-limit` unit test, extended).
- [ ] `hardening.db.test.ts` passes with the new table in the documented exception list.
- [ ] Release-gate live check on the PR's preview: about five bad sign-ins in 10 s from one client get a 429 (output in the PR, no credentials).

## Security notes
Touches `packages/auth` and a migration (a new table with grants from default privileges), so the `security-reviewer` runs. The table holds rate-limit keys (client addresses and paths): personal data in a small way; it is never shown, never logged, and has no RLS by design, so no app query may read it (SEC-38's rule). A database outage now also fails sign-in rate-limit checks (sign-in needs the database anyway). Fixes part of register gap **SEC-10** (with task 090).

## Approach (brief)
Red: the two-instance test. Then the schema table (`pnpm db:generate`), the auth option, the explicit address header, the hardening exception. No ADR (ADR-0006 already keeps auth tables outside RLS; the PR says this table joins them).

## Test plan
- Acceptance: none (rate limit off in e2e).
- DB-backed: `packages/auth` two-instance test; `hardening.db.test.ts`.
- Unit: `rate-limit.test.ts`.
- By hand on the preview: the release-gate check.
- Storybook: none.

## Open questions
1. **Limits:** default: Better Auth's (sign-in and sign-up: 3 requests per 10 seconds per address), now across instances. The preview e2e pacing (task 069: ≥11.5 s per path) stays valid.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-10); owner: "start fixing the P1 gaps".

## Parking lot
- A breached-password check on sign-up (review SEC-10 "8-character minimum, no breached-password check").
