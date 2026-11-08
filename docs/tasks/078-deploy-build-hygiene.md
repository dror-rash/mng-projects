# Task 078: Deploy build hygiene and pinning

- **Status:** done (PR #56)
- **Milestone:** cross-cutting (security)
- **Zone / package:** infra / CI: `.dockerignore`, `.gitignore`, `.github/workflows/*.yml` (`ci.yml`, `deploy.yml`, `preview-cleanup.yml`), `Dockerfile`, `infra/scripts/test-workflows.sh`, root `package.json` / `pnpm-lock.yaml` only if needed. No Terraform change, no migration. Commit type `chore`.
- **Feature file:** none (no visible behavior of the app; `infra/scripts/test-workflows.sh` and the PR's preview deploy are the tests)
- **Depends on:** task 068 (deploy pipeline) and task 076 (`Seed demo data` step and the current `test-workflows.sh`): both done. Not a dependency: task 077 (security review process, branch `docs/security-review`) adds `docs/security/register.md` and the template's "Security notes"; this task's PR updates SEC-01 and SEC-05 in that register if 077 has merged by then, otherwise 077's lane does.

## Why
The deploy image build should contain only tracked source and use only pinned, verified third-party code (register SEC-01, SEC-05).

## Scope
- **Build context holds tracked files only (SEC-01):**
  - `.dockerignore` and `.gitignore` gain `gha-creds-*.json` (the credentials file that `google-github-actions/auth` writes into the workspace), `cloud-sql-proxy` (the downloaded binary) and `*.log` (the proxy logs `proxy.log`, `proxy-seed.log`).
  - The three `docker/build-push-action` steps in `deploy.yml` no longer use `context: .`: they use a Git context (the commit being built), so the image build gets tracked files only. If the Git context can't work here (see Open questions), the fallback is to keep a path context but delete the credentials file and the other leftovers before the builds and rely on `.dockerignore`; the implementer records which in the Progress log.
  - No intermediate-layer cache export: every `cache-to` uses `mode=min` (or the cache is dropped for these builds): the cache keeps final layers only.
- **Pinning (SEC-05):**
  - Every `uses:` in `ci.yml`, `deploy.yml` and `preview-cleanup.yml` is pinned to a full 40-hex commit SHA with the version in a trailing comment (`uses: actions/checkout@<sha> # v4.x.y`). The SHA is the one the current tag points at (no version upgrade in this task).
  - The `Dockerfile` pruner stage stops using `pnpm dlx turbo@^2`: it runs the `turbo` that the root `package.json` already lists as a devDependency, at the version in `pnpm-lock.yaml` (e.g. a root-only `pnpm install --frozen-lockfile` before `turbo prune`, or equivalent). `turbo` stays a root devDependency; pin its range in `package.json` only if the lockfile route needs it.
  - `node:22-alpine` (base and runner stages) is pinned by digest (`node:22-alpine@sha256:…`), with a comment saying how to refresh it.
  - The `cloud-sql-proxy` download (in the migration step and the `Seed demo data` step, or the shared helper if one exists) is checked against the published sha256 for that exact version before it is made executable; a mismatch fails the step. The expected hash lives in one place (e.g. `infra/scripts/environment.sh` or a small helper next to the version).
- **`infra/scripts/test-workflows.sh` gains checks, written first and shown red:**
  - `.dockerignore` contains `gha-creds-*.json`;
  - every `uses:` line in `.github/workflows/*.yml` ends in `@` plus 40 hex characters (comment allowed after);
  - no `pnpm dlx` in the `Dockerfile` or any workflow;
  - every `cloud-sql-proxy` download is followed by a sha256 check before `chmod +x`;
  - no `mode=max` in a build step whose context includes the workspace (in practice: no `mode=max` together with `context: .`);
  - the `node:` images in the `Dockerfile` carry `@sha256:`.
  The script's header comment is updated to say it now covers build hygiene too (task 078). Existing task 076 checks stay.

## Out of scope
- Branch protection / rulesets, a `production` environment, the deploy waiting for CI (SEC-02).
- Fork PR approval settings, `ci.yml` `permissions:`, a `workflow_ref` condition in Workload Identity (SEC-15).
- Upgrading any action, Node or the proxy to a newer version; Dependabot / Renovate for the pins (Parking lot).
- Any Terraform change.
- Deleting the old build caches: an owner step after merge, below.

## Acceptance criteria
- [ ] `bash infra/scripts/test-workflows.sh` fails on `main` for each new check before the change (red output in the PR) and passes after. → the script.
- [ ] No build step in `deploy.yml` sends untracked workspace files to the builder, and no build exports intermediate layers to the cache. → test-workflows.sh checks; review of `deploy.yml`.
- [ ] Every `uses:` in all workflows is a full commit SHA with the version in a comment. → test-workflows.sh check.
- [ ] The image build uses the lockfile's `turbo`, a digest-pinned `node:22-alpine`, and a checksum-verified `cloud-sql-proxy`. → test-workflows.sh checks.
- [ ] The PR's preview deploy (`deploy.yml` on `pull_request`) passes, including the preview Playwright run. → the PR's checks.
- [ ] CI (`verify`, `e2e`) is green. → the PR's checks.
- [ ] After merge, the first `main` deploy is green. → link in the Progress log.

## Security notes
Touches the job that holds production deploy rights (`deployer-main` through Workload Identity) and the image build cache. Security-sensitive paths per `docs/SECURITY.md`: `.github/`, `infra/`, `Dockerfile`, `.dockerignore`, `.gitignore`, and `package.json` / `pnpm-lock.yaml` if touched (the `security-reviewer` runs). Fixes register gaps **SEC-01** and **SEC-05**. Must not print any token, password or credentials file content in the log while testing; the checks are text checks on the repository files only. **Owner step after merge (not part of the code):** delete `main`'s existing buildkit caches so nothing built before the fix is reused: `gh cache list --ref refs/heads/main`, then `gh cache delete <id>` for the `buildkit`/`gha` entries (or `gh cache delete --all` after checking the list). Then mark SEC-01 and SEC-05 fixed in the register.

## Approach (brief)
- Red: add the checks to `test-workflows.sh`, run, paste the failures.
- `.dockerignore` / `.gitignore` lines; drop `context: .` from the three build steps; `mode=min` on the three `cache-to`.
- Resolve each action tag to its commit SHA (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`, dereferencing annotated tags) and pin; same for the Node image digest (`docker buildx imagetools inspect node:22-alpine`).
- Dockerfile pruner: install the root's dev tools from the lockfile, then `pnpm turbo prune`.
- Proxy: version and sha256 next to each other; `echo "<sha>  cloud-sql-proxy" | sha256sum -c -` before `chmod`.
- No ADR: pinning and the build context are reversible.

## Test plan
- Acceptance: none (no app behavior). The PR's preview deploy and Playwright run, and the first `main` deploy after merge.
- Unit/component: `infra/scripts/test-workflows.sh` (red then green); `bash scripts/test-hooks.sh` unaffected.
- Storybook: none.

## Open questions
1. **Git build context on PRs:** the action's default Git context builds the commit's tree from GitHub. For `pull_request` runs that is the PR's merge ref; the implementation names the commit instead (see Progress log). If the owner wants previews built from the PR head instead, say so. If the Git context fails for another reason (e.g. it needs a token the job doesn't give it), is the fallback in the scope (path context + delete leftovers + `.dockerignore`) acceptable?
2. **Cache scopes:** PR builds read and write the same cache scopes as `main` (`scope=example-zone` etc.). With this task the cache no longer holds untracked files, but should previews get their own scopes (`scope=…-preview`)? Not in scope unless the owner adds it.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-01, SEC-05); owner: "start fixing P0".
- 2026-11-08 – Started in lane 2. Open questions answered by defaults (orchestrator): (1) build what `actions/checkout` builds today (the merge ref on PRs); the fallback (path context, delete leftovers, `.dockerignore`) is acceptable if the Git context fails; (2) no separate preview cache scopes: GitHub already keeps PR cache writes under the PR's own ref.
- 2026-11-08 – Implemented (lane 2). `test-workflows.sh` gained 14 checks, red on `main` (14 failed, the 21 task 076 checks passed), then green (35 passed). **Build context: a Git context** (the main route, no fallback needed): the three `docker/build-push-action` steps name `context: ${{ env.BUILD_CONTEXT }}`, the Git URL of `github.sha` (see the fix-loop entry below). The repository is public, so the builder needs no extra token (the action passes `github.token` anyway). `.dockerignore` and `.gitignore` also ignore `gha-creds-*.json`, `cloud-sql-proxy` and `*.log`, in case a path context comes back. `cache-to` is `mode=min` on all three. Actions are pinned to the commits of their current major tags (annotated tags dereferenced): checkout v4.4.0, setup-node v4.4.0, upload-artifact v4.6.2, pnpm/action-setup v4.3.0, auth v2.1.13, setup-gcloud v2.2.1, setup-buildx-action v3.12.0, build-push-action v6.19.2. `node:22-alpine` is pinned to its index digest, so each platform resolves from it. The pruner installs only the root importer from the lockfile (`pnpm install --frozen-lockfile --ignore-scripts --filter mng-projects`, turbo 2.11.9) before `turbo prune`. The proxy download moved to `infra/scripts/get-cloud-sql-proxy.sh` (version v2.14.1 and its sha256 from the release notes, also checked against a download), which runs `sha256sum -c` before `chmod +x`. Verified locally: `pnpm test:infra` green; the dashboard image built from `git archive HEAD` (tracked files only, as the Git context sends them); actionlint reports only the existing SC2034 (unused `i` in the migration step's wait loop). Only the PR's preview deploy can verify the Git context build, the pinned actions and the proxy checksum on the runner.
- 2026-11-08 – Review fix loop (lane 2). The builds now name `BUILD_CONTEXT: ${{ github.server_url }}/${{ github.repository }}.git#${{ github.sha }}` (one workflow-level env) instead of the action's default, which names a PR's merge ref (`refs/pull/<N>/merge`) and resolves it when each build runs; with the SHA every image comes from the commit the job checked out and migrated. `test-workflows.sh` is now positive and probed: every build-push step must name exactly that context, BUILD_CONTEXT is defined once and never reassigned, and no other image build (`docker build`, `buildx build/bake`, `bake-action`, `gcloud builds`) may appear in the workflows; pins need their `# v<version>` comment; every external image in the Dockerfile (`FROM`, `--from=`) needs a digest; `npx`, `dlx`, `bunx` and versioned `pnpm` runs are refused; any `cloud-sql-proxy` download (curl or wget, any host, continued lines joined) needs a later `sha256sum -c` without `||`; and `get-cloud-sql-proxy.sh` is run against a local file with the wrong hash (non-zero exit, file removed; its download URL is overridable for that test, the hash is not). 22 probes run the checks on a copy with one change each (`context: "."`, `context: ${{ github.workspace }}`, `context: . # x`, no context, a moving ref, a reassignment, `run: docker buildx build`, `bake-action`, a tag pin, a pin without comment, `FROM docker.io/library/node:22-alpine`, `COPY --from=` an unpinned image, `npx`, `pnpm exec turbo@2`, `pnpm dlx`, `mode=max`, an unchecked wget and a two-line curl from another host, `|| true` on the sha256 line, a URL override in a workflow, a missing `.dockerignore` line) and expect the matching check to fail. Red: 9 failed (52 passed), green: 61 passed, also under Ubuntu's mawk. BuildKit fetched this repository by commit SHA locally (`docker buildx build https://github.com/<repo>.git#<sha>`); fetching a PR merge commit by SHA is verified by the PR's preview deploy.
- 2026-11-08 – In review. Before the PR: the owner approved deleting `main`'s old image build caches; 218 `buildkit`/`index` entries deleted (only the two pnpm store caches remain).
- 2026-11-08 – Merged (PR #56). The preview deploy built all three images from the Git URL of the PR's commit and passed `@smoke`/`@poc` 4/4. The first `main` deploy after the merge (f0cff2a) succeeded: Git context by SHA, Node by digest, proxy checksum checked.

## Parking lot
- Dependabot (or Renovate) for GitHub Actions SHAs, the Node digest and the proxy version.
- Separate cache scopes for previews and `main` (question 2).
- `google-github-actions/auth` with `create_credentials_file: false` where no step needs the file.
- pnpm is pinned by version only (`packageManager: pnpm@10.18.0`, fetched by corepack), not by hash: add the `+sha512.…` suffix.
