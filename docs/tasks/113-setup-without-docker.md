# Task 113: Local database and file storage without Docker (setup fallback for sandboxes)

- **Status:** in-review
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
- [x] Sandbox (Linux, no Docker and it can't be installed), `--yes`: writes `create_main_cluster = false`, then
      installs `postgresql-16`. It runs `initdb` from `SETUP_PG_BIN` outside the repo, then `pg_ctl` on 5433
      (localhost only). It creates `app` for `postgres`/`postgres`, then migrates. Nothing is written inside the
      repo.
- [x] Without `--yes`, with a terminal, it asks before installing Postgres; declining installs nothing for it and
      exits 1. With no terminal and no `--yes`, it installs nothing for it. With `--no-docker`, no fallback step runs
      and it exits 0.
- [x] A rerun runs no `initdb` and creates no role or database, warns about neither 5433 nor 4443, and exits 0.
- [x] A distro without `postgresql-16` adds the PostgreSQL apt repository first; a server other than 16.15 prints
      the `rls-pins` warning.
- [x] The fake-gcs-server binary is checked against its sha256 and started on 4443 with the compose file's
      arguments and a `-filesystem-root` outside the repo; a wrong sha256 fails before it runs.
- [x] `services` run twice leaves one of each running; `services --stop` stops both.
- [x] Without root or `sudo`: it says Postgres can't be installed, still starts the emulator and finishes
      `pnpm install`, and exits 1 naming only Postgres.

## Security notes
Touches `scripts/` (the `security-reviewer` runs). Downloaded code: the fake-gcs-server binary is pinned by sha256,
and Postgres comes from apt (and the PostgreSQL repository's signed key) after a confirmation. The database listens
on localhost only, with the compose file's throwaway credentials; the storage emulator checks no signatures, like the
Docker one, and listens on localhost. `sudo` only for `apt-get`.
- **fake-gcs-server path traversal (WEB-1, SEC-52).** 1.52.2's filesystem backend joins object names to its root
  unescaped, so `POST /upload/storage/v1/b/app-files/o?uploadType=media&name=../../../../.bashrc` writes wherever the
  emulator's user can (as root: anywhere). CORS is `*`, so any web page could send that request to it. The fallback
  therefore runs it with `-backend memory` and no filesystem root, on 127.0.0.1. Uploaded dev files are lost when the
  emulator restarts (README and the summary say so). The Docker path keeps its filesystem backend, contained by the
  container, but still publishes 4443 on all interfaces.
- **Pid files (INF-1).** A pid file is trusted only when that process's command line names the program
  (`/proc/<pid>/cmdline`, else `ps`). A stale or reused pid is dropped, never stopped. Postgres needs a verified
  `postmaster.pid` as well as `pg_ctl status`.
- **Root (INF-2).** The data directory is created (`mkdir -m 700`) and written (`postgresql.conf`) by the postgres
  user, and a symlinked `PG_PARENT` or `PG_DATA` is refused.
- **Well-known password (INF-3).** User `postgres` with password `postgres` on localhost:5433, as in the compose file.
  On a shared host, other local users can log in with it (TCP needs the password, which is public). Run the
  fallback only on a machine of your own or in a single-user sandbox.
- **System-wide drop-in.** `/etc/postgresql-common/createcluster.d/mng-projects.conf` stays after setup and applies to
  every later `postgresql-*` install (README says so).
- **Test hooks.** `SETUP_OS_RELEASE` and `SETUP_APT_ROOT` are read only when `setup.sh` is sourced (SUP-1, SUP-4).
  `SETUP_PG_BIN` and `SETUP_GCS_WAIT` are also read in a normal run, because the tests run the whole setup with stub
  servers. `SETUP_PG_BIN` only names programs run as the database's owner (and psql), which whoever sets the
  environment could already put on `PATH`.

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
  - the shared refactor is a dependency;
  - `-filesystem-root` outside the repo, and `initdb`/`pg_ctl` from `/usr/lib/postgresql/16/bin` (`SETUP_PG_BIN`);
  - Postgres gets its own `ask` unless `--yes`;
  - `--no-docker` skips the fallback, and `down`/`denied` are offered the fallback with the `docker_fix` hint;
  - reruns are idempotent and the port warnings know the fallback's own servers;
  - the "repo stays clean" criterion is a snapshot check, and task 111's "task 113 message" checks are replaced.

  Orchestrator's choices: `create_main_cluster = false` before installing (no stray server on 5432); without root
  the emulator still starts and the exit names only Postgres.
- 2026-11-14 – Started in lane 2.
- 2026-11-14 – Implemented in lane 2 (`test:` red 226 passed / 56 failed, then `feat(scripts):`, `docs:`):
  - Pinned values. The PGDG key `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`, as postgresql.org's apt instructions
    show it (https://www.postgresql.org/download/linux/ubuntu/, "gpg --show-key"; wiki.postgresql.org/wiki/Apt) and as
    `gpg --show-keys` reads it from https://www.postgresql.org/media/keys/ACCC4CF8.asc (one key, "PostgreSQL Debian
    Repository"). fake-gcs-server 1.52.2 per the release's `checksums.txt`, matching the downloaded archives:
    `Linux_amd64` `de4cd120…69337` and `Linux_arm64` `dae42a5a…dda1b`. The Darwin archives aren't pinned, because
    macOS uses Docker Desktop.
  - `create_main_cluster = false` goes into a drop-in, `/etc/postgresql-common/createcluster.d/mng-projects.conf`
    (`install -D -m 644`, as root), not into `createcluster.conf` itself. postgresql-common installs that file
    through `ucf`, which asks about a copy edited before the install. The drop-in directory has been read since
    postgresql-common 183, and the criterion is unchanged.
  - As root (sandboxes often are), initdb refuses to run. The database goes in the postgres user's home
    (`getent passwd postgres`, else `/var/lib/postgresql`), at `.../mng-projects/postgres`, and `initdb`/`pg_ctl`
    run through `runuser -u postgres --`. The emulator, its pid file and its log stay in
    `${XDG_DATA_HOME:-~/.local/share}/mng-projects`.
  - initdb gets `-U postgres --pwfile` (password `postgres`), `--auth-host=scram-sha-256 --auth-local=trust` (like the
    Docker image), `-E UTF8 --locale=C.UTF-8 --locale-provider=icu --icu-locale=en-US` (en-US collation without the
    `locales` package), and `unix_socket_directories` in its own data directory, because `/var/run/postgresql`
    belongs to the postgres user. pg_ctl gets `-o "-p 5433 -h localhost"`. The emulator binds `-host 127.0.0.1`.
  - `setup.sh services` is for Linux only (elsewhere it points to `pnpm db:up`) and downloads nothing: before a
    setup it says to run setup.sh. A running server is left alone.
  - Test hooks: `SETUP_PG_BIN` (passed by `run`/`call` so a CI runner's own `/usr/lib/postgresql/16/bin` never runs)
    and `SETUP_OS_RELEASE`. Writes to the system (the PGDG repository) are checked through `call` with
    `SETUP_APT_ROOT`, which keeps SUP-4.
  - Task 111's checks: "sandbox: prints the task 113 message" and "sandbox without sudo: prints the task 113
    message" are now fallback checks. So are "sandbox: no database steps" and "sandbox: exits 1" (now: migrates,
    exits 0) and "services: comes with task 113" (now: services on macOS points to `pnpm db:up`).
  - `test-setup.sh`: 283 passed under /bin/bash 3.2 (macOS). Under bash 5.2 (Ubuntu 24.04 container) 282 passed;
    the one failure, `.gitignore: ignores .env.* temp files`, comes from the container, since the worktree's `.git`
    points outside it. `test-hooks.sh`: 148 passed.
- 2026-11-14 – Review fixes (security review and reviewer). The coordinator accepted both deviations (the
  createcluster.d drop-in; `runuser -u postgres` as root). Red first: 288 passed / 19 failed.
  - WEB-1 / SEC-52: the emulator runs with `-backend memory`, no `-filesystem-root`, on 127.0.0.1. Uploads are lost
    when it stops (README, summary, `services`). Register row SEC-52 (P3), counts recomputed.
  - INF-1: pid files are trusted only when `/proc/<pid>/cmdline` (else `ps -ww -o args=`) names `fake-gcs-server` or
    `.../bin/postgres`. A stale emulator pid file is dropped and never killed. A stale `postmaster.pid` is removed
    before `pg_ctl start`, and `pg_running` needs it verified as well as `pg_ctl status`. The port warnings know
    the fallback's servers only when the fallback runs (Linux, not `--no-docker`, Docker not running).
  - INF-2: `PG_PARENT` is made by the database's owner (`as_pg mkdir -p -m 700`) and `postgresql.conf` is appended
    through `as_pg tee -a`. A symlinked `PG_PARENT` or `PG_DATA` is refused. The `unix_socket_directories` line is
    added when it's missing, not only right after initdb.
  - The summary shows `Database: … data in $PG_DATA` (the postgres user's home as root) and the in-memory storage.
  - `services`: with Docker running and no fallback database it says "Uses Docker here: pnpm db:up". With the data
    kept but the package gone (a restarted sandbox) it says to rerun setup.sh.
  - The emulator start watches the process for `SETUP_GCS_WAIT` seconds (1; tests 0.2) instead of `sleep 1`, and
    fails as soon as it has ended. It doesn't stop early on an answering port: on a machine where Docker's emulator
    already holds 4443, that would accept a process about to exit.
  - `SETUP_OS_RELEASE` is now read only when sourced. `SETUP_PG_BIN` and `SETUP_GCS_WAIT` stay readable in a normal
    run (documented in the header and Security notes), because the run-mode tests need stub servers.
  - Test stubs: the server stubs' command lines name `.../bin/postgres` and `fake-gcs-server`; `ps` is linked into
    the world. New checks: memory backend, pid reuse (an unrelated `sleep` in both pid files: `services` starts both,
    `--stop` leaves the sleep running), root symlink refusal, never `runuser` when not root, an emulator that exits at
    once, Postgres that doesn't start, `--locale-provider=icu`, "names only Postgres" via `file storage:`.

## Parking lot
- dnf and apk (Fedora, Alpine) for the fallback.
- Running the e2e suite in a sandbox (Playwright's browser dependencies may need more than apt there).
