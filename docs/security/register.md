# Security gap register

The one list of known security gaps and their status. The process that feeds it is in [`docs/SECURITY.md`](../SECURITY.md). Details, evidence and fixes for each gap are in the review that found it (linked in "Source"). Open P0 gaps are listed by title only until they're fixed (`docs/SECURITY.md`, "Disclosure").

**Last full review:** 2026-11-08 ([report](reviews/2026-11-08.md)), on `main` at 76d6e83.

## Status at a glance

| Priority | Open | Planned | Partly fixed | Fixed | Accepted |
|---|---|---|---|---|---|
| P0 – fix now | 0 | 0 | 0 | 5 | 0 |
| P1 – before real customer data on `main` | 2 | 0 | 2 | 10 | 0 |
| P2 – hardening | 19 | 0 | 1 | 0 | 1 |
| P3 – info / decide | 11 | 0 | 0 | 0 | 0 |

Counted from the rows below (2026-11-14). "Fixed" includes SEC-14 and SEC-17, merged but not live until the owner applies their Terraform, and rows whose code part is fixed with an owner setting left in the row (SEC-11, SEC-15).

No Critical findings. One High (SEC-01). Nothing in the review showed one workspace's data reaching another through the app: every page, route handler and server action checks access on the server, and row-level security is on for every app table.

## Priorities and statuses
- **P0:** exploitable now, or one step from a production compromise or data loss. Fix before other work.
- **P1:** must be fixed, or accepted by the owner, before real customer data goes on `main`.
- **P2:** hardening. Schedule alongside feature work.
- **P3:** information, or a product decision for the owner.
- **Status:** `open` → `planned (task NNN)` → `fixed (PR #n)`; or `accepted (date, reason)` by the owner only. A fixed gap is re-checked by the next full review.

## P0 – fix now

| ID | Sev | Gap | Area | Effort | Status | Source |
|---|---|---|---|---|---|---|
| SEC-01 | High | The deploy's GCP credentials file reached the Docker build context and the GitHub Actions layer cache, which PR runs can read | CI/CD | S | fixed (PR #56, task 078; old build caches on `main` deleted 2026-11-08) | INF-1, SUP-7 |
| SEC-02 | Med | `main` has no branch protection, and deploys don't wait for CI | GitHub | S | fixed (owner ruleset 2026-11-08: PR required, `verify`, `e2e`, `security` up to date, no force push or deletion; the `production` environment is SEC-44) | SUP-1, INF-2 |
| SEC-03 | Med | Open redirect after login and sign-up: `safeNext` let some paths through that a browser reads as another site | Auth | S | fixed (PR #55, task 079) | AUTH-1 |
| SEC-04 | Med | `reset:local --yes` accepted a localhost tunnel to the production database (also named `app`) | Tooling | S | fixed (PR #54, task 080) | SUP-4 |
| SEC-05 | Med | Actions pinned by tag in the job with production deploy rights; `turbo@^2`, the Node image and the Cloud SQL proxy binary unpinned | CI/CD | S | fixed (PR #56, task 078) | INF-4, SUP-8 |

## P1 – before real customer data on `main`

| ID | Sev | Gap | Area | Effort | Status | Source |
|---|---|---|---|---|---|---|
| SEC-06 | Med | The `main` runtime connects as `app`, the database owner, and only switches to `app_user`; any SQL foothold can `RESET ROLE` and bypass row-level security | DB / infra | M | partly fixed (PR #85, task 074; `main` runs as `app_runtime` since 2026-11-12): no SET ROLE escape; closes when task 109 removes the runtime's transition grants on `db-password` | INF-3, ACC-1 |
| SEC-07 | Med | Uploads have no enforced size cap (the signed URL has no length range) and abandoned or orphaned uploads are never cleaned up: unbounded storage cost | Files | M | partly fixed: size cap PR #84 (task 085; CORS applied; the hand check on real Cloud Storage waits for previews, task 110), unfinished-upload cap and cleanup PR #92 (task 087); open: storage quota and a bucket-wide sweep (SEC-48) | WEB-1 |
| SEC-08 | Med | Deleting a workspace (or a cascade) leaves its photos and reports in the bucket forever (retention, erasure requests) | Files | S–M | fixed (PR #80, task 086; residual: a failed inline delete or an upload landing after it leaves orphans until a bucket-wide sweep exists; deleted objects stay restorable to project Owners/Editors for 7 days) | WEB-2 |
| SEC-09 | Med | No email verification and no password reset: anyone can register any address, and the real owner can't recover it; sign-up also reveals which emails have accounts | Auth | M | open (**owner decision:** email provider, or accept for the POC) | AUTH-2, AUTH-4 |
| SEC-10 | Med | Sign-in brute force is limited only by the in-memory, per-instance rate limiter (up to 5× the budget); no account lockout | Auth | M | fixed (PR #83 shared limit, task 089; PR #86 lockout, task 090); accepted trade-off: anyone who knows an email can keep that account locked (owner, 2026-11-10); IPv6 counted per /64 | AUTH-3 |
| SEC-11 | Med | No Dependabot alerts or updates, no `pnpm audit`, gitleaks or CodeQL in CI | Supply chain | S | fixed in CI (PR #62, task 082); **owner:** turn on Dependabot alerts and security updates; `security` is required by the SEC-02 ruleset | SUP-5 |
| SEC-12 | Med | Agent guard gaps: `gcloud secrets versions access`, `gcloud beta run deploy`, `git push origin +main`, `git add -f .env` and `git -c … commit` all pass; commits in lane worktrees skip the commit checks | Tooling | M | fixed (PR #61, task 084; owner limits stay with SEC-02 and SEC-13) | SUP-2, SUP-3 |
| SEC-13 | Med | The auto-mode environment in `~/.claude/settings.json` describes another, private repo; agent sessions hold the owner's `gcloud` and `gh` (`gist`, `repo`) credentials | Tooling | S | open (**owner:** project-level auto-mode context and deny rules; a less-privileged gcloud config for agents) | SUP-2 |
| SEC-14 | Low | `main` can scale to 5 instances × 3 zones × 4 connections against a 12-connection database; unauthenticated traffic can cause "too many connections" outages | Infra | S | fixed (PR #78, task 091); live once the owner applies | INF-8 |
| SEC-15 | Low | Fork PRs from anyone with one merged PR run edited workflows without approval; `ci.yml` has no `permissions:`; WIF doesn't check which workflow asks for a token | CI/CD | S | fixed: `ci.yml` (PR #62, task 082), WIF accepts only the deploy workflows (PR #79, task 083; applied, hand check PR #91); **owner:** fork approval for all outside contributors | INF-11, INF-12 |
| SEC-16 | Low | `drizzle-orm` 0.44.7 has a High SQL-injection advisory (identifiers); not reachable today, and Better Auth expects ≥0.45.2 | Supply chain | S | fixed (PR #77, task 081): `drizzle-orm` 0.45.4 (`drizzle-kit` 0.31.11); GHSA-gpj5-g38j-94v9 removed from `pnpm.auditConfig.ignoreGhsas` | WEB-5, SUP-6 |
| SEC-42 | Low | `postcss` 8.4.31, pinned by `next`, has two High advisories (GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849; fixed in ≥ 8.5.18); build-time only, but `pnpm audit --prod` (task 082) fails on them | Supply chain | S | fixed (PR #60, task 093) | task 082 audit |
| SEC-18 | Low | Deleting a user who uploaded a file or recorded a visit fails (`attachment_check`, `site_visit_keep_project`), so an erasure request or a compromised account can't be deleted | DB | S | fixed (PR #90, task 088) | ACC-3 |
| SEC-17 | Low | No alerting at all (IAM changes, deploys outside CI, 5xx, DB connections) and no budget alert | Infra | M | fixed (PR #82, task 092); live once the owner applies | INF-5 |

## P2 – hardening

| ID | Sev | Gap | Area | Effort | Status | Source |
|---|---|---|---|---|---|---|
| SEC-19 | Low | No security headers on any zone (CSP, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy); `x-powered-by` sent | Web | S / M (CSP nonces) | open | WEB-3 |
| SEC-20 | Low | The dashboard and example zones are public at their own run.app URLs, bypassing the shell; zones build URLs from client `x-forwarded-host` | Web / infra | S (headers per zone) / L (private ingress) | open | WEB-4, INF-6 |
| SEC-21 | Low | The DB still allows hard deletes (grants and delete policies) on soft-delete tables; a project hard delete cascades to readings and files; default privileges give future tables full DML | DB | S | open (cascade parked in task 061) | ACC-2 |
| SEC-22 | Low | The members page shows partners and workers the emails of every admin (and workers see every worker) | Access | S | open (**owner decision:** what partners and workers should see) | ACC-4 |
| SEC-23 | Low | A partner on a sub-company gets the unassigned parent company's id in the new-project page payload | Access | S | open | ACC-5 |
| SEC-24 | Low | The database doesn't check that a partner's project site belongs to a sub-company the partner serves, or that a task's organization and assignee are in the project's workspace (the app does) | DB | S–M | open | ACC-6 |
| SEC-25 | Low | Cloud SQL accepts unencrypted connections and doesn't require the connector; GCP-level deletion protection is off; the built-in `postgres` user exists; no connection logging | Infra | S | open | INF-7 |
| SEC-26 | Low | The files bucket has no versioning and only the default 7-day soft delete; the runtime can delete and overwrite every object | Infra | S | open | INF-9 |
| SEC-27 | Low | Previews trust every `*.run.app` origin, take their origin from `x-forwarded-host`, and old preview revisions keep serving 100% of each service's base URL | Infra / auth | S | open | AUTH-5, INF-10 |
| SEC-28 | Low | Users can't change their password, see their sessions or sign out everywhere; sessions last 7 days and slide | Auth | M | open | AUTH-6 |
| SEC-29 | Low | Invites are multi-use bearer links not bound to an email; a GET can plant another invite in a victim's cookie; the cookie survives sign-out | Auth | M | open | AUTH-7 |
| SEC-30 | Low | `ci.yml` uploads Playwright reports with traces to a public repo | CI/CD | S | open | SUP-9 |
| SEC-31 | Low | `.gitignore` covers only exact names (`.env.production`, other `*.tfvars`, key files, `gha-creds-*` aren't ignored) | Supply chain | S | partly fixed (task 111): `.env.*` is ignored except `.env.example`, and `gha-creds-*.json` already was; open: `*.tfvars` outside `infra/terraform.tfvars`, key files | SUP-10 |
| SEC-32 | Info | Data Access audit logs (Secret Manager, STS) and container scanning are off; the only GCP Owner is one personal account | Infra | S | open (**owner:** check 2-step verification and a hardware key) | INF-13 |
| SEC-33 | Low | The leak suite misses 9 scenarios: the members page (partner, worker), admin-only forms posted by partners and workers, own partner page, parent id in the page source, sub-company site refusal, files after unassigning, readings after a project delete | Access | M | open (to the planner) | ACC report §2 |
| SEC-43 | Low | `tinypool` 1.1.1 has two Critical prototype-pollution advisories (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr); it comes in through `better-auth`'s optional `vitest` peer, so `pnpm audit --prod` lists it, but only the test runner loads it | Supply chain | S | accepted (owner, 2026-11-08) until a vitest upgrade brings `tinypool` ≥2.1.2; both ignored in `pnpm.auditConfig.ignoreGhsas` | task 082 audit |
| SEC-44 | Low | The `main` deploy runs on push in parallel with CI and isn't tied to a GitHub `production` environment; WIF doesn't require `assertion.environment == 'production'` for `main`. PRs must pass `verify`, `e2e` and `security` before merge (SEC-02), so only tested code reaches `main` | CI/CD | S | open (with task 083) | SEC-02 follow-up |
| SEC-47 | Low | Row-level security trusts the session setting `app.user_id`, which any connection can set itself; a SQL injection (SEC-38) could set another user's id and read as them. Consider a signed or definer-set context, or `SET LOCAL` only through a definer function | DB | M | open | task 074 review |
| SEC-46 | Low | Better Auth's limiter counts every `/api/auth/*` path before routing, so requests to made-up paths add `rate_limit` rows; rows are pruned only when an existing key's window resets. Reject unknown auth paths in the shell's route handler before calling Better Auth | Auth | M | open | task 089 review |
| SEC-45 | Low | The database pool has no checkout timeout and the runtime role no `statement_timeout`: with `main` capped at one instance per zone (SEC-14), a burst of slow queries makes every request on that zone wait, up to Cloud Run's 300 s | DB / infra | S | open | task 091 review |
| SEC-48 | Low | No storage quota: confirmed uploads are unlimited per workspace, sign-up is open (SEC-09) and anyone can create workspaces, so storage cost is bounded only by the budget alert (SEC-17); a bucket-wide sweep for orphaned objects (late bodies, failed deletes, idle workspaces) is also missing | Files | M | open | task 087 review |

## P3 – information and decisions

| ID | Sev | Gap | Area | Status | Source |
|---|---|---|---|---|---|
| SEC-34 | Info | Photos keep their EXIF (GPS, device, time) for everyone who can see the project | Files | open (**owner decision**) | WEB-6 |
| SEC-35 | Info | `Content-Disposition` names aren't RFC 5987-encoded (Hebrew names may be mangled) | Files | open | WEB-7 |
| SEC-36 | Info | Some BEFORE triggers raise telling errors about other workspaces before RLS refuses the row (only through raw SQL) | DB | open | ACC-7 |
| SEC-37 | Info | Any published form version is fillable; matters once versioning lands | DB | open (parked in task 061) | ACC-8 |
| SEC-38 | Info | Better Auth's tables have no RLS by design; one unjoined `user` lookup would expose emails | DB | open (lint rule) | ACC-10 |
| SEC-39 | Info | The placeholder secret in `.env.example` would be accepted; `AUTH_DISABLE_RATE_LIMIT` ships in the bundle (only an env var enables it, and deploys replace the env) | Auth | open; a local `.env` now gets a random secret from `scripts/setup.sh` (task 111) | AUTH-8, SUP-11 |
| SEC-40 | Info | Any same-repo PR author can print the preview DB secrets (preview data only); fine with one collaborator | CI/CD | open (proposed: accept while the owner is the only collaborator; revisit before adding one) | INF-14 |
| SEC-41 | Info | Terraform state holds the generated passwords; the state bucket is owner-only and versioned | Infra | open (proposed: accept, expected for `random_password`) | SUP-12 |
| SEC-49 | Info | `next-intl`'s build plugin loads native `@swc/core` and `@parcel/watcher` (for its message extractor, unused) at build time; pnpm doesn't run their install scripts | Supply chain | open (optional: list them in `neverBuiltDependencies`) | task 094 review |
| SEC-50 | Info | The `use-intl` and `icu-minify` overrides in `package.json` pin next-intl's family at 4.14.9; a Dependabot bump of `next-intl` alone leaves them pinned to the old release | Supply chain | open (move the overrides with every `next-intl` bump, or drop them) | task 094 review |
| SEC-51 | Info | The `locale` cookie has no `Secure` flag, so a network attacker could plant it over http; worst case the page's language changes (the value is parsed, never interpolated) | Web | open (optional: add `; secure` on https) | task 094 review |

## Change log
- 2026-11-08 – Register created from the first full review (41 gaps: 1 High, 12 Medium, rest Low/Info).
- 2026-11-08 – SEC-03 fixed (PR #55) and SEC-04 fixed (PR #54); SEC-01 and SEC-05 in progress (PR #56); `main`'s old image build caches deleted. SEC-02 waits on the owner.
- 2026-11-08 – SEC-01 and SEC-05 fixed (PR #56); the first `main` deploy after it built from the commit's Git URL with the pinned Node image and the checked proxy. Only SEC-02 (owner setting) is open in P0.
- 2026-11-08 – P1 tasks planned: SEC-16 → 081, SEC-11 and SEC-15 → 082 (CI checks) and 083 (WIF), SEC-12 → 084, SEC-07 → 085 (size cap) and 087 (abandoned uploads), SEC-08 → 086, SEC-18 → 088, SEC-10 → 089 (shared rate limit) and 090 (lockout), SEC-14 → 091, SEC-17 → 092. Not planned: SEC-06 (task 074, after the POC), SEC-09 and SEC-13 (owner). Owner steps stay in the rows (SEC-11, SEC-15).
- 2026-11-08 – SEC-42 added from task 082's first `pnpm audit --prod` run: `next>postcss` 8.4.31 (two High advisories). Owner: fix with a `pnpm.overrides` entry → task 093.
- 2026-11-08 – SEC-42 fixed (PR #60, task 093): `next`'s postcss overridden to 8.5.30.
- 2026-11-08 – Task 082's audit: SEC-43 (`tinypool` via `better-auth`'s `vitest` peer, test runner only) accepted by the owner until a vitest upgrade; its two advisories and SEC-16's go in `pnpm.auditConfig.ignoreGhsas`. The `postcss` advisories in `next` are task 093.
- 2026-11-08 – SEC-11 fixed in CI (PR #62, task 082: audit, gitleaks, Dependabot config); the owner's alert settings stay open. SEC-15's `ci.yml` part fixed in the same PR.
- 2026-11-08 – SEC-12 fixed (PR #61, task 084): the guard refuses the listed commands and checks lane commits in their worktree, failing closed.
- 2026-11-08 – SEC-02 fixed by the owner's ruleset on `main` (PR required; `verify`, `e2e`, `security` required and up to date; no force push or deletion; linear history off so merge commits work). Its details are restored in the review. The `production` environment part becomes SEC-44 (P2). All P0 gaps are fixed.
- 2026-11-10 – SEC-06 partly fixed (PR #85, task 074). SEC-47 added (P2) from its review: the RLS user id is a session setting a SQL foothold could change.
- 2026-11-10 – SEC-08 fixed (PR #80, task 086), with residuals noted on the row.
- 2026-11-10 – SEC-10: shared limit fixed (PR #83, task 089), lockout is task 090. SEC-46 added (P2) from task 089's review: unknown auth paths add rate-limit rows.
- 2026-11-10 – SEC-10 fixed by PR #83 (task 089) and PR #86 (task 090); the nuisance lockout is the owner's accepted trade-off.
- 2026-11-10 – SEC-18 fixed (PR #90, task 088).
- 2026-11-10 – SEC-45 added from task 091's review: no pool checkout timeout or `statement_timeout` (P2).
- 2026-11-10 – SEC-17 fixed (PR #82, task 092), live once the owner applies.
- 2026-11-10 – SEC-07: upload size cap in PR #84 (task 085), pending the owner's Terraform run and preview hand check; cleanup is task 087.
- 2026-11-10 – SEC-07 partly fixed (PR #84, PR #87). SEC-48 added (P2): no storage quota or bucket-wide sweep.
- 2026-11-12 – P1 wrap-up: every P1 PR is merged (owner lifted the pre-demo hold on 2026-11-11). SEC-16 fixed (PR #77); SEC-15 fixed (WIF: PR #79, applied, hand check PR #91; fork approval stays an owner setting); SEC-14 (PR #78) and SEC-17 (PR #82) fixed, live once the owner applies; SEC-07's cleanup is PR #92 (replaced #87), its real-Cloud-Storage hand check waits for the preview database rebuild (task 110); SEC-06: `main` runs as `app_runtime`, closes with task 109; SEC-18's PR #90 replaced #81. Counts recomputed from the rows, with a "Partly fixed" column (SEC-06, SEC-07); the previous table still showed 2026-11-08's numbers.
- 2026-11-13 – SEC-49, SEC-50 and SEC-51 added (P3) from task 094's security review: next-intl's native build dependencies, its version overrides, and the `locale` cookie's missing `Secure` flag. Counts recomputed from the rows.
- 2026-11-14 – Task 111 (workspace setup script): SEC-31 partly fixed (`.env.*` ignored except `.env.example`); SEC-39 notes that a local `.env` now gets a random `BETTER_AUTH_SECRET`. Counts recomputed from the rows.
