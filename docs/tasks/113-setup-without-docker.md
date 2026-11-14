# Task 113: Local database and file storage without Docker (setup fallback for sandboxes)

- **Status:** todo
- **Milestone:** cross-cutting (tooling)
- **Zone / package:** `scripts/setup.sh` (the sandbox path and a `services` subcommand), `scripts/test-setup.sh`, `README.md` (one line under Quick start). Commits `test:` → `feat(scripts):` → `docs:`.
- **Feature file:** none (no app behavior; `scripts/test-setup.sh` is the check)
- **Depends on:** task 111 (`scripts/setup.sh`, its environment detection and install functions). Split from task 111 (owner, 2026-11-14).

## Why
claude.ai/code and other sandboxes have no Docker, so `pnpm db:up` can't run there, and task 111 stops with "No
Docker here". The owner wants a working local setup in every environment. That means the same database and file
storage as `docker-compose.yml`, so `.env.example` works unchanged.

## Scope
- Where task 111 detects a sandbox (Linux, not WSL, Docker absent or its daemon unreachable after the install step),
  `bash scripts/setup.sh` runs this fallback instead of printing the task 113 message:
  - **Postgres 16** from apt (through `sudo` unless root, after task 111's confirmation): `postgresql-16` from the
    distro when it has it (Ubuntu 24.04), else the PostgreSQL apt repository (`apt.postgresql.org`, its signed key).
    The script:
    - runs `initdb` as the current user (no systemd) in `${XDG_DATA_HOME:-$HOME/.local/share}/mng-projects/postgres`;
    - starts it with `pg_ctl` on port 5433, `listen_addresses = 'localhost'`;
    - sets up user `postgres` with password `postgres` and database `app`, then runs `pnpm db:migrate`.

    When the server's version isn't 16.15 (the Docker image and CI), it warns: the infra role-check pins
    (`infra/scripts/rls-pins.mjs`, `pnpm test:infra`) may differ on another minor; the app, unit and database tests
    are unaffected.
  - **File storage:** the `fake-gcs-server` release binary at the compose file's version (1.52.2), for `amd64` or
    `arm64`, pinned by sha256 in the script and checked before it runs. It starts in the background with the same
    arguments as `docker-compose.yml` (port 4443, `-data packages/storage/dev-bucket`). Its pid file and log go next
    to the database's.
- `bash scripts/setup.sh services` starts both again after a restart (idempotent: a running one is left alone);
  `bash scripts/setup.sh services --stop` stops them. The setup summary names it in place of `pnpm db:up`.
- Without root and without `sudo`, it can't install Postgres. It says so, finishes everything else (unit tests run)
  and exits 1 naming the missing piece.
- Data lives outside the repo, so `git status` stays clean and lanes (`scripts/lane.sh`, which uses `psql` when
  present) work.
- `README.md`: one line saying that without Docker, `setup.sh` runs Postgres and file storage directly and
  `bash scripts/setup.sh services` restarts them.

## Out of scope
- macOS without Docker (task 111 installs Docker Desktop), and WSL (Docker Desktop's WSL integration, task 111).
- Changing `pnpm db:up`, `docker-compose.yml` or `.env.example`.
- Other package managers than apt (dnf, apk): parking lot.

## Acceptance criteria
Checked by `scripts/test-setup.sh` with stubs on `PATH` that record their calls (`uname`, `apt-get`, `sudo`, `docker`,
`initdb`, `pg_ctl`, `psql`, `curl`, `pnpm`).
- [ ] Sandbox (Linux, no Docker and it can't be installed): installs `postgresql-16` and runs `initdb` outside the
      repo, then `pg_ctl` on 5433 (localhost only). Creates `app` for `postgres`/`postgres`, then migrates. `git status`
      stays clean.
- [ ] A distro without `postgresql-16` adds the PostgreSQL apt repository first; a server other than 16.15 prints
      the `rls-pins` warning.
- [ ] The fake-gcs-server binary is checked against its sha256 and started on 4443 with the compose file's
      arguments; a wrong sha256 fails before it runs.
- [ ] `services` run twice leaves one of each running; `services --stop` stops both.
- [ ] Without root or `sudo`: it says Postgres can't be installed, still finishes `pnpm install` and exits 1.

## Security notes
Touches `scripts/` (the `security-reviewer` runs). Downloaded code: the fake-gcs-server binary is pinned by sha256,
and Postgres comes from apt (and the PostgreSQL repository's signed key) after a confirmation. The database listens
on localhost only, with the compose file's throwaway credentials; the storage emulator checks no signatures, like the
Docker one, and listens on localhost. `sudo` only for `apt-get`.

## Approach (brief)
Functions in `scripts/setup.sh` next to task 111's (install Postgres, init and start, fetch and start the emulator,
`services`), stubbed in `test-setup.sh`. No ADR.

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

## Parking lot
- dnf and apk (Fedora, Alpine) for the fallback.
- Running the e2e suite in a sandbox (Playwright's browser dependencies may need more than apt there).
