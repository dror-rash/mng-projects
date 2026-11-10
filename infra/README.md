# Infrastructure (GCP)

Terraform for: Artifact Registry, one Cloud Run service per zone (`shell`, `example-zone`, `dashboard`), runtime
service accounts per zone and environment, Cloud SQL, Secret Manager, the file buckets, a log exclusion, and
GitHub Actions → GCP auth via Workload Identity Federation (no long-lived keys).

Every resource is regional in `var.region` (required; this project uses `me-west1`, Tel Aviv): Cloud Run,
Artifact Registry (`<region>-docker.pkg.dev`), Cloud SQL and the buckets.

## One-time bootstrap
```bash
gcloud auth login
gcloud auth application-default login
gcloud projects create <PROJECT_ID>                     # a new, dedicated project
gcloud billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>
gcloud config set project <PROJECT_ID>
gcloud auth application-default set-quota-project <PROJECT_ID>

# APIs Terraform itself needs before it can enable the rest
gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com iam.googleapis.com

# State bucket (once, by hand)
gcloud storage buckets create gs://<PROJECT_ID>-tfstate --location=me-west1 --uniform-bucket-level-access
gcloud storage buckets update gs://<PROJECT_ID>-tfstate --versioning

cd infra
cp backend.hcl.example backend.hcl            # edit
cp terraform.tfvars.example terraform.tfvars  # edit (region = "me-west1")
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```
`backend.hcl` and `terraform.tfvars` are git-ignored. The first `apply` takes 10–15 minutes (Cloud SQL). If it fails
right after enabling an API ("API not enabled" or "has not been used"), wait a minute and run `terraform apply` again.

## Connect GitHub
After `apply`, set these **repository variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | your project ID |
| `GCP_REGION` | same as `region` |
| `GCP_WIF_PROVIDER` | `terraform output gcp_wif_provider` |
| `GCP_DEPLOYER_SA_MAIN` | `terraform output gcp_deployer_sa_main` |
| `GCP_DEPLOYER_SA_PREVIEW` | `terraform output gcp_deployer_sa_preview` |
| `GCP_CLOUDSQL_CONNECTION` | `terraform output gcp_cloudsql_connection` |
| `APP_URL` (optional) | public origin behind a custom domain. Leave unset for the `run.app` origin |

No secrets are needed for GCP auth. (An older `GCP_DEPLOYER_SA` variable is unused; delete it.)

## First deploys: main before any preview
A preview deploy only verifies its database logins; a `main` deploy creates them. So after `apply` and the
variables, **merge (or push) to `main` first** and let `deploy.yml` finish there. Until then every preview deploy
fails at "Migrate and check the database" with `preview_owner doesn't exist (run a main deploy first …)`.

## The app's origin
Without `APP_URL`, the origin is the shell's **`status.url`**: the URL printed by
`gcloud run services describe shell --region <region> --format='value(status.url)'`. `deploy-service.sh` sets it as
`BETTER_AUTH_URL` on every `main` revision. Cloud Run answers on a second `run.app` URL for the same service
(`shell-<hash>-<region code>.a.run.app` and `shell-<project number>.<region>.run.app`); pages load on both, but
sign-in only works on `status.url`, because Better Auth trusts only its base URL on `main`.

## Environments: main and PR previews
Same project and Cloud SQL instance; nothing else is shared. `infra/scripts/environment.sh` is
the one place the workflow picks the names, and Terraform's `local.environments` (`infra/main.tf`) carries the same
ones: `bash infra/scripts/test-environment.sh` fails when they differ.

| | main | PR preview |
|---|---|---|
| GitHub event (Workload Identity) | push to `refs/heads/main` | `pull_request` of this repository |
| Deployer | `deployer-main` | `deployer-preview` |
| Cloud Run services | `shell`, `example-zone`, `dashboard` | `shell-preview`, `example-zone-preview`, `dashboard-preview` |
| Revisions | 100% traffic | no traffic, tag `pr-<N>`; at most 1 instance per revision (every open PR's revision can scale) |
| Image repository | `<region>-docker.pkg.dev/<PROJECT_ID>/images` | `…/images-preview` |
| Runtime identity | `<zone>-runtime` | `<zone>-preview` |
| Database | `app` | `app_preview` |
| Migrations run as | `app` (Terraform's Cloud SQL user) | `preview_owner` |
| Runtime login (switches to `app_user`) | `app_runtime` (task 074) | `preview_runtime` |
| Secrets | `db-password`, `db-runtime-password`, `better-auth-secret` | `db-preview-owner-password`, `db-preview-password`, `better-auth-secret-preview` |
| Files bucket | `<PROJECT_ID>-files` | `<PROJECT_ID>-files-preview` |

- Each runtime identity reads only its environment's runtime database password and auth secret (and, until the
  rollout below is finished, `main`'s also `db-password`: `runtime_transition_secrets` in `main.tf`).
  `deploy-service.sh` sets the revision's identity, env vars, secrets and Cloud SQL instance with `--set-*`, so a
  revision never inherits the other environment's.
- Each deployer deploys only to its environment's services, pushes only to its environment's repository and acts
  only as its environment's runtime identities. The preview shell is built with the preview zones' tagged URLs;
  `main` services never get preview revisions. `deployer-preview` reads only the two preview
  database passwords. `deployer-main` reads `db-password` and, because it provisions `app_runtime` and the preview
  logins, their three passwords. No deployer reads an auth secret.
- **Main's runtime login (task 074).** `main`'s services connect as `app_runtime`, not as the owner login `app`:
  with the owner, one `SET ROLE app` or `RESET ROLE` on a pooled connection would leave row-level security behind
  (ADR-0006, 2026-11-10 amendment). `provision-db-logins.mjs` creates it on `main` deploys, as `app`, before the
  role check: `LOGIN NOINHERIT`, owns nothing, its only membership is `app_user` with `SET` (no `INHERIT`, no
  ADMIN), `CONNECT` on `app`, no `CONNECTION LIMIT` (as `app` before it). This part is fatal: a failure fails
  the main deploy before any service deploys. Keeping it out of `app_preview` is a best-effort preview step:
  the preview logins and `app` get `CONNECT` grants of their own there, then `PUBLIC` and `app_runtime` lose it,
  in one step, so if a grant can't run nothing is revoked and previews still connect. The preview verification
  then fails until a main deploy completes it (a preview login without its own grant, or `app_runtime` able to
  connect). Its password is Terraform's `db-runtime-password`. Migrations, the
  demo seed and provisioning keep the owner login. Local dev and CI keep one login (`DATABASE_URL`); the tests
  create a throwaway runtime login where they need one.
- **Preview logins.** `infra/scripts/provision-db-logins.mjs` creates them on `main` deploys only, as `app`, in two
  parts:
  - **Main side**, on a connection to `app` (PR code can't write there), bounded by `lock_timeout` (30 s;
    statements 60 s). Statements on the preview roles (create, password, connection limit, `app_user` grants)
    and the grants on `app_preview` are best effort: a preview login can hold its own role row, so on a timeout
    or error they print `::warning::` and main goes on. Fatal is only what protects `app`: `CONNECT` on `app`
    revoked from `PUBLIC` and the preview logins, the owner's `CONNECT`, and the check that neither preview login
    (nor `PUBLIC`) can connect to `app`.
  - **Preview side**, on `app_preview`: the preview migration lock (the same `migrate-app_preview` lock
    `with-db-lock.mjs` takes), the schema grant and the full verification, bounded by `lock_timeout` (30 s;
    statements 60 s). **Any failure here is a `::warning::` and the main deploy goes on**: nothing a PR does to
    `app_preview` (holding the lock, odd grants, planted functions) can stall or fail `main`. The next preview
    deploy then fails with the reason.

  Not Terraform: Cloud SQL makes every
  API-created user a member of `cloudsqlsuperuser`, which owns the databases (so it could connect to `app`). Both are
  `LOGIN NOINHERIT`, no `CREATEROLE`/`CREATEDB`, with SCRAM-SHA-256 verifiers computed in Node, and a
  `CONNECTION LIMIT`:
  - `preview_runtime` 7. Each open PR's revision can scale to 1 instance per zone, and previews run a pool of 2
    per instance (`DB_POOL_MAX=2`, set by `deploy-service.sh` from `environment.sh`; every zone, the shell
    included), so the worst case is 3 zones × 1 instance × 2 = 6 per active PR, plus the role check's 1 at deploy
    time = 7 (`CONNECTION_BUDGET` in `provision-db-logins.mjs`; its test fails when it and `environment.sh`
    differ). Assumed: one preview tested at a time; a second at once may hit the limit and fail its own e2e,
    never `main`. (Until task 075 the pool was fixed at 5: three zones could open 15 against a limit of 6, and
    the first previews failed `@smoke` with `too many connections for role "preview_runtime"`.)
  - `preview_owner` 3: one PR migrating (lock + migration) and one waiting on the lock.
  - Previews take at most 7 + 3 = 10 of `db-f1-micro`'s 22 login connections (25, 3 reserved); `main` keeps
    22 − 10 = 12, and its worst case is 3 zones × 1 busy instance × 4 (`DB_POOL_MAX=4`) = 12: it fits at steady
    state with no margin (see Known limits). `app` has no `CONNECTION LIMIT`, and operator sessions (`psql`,
    `db:studio`) and a main deploy's own migrate/provisioning connections come out of `main`'s 12.
  - A change to these limits reaches previews only after a main deploy (main provisions, previews only verify):
    until then every preview deploy fails its verification (`preview_runtime's connection limit is 6, not 7`).
    Merge such a change, let the main deploy finish, then rerun or rebase open PRs. Open PRs based on the older
    `main` expect the older limit and fail until rebased. If that main deploy's preview-login step warns and
    skips (`::warning::Preview login step skipped`), the limit stays old and previews keep failing until the
    next main deploy completes it.
  - `preview_owner` owns `app_preview`'s objects. It holds ADMIN on `app_user` (migration 0020 runs
    `GRANT app_user TO current_user`), `CONNECT`/`CREATE` on `app_preview` (drizzle-kit creates its `drizzle`
    schema) and `CREATE` on its `public` schema. The database itself stays owned by `cloudsqlsuperuser`.
    Migration 0020 then grants it `app_user` once more, as itself (SET, no ADMIN); verification allows exactly that
    one besides the provisioned grant. Any other `app_user` grant `preview_owner` makes (say, to `preview_runtime`
    with `INHERIT`) fails the preview verification, and the next main deploy removes it: `app` may not
    `REVOKE … GRANTED BY preview_owner`, but revoking `preview_owner`'s ADMIN option with `CASCADE` drops every
    grant made with it, and ADMIN is granted again.
  - **A future migration that creates a role fails on previews**: `preview_owner` has no `CREATEROLE`. Create the
    role in `provision-db-logins.mjs` (main deploys) first, guarded like 0020's `IF NOT EXISTS`.
  - `preview_runtime` is a `SET`-only member of `app_user` with `CONNECT` on `app_preview`.
  - `CONNECT` on `app` is revoked from `PUBLIC` (granted to `app`), so neither preview login can connect to `app`.
    They can still connect to Cloud SQL's `postgres` database (its catalogs only); that one belongs to Cloud SQL's
    own admin, so it is left alone.
  - `TEMPORARY` on `app_preview` is revoked from `PUBLIC` here: migration 0025 does it too, but run by
    `preview_owner` (not the database owner) it only warns.

  Preview deploys run it with `--verify-only` (read-only) and fail if anything above is missing or different
  (memberships and connection limits included).
- **Functions planted by PR migrations.** `preview_owner` can create functions in `app_preview`'s `public`, and
  `main`'s owner login and the role check both read catalogs there. Every connection of these scripts pins
  `search_path` to `pg_catalog, pg_temp` (startup option, and again before the first query) and calls catalog
  functions schema-qualified (`infra/scripts/pg-safe.mjs`), so a planted function or operator never runs in their
  place. Tests plant some and fail if one is called.
  `bash infra/scripts/test-preview-migrate.sh` runs the whole sequence on fresh databases set up like Cloud SQL.

## How deploys work
- Terraform creates the services with a placeholder image and their environment's identity, and ignores image,
  traffic and env drift.
- `.github/workflows/deploy.yml`:
  1. Through the Cloud SQL Auth Proxy. `main`: migrate `app` as `app`, then provision the preview logins. Previews:
     verify the preview logins, then migrate `app_preview` as `preview_owner`. Migrations run under a Postgres
     advisory lock (`with-db-lock.mjs`), so two PRs never migrate `app_preview` at once. Then
     `check-runtime-role.mjs` as the environment's runtime login.
  2. Builds and deploys `example-zone` and `dashboard` to the environment's services, resolves their URLs (tagged
     `pr-<N>` URLs of the `-preview` services on PRs). Every deploy pins the digest its build pushed;
     `deploy-service.sh` refuses a tag.
  3. Builds the shell with `EXAMPLE_ZONE_URL` and `DASHBOARD_ZONE_URL` (Next.js bakes rewrites in at **build
     time**) and deploys it.
  4. PRs: checks the shell URL, runs the `@smoke` scenarios and the `@poc` flow against it, and posts it on the PR.
  5. `main`: seeds the demo account's workspace once (see [Demo data](#demo-data)); never fails the deploy.
- **PR previews run the `@smoke` scenarios and the `@poc` flow only**, one worker, no traces and no uploaded
  report (public repository; traces would hold the test accounts' passwords and cookies). The full suite needs
  `AUTH_DISABLE_RATE_LIMIT`, which a deployment never sets (rule 13); the e2e helpers space sign-ups and
  sign-ins at least 11.5 s apart against a deployment (`e2e/support/pacing.ts`).
- `preview-cleanup.yml` removes the `pr-<N>` tags of the three `-preview` services when the PR closes (as
  `deployer-preview`). A missing tag is a notice; any other failure is logged and fails the job.
- Deployers get the custom role `runDeployer` on their own environment's services: the `run.*` permissions of
  `roles/run.developer` that a deploy and a tag cleanup use. Not `run.developer` itself: it includes
  `run.services.sshRoot`, `run.instances.sshRoot` and the `sshRead` ones (SSH into running instances, whose
  environment holds the database password and auth secret). Nor IAM policy changes, jobs or worker pools.
- Workload Identity accepts only this repository, by name and by its numeric id (`github_repository_id`).

## Runtime role check
`infra/scripts/check-runtime-role.mjs` connects like the runtime pool (`buildPoolConfig`: the login and
`-c role=app_user`) and fails the deploy unless (ADR-0006: row-level security isn't forced):
- `current_user = app_user`, and the login may `SET ROLE app_user`;
- the login (`session_user`) isn't, and can't `SET ROLE` to, the owner of the public tables or of the database
  (task 074). So it **fails on purpose when the runtime connects as the owner login** (`app` or `preview_owner`);
- `app_user` is no superuser and has no `BYPASSRLS` or `TEMPORARY` (migration 0025);
- `app_user` owns no public table and isn't a member of any table's owner;
- row-level security is on for every public table except Better Auth's (`account`, `session`, `user`, `verification`);
- `app_user` can use no view, materialized view or `SECURITY DEFINER` function except the migrations' own, and no
  table outside `public` (column-only grants count);
- no rule on any table (rule actions run with the table owner's rights);
- no `SECURITY DEFINER` trigger except the migrations' 7 (triggers fire without `EXECUTE`);
- what row-level security depends on is the migrations' definition, pinned by a sha256 of how Postgres deparses
  it, owner included (`infra/scripts/rls-pins.mjs`): the 2 views, **every** function in non-system schemas (31,
  whatever their security: an invoker `text` overload of `has_workspace_role` would otherwise hijack the
  definer functions' untyped `'{admin}'` calls), the 7 definer trigger functions, all 45 policies, and every
  table's owner and `ROW LEVEL SECURITY`/`FORCE` flags (21). An added, changed or missing one fails. The login
  that ran the migrations hashes as `<migrator>`, so `app`, `preview_owner` and a local `postgres` match;
- `app_user` has no `TRUNCATE`, `TRIGGER` or `REFERENCES` on any table (`TRUNCATE` ignores row-level security);
- with `app.user_id` unset, `select count(*) from workspace` is 0.

A migration that adds or changes a view, function, trigger, policy or table fails the deploy (preview first) until
its pin in `rls-pins.mjs` is updated on purpose. The failure starts with "A migration changed RLS-relevant
objects: update infra/scripts/rls-pins.mjs" and prints each object with its new hash;
`node --experimental-strip-types infra/scripts/rls-pins.mjs --print` lists them all from a migrated database. CI
and `docker-compose.yml` run Postgres `16.15`, the version the pins were computed on; Cloud SQL's `POSTGRES_16`
minor is only visible after the instance exists. If it deparses differently, the first deploy fails safe and
prints the hashes: add them next to the existing ones (a pin may be a list of hashes).

`pnpm test:infra` runs all the infra script tests locally (needs `DATABASE_URL` of a superuser on a migrated
database, e.g. `scripts/lane.sh exec <n> -- pnpm test:infra`).

CI runs the tests of all these scripts against the migrated database, and `test-preview-migrate.sh`.
`bash infra/scripts/test-workflows.sh` checks the deploy's demo-seed step stays `main`-only, non-blocking and masked,
and the build hygiene of task 078: the image builds use `BUILD_CONTEXT`, the Git URL of `github.sha` (tracked
files of the checked-out commit only), no other image build runs, and the cache keeps final layers only (`mode=min`); every `uses:` is a commit SHA with its version in a comment; both
`node:22-alpine` stages are pinned by digest (refresh: `docker buildx imagetools inspect node:22-alpine`); the
Dockerfile runs the lockfile's `turbo`; and `infra/scripts/get-cloud-sql-proxy.sh` holds the proxy's version and
sha256 together (upgrade both from the release notes) and fails on a mismatch. Probes run each check on a copy with
one change and expect it to fail.

CI's `security` job (task 082) runs `pnpm audit --prod --audit-level=high` (accepted advisories in the root
`package.json`'s `pnpm.auditConfig.ignoreGhsas`, each with a register line) and gitleaks
(`infra/scripts/get-gitleaks.sh`: version and sha256 together, like the proxy) through `scan-secrets.sh` on the PR's
`base..head` or a push's `before..after`. `test-workflows.sh` also checks every workflow's top-level `permissions:`
and that Dependabot's runs skip the deploy and the preview cleanup. To test the scan locally (not part of
`pnpm test:infra`, it needs the binary): `GITLEAKS=gitleaks bash infra/scripts/test-secret-scan.sh` (a gitleaks on
`PATH`, or `GITLEAKS=/path/to/gitleaks`).

## Files (GCS)
- `<PROJECT_ID>-files` for `main` (no lifecycle rule: attachments are soft-deleted in the database and stay
  restorable) and `<PROJECT_ID>-files-preview` for all PRs (objects deleted 14 days after upload, no soft-delete
  retention).
- `deploy-service.sh` sets `STORAGE_BUCKET` on the dashboard. `STORAGE_LOCAL_URL` is local-only.
- Of the app's identities, only the dashboard's have object access: `dashboard-runtime` on the main bucket,
  `dashboard-preview` on the preview bucket (`roles/storage.objectUser`). Each signs URLs as itself
  (`roles/iam.serviceAccountTokenCreator` on itself, through the IAM Credentials API; no key). People with
  project Owner/Editor/Viewer still reach both buckets through GCS's legacy project bindings.
- CORS allows `PUT` and `GET` with `Content-Type` and `x-goog-if-generation-match`. Main: the shell's `run.app`
  URLs. Preview: `*`, because tagged origins (`https://pr-<N>---shell-….run.app`) change per PR and GCS has no
  wildcard inside a host. Every request still needs a URL the app signed, and the bucket holds test data only.

## Logs
- A log exclusion drops Cloud Run request logs of `/dashboard/invite/<token>` on the shell and dashboard services of
  both environments (the path
  carries the invite secret, task 028), in any case and with repeated slashes.

## Artifact Registry
- One repository per environment (`images`, `images-preview`), one package per zone. Each keeps the 10 newest
  versions of each image and deletes any other version older than 30 days, so previews never push `main`'s
  images out.

## Database & auth
- Cloud SQL Postgres 16 (`db-f1-micro`, about US$11–14/month in `me-west1` with 10 GB SSD and backups, **does not
  scale to zero**). Databases: `app` (production) and `app_preview` (shared by all PR previews).
- Terraform generates the database passwords and the Better Auth secrets into Secret Manager. Values also sit in
  Terraform state, so keep the state bucket private.
- Generate and commit migrations locally with `pnpm db:generate` whenever `packages/db/src/schema.ts` changes.
- Behind a custom domain, set `APP_URL` so Better Auth's base URL and origin checks match.

## Demo data
A `main` deploy fills the demo account's workspace with demo data once (task 076), so a viewer of the deployed app
finds whole stories instead of an empty dashboard. In order:
1. Set the demo account's email, an address you control, as a repository **secret** (not a variable: the
   repository and its Actions logs are public): `gh secret set DEMO_EMAIL`.
2. Sign up with that email on the `main` URL.
3. Open the dashboard once (that creates the account's workspace).
4. Push to `main`, or re-run the latest Deploy run on `main` (`gh run rerun <id>`).

The `Seed demo data` step (after the shell is deployed) runs `seed:demo --deploy` through the Cloud SQL proxy as
`app`'s owner login, with one connection (`DB_POOL_MAX=1`). It adds 5 demo customers (tagged `demo`) with
sub-companies, sites, 75 projects with tasks in every state, past visits, and readings of a published
`Site inspection (demo)` reading form. No photos, reports or other files: upload a photo and a report on a demo
project by hand through the app.

It never wipes or replaces anything: it skips (a notice on the run) until the account has signed up and opened
the dashboard, and from then on whenever the workspace has demo data, deleted or not, so hand edits stay. It
refuses (a warning, nothing written) unless the account is the admin and only member of exactly one workspace.
A refusal or failure never fails the deploy (`continue-on-error`). The log shows counts only; the email and
password are masked. To start over, use a new demo account (a new `DEMO_EMAIL`); there is no reseed from CI.

## Main's runtime login: rollout (task 074)
Order matters: the deploy reads `db-runtime-password` and the services start with it, so the secret exists first.
1. Apply Terraform (from `infra/`, `terraform plan` then `terraform apply`): it adds `db-runtime-password` and its
   reader grants (`main`'s runtime identities and `deployer-main`) and removes nothing. The plan also shows 6
   in-place updates of the Cloud Run services (`scaling`): that drift is already there on `main` (task 068's
   services), not from this change. The running services
   still use `app` and `db-password`, which they can still read.
2. Before merging, look at the last `main` Deploy log for `::warning::Preview login step skipped`. With one
   there, a preview login may lack its own `CONNECT` grant on `app_preview`; that is still safe (the grants and
   the revoke of `PUBLIC`'s run as one step, so nothing is revoked until every grant runs), but the next
   previews fail their verification until a main deploy completes the step. Merge. The `main` deploy migrates as `app`, creates `app_runtime` (`Database logins provisioned on app:
   app_runtime owns nothing…`), runs the role check as `app_runtime` (`Runtime role check passed on app (login
   app_runtime)`), then deploys the services with `DB_USER=app_runtime` and `DB_PASSWORD=db-runtime-password`.
3. Verify: those two log lines in the Deploy run, then sign in on the `main` URL and open the dashboard
   (projects and customers load). `@smoke` runs on previews only, so this check is by hand.
4. Then drop `runtime_transition_secrets` from `main.tf` in a follow-up PR and apply it (3 IAM grants destroyed:
   `main`'s runtime identities no longer read `db-password`).

Revert (before step 4): revert the PR. The next `main` deploy goes back to `app`/`db-password`, which the runtime
identities can still read. `app_runtime` stays in the database, unused and harmless (it owns nothing and can
only become `app_user`); dropping it is a task of its own, never a hand edit. If the deploy fails at provisioning or the
role check, nothing is deployed: the old revision keeps serving as `app`.

## Known limits / follow-ups
- Connections on `db-f1-micro` (22 for logins; task 075): previews at most 10 (`preview_runtime` 3 × 1 × 2 + 1 =
  7, `preview_owner` 3), `main` 12 (3 zones × 1 busy instance × `DB_POOL_MAX=4`). That fills all 22 with no
  margin, and counts one busy instance per zone: `main` can scale to 5 instances per zone (5 × 3 × 4 = 60), and a
  main deploy briefly adds its own (migration lock + migration 2, then provisioning 2, then the role check 1,
  then the demo seed 1) while the old revision still serves. Idle pool connections close after 10 s (`pg`'s
  default). That timer runs between requests because CPU is always allocated
  (`run.googleapis.com/cpu-throttling: false`, checked on `dashboard-preview` and `shell`), so an older
  revision's instances (the previous push of the same PR, or `main`'s old revision during a rollout) release their connections within about 10 s of their last request.
  So this only bites under real load. Before real load: a bigger tier or a connection pooler, or lower `max_instances`.
- Services are public (`allUsers`). If org policy forbids that, put a load balancer with IAP in front.
- Previews share the production project and Cloud SQL instance. Use a separate project for staging if data
  isolation must not depend on database grants.
- Always deploys all three zones; add change detection with `turbo --filter=...[origin/main]` later.

## Monthly cost (POC, `me-west1`)
Cloud SQL is most of it (about US$11–14). Cloud Run scales to zero; buckets, logs and the registry stay within
or near the free tiers at POC volume. The preview identities, deployers and secrets add nothing at this size (six
secret versions in all since task 074's `db-runtime-password`, exactly Secret Manager's 6 free; a seventh costs
about US$0.06/month; service accounts are free). Target: about US$15/month.
