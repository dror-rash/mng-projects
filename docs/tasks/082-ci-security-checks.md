# Task 082: CI security checks (dependency audit, secret scan, Dependabot, workflow permissions)

- **Status:** in-progress
- **Milestone:** cross-cutting (security)
- **Zone / package:** `.github/workflows/ci.yml`, a new `.github/dependabot.yml`, `infra/scripts/test-workflows.sh`, root `package.json` (`pnpm.auditConfig` only), `docs/SECURITY.md` (the CI checks table). Commit type `ci:`.
- **Feature file:** none (no app behavior; the checks are the tests)
- **Depends on:** task 081 for a green audit without an allowlist entry (otherwise question 2's default applies).

## Why
Nothing in CI catches a vulnerable runtime dependency or a committed secret, and `ci.yml` relies on the repository default for its token's permissions. Late-October critical advisories were patched only because of a timely upgrade. Register **SEC-11** and the `ci.yml` part of **SEC-15**.

## Scope
- **Dependency audit:** a CI step (in `verify`, or a separate `security` job; implementer's choice, named in the PR) running `pnpm audit --prod --audit-level=high`. Accepted advisories go in `pnpm.auditConfig.ignoreGhsas` in the root `package.json`, each with a reason in the PR and a register line; the list starts empty.
- **Secret scan:** gitleaks on the commits a PR adds (base..head) and on pushes to `main`. The gitleaks binary or action is pinned (a full commit SHA for an action; a version and a checked sha256 for a binary, as `deploy.yml` does for `cloud-sql-proxy`). A one-time full-history scan run by hand, its summary (counts only) in the PR.
- **Workflow permissions:** a top-level `permissions: { contents: read }` in `ci.yml` (jobs that need more say so on the job). `infra/scripts/test-workflows.sh` fails when any workflow under `.github/workflows/` has no top-level `permissions:` (red first, against today's `ci.yml`).
- **Dependabot updates:** `.github/dependabot.yml` with `npm` (root, weekly, grouped: one group for runtime minor/patch, one for dev) and `github-actions` (weekly; keeps task 078's SHA pins current). Major updates not grouped.
- `docs/SECURITY.md` "CI checks": the audit and gitleaks rows become `in place`.

## Out of scope
- **Owner steps** (repository settings, not code): turn on Dependabot alerts and Dependabot security updates; turn on secret scanning's non-provider patterns; make the new check required once SEC-02's ruleset exists. Listed in the PR description.
- CodeQL, `actionlint` and `zizmor` (parking lot).
- Fixing any advisory the audit finds besides `drizzle-orm` (task 081): a new finding gets a register entry and its own task.
- The WIF workflow check (task 083) and fork-PR approval (an owner setting, SEC-15).

## Acceptance criteria
- [ ] `test-workflows.sh` fails on today's `ci.yml` (no `permissions:`) and passes after the change.
- [ ] The audit step fails on a High advisory in a runtime dependency (shown red in the PR: before task 081, or with a temporarily pinned vulnerable version on a scratch branch) and passes on the PR.
- [ ] gitleaks fails on a planted fake secret in a scratch commit (shown in the PR; the commit is dropped, never merged) and passes on the PR.
- [ ] `.github/dependabot.yml` is valid (GitHub shows no config error on the PR's "Dependabot" insights after merge; checked by the owner).
- [ ] Every action the change adds is pinned by full SHA.
- [ ] `docs/SECURITY.md` CI checks table updated.

## Security notes
Touches `.github/` and `package.json`, so the `security-reviewer` runs. No secrets are added; gitleaks needs only `contents: read`. A planted test secret must be an obviously fake, non-provider value and never reach `main`. Dependabot PRs come from the repository itself, so `deploy.yml`'s preview job runs on them but gets no secrets or OIDC token (question 3). Fixes register gap **SEC-11** (with the owner's alert setting) and part of **SEC-15** (`ci.yml` permissions; the WIF part is task 083, fork approval is the owner's).

## Approach (brief)
Red: extend `test-workflows.sh` with the `permissions:` check; run it. Then add `permissions:` to `ci.yml`, the audit and gitleaks steps, and `dependabot.yml`. No ADR.

## Test plan
- Acceptance: none.
- Scripts: `infra/scripts/test-workflows.sh` (new `permissions:` case).
- CI: the red/green runs above, linked in the PR.
- Storybook: none.

## Open questions
1. **Should the audit block merging?** Default: yes, at `high` on `--prod`; a registry outage fails the step, and the rerun is manual (no retry loop, per the flaky-test rule).
2. **If task 081 hasn't merged yet:** default: add `GHSA-gpj5-g38j-94v9` to `ignoreGhsas` with the reason "not reachable, task 081" and remove it in task 081.
3. **Dependabot PRs and the preview deploy:** they get no secrets, so the preview `deploy` check fails on them. Default: `deploy.yml`'s job condition also skips pull requests from Dependabot (`github.event_name == 'pull_request' && github.actor == 'dependabot[bot]'`; pushes to `main` are untouched, and `test-workflows.sh` asserts both); CI `verify` and `e2e` still run on them. Alternative: leave `deploy.yml` alone and merge Dependabot PRs on `verify` + `e2e` with a red preview check.
4. **When Dependabot starts:** version updates open PRs as soon as `dependabot.yml` is on `main` (up to the open-PR limit). Default: `open-pull-requests-limit: 5` per ecosystem, and the task merges after the POC demo if the owner prefers no PR noise that week; the checks themselves can merge before.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-11, SEC-15); owner: "start fixing the P1 gaps".
- 2026-11-08 – Started in lane 2 (based on `docs/security-p1-tasks`, PR #59). Open questions take their defaults.
- 2026-11-08 – Red: `test-workflows.sh` against today's `ci.yml`: `FAIL - .github/workflows/ci.yml has a top-level permissions:` (deploy.yml and preview-cleanup.yml ok), plus the new security-job, gitleaks-download and Dependabot-skip checks; `# 74 passed, 18 failed`, exit 1. `test-secret-scan.sh` before `scan-secrets.sh` existed: `# 9 passed, 6 failed`, exit 1. Committed as `test(ci)`.
- 2026-11-08 – Green: a `security` job in `ci.yml` (parallel to `verify`; top-level `permissions: contents: read`; checkout with `fetch-depth: 0`) runs `pnpm audit --prod --audit-level=high`, gets gitleaks 8.30.1 by version + sha256 (`infra/scripts/get-gitleaks.sh`, hash from the release's checksums file and the asset digest), runs `test-secret-scan.sh` and then `scan-secrets.sh` on the PR's `base.sha..head.sha` (push: `before..sha`; no usable base: the head's whole history). The scan refuses a shallow clone and an in-repo `.gitleaks.toml`/`.gitleaksignore`, ignores inline `gitleaks:allow`, and redacts values. No new action (the job reuses the pinned checkout, pnpm and setup-node). `deploy.yml` skips `dependabot[bot]` pull requests; pushes to `main` untouched. `.github/dependabot.yml`: npm (weekly, groups `runtime` and `dev` for minor/patch, majors one PR each) and github-actions (weekly), 5 open PRs each. `test-workflows.sh` `# 93 passed, 0 failed`; `test-secret-scan.sh` `# 15 passed, 0 failed`; `pnpm test:infra` exit 0. actionlint not available locally.
- 2026-11-08 – Audit red (local, no allowlist): `pnpm audit --prod --audit-level=high` exit 1, `12 vulnerabilities found, Severity: 7 moderate | 3 high | 2 critical`. High/Critical: `drizzle-orm` GHSA-gpj5-g38j-94v9 (High, `packages__db>drizzle-orm`, SEC-16, task 081); `postcss` 8.4.31 GHSA-6g55-p6wh-862q and GHSA-r28c-9q8g-f849 (High, `next>postcss`, build-time CSS); `tinypool` 1.1.1 GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr (Critical, `better-auth>vitest (auto-installed optional peer)>tinypool`, test runner). With `ignoreGhsas: [GHSA-gpj5-g38j-94v9]` ("not reachable, task 081"): `3 high (1 ignored) | 2 critical`, still exit 1. Task 081 assumed `--prod` doesn't see the postcss and tinypool chains; it does (`next` and the `vitest` peer resolve as production dependencies). **Blocker:** the `security` job is red on this PR until the owner accepts those four (`ignoreGhsas` + register lines) or a task fixes them (overrides); not added here.
- 2026-11-08 – gitleaks red (local, scratch repo, never pushed): a commit adding `PLANTED_TEST_API_KEY="<fake 32-char value>"` → `leaks found: 1`, `RuleID: generic-api-key`, `Secret: REDACTED`, exit 1; the range after that commit passes. (A value starting with `fake` is not reported by gitleaks' generic rule, so the planted value doesn't.) Full history, run by hand: 556 commits scanned, 0 findings. This branch's commits (`main..HEAD`): 0 findings.
- 2026-11-08 – Owner decision on the audit: `postcss` (in `next`) is fixed by task 093 (another lane); `tinypool` is accepted until a vitest upgrade (SEC-43, P2): GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr go in `ignoreGhsas`. Audit now: `3 high (1 ignored) | 2 critical (2 ignored)`, exit 1 on the two `postcss` advisories only, expected until 093 merges.
- 2026-11-08 – Review fixes. Red (`test(ci)`): `test-workflows.sh` `# 93 passed, 8 failed` (preview-cleanup Dependabot skip, PR-only cancel, checkout credentials, Dependabot cooldown, and their probes); `test-secret-scan.sh` `# 17 passed, 2 failed` (a secret added inside a merge commit was not found; no "rotate the secret" message). Green (`ci:`): `scan-secrets.sh` passes `--diff-merges=first-parent` and says to rotate the secret; `ci.yml` cancels PR runs only and every checkout has `persist-credentials: false` (no step in `verify` or `e2e` uses git credentials); `preview-cleanup.yml` skips `dependabot[bot]`; `dependabot.yml` has a 3-day cooldown for both ecosystems. `test-workflows.sh` `# 101 passed, 0 failed`; `test-secret-scan.sh` `# 19 passed, 0 failed` (also with `GITLEAKS=gitleaks` on `PATH`). Register: SEC-43 added, SEC-16 notes the allowlist entry; task 081 removes it.

## Parking lot
- CodeQL default setup (an owner setting) or a workflow.
- `actionlint` and `zizmor` on `.github/workflows` (`docs/SECURITY.md` lists them as planned for SEC-05 and SEC-15).
- `pnpm.overrides` for dev-only advisories (task 081 parking lot).
