# Task 109: `main`'s runtime no longer reads the owner's database password

- **Status:** todo
- **Milestone:** cross-cutting (security), M11 follow-up
- **Zone / package:** `infra/main.tf` (`runtime_transition_secrets` and its use in `google_secret_manager_secret_iam_member.runtime_reads_secrets`), `infra/README.md` (the identity table note and "Main's runtime login: rollout"), an `infra/scripts/` test. Commit types `test(infra)` → `fix(infra)`.
- **Feature file:** none (no app behavior; a script test, `terraform plan` and a read-only check after apply)
- **Depends on:** task 074 (done, PR #85; `main` runs as `app_runtime` since its first deploy after the merge). Due within a week of that rollout (task 074, "Follow-up": by 2026-11-19).

## Why
Task 074 moved `main`'s runtime to `app_runtime`, a login that owns nothing. During the rollout its three runtime identities kept read access to `db-password`, the owner login's password, so a revert would still start. Until that grant goes, a compromised `main` container can read the owner's password and connect as the owner, which is the row-level-security bypass task 074 closed. Register **SEC-06** stays "partly fixed" until this is applied.

## Scope
- Remove `runtime_transition_secrets` from `locals` in `infra/main.tf`, and its `lookup(...)` from `runtime_reads_secrets`, so each runtime identity reads only its environment's `db_secret` and `auth_secret`. Update the comment above that resource.
- A script test (red first, in `infra/scripts/test-environment.sh` or a sibling CI already runs) that fails when any runtime identity is granted an environment's `migrate_secret` (`db-password`, `db-preview-owner-password`), read from `main.tf`, not a copy of the names.
- `infra/README.md`: drop the "until the rollout below is finished" note in the identity section; mark rollout step 4 done; the revert note says reverting task 074 now also needs the grant back (this task reverted first).
- `terraform plan` in the PR: exactly 3 to destroy (the `<zone>/main/db-password` grants of `shell`, `example-zone` and `dashboard`), plus the known service-level `scaling` drift (task 068) and anything still unapplied from tasks 091 and 092 if the owner hasn't applied those yet (name them in the PR).

## Out of scope
- Rotating `db-password` (the runtime never logged in as the owner after the rollout; rotating is a separate decision, see "Open questions").
- Dropping `app_runtime` or any database change.
- The comment on `RUNTIME_ROLE` in `packages/db/src/pool-config.ts` (task 074 "Follow-up"; a `packages/` change, not this infra task).
- `deployer-main`'s read of `db-password` (it migrates as the owner; needed).

## Acceptance criteria
- [ ] The script test fails while a runtime identity can read `db-password`, and passes after the change.
- [ ] `terraform plan` shows the 3 `runtime_reads_secrets` grants on `db-password` destroyed and nothing else of this task's (output in the PR).
- [ ] Before apply, every `main` service's serving revision uses `DB_USER=app_runtime` and `db-runtime-password` (read-only `gcloud run services describe`, in the PR).
- [ ] After the owner applies, `gcloud secrets get-iam-policy db-password` lists no `*-runtime` identity, and the next `main` deploy passes ("Runtime role check passed on app (login app_runtime)").

## Security notes
Touches `infra/` IAM on a production secret, so the `security-reviewer` runs. Removes access only. Risk: a `main` revision that still reads `db-password` would fail to start new instances; the precondition check covers it. Closes the rest of register gap **SEC-06**.

## Approach (brief)
Red script test, then the `main.tf` change, README, `terraform plan`. The owner applies (targeted at the three grants, or in full if the plan shows nothing unexpected). No ADR (task 074's ADR-0006 amendment already planned this step).

## Test plan
- Acceptance: none.
- Scripts: the new check, with a probe that re-adds the grant and fails it.
- By hand: `terraform plan`; the read-only checks above.
- Storybook: none.

## Open questions
1. **Rotate `db-password` afterwards?** Default: no. The runtime held read access but never used it after the rollout; rotating means a new secret version and a `main` deploy, and is worth it only if the owner suspects a container was compromised.

## Progress log
- 2026-11-12 – Drafted from task 074's follow-up (rollout step 4) at the P1 wrap-up.

## Parking lot
- (none yet)
