# Task 091: `main` can't scale past its database connections

- **Status:** in-review
- **Milestone:** cross-cutting (security), M11 follow-up
- **Zone / package:** `infra/variables.tf` (`max_instances`), `infra/scripts/test-environment.sh` (a budget check), `infra/README.md` ("Known limits"). Commit type `fix(infra)`.
- **Feature file:** none (no app behavior; a script test and `terraform plan`)
- **Depends on:** task 075 (`DB_POOL_MAX`: done). Related: task 074 (a runtime login with its own `CONNECTION LIMIT`, after the POC) and task 092 (a connections alert).

## Why
Each `main` zone can scale to 5 Cloud Run instances, each opening up to 4 database connections, against the 12 connections `main` has on `db-f1-micro`. A burst of traffic, signed in or not, can scale the zones up until new connections fail, and then every page that touches the database errors for everyone ("too many connections"). Capping instances at what the budget holds turns a burst into slower responses instead of an outage. Register **SEC-14**.

## Scope
- `var.max_instances` default (used for `main` only; previews have `preview_max_instances`) set so that zones that use the database × `max_instances` × `MAIN_DB_POOL_MAX` fits `main`'s share (question 1). With today's numbers: **1** (3 × 1 × 4 = 12), which is also the README's working assumption ("1 busy instance").
- The variable gets a description saying why, pointing to `environment.sh` and `infra/README.md`.
- `infra/scripts/test-environment.sh` (or a sibling test run by CI) fails when `max_instances` × zones × `MAIN_DB_POOL_MAX` exceeds `main`'s connection share as documented (red first, against today's default of 5). The numbers come from `variables.tf` and `environment.sh`, not copies.
- `infra/README.md` "Known limits": the new cap, what a burst does now (Cloud Run queues and may answer 429 when the one instance is full), and when to raise it (a bigger tier or a pooler).
- `terraform plan` in the PR: only the three `main` services' scaling changes.

## Out of scope
- A connection pooler or a bigger Cloud SQL tier.
- A `CONNECTION LIMIT` on `main`'s runtime login (task 074).
- Whether `example-zone` needs a database connection at all (task 074 asks it; if it drops out, the budget allows more).
- Alerting (task 092).

## Acceptance criteria
- [x] The budget test fails with today's `max_instances = 5` and passes with the new default.
- [ ] `terraform plan` shows only `max_instance_count` changing on the three `main` services (output in the PR).
- [ ] After the owner applies it, the next `main` deploy passes and the services show the new maximum (`gcloud run services describe`, read-only, in the PR).
- [x] `infra/README.md` "Known limits" updated.

## Security notes
Touches `infra/` (production services), so the `security-reviewer` runs. No data or roles change. The trade-off is availability under real load: one instance per zone (Cloud Run's default concurrency of 80 requests) is enough for the POC and early use; the README says when to revisit. Applying it creates new revisions of the `main` services, which is why it waits until after the POC. Fixes register gap **SEC-14**.

## Approach (brief)
Red: the budget check in the script test. Then the default, the description, the README. `terraform plan`, owner applies. No ADR.

## Test plan
- Acceptance: none.
- Scripts: the budget case in `infra/scripts/test-environment.sh` (CI `verify` already runs it).
- By hand: `terraform plan`; the service's max instances after apply.
- Storybook: none.

## Open questions
1. **Cap at 1 per zone, or 2 per zone with `MAIN_DB_POOL_MAX` 2?** Default: 1 × pool 4 (same total, fewer cold starts; one instance handles many requests at once). 2 × 2 gives redundancy at the same connection count but halves each instance's pool.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-14); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 5 (owner: "do the rest of the P1"; build now, merge after the POC demo on 2026-11-13). Q1 default (1 instance × pool 4).
- 2026-11-10 – Red: `test-environment.sh` checks zones (3, `variables.tf`) × `max_instances` (`variables.tf`) × `MAIN_DB_POOL_MAX` (4, `environment.sh`) against the new `MAIN_DB_CONNECTIONS` (12, `environment.sh`); `provision-db-logins.test.mjs` ties that share to 22 − the preview limits. Failed with 3 × 5 × 4 = 60 > 12. Green: `max_instances` default 1 with a description. `terraform plan`: 0 add, 6 change, 0 destroy (`max_instance_count 5 -> 1` on the three `main` services; the other changes are the known service-level `scaling` drift, present without this change too). `pnpm test:infra` passes. Today the `main` services show max 5, concurrency 80. Waits for the owner's apply (steps above).
- 2026-11-10 – Review fixes. Plan re-run from lane 5's `infra/` (the earlier saved plan was overwritten by lane 4's): 0 add, 6 change, 0 destroy, `max_instance_count 5 -> 1` on `dashboard`, `example-zone` and `shell`, the rest the known `scaling` drift. `test-environment.sh` also checks that `main.tf` maps `main` to `var.max_instances` and previews to `var.preview_max_instances` (red without the check; probes with a hard-coded and a swapped mapping fail it). Variable description and README: change the default, don't override it in `terraform.tfvars`. README: the cap is per revision (deploy overlap), requests past the pool wait with no checkout timeout, 429s past about 80 in flight. Owner step 2: task 083's provider change if it isn't applied.

## Owner steps (after the POC demo on 2026-11-13)
1. Merge the PR once `verify` passes (no app change; the `main` deploy that follows changes nothing on its own: deploys keep the template's scaling).
2. From `infra/` on the merged `main`: `terraform plan`. Expect `Plan: 0 to add, 6 to change, 0 to destroy`: `template.scaling.max_instance_count 5 -> 1` on `shell`, `example-zone` and `dashboard`, plus the known cosmetic service-level `scaling` drift (`manual_instance_count`/`min_instance_count 0 -> null`) on all six services, which shows with or without this change (task 068). If task 083 (the WIF provider's `attribute_mapping`/`attribute_condition`) merged first and isn't applied yet, the plan also shows that provider's in-place change: apply 083 first (its own steps), or expect `0 to add, 7 to change, 0 to destroy`. Anything else: stop.
3. Apply that plan. It creates a new revision of each `main` service with its current image (the image is in `ignore_changes`), so expect a brief rollout.
4. Verify (read-only), for each of `shell`, `example-zone`, `dashboard`: `gcloud run services describe <zone> --region me-west1 --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"])'` prints `1` (it prints `5` today). Paste the output in the PR.
5. Trigger or wait for the next `main` deploy and check it passes (the acceptance criterion), and that the deployed revision still shows max `1`.
6. Register: SEC-14 to fixed.

## Parking lot
- A connection pooler or a bigger tier when real load arrives (`infra/README.md` "Known limits").
