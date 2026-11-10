# Task 083: Only the deploy workflows can get a deployer token

- **Status:** in-progress
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

## Parking lot
- Require the `production` environment claim for `deployer-main` once SEC-02 adds the environment.
