# Task 111: One command to set up a new workspace for local development

- **Status:** todo
- **Milestone:** cross-cutting (tooling)
- **Zone / package:** `scripts/setup.sh` (new), `scripts/test-setup.sh` (new), `.github/workflows/ci.yml` (the `verify` job runs the test), `.gitignore` (nothing new expected: fallback data lives outside the repo), `README.md` (Quick start, Windows line, "Onboarding a new person"), `CLAUDE.md` Commands line (drafted for the owner, who edits it). Commits `test:` → `feat(scripts):` → `docs:`.
- **Feature file:** none (no app behavior; `scripts/test-setup.sh` is the check, as `scripts/test-lane.sh` is for lanes)
- **Depends on:** nothing open. ADR-0013 (accepted 2026-11-14) sets that local development shares no secret.

## Why
The owner works from other machines and cloud terminals and won't remember the steps, and more people may join. One
command takes a fresh clone to "`pnpm dev` works and the tests run" on any of them, installing what is missing, with
nothing secret to copy.

## Scope

### Environments (detected, never asked)
| Environment | Detected by | Docker source | Package manager |
|---|---|---|---|
| macOS | `uname -s` = `Darwin` | Docker Desktop (Homebrew cask) | Homebrew |
| Linux (incl. Codespaces, Cloud Shell) | `uname -s` = `Linux`, no WSL marker; `CODESPACES=true` / `CLOUD_SHELL=true` only change hints | the distro's `docker.io` + `docker-compose-v2` when missing and installable; Codespaces and Cloud Shell usually have it | `apt-get` (with `sudo` unless root) |
| Windows through WSL2 (Ubuntu) | `WSL_DISTRO_NAME` set or `microsoft` in `/proc/version` | Docker Desktop for Windows with WSL integration; the script never installs `docker.io` inside WSL | `apt-get` (the Linux path) |
| Windows outside WSL (Git Bash, MSYS, Cygwin) | `uname -s` starts with `MINGW`, `MSYS` or `CYGWIN` | none | none: it prints "Run this inside WSL2: `wsl --install -d Ubuntu`, then clone the repo inside WSL and rerun `bash scripts/setup.sh`" and exits 1 without changing anything |
| Sandbox without Docker (claude.ai/code and similar) | Linux, not WSL, and Docker absent or its daemon unreachable after the install step (no daemon, no permission, no systemd) | none: **Part B fallback** | `apt-get` |

Native PowerShell and cmd aren't supported: one `README.md` line says to install WSL2 and run the script inside it
(no `setup.ps1`).

### Part A: the setup
`bash scripts/setup.sh [--no-install] [--yes] [--no-docker] [--skip-browsers]`. Bash 3.2 compatible (macOS's default
bash): it runs before Node or pnpm exist.
1. **Detects the environment** (table above) and prints it on the first line ("Environment: WSL2 (Ubuntu)").
2. **Checks every tool at once:** git, curl, openssl, jq and perl (the guard hook needs both), Node with the major in
   `.nvmrc`, Docker with `docker compose` v2 and a reachable daemon. Prints one line per missing or wrong tool.
3. **Installs what is missing**, after one confirmation listing everything it will install (`--yes` answers yes;
   without a terminal and without `--yes` it installs nothing, lists what is missing and exits 1):
   - macOS: Homebrew (`brew install`) for git, jq, openssl and the Docker Desktop cask (then "start Docker Desktop
     once and rerun"). If Homebrew itself is missing: question 1.
   - Linux and WSL: `apt-get install -y` (through `sudo` unless root) for git, curl, openssl, jq and perl; on plain
     Linux also `docker.io docker-compose-v2` when Docker is missing (then "start a new shell" if the user was added
     to the `docker` group).
   - **WSL, Docker not reachable:** installs nothing for Docker and prints the fix: "Docker isn't reachable from WSL.
     Install Docker Desktop for Windows, then Settings → Resources → WSL integration → turn on `<distro>`, apply,
     and rerun in a new WSL shell." It exits 1 unless `--no-docker`.
   - Node: the `.nvmrc` version through the version manager already there (nvm or fnm; Cloud Shell and Codespaces
     have nvm). With neither: fnm, by `brew install fnm` on macOS, or on Linux and WSL its release binary pinned by
     version and sha256 in the script (like `infra/scripts/get-gitleaks.sh`), failing on a mismatch.
   - pnpm: `corepack enable` and the `packageManager` version; never a global npm install.
4. **`--no-install`** (check only): installs nothing, prints the exact command for each missing tool, exits 1 when
   anything is missing, 0 otherwise.
5. **`.env`:** if absent, copies `.env.example` and replaces the `BETTER_AUTH_SECRET` placeholder with
   `openssl rand -base64 32`; file mode 600. If present, never changes it, and prints the names (never the values) of
   keys in `.env.example` it lacks.
6. `pnpm install --frozen-lockfile`.
7. **Database and file storage:** with Docker, `pnpm db:up`, waits for the database healthcheck (60 s, then an error
   naming port 5433), `pnpm db:migrate`. Never `pnpm db:generate`. In a sandbox without Docker: Part B. `--no-docker`
   skips this step entirely and says so in the summary.
8. **Browsers:** `pnpm --filter @repo/e2e exec playwright install chromium` (on Linux and WSL with `--with-deps`,
   which uses `sudo`; with `--no-install` only the command is printed). `--skip-browsers` skips it.
9. Warns (doesn't fail) when ports 3000–3002, 4443, 5433 or 6006 are taken.
10. **Summary:** the environment, what was installed, what was skipped, how to start the services after a restart
    (`pnpm db:up`, or `bash scripts/setup.sh services` on the fallback), and next steps (`pnpm dev`, sign up,
    `pnpm --filter @repo/dashboard seed:demo --email <you>`; GCP admins: `bash scripts/setup.sh infra`, task 112).

- Rerunning on a workspace that is set up installs nothing, changes no file and exits 0.
- Never prints a secret value; never calls `gcloud`, `gh` or `terraform`.
- `scripts/test-setup.sh` runs in CI's `verify` job.

### Part B: the no-Docker fallback (sandboxes such as claude.ai/code)
Same database and storage as `docker-compose.yml`, so `.env.example` works unchanged:
- **Postgres 16** from apt: `postgresql-16` from the distro when it has it (Ubuntu 24.04), else the PostgreSQL apt
  repository (`apt.postgresql.org`, its signed key). The script runs `initdb` as the current user (no systemd) in
  `${XDG_DATA_HOME:-$HOME/.local/share}/mng-projects/postgres`, starts it with `pg_ctl` on port 5433, user
  `postgres` / password `postgres`, database `app`, then `pnpm db:migrate`. When the server's version isn't 16.15
  (the Docker image and CI), it warns: the infra role-check pins (`infra/scripts/rls-pins.mjs`, `pnpm test:infra`)
  may differ on another minor; the app, unit and database tests are unaffected.
- **File storage:** the `fake-gcs-server` release binary at the compose file's version (1.52.2), for `amd64` or
  `arm64`, pinned by sha256 in the script and checked before it runs. It is started in the background with the same
  arguments as `docker-compose.yml` (port 4443, `-data packages/storage/dev-bucket`). Its pid file and log go next
  to the database's.
- `bash scripts/setup.sh services` starts both again after a restart (idempotent; a running one is left alone);
  `bash scripts/setup.sh services --stop` stops them.
- Without root and without `sudo`, it can't install Postgres: it says so, finishes everything else (unit tests run)
  and exits 1 naming the missing piece.
- Data lives outside the repo, so `git status` stays clean and lanes (`scripts/lane.sh`, which uses `psql` when
  present) work.

### Onboarding (README)
- Quick start becomes `bash scripts/setup.sh`. The template-era `pnpm db:generate` "first time only" line goes.
- **Windows:** one line: install WSL2 (`wsl --install -d Ubuntu`) and Docker Desktop with WSL integration, then run
  everything inside WSL.
- **"Onboarding a new person":**
  - **Developer:** the owner adds them as a GitHub collaborator; they clone and run `bash scripts/setup.sh`. Nothing
    secret is shared and they need no GCP access (previews and deploys run in CI). Claude Code picks up the
    committed `.claude/` settings and guard; personal `~/.claude/` settings stay theirs to set.
  - **GCP admin:** not until the state bucket's IAM is in Terraform (ADR-0013); then the developer steps plus
    `bash scripts/setup.sh infra` (task 112; details in `infra/README.md`).
  - **Leaving:** remove the GitHub access. A former GCP admin: `infra/README.md` (remove in Terraform, rotate).
- The `CLAUDE.md` Commands line for `scripts/setup.sh`, drafted in the PR for the owner.

## Out of scope
- Owner/GCP setup (gcloud, Terraform, `gh`, `terraform.tfvars`, `backend.hcl`, Secret Manager): task 112.
- Native Windows (PowerShell, cmd) beyond the README line; a `setup.ps1`.
- A `.devcontainer/` for Codespaces (parking lot).
- Copying personal Claude Code settings or memory (`~/.claude/`): a manual step, listed in the README.
- Changing `pnpm db:up` or `docker-compose.yml`.

## Acceptance criteria
Checked by `scripts/test-setup.sh`: a temporary clone and stubs on `PATH` that record their calls (`uname`, `brew`,
`apt-get`, `sudo`, `docker`, `node`, `nvm`/`fnm`, `corepack`, `pnpm`, `curl`, `initdb`, `pg_ctl`, `psql`). The
environment comes from the stubbed `uname`, environment variables and a test `/proc/version` path.

Part A: one per environment path
- [ ] **macOS** with jq and Docker missing, `--yes`: runs `brew install jq` and the Docker Desktop cask, then the
      remaining steps.
- [ ] **Linux** (also with `CODESPACES=true`) with jq missing, `--yes`: runs `sudo apt-get install -y jq` (no
      `sudo` when root), then the remaining steps.
- [ ] **Cloud Shell** (`CLOUD_SHELL=true`) with every tool present and nvm on the wrong Node: runs only
      `nvm install` / `nvm use` for the `.nvmrc` version, no apt or brew.
- [ ] **WSL** with Docker not reachable: installs no `docker.io`, prints the WSL-integration fix naming the distro,
      exits 1; with `--no-docker` it finishes with exit 0.
- [ ] **Windows outside WSL** (`uname` = `MINGW64_NT-…`): prints the WSL2 instruction, exits 1, changes nothing.

Part A: common behavior
- [ ] `--no-install` with jq missing and Node 20: installs nothing, prints the command for each, exits 1, creates no
      `.env` and runs no `pnpm install`. No terminal and no `--yes`: the same.
- [ ] A fresh clone gets a `.env` with mode 600 and a `BETTER_AUTH_SECRET` that isn't the placeholder; two clones
      get different secrets; the secret never appears in the output. An existing `.env` with a key missing stays
      byte-for-byte unchanged, and the key's name is printed.
- [ ] Steps run in order (install, `db:up`, migrate, chromium) and never `db:generate`, `gcloud`, `gh` or
      `terraform`. When the database never gets healthy it fails within the timeout naming port 5433. A second run
      installs nothing, changes no file and exits 0. A wrong sha256 for the fnm binary fails before anything runs.

Part B: sandbox without Docker
- [ ] Linux, no Docker and it can't be installed: installs `postgresql-16`, runs `initdb` outside the repo and
      `pg_ctl` on 5433, creates `app` for `postgres`/`postgres`, then migrates; the fake-gcs-server binary is
      checked against its sha256 and started on 4443; `git status` stays clean.
- [ ] A wrong fake-gcs-server sha256 fails before it runs. `services` started twice leaves one of each running.
      Without root or `sudo`, it says Postgres can't be installed, still finishes `pnpm install` and exits 1.

## Security notes
Touches `scripts/` and `.github/workflows/ci.yml` (the `security-reviewer` runs). No shared secret: the only secret is
generated per machine (ADR-0013 class 4).
- **Printing `.env` values, overwriting a hand-edited `.env`, a world-readable `.env`:** covered by the criteria above.
- **Running downloaded code:** the fnm and fake-gcs-server binaries are pinned by sha256. Installs go through the OS
  package manager (and the PostgreSQL apt repository's signed key) after a confirmation.
- **`sudo`:** only for `apt-get` and Playwright's `--with-deps`, never for the repo's own commands.
- **The fallback database:** it listens on localhost only (`listen_addresses = 'localhost'`) with the same
  throwaway credentials as the compose file.
- **SEC-31:** unchanged. `.env` is already git-ignored.

## Approach (brief)
One bash script with small functions (detect environment, check, plan installs, confirm, install, `.env`, services,
browsers, summary), tested with stubs like `test-lane.sh`. No new ADR (ADR-0013 covers secrets).

## Test plan
- Scripts: `scripts/test-setup.sh` (red first), in CI's `verify` job.
- By hand, through to `pnpm dev` and `pnpm test`:
  - a fresh clone on a second Mac, in Codespaces, on Cloud Shell and in WSL2 Ubuntu;
  - one run in claude.ai/code, where the fallback gets the database and storage up and
    `pnpm --filter @repo/db test:db` passes.
- Acceptance / Storybook: none.

## Open questions
1. **Homebrew missing on macOS:** install it (its official installer, after its own confirmation prompt), or stop
   with the install command? Default: install it only when absent, after a confirmation prompt (`--yes` does not
   skip that one prompt).
2. **Split Part B into its own task?** This task has 10 criteria, above the ~8 a reviewable change aims for, and
   Part B (the no-Docker fallback) is the largest piece. Default: yes. Part B becomes task 113 (its criteria and
   scope move as written). Until it lands, task 111 detects a sandbox and stops with "No Docker here: the database
   fallback comes with task 113; unit tests (`pnpm test`) work." Part A stays here.

## Progress log
- 2026-11-14 – Drafted from the owner's request (a setup script for other workspaces) and answers:
  - every environment: macOS, Linux (Codespaces, Cloud Shell), Windows through WSL2, and claude.ai/code through a
    no-Docker fallback;
  - the script installs missing tools, with `--no-install` and `--yes`;
  - onboarding stays simple for more people.

## Parking lot
- `.devcontainer/devcontainer.json` (Node 22, docker-in-docker, forwarded ports) for Codespaces.
- A `--check` flag that runs lint, typecheck and unit tests at the end.
- Copying personal Claude Code settings or memory between machines.
- A `setup.ps1` that installs WSL2 from native Windows.
