# Task 111: One command to set up a new workspace for local development

- **Status:** done (PR #99)
- **Milestone:** cross-cutting (tooling)
- **Zone / package:** `scripts/setup.sh` (new), `scripts/test-setup.sh` (new), `.github/workflows/ci.yml` (the `verify` job runs the test), `README.md` (Quick start, Windows line, "Onboarding a new person"), `CLAUDE.md` Commands line (drafted for the owner, who edits it). Commits `test:` → `feat(scripts):` → `docs:`.
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
| Sandbox without Docker (claude.ai/code and similar) | Linux, not WSL, and Docker absent or its daemon unreachable after the install step (no daemon, no permission, no systemd) | none: stops with "No Docker here: the database fallback comes with task 113; unit tests (`pnpm test`) work." after finishing the other steps (exit 1; with `--no-docker`, exit 0) | `apt-get` |

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
     once and rerun"). If Homebrew itself is missing, the script installs it with Homebrew's official installer, only
     after a separate confirmation prompt that `--yes` does not skip; declining prints the install command and exits
     1 (owner, 2026-11-14).
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
   naming port 5433), `pnpm db:migrate`. Never `pnpm db:generate`. In a sandbox without Docker: the task 113 message above. `--no-docker`
   skips this step entirely and says so in the summary.
8. **Browsers:** `pnpm --filter @repo/e2e exec playwright install chromium` (on Linux and WSL with `--with-deps`,
   which uses `sudo`; with `--no-install` only the command is printed). `--skip-browsers` skips it.
9. Warns (doesn't fail) when ports 3000–3002, 4443, 5433 or 6006 are taken.
10. **Summary:** the environment, what was installed, what was skipped, how to start the services after a restart
    (`pnpm db:up`), and next steps (`pnpm dev`, sign up,
    `pnpm --filter @repo/dashboard seed:demo --email <you>`; GCP admins: `bash scripts/setup.sh infra`, task 112).

- Rerunning on a workspace that is set up installs nothing, changes no file and exits 0.
- Never prints a secret value; never calls `gcloud`, `gh` or `terraform`.
- `scripts/test-setup.sh` runs in CI's `verify` job.

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
- The no-Docker fallback (Postgres and file storage without Docker, `setup.sh services`): task 113.

## Acceptance criteria
Checked by `scripts/test-setup.sh`: a temporary clone and stubs on `PATH` that record their calls (`uname`, `brew`,
`apt-get`, `sudo`, `docker`, `node`, `nvm`/`fnm`, `corepack`, `pnpm`, `curl`). The
environment comes from the stubbed `uname`, environment variables and a test `/proc/version` path.

Part A: one per environment path
- [x] **macOS** with jq and Docker missing, `--yes`: runs `brew install jq` and the Docker Desktop cask, then the
      remaining steps. With Homebrew missing and `--yes`, it still asks before installing Homebrew; declining
      installs nothing and exits 1 with the install command.
- [x] **Linux** (also with `CODESPACES=true`) with jq missing, `--yes`: runs `sudo apt-get install -y jq` (no
      `sudo` when root), then the remaining steps.
- [x] **Cloud Shell** (`CLOUD_SHELL=true`) with every tool present and nvm on the wrong Node: runs only
      `nvm install` / `nvm use` for the `.nvmrc` version, no apt or brew.
- [x] **WSL** with Docker not reachable: installs no `docker.io`, prints the WSL-integration fix naming the distro,
      exits 1; with `--no-docker` it finishes with exit 0.
- [x] **Windows outside WSL** (`uname` = `MINGW64_NT-…`): prints the WSL2 instruction, exits 1, changes nothing.
- [x] **Sandbox without Docker** (Linux, not WSL, Docker absent and not installable): finishes `.env`,
      `pnpm install` and the browsers, prints the task 113 message, exits 1; with `--no-docker` exit 0.

Part A: common behavior
- [x] `--no-install` with jq missing and Node 20: installs nothing, prints the command for each, exits 1, creates no
      `.env` and runs no `pnpm install`. No terminal and no `--yes`: the same.
- [x] A fresh clone gets a `.env` with mode 600 and a `BETTER_AUTH_SECRET` that isn't the placeholder; two clones
      get different secrets; the secret never appears in the output. An existing `.env` with a key missing stays
      byte-for-byte unchanged, and the key's name is printed.
- [x] Steps run in order (install, `db:up`, migrate, chromium) and never `db:generate`, `gcloud`, `gh` or
      `terraform`. When the database never gets healthy it fails within the timeout naming port 5433. A second run
      installs nothing, changes no file and exits 0. A wrong sha256 for the fnm binary fails before anything runs.

## Security notes
Touches `scripts/` and `.github/workflows/ci.yml` (the `security-reviewer` runs). No shared secret: the only secret is
generated per machine (ADR-0013 class 4).
- **Printing `.env` values, overwriting a hand-edited `.env`, a world-readable `.env`:** covered by the criteria above.
- **Running downloaded code:** the fnm binary is pinned by sha256. Installs go through the OS package manager after a
  confirmation; Homebrew's own installer only after its separate prompt.
- **`sudo`:** only for `apt-get` and Playwright's `--with-deps`, never for the repo's own commands.
- **SEC-31:** unchanged. `.env` is already git-ignored.

## Approach (brief)
One bash script with small functions (detect environment, check, plan installs, confirm, install, `.env`, database,
browsers, summary), tested with stubs like `test-lane.sh`. No new ADR (ADR-0013 covers secrets).

## Test plan
- Scripts: `scripts/test-setup.sh` (red first), in CI's `verify` job.
- By hand, through to `pnpm dev` and `pnpm test`:
  - a fresh clone on a second Mac, in Codespaces, on Cloud Shell and in WSL2 Ubuntu;
  - one run in claude.ai/code, to see the task 113 message and `pnpm test` pass.
- Acceptance / Storybook: none.

## Open questions
- (none: the owner took both defaults on 2026-11-14)

## Progress log
- 2026-11-14 – Drafted from the owner's request (a setup script for other workspaces) and answers:
  - every environment: macOS, Linux (Codespaces, Cloud Shell), Windows through WSL2, and claude.ai/code through a
    no-Docker fallback (split into task 113);
  - the script installs missing tools, with `--no-install` and `--yes`;
  - onboarding stays simple for more people.
- 2026-11-14 – Owner took both defaults: Homebrew installed only when absent, after its own prompt (`--yes` doesn't
  skip it); the no-Docker fallback split into task 113. This task stops in a sandbox with the task 113 message.
- 2026-11-14 – Started in lane 1 (`chore/workspace-setup-script`).
- 2026-11-14 – Implemented:
  - `scripts/test-setup.sh` red first (27 passed, 56 failed: no `setup.sh`), then green (87 checks, with
    `--skip-browsers` and the port warning added); in CI's `verify` job.
  - `scripts/setup.sh`: fnm 1.39.0 pinned by the release assets' sha256 (GitHub's release API `digest`, checked
    against the downloaded `fnm-linux.zip` and `fnm-arm64.zip`). Homebrew's cask is `docker-desktop` (`docker` is
    its old name). `setup.sh infra` says it comes with task 112.
  - README: Quick start, the Windows line and "Onboarding a new person". The leaver step points at ADR-0013:
    `infra/README.md` has no runbook for removing a GCP admin yet.
  - A real `--no-install` run on the owner's Mac (lane 1): Node 23.6.0 fails the `.nvmrc` major (22) check, as
    specified; the main checkout's containers hold 5433 and 4443, so a lane (another compose project) warns.
- 2026-11-14 – Reviews: the Node check stays strict (== `.nvmrc`, coordinator). Fixed, each with a red check first
  (113 passed, 19 failed; the Homebrew-prompt and WSL checks are test-only, shown to fail on a mutated script):
  - tests: the exact Homebrew prompt and its yes path; WSL without Docker; the owner's Mac (Node 23, no manager)
    and the fnm download's success path (the test's copy of `setup.sh` pins the hash of a local zip);
  - no sudo: Docker is dropped with a warning, so a sandbox still reaches `.env`, install and the task 113 message;
    tools that must install stop before asking, as does a distro without `apt-get`;
  - Playwright's `--with-deps` (sudo apt-get) only when approved, in the plan or asked on its own (SUP-2);
  - after a Node change: the fnm profile line or `nvm use`, and "open a new shell before pnpm dev";
  - the `.env` temp file is removed on exit, INT and TERM; `.gitignore` ignores `.env.*` except `.env.example`
    (SUP-1; SEC-31 partly fixed); "created" only when `.env` was;
  - `packageManager` pinned with `+sha512` (npm registry `dist.integrity` for pnpm 10.18.0, checked against the
    tarball; corepack accepts it and refuses a wrong hash); hints and summary wording; register updated.
- 2026-11-14 – Done: merged (PR #99, `aaaed85`). A shared `refactor(scripts):` commit follows on
  `refactor/setup-seams` before tasks 112 and 113 start: subcommand dispatch with a parser per subcommand and usage as a
  heredoc, `download_checked` (fnm moved onto it), `ensure_brew`, `add_apt_repo`, empty `infra` / `infra-push` /
  `services` arms that keep today's messages, and test helpers per task in `test-setup.sh`.

## Parking lot
- `.devcontainer/devcontainer.json` (Node 22, docker-in-docker, forwarded ports) for Codespaces.
- A `--check` flag that runs lint, typecheck and unit tests at the end.
- Copying personal Claude Code settings or memory between machines.
- A `setup.ps1` that installs WSL2 from native Windows.
- Writing the fnm profile line (`eval "$(fnm env --use-on-cd)"`) into `~/.bashrc` / `~/.zshrc`: the script prints
  it instead.
- `package.json` `engines` → `22.x`, to match the strict `.nvmrc` check (coordinator, 2026-11-14).
- An interactive rerun on Linux asks about chromium's system libraries each time (it can't tell they're there).
- Port warnings that recognize another checkout's compose containers (`docker ps --filter publish=<port>`).
- A runbook in `infra/README.md` for removing a GCP admin (remove in Terraform, rotate the generated secrets):
  moved to task 112 (its Rotation section).
