# Task 076: Demo data on the deployed app

- **Status:** in-progress
- **Milestone:** POC (2026-11-13)
- **Zone / package:** `apps/dashboard` (`scripts/seed-demo.ts`, `features/demo/`), `.github/workflows/deploy.yml`, `infra/README.md` (docs only). No Terraform change, no migration.
- **Feature file:** none (no visible behavior of the app; the seed's own tests and a check by hand on the deployed app)
- **Depends on:** tasks 058–061 and 064 (visits, photos, reading forms, readings, reports: done), 068 (the deploy pipeline: done). Split from task 069 on 2026-11-07. Not a dependency, but a merge note: task 069 (lane 1, `feat/poc-flow`) edits `deploy.yml`'s preview Playwright step; this task adds a `main`-only step just before the PR-only steps, so whichever merges second rebases over a small, separate hunk.

## Why
The POC is shown on the deployed app, and a viewer should find a customer's whole story there (sites, visits, photos, readings, a report), not an empty dashboard. The owner chose demo data in a demo account only, no real users (2026-11-02), and on 2026-11-07 chose how it gets there: a step in the `main` deploy, no files in the seed, and an address the owner controls as the demo account.

## Scope
- **`seed:demo` adds field data** to the demo projects it already makes (customers, sub-companies, sites with on-site contacts, projects and tasks):
  - **A published reading form** in the workspace, named `Site inspection (demo)`, with a Number field with a unit (e.g. "Voltage", `V`), a Yes/no field, a Choice field (at least two options) and a Text field. The seed reuses a form of that name in the workspace if one exists, otherwise creates it as a draft, adds version 1's fields and publishes it the way the app does (status `draft` → `published`; task 060's trigger sets the version's `published_at`). The seed never deletes or changes a form.
  - **Visits:** every demo project except the "not started" ones gets 1–4 visits on past days (`visited_on` before today in UTC), each with notes and the people who were there (the seeding user; a demo workspace has only them). `created_by` and `recorded_at` match the visit.
  - **Readings:** at least one visit per demo customer carries a reading of that form, with values that `features/readings/reading-values.ts` accepts for its fields, by the seeding user, `recorded_at`/`submitted_at` on the visit's day.
  - **No photos, no reports, no files** (owner, 2026-11-07): after the seed, the owner uploads one photo and one report on a demo project by hand through the app.
  - Reruns keep replacing only the demo data: customers tagged `demo` and what hangs off them (projects, tasks, visits and readings go with the projects). The form stays and is reused.
- **A deploy mode, `seed:demo --deploy --email <address>`**, for CI. On top of the local behavior:
  - **Skips with a notice (exit 0)** when:
    - no account has that email ("the demo account hasn't signed up yet");
    - the account has no workspace ("the demo account hasn't opened the dashboard yet");
    - its workspace already has demo data: any customer tagged `demo`, deleted or not. So a later deploy never wipes or duplicates what the owner added or changed by hand.
  - **Refuses (exit 1) anything but the demo account's own workspace:** the account must belong to exactly one workspace, as its admin, and be its only member; `--workspace` is not allowed with `--deploy`. Otherwise it writes nothing and says why (without names).
  - **Prints no personal data:** not the email, not the workspace name, not the connection string. It prints counts only ("Seeded 5 customers (+N sub-companies), N sites, N projects, N tasks, N visits, N readings."), and on an error the error's message, not the error object.
  - Runs in one transaction, as today: a failure leaves nothing half-seeded.
  - Local runs without `--deploy` behave as today (including refusing an email with no account), plus the field data.
- **A `Seed demo data` step in `deploy.yml`:**
  - **When:** on `push` to `main` only (never on `pull_request`, so never on the preview database or its throwaway accounts), only when the repository secret `DEMO_EMAIL` is set (question 4; tested in the shell, since `if:` can't read secrets), after the migrations; placed after `Check shell URL`, so the new revision is already serving when it runs.
  - **Never blocks the deploy of `main`:** `continue-on-error: true` and `timeout-minutes: 10`. The app is already deployed by then, the demo data is a convenience, and a red `main` for it would hide real failures. A failure or refusal shows as a `::warning::` annotation on the run; a skip as a `::notice::`.
  - **Connection:** it starts the Cloud SQL proxy as the migration step does and connects as `app`'s owner login (`DB_MIGRATE_LOGIN` / `DB_MIGRATE_PASSWORD_SECRET` from `infra/scripts/environment.sh`), with the password from Secret Manager through main's deployer, which can already read it. No new identity, no Terraform change. Sharing the proxy start with the migration step through a small helper script is the implementer's choice.
  - **No secret in the log:** the password and the email are masked (`::add-mask::`) before any other command. `DATABASE_URL` is built in the shell and passed only in the seed command's environment (`DATABASE_URL=… DB_POOL_MAX=1 pnpm --filter @repo/dashboard seed:demo --deploy --email "$DEMO_EMAIL"`), never echoed, no `set -x`. `DB_POOL_MAX=1`: the seed needs one connection and shares `app`'s connection budget with the running app (task 075).
  - **Install:** it installs the dashboard's dependencies itself (`pnpm install --frozen-lockfile --filter @repo/dashboard...`), so the shared install line that task 069 may touch stays as is.
- **Docs:**
  - `infra/README.md` gets a short "Demo data" section: set `DEMO_EMAIL`, sign up with it on the `main` URL and open the dashboard once, then push to `main` or re-run the latest Deploy run on `main`; the run then seeds once, and later runs skip. To reseed, see the Parking lot.
  - The `seed-demo.ts` header and the `seed:demo` line in `CLAUDE.md` mention `--deploy`.

## Out of scope
- Photos, reports or any file in the seed, and any grant on the main bucket (owner, 2026-11-07).
- Generated PDF reports (task 065) and offline capture (062–063).
- Demo data on previews.
- Resetting or deleting anything on the deployed database, including the demo account's own demo data (`reset:local` stays local-only; a reseed flag is in the Parking lot).
- A manually run workflow or a new service account (route (b), not chosen).
- Signing up the demo account from CI: the owner signs up through the app.

## Acceptance criteria
- [ ] Locally, `seed:demo` gives every demo project except the "not started" ones 1–4 past visits with notes and the seeding user as attendee, and at least one visit per demo customer a reading of the published `Site inspection (demo)` form whose values pass `reading-values.ts`. → unit tests on `buildDemoPlan`; local run by hand (output in the PR).
- [ ] A local rerun replaces the demo visits and readings with the demo customers, reuses the form, and changes nothing outside the demo customers. → local run by hand: count rows before and after (in the PR).
- [ ] `--deploy` skips with exit 0 and a notice for: no such account, no workspace, demo data already there (deleted demo customers count). → unit tests on the deploy-mode decision; local runs by hand.
- [ ] `--deploy` refuses with exit 1, writing nothing, when the account is in more than one workspace, isn't its workspace's admin, shares it with another member, or `--workspace` is given. → unit tests on the decision.
- [ ] `--deploy` output holds no email, workspace name or connection string. → unit test on the messages; the CI run's log.
- [ ] The `Seed demo data` step runs only on pushes to `main` with `DEMO_EMAIL` set, after the shell is deployed; a seed failure leaves the run's deploy steps green (`continue-on-error`). → review of `deploy.yml`; the first `main` run after merge.
- [ ] On the deployed app, the demo account shows the whole flow on at least one project: customer → sub-company → site → project with tasks, a visit and a reading from the seed, plus a photo and a report the owner uploaded by hand. → check by hand.
- [ ] The seed ran through CI (the run is linked here) and a later `main` run skipped it; nothing was changed on the deployed database by hand. → links in the Progress log.

## Approach (brief)
- `features/demo/seed-plan.ts`: the demo form's fields and, per project, its visits (day offset, notes, reading values or none), all from `buildDemoPlan(now)`, so they are unit-tested like the tasks.
- `features/demo/` gains a pure deploy-mode decision, e.g. `decideDeploySeed({ userFound, memberships, members, demoCustomers, workspaceFlag })` → `seed | skip(reason) | refuse(reason)`, with the notice texts, so every branch is unit-tested without a database.
- `scripts/seed-demo.ts`: parse `--deploy`, query the inputs, apply the decision, then insert form (if new), visits, visit members and readings in the existing transaction. Exit codes as above.
- `deploy.yml`: the step as in the scope. No ADR: no new identity, nothing hard to reverse.

## Test plan
- Acceptance: none (no visible app behavior; the `@poc` scenario of task 069 covers the flow itself).
- Unit: `seed-plan.test.ts` extends (visits only on started projects, past days only, a reading per customer, reading values accepted by `reading-values.ts`'s parser for the plan's fields); a new test for the deploy-mode decision (each skip, each refusal, seed) and that its messages hold no email or workspace name.
- Local by hand (output pasted in the PR): `seed:demo` on a fresh local account; a rerun; `--deploy` on a fresh account (seeds), again (skips: demo data exists), with an unknown email (skips), with an account in two workspaces (refuses).
- CI: the first `main` run after merge with `DEMO_EMAIL` set (seeds, or skips if the owner hasn't signed up yet), then a later run (skips). Links in the Progress log.
- By hand: sign in as the demo account on the `main` URL, upload a photo on a seeded visit and a report on its project, and walk customer → sub-company → site → project → visit → reading → photo → report.

## Open questions (for the owner)
1. **How does the seed reach the deployed database?** **Answered 2026-11-07: (a)**, a step in `deploy.yml`, on `main` deploys only, after the migrations, that runs `seed:demo --email "$DEMO_EMAIL"` when `DEMO_EMAIL` is set and only when the demo workspace has no demo data yet. No Terraform change and no new identity.
2. **Photos and a report in the seed?** **Answered 2026-11-07: no files in the seed.** The owner uploads one photo and one report on the demo project by hand through the app.
3. **Which email is the demo account?** **Answered 2026-11-07:** an address the owner controls, set by the owner as `DEMO_EMAIL` in the repository settings (a secret, question 4); never committed.
4. **A repository secret rather than a repository variable for `DEMO_EMAIL`?** **Answered 2026-11-07: a repository secret**, as recommended. The repository is public, and so are its Actions logs. GitHub prints a step's `env:` values and its script (with `${{ vars.… }}` filled in) at the top of the step's log, and doesn't mask variables, so a `DEMO_EMAIL` *variable* would show the demo login in every `main` run's log; `::add-mask::` only hides it from later lines. A *secret* of the same name is masked everywhere and costs nothing else (the step tests it in the shell instead of in `if:`). **Recommended default:** set `DEMO_EMAIL` as a repository secret. Alternative: keep the variable and accept the email in public logs.

## Progress log
- 2026-11-07 – Split from task 069: the demo data on the deployed app needs a decision on how a seed reaches the deployed database through CI, which doesn't belong in 069's e2e change. Three open questions for the owner, each with a recommended default.
- 2026-11-07 – The owner answered questions 1–3 with the recommended defaults: route (a) (a step in the `main` deploy, no Terraform), no files in the seed, an owner-controlled address in `DEMO_EMAIL`. Scope made concrete: `seed:demo --deploy` (skip when not signed up / no workspace / demo data exists; refuse anything but a single-member workspace the account administers; no personal data in the output), a `continue-on-error` step after the shell deploy with `DB_POOL_MAX=1`. New question 4: a public log would show a `DEMO_EMAIL` variable, so a secret is recommended.
- 2026-11-07 – The owner answered question 4: `DEMO_EMAIL` is a repository secret (masked in the public Actions logs). Ready.
- 2026-11-07 – Started in lane 2 (`chore/deployed-demo-data`).

## Parking lot
- Reset the demo account's data from CI (a "reseed" flag), if the owner wants a clean demo before each showing. Until then, a reseed means a new demo account (a new `DEMO_EMAIL`) or a local-style delete that this task doesn't provide.
- A shared helper for starting the Cloud SQL proxy in `deploy.yml`, if the implementer doesn't do it here.
- Seeding a photo and a report (needs a grant for main's deployer on the main bucket, a Terraform change).
