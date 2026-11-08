# Task 091: `main` can't scale past its database connections

- **Status:** todo (after the POC)
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
- [ ] The budget test fails with today's `max_instances = 5` and passes with the new default.
- [ ] `terraform plan` shows only `max_instance_count` changing on the three `main` services (output in the PR).
- [ ] After the owner applies it, the next `main` deploy passes and the services show the new maximum (`gcloud run services describe`, read-only, in the PR).
- [ ] `infra/README.md` "Known limits" updated.

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

## Parking lot
- A connection pooler or a bigger tier when real load arrives (`infra/README.md` "Known limits").
