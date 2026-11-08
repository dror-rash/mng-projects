# Task 080: `reset:local` refuses any Cloud SQL database

- **Status:** in-progress
- **Milestone:** cross-cutting (security)
- **Zone / package:** `apps/dashboard` (`features/demo/local-reset.ts`, `features/demo/local-reset.test.ts`, `scripts/reset-local.ts`, a new `scripts/reset-local.db.test.ts`). No migration. Commit type `fix(dashboard)`.
- **Feature file:** none (a local dev command, no app behavior; unit and DB tests)
- **Depends on:** task 071 (`reset:local`: done). Task 077 (`docs/security/register.md`) is not a dependency; the register's SEC-04 row is updated by whichever lands second.

## Why
The local reset command must only ever delete data in a local development database (register SEC-04).

## Scope
- **A server check over the connection**, on top of today's `isLocalDatabase(env)` (env, host, database name):
  - Right after the env guard passes and **before any other query** (the dry run's account listing included), `reset-local.ts` reads facts about the connected server in one read-only query, e.g. whether a role named `cloudsqlsuperuser` exists (`pg_roles`) and whether any `cloudsql.*` setting exists (`pg_settings`). The implementer may add other Cloud SQL markers if they are as cheap and reliable; each one is named in the code comment.
  - A pure decision function in `features/demo/local-reset.ts`, e.g. `isLocalServer(facts: { cloudSqlRole: boolean; cloudSqlSettings: boolean })` → `{ local: true } | { local: false; reason }`, refuses when any marker is present. Reason text: `the connected server is Cloud SQL.` (shown as `Refusing to reset: the connected server is Cloud SQL. reset:local only runs against a local database.`, matching today's message format), exit 1, nothing read or deleted.
  - If the facts query itself fails, the reset refuses too (exit 1, the error's message only).
- **The comments match the code:** `isLocalDatabase`'s doc comment no longer claims that a proxy or tunnel on localhost is refused by the database-name check; it says the name check covers other local databases and that the server check (this task) is what refuses a tunnel to Cloud SQL. The header of `reset-local.ts` lists the server check among its refusals.
- `reset:local` on the local docker database and on a lane database (`app_lane<n>`) behaves as today.

## Out of scope
- Renaming the production database (`app`) or any Terraform change.
- Changes to `seed:demo` (its `--deploy` mode is meant for Cloud SQL).
- Refusing non-Cloud-SQL remote servers beyond what the host check already does.

## Acceptance criteria
- [ ] The decision refuses when the Cloud SQL role is present, when `cloudsql.*` settings are present, and when both are; it allows when neither is. → unit tests in `local-reset.test.ts` (red first).
- [ ] On the local docker database (`DATABASE_URL` from `.env`, `pnpm db:up` + `pnpm db:migrate`), the facts query finds no Cloud SQL markers and the decision allows the reset. → `scripts/reset-local.db.test.ts` (`pnpm --filter @repo/dashboard test:db`); it reads facts only and deletes nothing.
- [ ] `reset-local.ts` runs the server check before any other query, and a refusal exits 1 without listing accounts or deleting. → review of the script order; the unit test of the decision; a dry run by hand locally (output in the PR).
- [ ] The doc comments of `isLocalDatabase` and `reset-local.ts` describe what the code checks, no more. → review.
- [ ] Existing `local-reset.test.ts` cases stay green.

## Security notes
Touches a maintenance script that deletes every workspace and test account past row-level security, as the database owner. Not under the app's request paths; the diff touches `scripts/` (`apps/dashboard/scripts/reset-local.ts`), a security-sensitive path per `docs/SECURITY.md`, so the `security-reviewer` runs. Fixes register gap **SEC-04**. Tests never connect to a deployed database; the DB test uses only the local `DATABASE_URL` and reads, never writes.

## Approach (brief)
- Red: unit tests for the new decision function; the DB test calling the facts query + decision on the local database (fails until the function and query exist).
- Add `readServerFacts(db)` (a small query, kept next to the script or in `features/demo/` taking a query executor) and `isLocalServer(facts)`; call them in `main()` straight after `isLocalDatabase`.
- Fix the comments.
- No ADR.

## Test plan
- Acceptance: none (no app behavior).
- Unit/component: `features/demo/local-reset.test.ts` (decision function, all four combinations).
- DB: `scripts/reset-local.db.test.ts`: the local docker database passes the server check.
- Storybook: none.

## Open questions
- None blocking. (Whether the Cloud SQL markers chosen are present on this project's instance can be confirmed by the owner with a read-only query through the proxy; the task doesn't require connecting to it.)

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-04); owner: "start fixing P0".
- 2026-11-08 – Started in lane 4. Open questions answered by defaults (orchestrator): none open.

## Parking lot
- Renaming the production database so its name never matches the local one.
- A `--i-know` style second confirmation that types the database name, if the owner wants one.
