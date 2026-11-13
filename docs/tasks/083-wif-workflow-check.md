# Task 083: Only the deploy workflows can get a deployer token

- **Status:** in-review
- **Milestone:** cross-cutting (security)
- **Zone / package:** `infra/main.tf` (Workload Identity provider), `infra/README.md`. Commit type `fix(infra)`.
- **Feature file:** none (no app behavior; `terraform plan` and a hand check on a preview)
- **Depends on:** task 068 (WIF provider: done). Not on SEC-02, but see "Out of scope".

## Why
The Workload Identity provider decides which deployer a GitHub token becomes by event and ref only (`attribute.deploy_target`, `infra/main.tf`). So any workflow in the repository that runs on a push to `main` can act as `deployer-main`, and any workflow on a same-repo pull request as `deployer-preview`, not just the deploy workflows. Requiring the workflow file narrows that to the two files that are reviewed for it. Register **SEC-15** (WIF part).

## Scope
- The provider's mapping gives `deploy_target = 'main'` only when, on top of today's event and ref, the token's `job_workflow_ref` (or `workflow_ref`; the implementer checks which one GitHub sets for a non-reusable workflow and names it in the PR) is `<repo>/.github/workflows/deploy.yml@refs/heads/main`.
- `'preview'` only for `deploy.yml` on a `pull_request` event, or `preview-cleanup.yml` on a `pull_request` event; everything else maps to `'none'`.
- The repository name in the condition comes from `var.github_repository` (no hard-coded name).
- `infra/README.md`: the WIF section says which workflows can get which deployer.
- `terraform plan` output in the PR: one in-place update of the provider, nothing else.

## Out of scope
- Binding the `main` deployer to a GitHub `production` environment (the `environment` claim): after SEC-02's environment exists (owner setting); parking lot.
- Fork-PR approval for all outside contributors (owner setting, SEC-15): listed as an owner step in the PR.
- `ci.yml` permissions (task 082).
- Splitting deployers further (task 068 parking lot).

## Acceptance criteria
- [ ] `terraform plan` shows only the provider's attribute mapping changing (output in the PR).
- [ ] After the owner applies it: the PR's own preview deploy gets `deployer-preview` and passes; the PR's close runs `preview-cleanup.yml` successfully; the first `main` deploy after merge passes.
- [ ] A hand check on the PR (a temporary workflow, removed before merge, that only asks for a preview token and prints whether it got one): refused. Its run link in the PR.
- [ ] `infra/README.md` describes the rule.

## Security notes
Touches `infra/` (the identity that can deploy production and read its secrets), so the `security-reviewer` runs. A wrong expression fails closed (deploys can't authenticate) rather than open; the risk is a broken `main` deploy, which is why it waits until after the POC and why the owner applies it at a quiet time and watches the next deploy. The temporary check workflow must request a token and nothing else, and must not merge. Fixes part of register gap **SEC-15**.

## Approach (brief)
Read a real token's claims from a deploy run's debug output (claim names only, never the token) to confirm the field and its exact value; change the `deploy_target` mapping; `terraform plan`; owner applies; hand checks. No ADR (it narrows the rule task 068 recorded).

## Test plan
- Acceptance: none.
- Infra: `terraform validate` and `plan`; the hand checks above.
- Storybook: none.

## Open questions
1. **Order with task 082:** default: independent; either can merge first.
2. **Apply window:** default: the owner applies right after merge on a day with no demo, then watches the next `main` deploy; if it fails, revert the mapping with `terraform apply` of the previous commit.

## Progress log
- 2026-11-08 – Drafted from the first full security review (SEC-15); owner: "start fixing the P1 gaps".
- 2026-11-10 – Started in lane 4 (owner: "do the rest of the P1"; build now, merge after the POC demo on 2026-11-13). Defaults; the owner applies after the POC.
- 2026-11-10 – Claim: **`workflow_ref`** (`<owner>/<repo>/.github/workflows/<file>@<ref>`), which GitHub sets on every Actions token and which names the top-level workflow of the run. `job_workflow_ref` names the file that defines the job: for our non-reusable workflows it's the same value, but it would let another workflow that calls `deploy.yml` (if it ever gained `workflow_call`) act as `deploy.yml`. Not read from a real token (no step prints claims, and printing one is out of bounds); GitHub's documented claims, checked by the hand checks below. Mapping: `main` = `push` + `refs/heads/main` + `workflow_ref == <repo>/.github/workflows/deploy.yml@refs/heads/main`; `preview` = `pull_request` + `workflow_ref` starting with `…/deploy.yml@refs/` or `…/preview-cleanup.yml@refs/` (the ref part is `refs/pull/<n>/merge`; a prefix, so a closed PR's ref can't break cleanup; `@refs/` so a file named `deploy.yml@x.yml` doesn't match); else `none`. A missing claim fails the mapping (refused). Red: 15 `WIF:` checks in `test-workflows.sh` (via `wif-deploy-target.mjs`, which evaluates the mapping as the CEL subset JavaScript reads the same way), 9 failing before the change; then green with 4 probes (122 checks). Review: the preview prefixes end in `@refs/` (red: a file named `deploy.yml@x.yml` or `preview-cleanup.yml@x.yml` got `preview`), the evaluator refuses a bare claim (JavaScript truthiness where CEL errors; red probe), and a closed-PR case keeps the any-ref tolerance: 126 checks. `terraform fmt`/`validate` clean. `terraform plan`: 0 add, 7 change, 0 destroy: the provider plus the 6 Cloud Run `scaling` zeros parked in task 068 (cosmetic, already there on `main`); `-target=google_iam_workload_identity_pool_provider.github`: 0 add, 1 change, 0 destroy, only `attribute.deploy_target`.
- **Owner: apply and verify** (after 2026-11-13, at a quiet time; the hand checks need the change live before merge):
  1. On this PR's branch: `cd infra && terraform init -backend-config=backend.hcl && terraform plan -target=google_iam_workload_identity_pool_provider.github -out=tfplan`. Expect `0 to add, 1 to change, 0 to destroy`, only `"attribute.deploy_target"`.
  2. `terraform apply tfplan` (the target leaves the parked `scaling` drift alone), then `rm tfplan`. If the API rejects the expression, nothing changed: report it.
  3. Wait 5 minutes (IAM propagation), then re-run this PR's **Deploy** run (`gh run rerun <run id>`). Expect the run to pass, its `gcloud` and image push steps included (the auth step alone proves nothing: without `token_format` it doesn't exchange the token).
  4. Hand check: push a temporary `.github/workflows/wif-check.yml` (`on: pull_request`, top-level `permissions: {contents: read, id-token: write}`, one job, one step: `google-github-actions/auth` at the SHA `deploy.yml` pins, with `workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}`, `service_account: ${{ vars.GCP_DEPLOYER_SA_PREVIEW }}`, `token_format: access_token` and `create_credentials_file: false`; nothing else, no secrets). Expect its run to fail at the auth step with `iam.serviceAccounts.getAccessToken` denied. Put the run link in the PR, then delete the file in its own commit before merge.
  5. Merge. Expect `preview-cleanup.yml` (the PR's close) to pass and the first `main` **Deploy** run to pass; watch its auth step.
- **Revert path** (a deploy can't authenticate): before merge, `git switch main`, then `terraform plan -target=google_iam_workload_identity_pool_provider.github -out=tfplan` and `terraform apply tfplan` restore the old mapping. After merge, `git revert` the `fix(infra)` commit on a branch, the same targeted plan and apply from it, re-run the failed deploy, and merge the revert. Either way the change fails closed: until reverted, deploys fail at auth and nothing is deployed. Between step 2 and the merge, **no other infra applies from `main`**: an apply from `main` would put the old mapping back (and the next apply from this branch would narrow it again).

## Parking lot
- Require the `production` environment claim for `deployer-main` once SEC-02 adds the environment.
