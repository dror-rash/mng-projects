# Task 074: A separate runtime login for the database

- **Status:** done (PR #85); follow-up task 109 removes the transition grants
- **Milestone:** M11 Deploy to GCP (follow-up)
- **Zone / package:** `infra/`, `.github/workflows/`, `packages/db`, `docs/adr/`
- **Feature file:** none (no visible behavior); checked by the runtime role check and DB tests
- **Depends on:** task 068 (first GCP deploy, its runtime role check and preview identities)

## Why
On `main` the app connects with the login that owns the tables (`app`) and switches to `app_user` on connect (`-c role=app_user`, ADR-0006). Because that login owns everything, a single `SET ROLE <owner>` (or `RESET ROLE`) on a pooled connection would leave row-level security behind for as long as that connection lives. A runtime login that owns nothing and can only become `app_user` closes that door: there is nothing better to switch to. Found in task 068's review (2026-11-04). Previews already work this way since task 068 (`preview_runtime`, created by `infra/scripts/provision-db-logins.mjs`); this task does the same for `main`.

## Scope
- **ADR-0006 amendment:** the runtime uses its own Cloud SQL login. This reverses the alternative ADR-0006 turned down ("A separate Cloud SQL login user for the runtime"); record why (the `SET ROLE` escape above).
- **Main's runtime login:** a `LOGIN` role that owns no objects and whose only role membership is `app_user` (with `SET` only), with `CONNECT` to `app` only, so it can take `app_user` on connect and nothing else. Created and granted by `infra/scripts/provision-db-logins.mjs` on deploy, like `preview_runtime` (a Terraform `google_sql_user` would be a member of `cloudsqlsuperuser`). Migrations, seeds and the maintenance connection keep the owner login.
- **Terraform (`infra/`):** only the new login's password, generated into a new Secret Manager secret readable by main's runtime identities and the deployer.
- **Names and deploy:** `infra/scripts/environment.sh` points main's `DB_LOGIN` and `DB_PASSWORD_SECRET` at the new login, so Cloud Run services and the role check use it; the migrate step keeps the owner login. Previews are unchanged.
- **Runtime role check (`infra/scripts/check-runtime-role.mjs`):** one more check on top of task 068's: `SET ROLE` to the owner login fails on a runtime connection (for both environments).
- **`packages/db`:** the pool keeps `-c role=app_user` and `assertRole`; only the credentials it is given change.

## Out of scope
- Splitting the preview and production deployer accounts (task 068 parking lot).
- Forcing row-level security on the owner (ADR-0006, task 047 amendment stays).
- Changing the access functions or policies.

## Acceptance criteria
- [ ] On Cloud SQL (main), the runtime connection's `session_user` is the new runtime login, not `app`, `current_user` is `app_user`, and the role check passes.
- [ ] On a runtime connection, `SET ROLE` to the owner login fails.
- [ ] The role check fails on purpose when the runtime connects with the owner login.
- [ ] ADR-0006 has an amendment recording the separate runtime login and the reason.
- [ ] `terraform plan` shows no changes after apply.

## Approach (brief)
Answer the open question first (below). Then: add the secret in Terraform, extend `provision-db-logins.mjs` (and its test) with main's runtime login, switch main's names in `environment.sh` (and its test), add the `SET ROLE` check to the role check (and its test), amend ADR-0006.

## Test plan
- Script tests: `provision-db-logins.test.mjs` (main's login owns nothing, `SET`-only member of `app_user`, `CONNECT` to `app` only), `check-runtime-role.test.mjs` (a runtime connection that can `SET ROLE` to the owner fails), `test-environment.sh` (main's new names).
- A DB test: on a connection as the runtime login, `SET ROLE` to the owner fails.
- By hand on the first preview after the change: the deploy's role check output.

## Open questions
1. Local dev and CI: do they also connect with a separate runtime login (closer to production, more `.env` setup), or keep one login locally?

Answered by task 068's design (2026-11-04): the grant runs in a deploy script (`provision-db-logins.mjs`), not Terraform or a migration, because a Terraform `google_sql_user` is a member of `cloudsqlsuperuser`; previews need only their one login (`preview_runtime`).

## Progress log
- 2026-11-04 – Planned from task 068's review: the owner login plus `-c role=app_user` lets any `SET ROLE` on a pooled connection escape row-level security. After the POC.
- 2026-11-04 – Narrowed: task 068 already gives previews a runtime login that owns nothing (`preview_runtime`, granted by a deploy script), which answers the former questions on where the grant runs and how many preview logins. Left: main's runtime login and a `SET ROLE <owner>` check.
- 2026-11-10 – Started in lane 1 (owner: "do the rest of the P1"; merge after the POC demo on 2026-11-13). Open question 1 taken as: local dev and CI keep one login (the DB tests and the role check cover the separate login on Cloud SQL).
- 2026-11-10 – Red (`b7cebcc`, tests only on top of `49cf0d0`'s code, lane 1 database): `test-environment.sh` 43 passed, 5 failed (main's names); node tests (`check-runtime-role`, `provision-db-logins`) 59 passed, 13 failed of 72 (no `app_runtime`, no owner check); `test-preview-migrate.sh` 24 passed, 5 failed.
- 2026-11-10 – Green (`f60498f`): `app_runtime` provisioned on main deploys, the role check fails when the login is or can become an owner, `environment.sh` and Terraform (`db-runtime-password`, `runtime_transition_secrets`), ADR-0006 amendment, README rollout. `pnpm test:infra` all green (48, 14, 74, 29, 103), `test:db` 149, e2e 323 passed. `terraform plan`: 7 to add, nothing destroyed; the 6 in-place Cloud Run `scaling` updates are drift already on `main`.
- 2026-11-10 – Security review (no blockers). Fixes: the preview logins' `CONNECT` grants on `app_preview` and the revoke of `PUBLIC`'s run as one best-effort step, grants first (a skipped grant no longer locks previews out), and the preview verification needs their own grants, not `PUBLIC`'s; the role check also fails when the login can `SET ROLE` to any role but itself and `app_user`. Red: 4 failed of 76 node tests; green: `pnpm test:infra` 48, 14, 78, 29, 103.
- 2026-11-12 – Merged (PR #85) after the owner lifted the pre-demo hold (2026-11-11). The owner applied the `db-runtime-password` secret and grants; `main` now runs as `app_runtime` (deploy log: "Runtime role check passed on app (login app_runtime)"). Rollout step 4 (drop `runtime_transition_secrets`) is task 109; SEC-06 stays partly fixed until it's applied.

## Follow-up
- Rollout step 4 (`infra/README.md`, "Main's runtime login: rollout"): remove `runtime_transition_secrets` from `infra/main.tf` in a separate small PR within a week of the rollout, and apply it (3 IAM grants removed). Until then a compromised `main` container can still read `db-password`, the owner's password, so SEC-06 stays partly open.
- The comment on `RUNTIME_ROLE` in `packages/db/src/pool-config.ts` still says the login is the owner; it needs updating (the infra agent may not edit `packages/`).

## Parking lot
- (none yet)
