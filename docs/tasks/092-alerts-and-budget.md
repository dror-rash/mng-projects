# Task 092: Alerts for risky changes, errors and spend

- **Status:** in-progress
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

## Parking lot
- Uptime checks on the `main` URL.
- Alerts on preview spend or preview database connections.
