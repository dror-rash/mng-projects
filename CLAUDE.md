# Agent Rules

Read this file first, every session. `AGENTS.md` is a copy/symlink of this file for non-Claude agents.

## Read order
1. `docs/PLAN.md` – what we are building and current milestone
2. `docs/ARCHITECTURE.md` – zone map, package boundaries, conventions
3. `docs/WORKFLOW.md` – the loop you must follow
4. The active task in `docs/tasks/` and its linked `.feature` file
5. `docs/SECURITY.md` and `docs/security/register.md` – the security review process and the known gaps
6. `docs/AGENT-TEAM.md` – the agent team, pipeline, lanes and guard hooks (ADR-0010). The main session orchestrates; agents in `.claude/agents/` do the work

If the plan, feature file, or task is missing or unclear: **stop and ask**. Do not invent scope.

## Stack
Next.js (App Router, multi-zone) · Better Auth · Postgres + Drizzle · TypeScript strict · Tailwind + shadcn/ui · Storybook · Vitest + Testing Library (unit/component) · Playwright + Gherkin via playwright-bdd (acceptance) · Turborepo + pnpm · GCP (Cloud Run, Artifact Registry, Secret Manager, Terraform) · GitHub Actions

## Commands
- `pnpm db:up` – local Postgres and file storage (Docker: `fake-gcs-server`, task 057); `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio`
- `pnpm --filter @repo/storage test:storage` – storage tests against the local storage server (needs `pnpm db:up` and `STORAGE_*` in `.env`)
- `pnpm --filter @repo/dashboard seed:demo --email you@example.com` – demo data for local dev: 5 customers × 15 projects with tasks in every state, visits, and readings of a published `Site inspection (demo)` form (no files), in that user's workspace (needs `pnpm db:migrate` first). Reruns replace the previous demo data (customers tagged `demo`, with their projects, visits and readings) and reuse the form. `--deploy` is for the `main` deploy (task 076): it seeds the demo account's only workspace once, skips when the account or its workspace isn't there yet or it has demo data, refuses anything but a workspace the account administers alone, and prints counts only
- `pnpm --filter @repo/dashboard test:db` – the demo seed's database tests (against `DATABASE_URL`, like `@repo/db`'s `test:db`)
- `pnpm --filter @repo/dashboard reset:local [--yes]` – wipes every workspace and every `@example.com` (e2e) account from the local database, keeping other accounts; refuses a non-local `DATABASE_URL` or a Cloud SQL server; a dry run without `--yes`. Then sign in once and run `seed:demo` (task 071)
- `pnpm dev` – run all zones (shell :3000, example-zone :3001, dashboard :3002); needs `.env` (copy `.env.example`) and the database up. Restart it if e2e gets slow after a long session (dev memory growth); never run `pnpm build` while it runs (both write `.next`)
- `pnpm test` – unit/component tests (Vitest)
- `pnpm test:e2e` – acceptance tests (Gherkin via Playwright; generates specs with `bddgen`, then runs)
- `pnpm --filter @repo/e2e screenshots` – screenshots of every page and form (error states included) into `e2e/screenshots/`, against running dev servers; for validation reports
- `pnpm storybook` – UI workbench on :6006
- `pnpm lint && pnpm typecheck` – must pass before any commit
- `pnpm build` – build everything (Turborepo caches; CI can add `--filter=...[origin/main]`)
- `scripts/lane.sh up|exec|list|down <n>` – a parallel lane: worktree, database `app_lane<n>`, ports 3000+10n…; tests: `bash scripts/test-hooks.sh`, `bash scripts/test-lane.sh`
- Single package: `pnpm --filter @repo/ui test`, `pnpm --filter @repo/shell dev`

## Non-negotiable rules
1. **No production code without a failing test first.** Acceptance test (ATDD) for behavior, unit test (TDD) for logic. Show the red run before writing the implementation.
2. **Feature files are the source of truth.** Behavior lives in `docs/features/*.feature`. Never edit a scenario to make a test pass; if behavior must change, update the feature file in its own commit and say why. Scenarios written ahead of their task carry `@wip` (skipped by `pnpm test:e2e`); remove the tag in the task's `test:` commit.
3. **Plan before code.** Work happens against a task file in `docs/tasks/`. One task = one small, reviewable change.
4. **Respect boundaries.** Zones never import from each other; share code only through `packages/*`. Cross-zone navigation uses plain links/rewrites, not imports.
5. **UI goes through `packages/ui`.** Use shadcn primitives. Every new component ships with a Storybook story covering its states.
6. **Server Components by default.** Add `"use client"` only for interactivity, and keep client islands small.
7. **No secrets in the repo.** Config via env vars; production secrets in Secret Manager. Auth to GCP uses Workload Identity Federation.
8. **Don't expand scope.** Out-of-scope ideas go in the task's "Parking lot", not the diff.
9. **Record decisions.** Any choice that is hard to reverse gets an ADR in `docs/adr/`.
10. **Infra is code, deploys go through CI.** Change GCP only via `infra/` Terraform (show `terraform plan` output in the PR). Never commit state, `*.tfvars`, or credentials; never deploy by hand to production.
11. **Auth goes through `@repo/auth`.** Never read or parse session cookies yourself. Middleware is only an optimistic check; every protected page/route handler must call `getSession()`. Post-login redirects must use `safeNext`.
12. **Data goes through `@repo/db`.** Schema changes = edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the SQL migration. Never edit applied migrations; never change the database by hand. Import query operators (`eq`, `and`, `sql`, …) from `@repo/db`, not `drizzle-orm`.
13. **No secrets or real user data in tests, fixtures, logs, or commits.** E2E creates unique throwaway accounts per scenario. `AUTH_DISABLE_RATE_LIMIT=true` is set only on the Playwright test servers; never in `.env` or a deployment.

## Forms
- Server actions for forms return `FormState` (`invalid()` in `apps/dashboard/features/forms/form-state.ts`) for invalid input and throw only for auth/not-found; client forms use `useActionState`.
- Form parsers return `undefined` for a field the form doesn't have (keep the current value), `null` for a cleared field, and `{ ok: false, field, error }` so the error shows on the right input.
- A native `<select>` in an action form gets `key={its value}`: React resets the form after every submit, and a select only applies `defaultValue` when it mounts.

## Domain conventions
- Access is by workspace membership and role (ADR-0005, ADR-0006): pages call `requireWorkspace(path)`; record lookups and lists filter with the predicates in `features/access/predicates.ts` (they call the SQL access functions) and `deleted_at is null`; lists use the current workspace (the `workspace` cookie, checked against membership); writes call `requireProjectChange` / `requireCustomerChange` / `isAdmin` on the server; pages hide forms with `canChange(role)` or the record's `canChange`. Never scope by `owner_id` (it means "created by", and is null once that user is deleted).
- Row-level security (ADR-0006, task 047): every query and action runs inside `withAccess(session.user.id, …)` from `@repo/db` (outside it the database returns nothing). Read the session before it and `redirect()` after it. Only seeds, e2e fixtures and DB tests use `@repo/db/maintenance`.
- Actions that work on "the current workspace" (create, members page, leave) post a hidden `workspaceId` and call `requireWorkspaceForAction(formData)`, never trust the cookie: another tab may have switched it. Membership changes go through `changeMembership` (locks the workspace row, keeps an admin).
- Fixed value sets (task status, priority, organization status) are defined once as a `const` list with `parse…`/label helpers and a default for unknown stored values (see `features/tasks/task-status.ts`). Never hard-code the strings elsewhere.
- Calendar days (due dates) are Postgres `date` read as `"YYYY-MM-DD"` strings and compared as strings. "Today" is `todayUtc()`; format with `timeZone: "UTC"`. E2E date steps compute days relative to today in UTC and keep a margin of several days.

## Testing conventions
- Test behavior and outputs, not implementation details. Query by role/label, not test IDs, unless unavoidable.
- Do not mock our own modules in acceptance tests. Mock only external boundaries (third-party APIs, time, network).
- Test names read as sentences: `it("shows an error when the email is invalid")`.
- Flaky tests are bugs: fix or delete, never retry-and-ignore.
- Other people in a scenario come from the `people` fixture (`people.newPerson()` + `signUp` in `e2e/steps/fixtures.ts`); their contexts close when the scenario ends. Cross-user tests use real ids from those people, never made-up ones.

## Commits & PRs
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), scope = zone or package (`feat(shell): ...`).
- Prefer the sequence: `test:` (red) → `feat:` (green) → `refactor:`.
- PR description links the task file and feature file, and lists the Definition of Done checks.

## When finished with a task
Run the Definition of Done in `docs/WORKFLOW.md`, update the task's status and the plan's milestone, then summarize: what changed, what was tested, open questions.
