# Task 113: Local database and file storage without Docker (setup fallback for sandboxes)

- **Status:** in-progress
- **Milestone:** cross-cutting (tooling)
- **Zone / package:** `scripts/setup.sh` (the sandbox path and a `services` subcommand), `scripts/test-setup.sh`, `README.md` (one line under Quick start). Commits `test:` → `feat(scripts):` → `docs:`.
- **Feature file:** none (no app behavior; `scripts/test-setup.sh` is the check)
- **Depends on:**
  - task 111 (`scripts/setup.sh`, done: PR #99);
  - the shared `refactor(scripts):` commit on `refactor/setup-seams`, merged first. It adds subcommand dispatch with
    a parser per subcommand, usage as a heredoc, `download_checked`, `ensure_brew`, `add_apt_repo`, an empty
    `services` arm that keeps today's message, and test helpers per task. After its security review,
    `add_apt_repo <key-url> <keyring> <list-line> <fingerprint>` takes the repository's pinned key fingerprint (one
    key, checked with `gpg --show-keys` before anything is written), a keyring under `/usr/share/keyrings/` or
    `/etc/apt/keyrings/`, and a one-line `signed-by=` list line without `trusted=`; `download_checked` needs a
    64-hex sha256 pin and fetches over https only.

  Split from task 111 (owner, 2026-11-14).

## Why
claude.ai/code and other sandboxes have no Docker, so `pnpm db:up` can't run there, and task 111 stops with "No
Docker here". The owner wants a working local setup in every environment. That means the same database and file
storage as `docker-compose.yml`, so `.env.example` works unchanged.

## Scope
- Where task 111 detects a sandbox (Linux, not WSL, Docker absent or its daemon unreachable after the install step),
  `bash scripts/setup.sh` runs this fallback instead of printing the task 113 message. That happens in section 7's
  no-Docker branch.
  - "Unreachable" includes Docker present but `down` or `denied`. A Linux workstation whose daemon is only stopped is
    therefore offered the fallback. Because of the prompt below, that's an offer, not a silent install. The output
    still prints task 111's `docker_fix` hint ("If Docker should run here: …").
  - `--no-docker` skips the fallback too: no database and no file storage, as task 111 defines it.
  - **Postgres 16** from apt (through `sudo` unless root):
    - Its own confirmation: task 111's confirmation happens before it knows whether the Docker install works (a
      failed `apt-get install docker.io` only warns). The script asks "Install PostgreSQL 16 …?" with `ask`, unless
      `--yes`. With no terminal and no `--yes`, it installs nothing for the fallback and says to rerun with `--yes`.
    - Before installing, it writes `create_main_cluster = false` to
      `/etc/postgresql-common/createcluster.conf` (as root), so the package doesn't create and start a default `16/main`
      cluster on 5432.
    - `postgresql-16` comes from the distro when it has it (Ubuntu 24.04), else from the PostgreSQL apt repository
      (`apt.postgresql.org`, its signed key) through `add_apt_repo`. The PostgreSQL (PGDG) key's fingerprint is looked
      up during this task from postgresql.org's apt instructions, checked against the downloaded key, and pinned in
      `setup.sh` with a comment naming the source (like the fnm hashes). Docker stays on the distro's packages
      (`docker.io`); if Docker's own apt repository is ever added, its key gets a pinned fingerprint too.

    The script:
    - finds `initdb` and `pg_ctl` in `/usr/lib/postgresql/16/bin` (not on `PATH` on Debian or Ubuntu; only `psql` is,
      through postgresql-common). The test hook `SETUP_PG_BIN` replaces that directory;
    - runs `initdb` as the current user (no systemd) in `${XDG_DATA_HOME:-$HOME/.local/share}/mng-projects/postgres`;
    - starts it with `pg_ctl` on port 5433, `listen_addresses = 'localhost'`;
    - sets up user `postgres` with password `postgres` and database `app`, then runs `pnpm db:migrate`.

    When the server's version isn't 16.15 (the Docker image and CI), it warns: the infra role-check pins
    (`infra/scripts/rls-pins.mjs`, `pnpm test:infra`) may differ on another minor; the app, unit and database tests
    are unaffected.
  - **File storage:** the `fake-gcs-server` release binary at the compose file's version (1.52.2), for `amd64` or
    `arm64`. It is pinned by one sha256 per architecture and fetched with `download_checked`, which checks the hash
    before it runs. It starts in the background with the compose file's arguments (`-scheme http -port 4443
    -public-host localhost:4443 -external-url http://localhost:4443 -cors-headers …`), with
    `-data packages/storage/dev-bucket` (the seed buckets, only read). It also gets
    `-filesystem-root ${XDG_DATA_HOME:-$HOME/.local/share}/mng-projects/storage`, because the default `/storage` needs
    root (the container's volume). Its pid file and log go next to the database's.
  - **A rerun** finds the data directory, so it doesn't run `initdb` again or recreate the role or database. It
    starts whatever isn't running, migrates and exits 0.
  - **Port warnings:** task 111's `ours_running` also recognizes the fallback's own Postgres (5433) and emulator
    (4443) from their pid files, so a rerun doesn't warn about them.
  - **Task 111's checks:** "sandbox: prints the task 113 message" and "sandbox without sudo: prints the task 113
    message" become checks of the fallback. On the fallback path the summary's "After a restart: pnpm db:up" line
    names `bash scripts/setup.sh services`.
- `bash scripts/setup.sh services` (the shared refactor's `services` arm) starts both again after a restart (idempotent: a running one is left alone);
  `bash scripts/setup.sh services --stop` stops them. The setup summary names it in place of `pnpm db:up`.
- Without root and without `sudo`, it can't install Postgres. It says so, still fetches and starts the emulator (no
  root needed), finishes everything else (unit tests run) and exits 1 naming only Postgres.
- Data lives outside the repo, so `git status` stays clean and lanes (`scripts/lane.sh`, which uses `psql` when
  present) work.
- `README.md`: one line saying that without Docker, `setup.sh` runs Postgres and file storage directly and
  `bash scripts/setup.sh services` restarts them.

## Out of scope
- macOS without Docker (task 111 installs Docker Desktop), and WSL (Docker Desktop's WSL integration, task 111).
- Changing `pnpm db:up`, `docker-compose.yml` or `.env.example`.
- Other package managers than apt (dnf, apk): parking lot.

## Acceptance criteria
Checked by `scripts/test-setup.sh` with stubs that record their calls: `uname`, `apt-get`, `sudo`, `docker`, `psql`,
`curl` and `pnpm` on `PATH`, and `initdb` and `pg_ctl` in `SETUP_PG_BIN`. The stubs go in this task's own helper
(e.g. `pg_world`), not on the shared `present` line, so task 112's lane doesn't conflict. The test world isn't a git
repo, so "the repo stays clean" means that nothing is written inside the repo (the snapshot helper).
- [ ] Sandbox (Linux, no Docker and it can't be installed), `--yes`: writes `create_main_cluster = false`, then
      installs `postgresql-16`. It runs `initdb` from `SETUP_PG_BIN` outside the repo, then `pg_ctl` on 5433
      (localhost only). It creates `app` for `postgres`/`postgres`, then migrates. Nothing is written inside the
      repo.
- [ ] Without `--yes`, with a terminal, it asks before installing Postgres; declining installs nothing for it and
      exits 1. With no terminal and no `--yes`, it installs nothing for it. With `--no-docker`, no fallback step runs
      and it exits 0.
- [ ] A rerun runs no `initdb` and creates no role or database, warns about neither 5433 nor 4443, and exits 0.
- [ ] A distro without `postgresql-16` adds the PostgreSQL apt repository first; a server other than 16.15 prints
      the `rls-pins` warning.
- [ ] The fake-gcs-server binary is checked against its sha256 and started on 4443 with the compose file's
      arguments and a `-filesystem-root` outside the repo; a wrong sha256 fails before it runs.
- [ ] `services` run twice leaves one of each running; `services --stop` stops both.
- [ ] Without root or `sudo`: it says Postgres can't be installed, still starts the emulator and finishes
      `pnpm install`, and exits 1 naming only Postgres.

## Security notes
Touches `scripts/` (the `security-reviewer` runs). Downloaded code: the fake-gcs-server binary is pinned by sha256,
and Postgres comes from apt (and the PostgreSQL repository's signed key) after a confirmation. The database listens
on localhost only, with the compose file's throwaway credentials; the storage emulator checks no signatures, like the
Docker one, and listens on localhost. `sudo` only for `apt-get`.

## Approach (brief)
Functions in `scripts/setup.sh` (install Postgres, init and start, fetch and start the emulator, `services`). They use
the shared refactor's `ask`, `as_root`, `download_checked` and `add_apt_repo`, and fill its `services` arm. The changes
to the main flow are section 3 (ports), section 7 (the no-Docker branch) and the summary. Stubbed in this task's own
helper in `test-setup.sh`. No ADR.

## Test plan
- Scripts: `scripts/test-setup.sh` (red first), in CI's `verify` job (task 111).
- By hand: a run in claude.ai/code through to `pnpm dev`, `pnpm --filter @repo/db test:db` and
  `pnpm --filter @repo/storage test:storage`.
- Acceptance / Storybook: none.

## Open questions
- (none)

## Progress log
- 2026-11-14 – Split from task 111 (owner took the default): the no-Docker fallback for claude.ai/code and other
  sandboxes.
- 2026-11-14 – Readiness check against task 111's merged script (planner). Task text corrected:
- 2026-11-14 – Started in lane 2.
  - the shared refactor is a dependency;
  - `-filesystem-root` outside the repo, and `initdb`/`pg_ctl` from `/usr/lib/postgresql/16/bin` (`SETUP_PG_BIN`);
  - Postgres gets its own `ask` unless `--yes`;
  - `--no-docker` skips the fallback, and `down`/`denied` are offered the fallback with the `docker_fix` hint;
  - reruns are idempotent and the port warnings know the fallback's own servers;
  - the "repo stays clean" criterion is a snapshot check, and task 111's "task 113 message" checks are replaced.

  Orchestrator's choices: `create_main_cluster = false` before installing (no stray server on 5432); without root
  the emulator still starts and the exit names only Postgres.

## Parking lot
- dnf and apk (Fedora, Alpine) for the fallback.
- Running the e2e suite in a sandbox (Playwright's browser dependencies may need more than apt there).
