# Task 082: CI security checks (dependency audit, secret scan, Dependabot, workflow permissions)

- **Status:** todo (safe before the POC)
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

## Parking lot
- CodeQL default setup (an owner setting) or a workflow.
- `actionlint` and `zizmor` on `.github/workflows` (`docs/SECURITY.md` lists them as planned for SEC-05 and SEC-15).
- `pnpm.overrides` for dev-only advisories (task 081 parking lot).
