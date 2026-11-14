# Task 112: The owner's infra config (and any workstation secret) on any machine

- **Status:** todo
- **Milestone:** cross-cutting (infra tooling)
- **Zone / package:** `scripts/setup.sh` (subcommands `infra` and `infra-push`), `scripts/test-setup.sh`, `infra/workstation-secrets.list` (new, committed, no entries), `.claude/hooks/guard.sh` + `scripts/test-hooks.sh` (refuse both subcommands in agent sessions), `.gitignore` (`infra/.config-generation`), `infra/README.md` ("Working from another machine", "Onboarding a GCP admin", rotation). No Terraform change. Commits `test:` → `feat(scripts):` → `docs:`.
- **Feature file:** none (tooling; `scripts/test-setup.sh` and `scripts/test-hooks.sh` are the checks)
- **Depends on:** task 111 (`scripts/setup.sh`); ADR-0013 (accepted 2026-11-14). One owner step before the first pull from another machine: the first upload (README one-liner).

## Why
`infra/terraform.tfvars` and `infra/backend.hcl` exist only on the owner's Mac, and every other machine needs them to
plan and apply. ADR-0013: non-secret config lives in the state bucket's `config/`; real secrets live in Secret
Manager. None exists for workstations today, but the script has to be ready to fetch one.

## Scope
- `bash scripts/setup.sh infra [--project <id>] [--force] [--no-install] [--yes]`:
  1. **Tools**, checked and installed like task 111 (same `--no-install` / `--yes` and confirmation):
     - Terraform >= 1.9 (`infra/versions.tf`): `brew install hashicorp/tap/terraform` on macOS; on Linux the
       HashiCorp release zip pinned by version and sha256 in the script.
     - gcloud: `brew install --cask google-cloud-sdk` on macOS; on Linux Google's apt repository (its signed key).
       Cloud Shell has it.
     - gh: `brew install gh` on macOS; on Linux GitHub's apt repository (its signed key). Codespaces has it.
  2. **Logins:** an active gcloud account and application-default credentials, or it prints `gcloud auth login`,
     `gcloud auth application-default login` and `gcloud auth application-default set-quota-project <id>` and exits
     1. `gh auth status`, or it prints `gh auth login`. The project comes from `--project`, else
     `gcloud config get project`, else it exits 1 asking for `--project`.
  3. **Owner config (class 2):** downloads `gs://<id>-tfstate/config/terraform.tfvars` and `config/backend.hcl` into
     `infra/` with mode 600, and records their generations in `infra/.config-generation` (git-ignored). A missing
     object: exits 1 with the first-upload one-liner. A local file that differs: refuses ("infra/terraform.tfvars
     differs from the stored copy: run `setup.sh infra-push`, or `--force` to replace it") without showing either
     content; `--force` replaces it.
  4. **Workstation secrets (class 3, the hook point):** reads `infra/workstation-secrets.list`. Each line is
     `<secret name> <path in the repo>`; `#` comments and blank lines are skipped. The file is committed with a
     header comment and no entries. For each entry:
     - `gcloud secrets versions access latest --secret=<name> --project <id>` into the path, mode 600;
     - refuses a path that isn't git-ignored (`git check-ignore`), and refuses `..` and absolute paths;
     - never prints the value.

     With no entries it makes no Secret Manager call and prints "No workstation secrets listed". Adding a secret later
     is a Terraform change (container and per-person IAM, ADR-0013) plus one line here.
  5. `terraform -chdir=infra init -backend-config=backend.hcl`. Never `plan` or `apply`; it ends with "Ready:
     `cd infra && terraform plan`".
- `bash scripts/setup.sh infra-push`:
  - uploads `terraform.tfvars` and `backend.hcl` to `config/` with `--if-generation-match` from
    `infra/.config-generation`;
  - refuses when the stored copy changed since this machine's pull ("pull first: `setup.sh infra`");
  - uploads nothing else (never a file from `workstation-secrets.list`);
  - prints the new generations only.
- **Agents:**
  - both subcommands exit 1 when run inside an agent session (the variable Claude Code sets in its shell; to confirm
    while implementing);
  - `.claude/hooks/guard.sh` refuses a Bash call running `setup.sh infra` or `setup.sh infra-push`, because the
    variable can be unset;
  - the guard already refuses `gcloud secrets versions access` and edits to `*.tfvars` and `backend.hcl`.
- **`infra/README.md`:**
  - **"Working from another machine":** what lives where (ADR-0013 classes), the first upload (owner, once:
    `gcloud storage cp infra/terraform.tfvars infra/backend.hcl gs://<id>-tfstate/config/`), then
    `bash scripts/setup.sh` and `bash scripts/setup.sh infra`, and `infra-push` after an edit.
  - **"Onboarding a GCP admin"**, three steps:
    1. Precondition: the state bucket's IAM and the person's project roles are managed by Terraform, a task of its
       own drafted when a second admin is named. Until then there is a single admin.
    2. The owner applies that change.
    3. The new admin runs `bash scripts/setup.sh` and `bash scripts/setup.sh infra`.

    Removing an admin: remove them in Terraform and apply, then rotate.
  - **Rotation:** anyone who could read the state could read every production secret. After removing such a person,
    replace the Terraform-generated passwords and auth secrets (`terraform apply -replace=…` on each generated value,
    then a `main` deploy). The exact addresses are listed from `infra/main.tf`.
  - **Adding a workstation secret:** the Terraform secret and IAM, then a line in `infra/workstation-secrets.list`.

## Out of scope
- Any Terraform change: the bucket IAM, a second admin's roles, a Secret Manager secret. Each comes with its need.
- Data Access logs (SEC-32): not now (owner, 2026-11-14).
- `terraform plan` or `apply` from the script.
- Developer setup (task 111).

## Acceptance criteria
Checked by `scripts/test-setup.sh` with stub `gcloud`, `gh`, `terraform`, `brew` and `apt-get` that record their
calls, plus `scripts/test-hooks.sh`.
- [ ] `infra` writes both files with mode 600, records the generations, and runs
      `terraform -chdir=infra init -backend-config=backend.hcl` and never `plan` or `apply`.
- [ ] A differing local `terraform.tfvars` without `--force`: exits 1, keeps the local file, prints neither content.
- [ ] No active gcloud account: exits 1 and prints the three login commands.
- [ ] Terraform missing on macOS with `--yes`: runs the HashiCorp tap install; on Linux a wrong zip sha256 fails
      before anything is installed.
- [ ] An empty `workstation-secrets.list` makes no `gcloud secrets` call. A test manifest with one entry writes its
      git-ignored path with mode 600. A path that isn't git-ignored is refused. The value never appears in the output.
- [ ] `infra-push` passes the recorded generation and uploads only the two files; a stale generation is refused.
- [ ] Inside an agent session both subcommands exit 1, and the guard refuses them in a Bash call
      (`test-hooks.sh`).
- [ ] No output line ever contains a value from the test's tfvars or secret.

## Security notes
Touches `scripts/`, `.claude/`, `.gitignore` and `infra/` docs, so the `security-reviewer` runs. The config holds an
email and a billing account id, not credentials. Its readers are the state bucket's readers, who can already read
every production secret (ADR-0013). Real secrets stay in Secret Manager. They are fetched only through the
manifest, only into git-ignored paths, and only by a human session (rule 7; the guard). Push uses generation
preconditions, so one machine never silently overwrites another's edit. Relates to SEC-13 (agents' credentials) and
SEC-32 (no read audit; accepted for now).

## Approach (brief)
Extend task 111's script with two subcommands sharing its install and confirmation functions; stubs in
`test-setup.sh`. No new ADR (ADR-0013).

## Test plan
- Scripts: `scripts/test-setup.sh` (red first), `scripts/test-hooks.sh` (guard refusals), both in CI's `verify` job.
- By hand (owner): the first upload, then `setup.sh infra` on a second machine or Cloud Shell, then `terraform plan`
  there showing no changes beyond the known drift.
- Acceptance / Storybook: none.

## Open questions
- (none: the owner answered on 2026-11-14)

## Progress log
- 2026-11-14 – Drafted with task 111. Owner's rule (ADR-0013): no secrets → state bucket; real secrets → Secret
  Manager. Only the owner for now; onboarding a GCP admin waits for the bucket IAM in Terraform.

## Parking lot
- A task to manage the state bucket's IAM and a second admin's roles in Terraform, when a second admin is named.
- Data Access logs for Cloud Storage and Secret Manager (SEC-32) when a second admin joins.
- A check in `infra-push` that the tfvars holds no credential-like value (gitleaks on the file).
