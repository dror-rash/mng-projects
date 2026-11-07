# Task 068: First GCP deploy (M11)

- **Status:** done
- **Milestone:** M11 Deploy to GCP (POC-critical, 2026-11-13)
- **Zone / package:** `infra/`, `.github/workflows/`, `packages/db` (runtime role check)
- **Feature file:** none new. The deployed app passes the `@smoke` scenarios (later `@poc`, task 069): `BASE_URL=<shell run.app URL> E2E_TAGS=@smoke pnpm test:e2e` against a PR preview. The full suite keeps running in CI's `e2e` job.
- **Depends on:** the owner's GCP project with billing (bootstrap steps in `infra/README.md`); ADR-0002, ADR-0006

## Why
The POC must run on the internet, not just on a laptop. Row-level security has never run on Cloud SQL, and that is the biggest open risk in the plan.

## Scope
- **Owner (by hand, once):**
  - `gcloud auth`, the project and billing;
  - the state bucket;
  - `backend.hcl` and `terraform.tfvars`;
  - the first `terraform apply`;
  - GitHub repository variables (`infra/README.md`).

  No custom domain: the shell's `run.app` URL is the app's origin.
- **Agent (`infra`):**
  - **Terraform:** a `dashboard` Cloud Run service if it's missing, and the GCS bucket for task 057 (planned in M13). The bucket's CORS must allow `PUT` and `GET` from the shell's origin with the headers `Content-Type` and `x-goog-if-generation-match` (task 059's uploads send both), and the runtime service account needs to sign URLs (`roles/iam.serviceAccountTokenCreator` on itself).
  - **Logs:** a log exclusion for invite-link paths (task 028 parking lot).
  - **Artifact Registry:** a cleanup policy that keeps the 10 newest versions of each image and deletes any version (tagged or not) older than 30 days.
  - **Preview identities (same project):** previews don't share main's identities.
    - A `dashboard-preview` runtime service account with object access to the preview bucket only. Main deploys pass `--service-account` explicitly too.
    - A preview database login that can `CONNECT` only to `app_preview` (`REVOKE CONNECT ON DATABASE app FROM PUBLIC`).
    - A separate preview Better Auth secret.
  - **Two deployers (owner, 2026-11-04):**
    - main's deployer (`deployer-main`): usable only by a push to `main` (a Workload Identity Federation condition); acts as `*-runtime` service accounts only; reads `db-password` and, because it provisions the preview logins, the two preview database passwords; no auth secret;
    - the preview deployer (`deployer-preview`): used by PR runs; acts as `*-preview` service accounts only; reads the two preview database passwords only;
    - Workload Identity accepts only this repository, by name and by its numeric id (`github_repository_id`).
  - **Preview services and image repository (owner, 2026-11-04):** previews deploy to their own Cloud Run services (`shell-preview`, `example-zone-preview`, `dashboard-preview`) and push to their own repository (`images-preview`; main's is `images`). Each deployer deploys only to its environment's services and pushes only to its environment's repository. Deploys pin the image digest their build pushed (`deploy-service.sh` refuses a tag). `preview-cleanup.yml` removes a closed PR's `pr-<N>` tags.
  - **Deployer role:** a custom role `runDeployer` on the deployer's own services only: the `run.*` permissions of `roles/run.developer` that a deploy and a tag cleanup use, without `run.developer` itself (it includes SSH into running instances, whose environment holds the database password and auth secret), IAM policy changes, jobs or worker pools.
  - **Previews never touch the database `app` nor use the owner login:** a SQL-created `preview_owner` login runs the migrations on `app_preview`. Login provisioning (`infra/scripts/provision-db-logins.mjs`) runs only on `main` deploys: role and database statements on a connection to `app`, only the schema grant on `app_preview`. Previews verify the logins, then migrate. So one `main` deploy is needed before the first preview. The preview logins have connection limits (`preview_runtime` 6, `preview_owner` 3) and SCRAM-SHA-256 passwords. Main's steps on the preview side (and on the preview roles) are bounded by timeouts and best effort: they print `::warning::` and the main deploy goes on; only what protects `app` stays fatal.
  - **Migration lock:** migrations run under a Postgres advisory lock (`infra/scripts/with-db-lock.mjs`, shared with the provisioning's schema grant), so two PRs never migrate `app_preview` at once.
  - **Preview test output:** Playwright traces and reports from preview runs are not uploaded anywhere public (the repo is public).
  - **`deploy.yml`:** deploys all three zones and builds the shell with both zone URLs.
  - **PR:** shows the `terraform plan` output.
- **Runtime role check (risk from `PLAN.md`):** a script in `infra/scripts/` that the deploy workflow runs after `db:migrate`; it fails the deploy if any check fails. On a runtime connection:
  - `current_user = app_user`, and the login can use it: `pg_has_role(session_user, 'app_user', 'SET')`;
  - `app_user` is not a superuser and doesn't have `BYPASSRLS`;
  - no table in `public` is owned by a role whose privileges `app_user` has;
  - row-level security is enabled on every app table (the Better Auth tables excepted);
  - a probe: with `app.user_id` unset, `select count(*) from workspace` returns 0;
  - migration 0025's `REVOKE TEMPORARY … FROM PUBLIC` applied;
  - added in the review rounds: `app_user` can use no view, materialized view or `SECURITY DEFINER` function but the migrations' own (the views `customer_name` and `site_choice` pinned by a hash of their definition, the access functions by exact signature, so a redefinition or an overload fails), no table outside `public` (column-only grants count), and has no `TRUNCATE`, `TRIGGER` or `REFERENCES` on any table;
  - the check and the provisioning pin `search_path` to `pg_catalog, pg_temp` and call catalog functions schema-qualified, so functions planted by a PR's migration in `app_preview` never run in their place;
  - added in rounds 4–5: `infra/scripts/rls-pins.mjs` pins, by a hash of each definition as Postgres prints it (owners included), every function in non-system schemas, the views, every policy, the `SECURITY DEFINER` trigger functions, and each table's owner and RLS/`FORCE` flags; an added, changed or missing one fails, and so does any rule. A pin may list several hashes (one per Postgres minor that prints a definition differently).
- **CI:** `deploy` goes green on PRs (preview) and on `main`.

## Out of scope
- A custom domain, load balancer or IAP.
- A separate staging project.
- Email delivery (M10).

## Acceptance criteria
- [ ] `terraform plan` shows no changes after apply.
- [x] A PR gets a preview URL, and the `@smoke` scenarios (later `@poc`, task 069) pass against it. The full suite keeps running in CI's `e2e` job.
- [ ] `main` deploys, and an owner can sign up and see the dashboard on the `run.app` URL.
- [x] The runtime role check passes on Cloud SQL and is part of the deploy.
- [x] Requests with invite tokens are not in Cloud Run logs.
- [x] On the first preview, Better Auth sees a client IP: the shell's logs have no "Rate limiting could not determine a client IP".
- [x] On the preview, a file uploaded by hand downloads again (no `@smoke` scenario uploads).
- [ ] Previews run as their own service account, database login and Better Auth secret; the preview login can't connect to `app`.
- [ ] Preview Playwright traces and reports are not published.
- [x] A PR deploy can't read main's secrets or deploy as a `*-runtime` service account, shown on the first preview (for example the preview deployer's IAM bindings, or an access check that fails as expected).
- [x] Previews deploy to the `-preview` services from `images-preview`; the preview deployer can't deploy to main's services, push to `images` or read main's secrets. (IAM side checked 2026-11-05; the deploy side waits for the first preview.)
- [ ] Checked by hand on the first deploys (main, then the first preview):
  - on the first `main` deploy, record Cloud SQL's `server_version` here; if a pin in `infra/scripts/rls-pins.mjs` fails on it, add the hash the failure prints to that pin's list (don't replace the existing one);
  - `runDeployer` is enough to deploy, tag a revision and remove tags (the cleanup job);
  - every service runs the image by digest;
  - Cloud SQL accepts the preview logins' SCRAM-SHA-256 passwords;
  - Better Auth sees a client IP (criterion above);
  - an upload and download by hand on the preview (criterion above);
  - the preview deployer is refused on main's services, repository and secrets.
- [ ] The preview job never connects to the database `app`: it migrates `app_preview` as `preview_owner` and doesn't provision logins.

## Test plan
- The `@smoke` scenarios (later `@poc`, task 069) against the preview URL; the full suite in CI's `e2e` job, against local servers.
- The role-check script fails on purpose against a local connection that isn't `app_user`.
- By hand on the first preview: the shell logs (client IP), one upload and download, and that the preview deployer can't read main's secrets or act as a `*-runtime` account.

## Progress log
- 2026-11-02 – Planned for the POC. The owner confirmed GCP and no custom domain.
- 2026-11-04 – Started in lane 1 (`chore/first-gcp-deploy`), code part first while the owner bootstraps. Owner's answers: a new dedicated GCP project (not an existing one); region `me-west1`; two buckets, `<project_id>-files` (main, no lifecycle rule for the POC so soft-deleted files stay restorable) and `<project_id>-files-preview` (PRs, objects deleted after 14 days); Artifact Registry keeps the 10 newest images per zone and deletes untagged images older than 30 days; previews run a small tagged e2e set (`@smoke` now, `@poc` from task 069), not the full suite, which needs `AUTH_DISABLE_RATE_LIMIT` (rule 13). The preview acceptance criterion changes accordingly in its own docs commit.
- 2026-11-04 – Preview criterion changed (owner's decision above): previews run the `@smoke` set, not the full suite. The full suite signs up a new account in nearly every scenario from one IP, which production rate limits block without `AUTH_DISABLE_RATE_LIMIT`, and rule 13 forbids that flag on any deployment; many of its steps also read the database directly (`@repo/db/maintenance`), which a CI runner can't reach on Cloud SQL. `@smoke` tags four existing scenarios whose steps use only the app (no database or storage access) and sign up one account each: authentication "Visitor creates an account" and "One login works across zones", home-and-menu "Opening the home address signed out shows the login page, and logging in lands on the overview", customers "Create a customer with its details". No existing scenario creates a site or a project without the database (their steps find records with `myRecordId` or add a site through `@repo/db/maintenance`), so `@smoke` doesn't cover them yet; that is for `@poc` (task 069).
- 2026-11-04 – Review: Better Auth 1.7.10 allows 3 requests per 10 seconds on `/sign-up*` per IP and path, so "One login works across zones" left `@smoke` (3 sign-ups, 2 sign-ins remain).
- 2026-11-04 – Owner's decisions after review (now in Scope and the acceptance criteria):
  - previews get their own identities in the same project: a `dashboard-preview` runtime service account limited to the preview bucket (main passes `--service-account` explicitly too), a preview database login that can connect only to `app_preview` (`REVOKE CONNECT ON DATABASE app FROM PUBLIC`), and a separate preview Better Auth secret. Splitting the deployer accounts stays parked;
  - Artifact Registry keeps the 10 newest versions per image and deletes any version, tagged or not, older than 30 days (replaces "untagged only" above);
  - the runtime role check gets the stronger checks listed in Scope;
  - preview Playwright traces and reports are not uploaded publicly (the repo is public);
  - the first preview is checked by hand for a client IP in Better Auth (shell logs) and for one upload and download.
- 2026-11-04 – Follow-up planned: a separate runtime login role (amends ADR-0006's one login), task 074, after the POC.
- 2026-11-04 – Owner's decision after the re-review: split the deployers now (it was parked). Main's deployer only from a push to `main`, acting as `*-runtime` and reading main's secrets; the preview deployer from PR runs, acting as `*-preview` and reading the preview secrets. Previews never connect to `app` or use the owner login: `preview_owner` (created by SQL) migrates `app_preview`; logins are provisioned on `main` deploys only and previews only verify them, so the first preview needs one `main` deploy before it. ADR-0006 is unchanged.
- 2026-11-04 – Owner's decision: previews get their own Cloud Run services (`shell-preview`, `example-zone-preview`, `dashboard-preview`) and image repository (`images-preview`); each deployer deploys only to its own environment's services and pushes only to its own repository.
- 2026-11-04 – Review rounds 2–3, changes the implementer made beyond the decisions (now in Scope):
  - main's deployer also reads the two preview database passwords, because it provisions the preview logins;
  - images are kept apart by repository (and deployed by digest), not by a `main-` tag prefix;
  - the deployers get a custom `runDeployer` role without SSH (`roles/run.developer` includes root SSH into instances);
  - the role check covers views pinned by hash, exact definer-function signatures, column grants and `TRUNCATE`/`TRIGGER`/`REFERENCES`, and ignores planted functions through a pinned `search_path`;
  - `with-db-lock.mjs` serializes migrations (replaces the parked concurrency concern);
  - provisioning connects to `app` for roles and to `app_preview` only for the schema grant;
  - the preview logins have connection limits;
  - Workload Identity is pinned to the repository id as well as its name.

- 2026-11-05 – Review rounds 4–5 (infra commits d7205a6..43e85f8):
  - the role check pins every function in non-system schemas (not only definer ones), the views, every policy, the definer trigger functions, and each table's owner and RLS/`FORCE` flags (`infra/scripts/rls-pins.mjs`); it fails on rules and on missing objects; a pin accepts several hashes;
  - on `main` deploys, the steps on the preview side and on the preview roles are bounded and best effort (`::warning::`); only what protects `app` stays fatal, so nothing a PR does to `app_preview` can stall or fail `main`;
  - preview connection limits are now 6 (`preview_runtime`) and 3 (`preview_owner`), from the actual arithmetic;
  - CI's and `docker-compose.yml`'s Postgres are pinned to 16.15, the version the pins were computed on;
  - `pnpm test:infra` runs all the infra script tests locally;
  - the pool size follow-up (main's worst case 15 connections against its share of 13 on `db-f1-micro`) is task 075.

- 2026-11-05 – Applied by the owner (102 resources), GitHub variables set, PR #46 merged; the first `main` deploy passed (run 41972438518, 8m34s). Checked by hand:
  - Cloud SQL `POSTGRES_16_15.R20260712.01_44` on `db-f1-micro`; the runtime role check passed with the existing pins (no hash added);
  - `runDeployer` was enough to deploy all three zones; tagging and removing tags waits for the first preview and its cleanup;
  - `shell`, `dashboard` and `example-zone` run `images/<zone>@sha256:…` as their own `*-runtime` accounts;
  - the preview logins were provisioned (SCRAM-SHA-256 passwords set); that Cloud SQL accepts them is shown when the first preview connects;
  - the preview deployer has no binding on main's three services, the `images` repository, `better-auth-secret`, `db-password` or the `*-runtime` accounts; project-wide it has only `roles/cloudsql.client`;
  - signed out, the shell URL redirects to `/login` (200), and `/dashboard` to `/login?next=/dashboard/`.

  Still open, on the first preview (task 069's PR): the `@smoke` run, a client IP in the shell logs, an upload and download by hand, the preview deployer refused at deploy time, tag removal by the cleanup job. Still open, for the owner: sign up on the `main` URL and see the dashboard.
- 2026-11-05 – First green preview (PR #50, task 061): `@smoke` 3/3 against `pr-50---shell-preview`; the runtime role check passed on `app_preview` as `preview_runtime` and migrations ran as `preview_owner`, so Cloud SQL accepts the preview logins' passwords. The shell-preview logs have no "could not determine a client IP" (83 entries during the run). All six services run their image by digest, the previews from `images-preview`. The preview deployer has no binding on main's services, `images`, `better-auth-secret`, `db-password` or the `*-runtime` accounts (re-read after the deploy; project-wide only `roles/cloudsql.client`). The Policy Troubleshooter API is disabled, and enabling it would be a change outside Terraform, so no access check was run as that account. After the merge, the Preview cleanup job removed the `pr-50` tags (no tags left on the three preview services), so `runDeployer` covers deploy, tag and untag. Still open: an upload and download by hand on a preview (task 069's PR); the invite-token log criterion (no invite request has run on a deployment yet); and the owner signing up on the `main` URL.
- 2026-11-07 – On PR #51's and #52's previews the `@poc` flow (task 069) uploaded a photo and a report through the app and downloaded the report again, so the upload criterion is met by the scenario rather than by hand. Invite tokens: the flow created and opened two invite links on each preview; the links carry the token after `#`, so the Cloud Run logs show only `/dashboard/invite` (no request URL with `invite?` since 13:00 UTC). Still open: the owner signing up on the `main` URL, and `terraform plan` showing no changes (the cosmetic `scaling` drift is parked).

## Parking lot
- Neon instead of Cloud SQL to scale to zero (re-test the `app_user` setup first).
- PRs with different unmerged migrations share `app_preview`: drizzle applies one PR's migrations on top of another PR's schema.
- `terraform plan` shows 6 in-place changes after apply: Cloud Run fills a service-level `scaling` block with zeros that the config doesn't declare. Cosmetic; declare it or ignore it in a later infra change.
