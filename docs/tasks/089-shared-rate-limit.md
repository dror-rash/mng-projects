# Task 089: One sign-in rate limit across all instances

- **Status:** in-progress
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
- [x] Two separate auth instances (two `betterAuth` objects on the same test database, standing for two Cloud Run instances) share one budget: sign-in attempts from one address over the limit, split between them, get 429. Red first: with the memory store each instance allows its own budget. → DB-backed test in `packages/auth` (against `DATABASE_URL`, like `test:db`).
- [x] A request with a spoofed multi-value `x-forwarded-for` doesn't get a fresh budget. → same test file.
- [x] `AUTH_DISABLE_RATE_LIMIT=true` still disables it (existing `rate-limit` unit test, extended).
- [x] `hardening.db.test.ts` passes with the new table in the documented exception list.
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
- 2026-11-10 – Started in lane 3 (owner: "do the rest of the P1"; build now, merge after the POC demo on 2026-11-13). Q1 default (Better Auth's limits).
- 2026-11-10 – Built in lane 3. `refactor(auth)`: the Better Auth options moved to `authOptions(env)` (`options.ts`), `server.ts` adds the Next.js plugin, so tests build instances with the zones' settings. `test(auth)` (red): `rate-limit.db.test.ts` (`pnpm --filter @repo/auth test:db`, added to CI) builds two instances, each a fresh module copy of Better Auth (`vitest.db.config.ts` inlines it, `vi.resetModules()`), so each has its own memory store like two processes. **Red:** six wrong-password sign-ins from one address alternating between them gave `401 ×6` (expected `401 401 401 429 429 429`), and four with a multi-value `x-forwarded-for` (changing first address) gave no 429; control run (not committed): the same six on one instance gave `401 401 401 429 429 429`, so the memory limiter was on and only the split escaped it. Unit red: 4 of the 7 `rate-limit.test.ts` tests (storage `"database"`, no custom limits, other flag values, `x-forwarded-for` as the only address header). `feat(db)`: `rate_limit` (id, unique key, count, last_request bigint ms), migration `0040_rate_limit.sql`; no RLS like Better Auth's other tables (ADR-0006), DML grants from 0020's default privileges; added to `hardening.db.test.ts`'s and `check-runtime-role.mjs`'s exception lists and pinned in `rls-pins.mjs` (the same hash as the other auth tables; the runtime-role check and the hardening test failed on the new table before). `fix(auth)`: `rateLimit.storage: "database"`, `advanced.ipAddress.ipAddressHeaders: ["x-forwarded-for"]`; `AUTH_DISABLE_RATE_LIMIT=true` still returns `{ enabled: false }`. **Cleanup:** none added; Better Auth keeps one row per key (unique, replaced when its window passes) and on each window reset deletes rows older than its longest window (60 s); seen locally (only the 2 current rows left after a reset). **Live check against production builds** (`next start`, no `AUTH_DISABLE_RATE_LIMIT`): five bad sign-ins from one address `401 401 401 429 429`; split between two shell servers on 3030 and 3039 `401 401 401 429 429 429`; the same address 10.5 s later `401` (so task 069's 11.5 s pacing stays valid). Green: auth unit 43/43, auth DB 2/2, `@repo/db` DB 149/149, dashboard DB 19/19, infra DB script tests 61/61, `pnpm test` all packages, lint, typecheck, `pnpm build`, full `CI=1 pnpm test:e2e --workers=2` **323 passed** (5.5 min, no failures). Left: the release-gate check on the PR's preview.

## Parking lot
- A breached-password check on sign-up (review SEC-10 "8-character minimum, no breached-password check").
