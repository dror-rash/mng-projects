# Task 110: Rebuild the shared preview database, and keep PR migrations from skipping `main`'s

- **Status:** in-progress
- **Milestone:** cross-cutting (infra), M11 follow-up
- **Zone / package:** owner steps on GCP through Terraform (`infra/`, no code change for the rebuild); `infra/README.md` (a runbook section); `docs/WORKFLOW.md` (the migration rule, if question 1 picks it). Commit type `docs:` for the runbook; any check that question 1 adds gets its own `test(infra)` → `fix(infra)`/`ci:` commits.
- **Feature file:** none (no app behavior; the preview deploy's migration, role check and `@smoke` run are the check)
- **Depends on:** nothing open. Blocks task 085's hand check on real Cloud Storage and every PR preview.

## Why
Every PR preview deploy stops at the runtime role check, so no PR gets a preview, `@smoke` or `@poc` run, and task 085's size cap can't be checked on real Cloud Storage. The cause: the shared preview database `app_preview` ran early drafts of tasks 088 and 087 as migration `0040`, with journal timestamps later than `main`'s real `0040_rate_limit` and `0041_rate_limit_last_request`. `drizzle-kit migrate` applies only migrations newer than the last one it recorded, so it skipped those two: `rate_limit` doesn't exist on `app_preview`, and the role check (pinned tables, task 089) fails. `main`'s database `app` is unaffected.

## Scope
1. **Rebuild (owner):** from `infra/` on `main`, `terraform plan -replace='google_sql_database.databases["app_preview"]' -target='google_sql_database.databases["app_preview"]' -out=tfplan`. Expect `1 to add, 0 to change, 1 to destroy` (the target leaves task 091's and 092's unapplied changes and the known `scaling` drift alone). `terraform apply tfplan`, then `rm tfplan` (a saved plan holds secrets in plain text; `tfplan` is git-ignored).
2. **Re-provision (owner):** a `main` deploy. `deploy.yml` runs only on a push to `main` (no `workflow_dispatch`), so either re-run the latest `main` **Deploy** run (`gh run rerun <run id>`) or merge the next PR. Expect the "Database logins provisioned" line and no `::warning::Preview login step skipped`.
3. **Check (owner or implementer):** re-run one open PR's **Deploy** run. Expect `provision-db-logins.mjs --verify-only` to pass, the migration to apply `0000` through `0044` on the empty database, "Runtime role check passed on app_preview (login preview_runtime)", and `@smoke` green. Then task 085's hand check can run.
4. **Runbook:** `infra/README.md` gets "Rebuilding the preview database": when (a preview's role check or migration fails on drift; never `app`), steps 1–3, and what is lost (every preview account and record; previews hold no real data).
5. **Prevention:** whatever the owner picks in question 1, documented in `docs/WORKFLOW.md` or `infra/README.md`.

### Why steps 1–3 are enough (read from `deploy.yml` and `infra/scripts/provision-db-logins.mjs`)
- The logins `preview_owner` and `preview_runtime` and their `app_user` memberships are cluster-wide roles: they survive the drop.
- What the drop loses is per database: `CONNECT` and `CREATE` on `app_preview` for the preview logins and the owner, `PUBLIC`'s revoked `CONNECT` and `TEMPORARY`, and `USAGE`, `CREATE` on its `public` schema. A `main` deploy's provisioning grants all of them again (idempotent): the database grants on its connection to `app`, the schema grant on `app_preview` as `app`, which may grant on a schema owned through `cloudsqlsuperuser` (the new database's owner, as Terraform-created databases are).
- Until that `main` deploy runs, previews fail at `--verify-only` ("has no CONNECT grant of its own"), by design. Nothing touches `app`.
- On the empty database the PR's own migration rebuilds every object as `preview_owner`, so the role check's ownership pins hold. Migration 0020's `GRANT app_user TO current_user` works (provisioning gives `preview_owner` ADMIN on `app_user`); 0025's `REVOKE TEMPORARY` only warns (`preview_owner` doesn't own the database; provisioning already did it).
- To confirm while doing it: Cloud SQL refuses to drop a database with open connections. If step 1's apply fails on that, wait for the preview services to scale to zero (or let the owner stop the open PR's tagged revisions) and apply again.

## Out of scope
- Any change to `app` or its migrations.
- Per-PR databases or a pooler (question 1's option C is its own task if chosen).
- Task 085's hand check itself (it stays in task 085).

## Acceptance criteria
- [ ] `terraform plan` for step 1 shows only the `app_preview` replacement (output in the PR).
- [ ] The `main` deploy after it provisions the preview logins with no skipped-step warning.
- [ ] A PR's preview deploy passes its migration, the runtime role check and `@smoke`.
- [ ] `infra/README.md` has the rebuild runbook.
- [ ] The prevention the owner chose in question 1 is written down (and, for option B or C, checked by a test).

## Security notes
Drops and recreates the preview database only (throwaway data, register SEC-40). The `-replace` and `-target` addresses must name `app_preview`: replacing `databases["app"]` would delete production. The owner runs it; no agent applies Terraform. No grant widens: provisioning re-creates the same grants. The `security-reviewer` runs if question 1 adds a check in `deploy.yml` or `infra/scripts/`.

## Approach (brief)
Owner steps 1–3, then the runbook and the chosen prevention. No ADR for the rebuild; option C (per-PR databases) would need one.

## Test plan
- Acceptance: none new; the preview deploy's `@smoke` after step 3.
- Scripts: only if question 1 picks B (a red test for the divergence check with a recorded history that skips a migration) or C.
- By hand: the plan output and the two deploy logs.
- Storybook: none.

## Open questions
1. **How do PRs avoid this drift from now on?** All previews share `app_preview`, and a draft migration a preview has run stays recorded there with its timestamp. Options:
   - **A. A rule only:** a PR's migration is regenerated (fresh number and journal `when`) on top of the latest `main` right before its first preview runs and again before merge, and made idempotent (`IF NOT EXISTS`, `OR REPLACE`) if an earlier draft already ran there (what task 087 did). Cheap, but relies on agents and reviewers remembering it; two open PRs with migrations can still collide.
   - **B. A rule plus a check:** the preview deploy compares the PR's migration journal with what `app_preview` recorded and fails with a clear message ("a migration older than one already applied would be skipped: rebuild the preview database, task 110 runbook") instead of skipping silently. Turns the next drift into a one-line diagnosis; the fix is still this runbook.
   - **C. Previews stop sharing one database:** one database per PR (created by a `main`-side step, dropped by `preview-cleanup.yml`), so drafts never meet. Removes the problem, but needs the grants per database, a connection budget per PR on `db-f1-micro`, and an ADR.
   Default if the owner doesn't choose: **B** (the rule from A, plus the check), as its own small follow-up task after the rebuild.

## Progress log
- 2026-11-12 – Drafted at the P1 wrap-up: previews stop at the runtime role check since tasks 088's and 087's drafts ran on `app_preview` as `0040`.
- 2026-11-14 – Owner rebuilt `app_preview` (targeted plan 1/0/1). `main` Deploy re-run (43560341783, attempt 2): "Preview side ok: app_preview's schema grant made, preview logins verified." Runbook added to `infra/README.md`; this PR's preview deploy is the step-3 check. Question 1: default B, as a follow-up task.

## Parking lot
- (none yet)
