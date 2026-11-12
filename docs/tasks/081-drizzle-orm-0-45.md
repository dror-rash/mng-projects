# Task 081: `drizzle-orm` 0.45 (identifier escaping advisory)

- **Status:** done (PR #77)
- **Milestone:** cross-cutting (security)
- **Zone / package:** `packages/db` (`package.json`), `pnpm-lock.yaml`. No schema change, no migration. Commit type `fix(db)` (or `build(db)`).
- **Feature file:** none (no visible behavior; the existing unit, DB and e2e suites are the check)
- **Depends on:** nothing. Task 082's `pnpm audit` job is easier after this one (see there).

## Why
`drizzle-orm` 0.44.7 has a High advisory (GHSA-gpj5-g38j-94v9, identifier escaping), fixed in 0.45.2. It isn't reachable today (every `sql.raw`, `sql.identifier` and alias gets a constant), but the next query that passes a user value as an identifier would make it reachable, and `better-auth` already declares a peer `drizzle-orm ^0.45.2`. Register **SEC-16**.

## Scope
- `packages/db/package.json`: `drizzle-orm` to the latest `0.45.x` (at least `0.45.2`), and `drizzle-kit` to the version that matches it (the one drizzle documents for that ORM line).
- `pnpm-lock.yaml` regenerated; one `drizzle-orm` version in the tree (`pnpm why drizzle-orm`), and no peer warning from `better-auth` for it on `pnpm install`.
- Anything the bump breaks (types, query builder changes) is fixed in the same change, without changing behavior.
- Remove `GHSA-gpj5-g38j-94v9` from `pnpm.auditConfig.ignoreGhsas` in the root `package.json` (added by task 082) and from SEC-16's register row; `pnpm audit --prod --audit-level=high` must still pass without it.
- `pnpm db:generate` after the bump produces **no new migration** (the schema and the generated SQL agree); if the new `drizzle-kit` rewrites the snapshot format under `migrations/meta/`, that is committed, applied migrations are never edited (rule 12).

## Out of scope
- `pnpm.overrides` for the dev-only advisory chain (vitest/tinypool, esbuild via `drizzle-kit`, postcss in `next`, glob/minimatch): parking lot. `pnpm audit --prod` (task 082) does see postcss (fixed in task 093) and tinypool (accepted, SEC-43); the others are dev-only.
- Any other dependency bump.
- New uses of `sql.identifier`/`sql.raw`.

## Acceptance criteria
- [ ] `pnpm why drizzle-orm` shows one version, `>= 0.45.2`; `pnpm install` prints no `better-auth` peer warning for `drizzle-orm`.
- [ ] `pnpm db:generate` creates no migration file.
- [ ] `pnpm lint && pnpm typecheck`, `pnpm test`, `pnpm --filter @repo/db test:db`, `pnpm --filter @repo/dashboard test:db` and the full `pnpm test:e2e` pass.
- [ ] The RLS pins (`rls-pins.mjs`) are unchanged and the runtime role check passes on the PR's preview.
- [ ] `pnpm audit --prod` no longer lists GHSA-gpj5-g38j-94v9.

## Security notes
Touches the data layer every query goes through, and `package.json`/`pnpm-lock.yaml` (a bumped runtime dependency), so the `security-reviewer` runs. No change to access functions, policies or grants; the risk is a behavior change in the query builder that weakens a filter, which the leak suite (partner-access, workers, attachments, readings) and the DB tests cover. Fixes register gap **SEC-16**.

## Approach (brief)
Red: `pnpm audit --prod --json` lists the advisory (paste it in the PR). Bump both packages, `pnpm install`, fix type errors, run `db:generate` (expect nothing), run every suite. Read the drizzle 0.45 release notes for breaking changes and list them in the PR with "affects us / doesn't". No ADR.

## Test plan
- Acceptance: the full existing suite (no new scenarios).
- Unit/DB: existing suites; no new tests unless the bump changes a helper's behavior.
- Storybook: none.

## Open questions
- None blocking. (Exact versions are the implementer's, within the line above.)

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-16); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 1 (owner: "do the rest of the P1"; build now, merge after the POC demo on 2026-11-13).
- 2026-11-10 – Red: `drizzle-orm` 0.44.7 (three paths: `@repo/db`, and `better-auth`/`@better-auth/*` peers), `drizzle-kit` 0.31.11 installed (range `^0.31.0`). With GHSA-gpj5-g38j-94v9 taken out of `ignoreGhsas`, `pnpm audit --prod --audit-level=high` exits 1: "high – Drizzle ORM has SQL injection via improperly escaped SQL identifiers – drizzle-orm <0.45.2 – packages__db>drizzle-orm"; "8 vulnerabilities found, Severity: 5 moderate | 1 high | 2 critical (2 ignored)".
- 2026-11-10 – Green: `drizzle-orm` `^0.45.4`, `drizzle-kit` `^0.31.11` (0.31.11 shipped with orm 0.45.3; the latest kit). `pnpm why drizzle-orm` shows only 0.45.4; `pnpm install` prints no peer warning. Ignore entry removed; the audit exits 0: "7 vulnerabilities found, Severity: 5 moderate | 2 critical (2 ignored)". `pnpm db:generate`: "No schema changes, nothing to migrate", and no snapshot change. Release notes 0.45.0–0.45.4: `$onUpdate` with `SQL`, subqueries in select fields, bun-sql date mapping, pg-native Pool detection, `algorythm` typo, identifier escaping (0.45.2), Netlify driver (0.45.3), postgres-js prepare (0.45.4); none touches our code (no `$onUpdate`, `algorythm`, bun-sql, Netlify or postgres-js; `sql.identifier`/aliases get constants). No code changes needed.
- 2026-11-12 – Merged (PR #77) after the owner lifted the pre-demo hold (2026-11-11). SEC-16 fixed.

## Parking lot
- `pnpm.overrides` for the dev-only advisory chain (review SEC-16 "Other audit hits").
