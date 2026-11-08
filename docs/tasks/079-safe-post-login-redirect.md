# Task 079: Post-login redirects stay on the site

- **Status:** done (PR #55)
- **Milestone:** cross-cutting (security)
- **Zone / package:** `packages/auth` (`src/redirect.ts`, `src/redirect.test.ts`); callers `apps/shell/features/auth/login-form.tsx` and `signup-form.tsx` keep their call as is. No migration. Commit type `fix(auth)`.
- **Feature file:** `docs/features/authentication.feature` (one new `@wip @task:079` scenario)
- **Depends on:** nothing open (task 001 authentication: done). Task 077 (`docs/security/register.md`) is not a dependency; the register's SEC-03 row is updated by whichever lands second.

## Why
After logging in or signing up, people should only ever be sent to a page of this site (register SEC-03).

## Scope
- `safeNext(next, fallback)` in `packages/auth/src/redirect.ts` returns only a same-origin path:
  - It resolves the candidate with `new URL(next, <fixed dummy origin>)` (e.g. `https://safe-next.invalid`) and accepts it only if the resolved origin equals the dummy origin; it then returns the resolved `pathname + search + hash`, not the raw input.
  - It rejects (returns `fallback`) any input that contains an ASCII control character (U+0000–U+001F, U+007F) or a backslash, before resolving. Percent-encoded sequences stay as text (they are not decoded first); the property test below guards the decoded forms too.
  - It still requires the input to start with `/`; empty, `null` and `undefined` still give `fallback`.
  - Existing behavior kept: `/example/account?tab=1` → `/example/account?tab=1`; the existing `redirect.test.ts` cases keep passing.
- The doc comment on `safeNext` says what it guarantees: the result, resolved against any origin, stays on that origin.
- `loginUrl` and `resolvePublicOrigin` unchanged.

## Out of scope
- Changing where people land by default (`/dashboard` in the login and sign-up forms).
- Redirect handling anywhere else (invite links, middleware's `loginUrl`), unless it calls `safeNext` (it then gets the fix for free).
- Server-side redirect validation in a route handler (the forms redirect in the browser).

## Acceptance criteria
- [x] A `next` address that points to another site (absolute URL, protocol-relative, or a path that a browser would read as another host) sends the person to the default page after login, not off the site. → `authentication.feature` "A next address on another site goes to the dashboard after logging in"; unit tests.
- [x] Inputs containing a tab, CR or LF (raw), or a backslash in any position give the fallback. → unit tests (`it.each` over the forms, including the forms with the characters after the first `/` and percent-encoded forms checked after `decodeURIComponent`).
- [x] For any string `x`, `new URL(safeNext(x), base).origin === base` for a fixed `base`. → property-style unit test over generated strings (a seeded generator mixing `/`, `\`, `:`, `.`, `@`, `%`, `?`, `#`, letters, whitespace and control characters, at least a few thousand cases; no new dependency unless the implementer prefers `fast-check`, see Open questions).
- [x] Same-origin paths keep their path, query and hash (`/dashboard/projects/x?tab=1#top`). → unit test.
- [x] Existing authentication scenarios stay green. → `pnpm test:e2e`.

## Security notes
Touches authentication (`packages/auth`), a security-sensitive path per `docs/SECURITY.md` (the `security-reviewer` runs). No data or role change: the function only decides the address after a successful login or sign-up. Fixes register gap **SEC-03**. Tests use made-up hostnames under `.example` / `.invalid` only.

## Approach (brief)
- Red: add the unit cases and the property test to `redirect.test.ts`, run `pnpm --filter @repo/auth test`, paste the failures; add the `@wip` scenario's two new steps if the implementer un-wips it in this task.
- Rewrite `safeNext` around `new URL` as in the scope; keep it dependency-free and usable in the browser (the forms are client components).
- No ADR.

## Test plan
- Acceptance: `authentication.feature` "A next address on another site goes to the dashboard after logging in" (`@wip @task:079`; un-wip it in the `test:` commit). New steps: `Given I am on the login page to return to {string}` (opens `/login?next=<encoded>`) and `Then I am on the dashboard` (URL path `/dashboard`). Note the scenario uses a plain absolute URL, which today's code already rejects; it guards the behavior end to end, while the unit tests carry the red.
- Unit/component: `packages/auth/src/redirect.test.ts` as in the acceptance criteria.
- Storybook: none.

## Open questions
1. Is a seeded hand-written generator enough for the property test, or does the owner want `fast-check` added as a dev dependency of `@repo/auth`?

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-03); owner: "start fixing P0".
- 2026-11-08 – Started in lane 3. Open questions answered by defaults (orchestrator): a seeded hand-written generator, no new dependency.
- 2026-11-08 – Spec-writer: un-wipped the scenario, added steps `I am on the login page to return to {string}` and `I am on the dashboard` (auth.steps.ts). It passes on today's code (plain absolute URL already rejected), as planned; the red comes from the unit tests.
- 2026-11-08 – Implementer, red: unit cases for control characters, backslashes, dot segments and decoded percent forms, a same-origin path with query and hash, and two seeded property tests (5000 generated inputs each: the result resolves to the base origin; it has no control characters or backslashes). `pnpm --filter @repo/auth test`: 18 of 38 fail (the 16 new rejection cases and both property tests); the existing cases pass.
- 2026-11-08 – Implementer, green: `safeNext` rejects control characters and backslashes, resolves the input against a fixed dummy origin, accepts it only on that origin, and returns the normalized path + query + hash (checked once more to stay a same-origin path). Callers unchanged (login and sign-up forms; middleware and the invite flow use `loginUrl` with same-origin paths). `@repo/auth` 41/41; `pnpm test`, lint, typecheck green; e2e `@task:079` 1/1, `@zone:shell` 18/18 (`--workers=2`).
- 2026-11-08 – Review: no blockers or should-fix; Node (300k) and Chromium (200k) fuzzing found no off-site result. Nits done by the orchestrator: a test name that says what it checks, a blank line.
- 2026-11-08 – Merged (PR #55): CI `verify`, `e2e` and the preview `deploy` passed.

## Parking lot
- The same scenario for the sign-up page (`/signup?next=…`), if the owner wants both covered end to end.
