# Task 092: Alerts for risky changes, errors and spend

- **Status:** in-review
- **Milestone:** cross-cutting (security), M11 follow-up
- **Zone / package:** a new `infra/monitoring.tf`, `infra/variables.tf` (alert email, billing account, budget amount), `infra/terraform.tfvars.example`, `infra/README.md`. Commit type `feat(infra)`.
- **Feature file:** none (no app behavior; `terraform plan` and one test alert by hand)
- **Depends on:** task 068 (project and services: done). Related: task 091 (connection budget).

## Why
Nothing tells the owner when someone changes IAM, creates a service-account key, deploys outside CI, when `main` starts failing, when the database runs out of connections, or when spend jumps. An attack or an outage would be noticed only by a user. Register **SEC-17**.

## Scope
All in Terraform (applied by the owner, rule 10):
- **Notification channel:** one email channel to `var.alert_email` (question 1). The address lives in the owner's `terraform.tfvars`, never in the repo; `terraform.tfvars.example` gets a placeholder.
- **Log-based alerts** (each a log-match alert policy, at most one notification per 5 minutes per policy):
  - IAM policy changes on the project, a service account or a secret (`SetIamPolicy`);
  - service-account key creation (`CreateServiceAccountKey`);
  - Cloud Run service changes (deploy, update, delete) by anyone other than the two deployer service accounts.
- **Metric alerts:**
  - `main` 5xx responses: more than 5% of requests over 5 minutes, per `main` service (question 2);
  - Cloud SQL connections: the instance's backends above 80% of its connection limit (`db-f1-micro`: 25, 3 reserved) for 5 minutes.
- **Budget:** a billing budget on the project with alerts at 50%, 90% and 100% of `var.monthly_budget` (question 3), emailing the billing admins (and the channel above if the API allows); enables the Billing Budget API (`billingbudgets.googleapis.com`) through the existing `google_project_service` list. `var.billing_account` in tfvars.
- `infra/README.md`: what alerts exist and what to do first for each.

## Out of scope
- Paging or chat channels (email only).
- Data Access audit logs and container scanning (SEC-32, P2).
- Uptime checks.
- Alerts for previews.

## Acceptance criteria
- [ ] `terraform plan` adds only the channel, the alert policies, the log filters, the budget and the API enablement (output in the PR, with the email and billing account redacted).
- [ ] After the owner applies it: a test notification from the channel reaches the owner (the console's "Send test notification"), noted in the PR.
- [ ] A harmless test change that matches one log alert (e.g. adding and removing a label on a preview service by the owner, not the deployer) raises that alert once; noted in the PR.
- [ ] `terraform.tfvars.example` and `infra/README.md` updated; no address or billing id in the repo.

## Security notes
Touches `infra/`, so the `security-reviewer` runs. Adds monitoring only; no access for the app or the deployers changes. The deployers must not be able to change or delete the alert policies (they don't hold monitoring roles today; the PR confirms). Alert emails carry resource names and principals, not data. Fixes register gap **SEC-17**.

## Approach (brief)
Write `monitoring.tf` with the resources above, check the log filters against real entries in the project's logs (read-only queries), `terraform plan`, owner applies and sends test alerts. No ADR.

## Test plan
- Acceptance: none.
- Infra: `terraform validate`, `plan`; the two hand checks after apply.
- Storybook: none.

## Open questions
1. **Where should alerts go?** Default: the owner's email (set in `terraform.tfvars`).
2. **5xx threshold:** default more than 5% over 5 minutes on any `main` service.
3. **Monthly budget amount** (the review couldn't read the billing account). Default: the owner sets it in `terraform.tfvars`; no default in code. Needed before apply.
4. **Who may apply the budget:** creating a budget needs Billing Account permissions the project Owner may not have on the billing account. Default: the owner applies it with their own account; if it fails, the budget resource moves to its own small follow-up.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-17); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 7 (owner: "do the rest of the P1"; merge after the POC demo on 2026-11-13). Owner answers: budget USD 25/month (set in `terraform.tfvars`, not in the repo); alerts to the owner's email (in `terraform.tfvars`); other questions take their defaults.
- 2026-11-10 – Red: `infra/scripts/test-monitoring.sh` (91 checks with probes: channel, five policies, budget, tfvars-only `sensitive` variables, no address or billing id in `infra/`). Then `infra/monitoring.tf`, the three variables, `terraform.tfvars.example`, the two APIs, README section "Alerts and budget"; the test runs in CI and `pnpm test:infra`. Log filters checked read-only against the project's Admin Activity log: `SetIamPolicy` on the project, service accounts (`SetIAMPolicy`), secrets, Cloud Run and Artifact Registry, and `storage.setIamPermissions`; the deployers' 207 `ReplaceService` entries in 30 days fall outside the Cloud Run alert, the owner's 6 `CreateService` inside. The deployers hold only `roles/cloudsql.client` on the project (no Monitoring or Billing role). `terraform plan` (placeholder `-var` values for the three new variables, not yet in the owner's tfvars): 9 to add (channel, 5 policies, budget, 2 APIs), 6 to change (pre-existing drift on the Cloud Run services' service-level `scaling` block, not this task), 0 to destroy. The budget uses an aliased provider (`google.billing`, `user_project_override`): the Billing Budget API needs a quota project with user credentials. Cost: budgets, the channel and the audit-log alerts are free; Cloud Monitoring's alerting charge, if in effect, about US$0.50/month for 5 conditions.
- 2026-11-10 – Security review fix loop (no blockers). Red first (table test and new checks), then: **bug found** — the key and Cloud Run filters had `\\.` in a heredoc, which Terraform keeps as written and Cloud Logging reads as a literal backslash, so they matched nothing (checked: the rendered filter returned 0 entries, `\.` matched). The regexes now live in `local.log_alert_methods` with `[.]` for dots; the test refuses backslashes and runs each regex (Perl) against method names it must and must not match (`GetIamPolicy`, `cloudsql.instances.connect`, …). New log alert "Security config changed" (Workload Identity pool/provider, custom roles, HMAC keys, secret versions and deletes, Cloud SQL users and instance updates, Run jobs, log sinks/exclusions, bucket updates, alert policy and channel updates/deletes), not excluding the deployers. `main_5xx` gets a second condition (at least 3 5xx per service per 5 minutes, `AND_WITH_MATCHING_RESOURCE`). The SQL threshold comes from `local.sql_max_connections[var.db_tier]` with a precondition for unknown tiers. README: the Run alert's deployer exclusion (WIF + ruleset are the guard; relies on SA impersonation), and plan needing Billing Account Viewer once the budget exists. Every rendered filter from the plan was run read-only against the audit log and matches the expected entries. `test-monitoring.sh` 189 checks. `terraform plan`: 10 to add (channel, 6 policies, budget, 2 APIs), 6 to change (the same pre-existing `scaling` drift), 0 to destroy. Cost: about US$0.70/month for 7 conditions if Cloud Monitoring's alerting charge is in effect.

## Owner steps (after merge)
1. Add to `infra/terraform.tfvars` (git-ignored): `alert_email = "<your address>"`, `billing_account = "<XXXXXX-XXXXXX-XXXXXX>"` (from `gcloud billing projects describe mng-projects-poc`), `monthly_budget = 25`.
2. `cd infra && terraform plan` (expect 10 to add: channel, 6 policies, budget, 2 APIs; and 6 to change: the Cloud Run services' `scaling` drift, not this task), then `terraform apply` with your own account. The budget needs Billing Account Administrator or Costs Manager on the billing account; if only `google_billing_budget.monthly` fails on permissions, note it here and it moves to a follow-up.
3. Monitoring → Alerting → Edit notification channels → "Owner email (alerts)" → Send test notification; note in the PR that it arrived.
4. As yourself (not a deployer), add and then remove a label on a preview service (console: Cloud Run → `dashboard-preview` → Labels). Expect one "Cloud Run service changed outside CI" email (a second within 5 minutes is rate-limited); note it in the PR. Your apply in step 2 may already send IAM and Cloud Run emails.

## Parking lot
- Uptime checks on the `main` URL.
- Alerts on preview spend or preview database connections.
