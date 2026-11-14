#!/usr/bin/env bash
# One command from a fresh clone to "pnpm dev works and the tests run" (task 111). Local development shares no
# secret (ADR-0013 class 4): the only secret, BETTER_AUTH_SECRET, is generated here per machine.
#
# Usage: bash scripts/setup.sh --help (usage() below). A subcommand comes first (setup.sh infra ...) and takes only
# its own flags (parse_args); subcommands branch off right after environment detection.
#
# Environments: macOS (Homebrew), Linux incl. Codespaces and Cloud Shell (apt-get), Windows through WSL2 (apt-get;
# Docker comes from Docker Desktop for Windows). Windows outside WSL: it says to use WSL2 and changes nothing.
# Linux without a reachable Docker (claude.ai/code and similar): Postgres 16 and the storage emulator run directly,
# outside Docker (task 113); `setup.sh services [--stop]` starts or stops them after a restart.
#
# Bash 3.2 compatible (macOS's bash): it runs before Node or pnpm exist. It never prints a secret, never changes
# an existing .env, never runs pnpm db:generate, gcloud, gh or terraform, and uses sudo only for apt-get (its own,
# and Playwright's --with-deps once approved), an apt repository's key and list (add_apt_repo), and, on Linux without
# Docker, the createcluster.d drop-in that keeps postgresql-16 from creating a default cluster (task 113; it stays,
# system-wide). Rerunning on a set-up workspace installs nothing and changes no file.
# Tests: bash scripts/test-setup.sh, under /bin/bash; CI (Ubuntu) runs it with bash 5, so bash 3.2 is checked by
# running it on macOS.
#
# Test hooks (scripts/test-setup.sh): sourced (. scripts/setup.sh), it only defines its helpers, so the tests call
# them directly, and then SETUP_APT_ROOT puts add_apt_repo's files under a directory. SETUP_INTERACTIVE=1 treats
# stdin as a terminal; SETUP_PROC_VERSION, SETUP_BREW_PREFIXES, SETUP_PORTS and SETUP_DB_TIMEOUT replace
# /proc/version, Homebrew's install prefixes, the ports checked and the database wait (60 s). SETUP_PG_BIN replaces
# /usr/lib/postgresql/16/bin (initdb, pg_ctl, postgres) and SETUP_GCS_WAIT the storage emulator's start watch (1 s).
# Both are read in a normal run too, because the tests run the whole setup with stub servers. SETUP_PG_BIN only names
# programs run as the database's owner (and psql), which an environment that sets it could already put on PATH.
# SETUP_OS_RELEASE replaces /etc/os-release, only when sourced.
set -u

# fnm for Linux and WSL when there is neither nvm nor fnm. To upgrade: change the version and both hashes together.
# The hashes are the release assets' sha256 digests (GitHub's release API, "digest"), checked against the downloads:
#   https://github.com/Schniz/fnm/releases/tag/v<version> (fnm-linux.zip, fnm-arm64.zip)
FNM_VERSION="1.39.0"
FNM_SHA256_LINUX_X64="7807664f39d39fc518da1c35ba0181e4b3267603c4b1dedeb4b5fc6ae440a224"
FNM_SHA256_LINUX_ARM64="4eaff58b2c5bf30d0934027572dd0b5bbb60d2a1af309230b53662d4b1d45599"
# shellcheck disable=SC2016 # printed, not run
HOMEBREW_INSTALL='/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
# Without Docker (task 113). The PostgreSQL apt repository (PGDG), for a distro without postgresql-16. Its key's
# fingerprint is the one postgresql.org's apt instructions show (https://www.postgresql.org/download/linux/ubuntu/,
# "gpg --show-key"), checked against the key at PGDG_KEY_URL.
PGDG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
PGDG_FINGERPRINT="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"
PGDG_KEYRING="/usr/share/keyrings/postgresql-pgdg.gpg"
PG_MINOR="16.15" # docker-compose.yml's image and CI
# fake-gcs-server at docker-compose.yml's version. To upgrade: change the version and both hashes together. The hashes
# are the release's checksums.txt, checked against the downloads (Linux only: macOS uses Docker Desktop):
#   https://github.com/fsouza/fake-gcs-server/releases/tag/v<version> (fake-gcs-server_<version>_Linux_<arch>.tar.gz)
GCS_VERSION="1.52.2"
GCS_SHA256_LINUX_AMD64="de4cd1205e2a09ffb17272294714aaf994779e43f7e510d158b1d60a31269337"
GCS_SHA256_LINUX_ARM64="dae42a5aeab9c5bd433c6e861d4c80ec2d349f88eef3e6ab7b16df21989dda1b"

usage() {
  cat <<'EOF'
  bash scripts/setup.sh [--no-install] [--yes] [--no-docker] [--skip-browsers]
  bash scripts/setup.sh services [--stop]

  --no-install     check only: change nothing, print the command for each missing tool (exit 1 if any)
  --yes            install what is missing without asking (Homebrew itself is still asked for)
  --no-docker      skip Docker and the database and file storage (pnpm db:up, pnpm db:migrate)
  --skip-browsers  skip Playwright's chromium

  services         Linux without Docker: start the database and file storage setup.sh runs there (after a restart)
  services --stop  stop them
EOF
}

# --- Helpers -------------------------------------------------------------------------------------------------------
say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
err()  { printf 'setup: %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }
interactive() { [ -t 0 ] || [ "${SETUP_INTERACTIVE:-}" = 1 ]; }
ask() { # question: true on yes; a non-interactive run never says yes
  local answer=""
  interactive || return 1
  printf '%s [y/N] ' "$1"
  read -r answer || answer=""
  case "$answer" in y|Y|yes|YES|Yes) return 0 ;; esac
  return 1
}
INSTALLED=""; SKIPPED=""; STATUS=0
installed() { INSTALLED="${INSTALLED}  - $1"$'\n'; }
skipped()   { SKIPPED="${SKIPPED}  - $1"$'\n'; }
SUDO="sudo "; [ "$(id -u 2>/dev/null)" = 0 ] && SUDO=""
can_root() { [ -z "$SUDO" ] || has sudo; }
as_root() { # runs a command as root; false (with a warning) when there is no way to
  if [ -z "$SUDO" ]; then "$@"
  elif has sudo; then sudo "$@"
  else warn "needs root and there is no sudo: $*"; return 1; fi
}

find_brew() {
  has brew && return 0
  local prefix
  for prefix in ${SETUP_BREW_PREFIXES:-/opt/homebrew /usr/local}; do
    if [ -x "$prefix/bin/brew" ]; then eval "$("$prefix/bin/brew" shellenv)"; return 0; fi
  done
  return 1
}
# Homebrew on PATH. When it's missing: its official installer after its own question (even with --yes); exits 1 when
# declined or without a terminal.
ensure_brew() {
  find_brew && return 0
  say "Homebrew isn't installed. Its official installer is: $HOMEBREW_INSTALL"
  if ! ask "Install Homebrew now with its official installer?"; then
    say "Nothing installed. Install Homebrew with: $HOMEBREW_INSTALL"
    say "then rerun bash scripts/setup.sh."
    exit 1
  fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || die "Homebrew's installer failed"
  find_brew || die "Homebrew installed, but brew isn't found: open a new terminal and rerun"
  installed "Homebrew"
}

sha256_of() { # file: its sha256; false without sha256sum or shasum
  if has sha256sum; then sha256sum "$1" | cut -d' ' -f1
  elif has shasum; then shasum -a 256 "$1" | cut -d' ' -f1
  else return 1; fi
}
fetch() { # url file: https only, redirects too
  curl --proto '=https' --proto-redir '=https' -fsSL -o "$2" "$1"
}
# url sha256 dest: downloads (https only) into a new temp dir and checks the pinned sha256 (64 lower-case hex digits)
# before anything is at dest. Fails closed: false with the reason, nothing at dest, the temp dir removed.
download_checked() {
  local url="$1" sha="$2" dest="$3" tmp got ok=1
  case "$sha" in
    *[!0-9a-f]*|"") err "the pinned sha256 for $url isn't 64 lower-case hex digits"; return 1 ;;
  esac
  [ "${#sha}" = 64 ] || { err "the pinned sha256 for $url isn't 64 lower-case hex digits"; return 1; }
  tmp="$(mktemp -d)" || { err "mktemp failed"; return 1; }
  if ! fetch "$url" "$tmp/download"; then err "couldn't download $url"
  elif ! got="$(sha256_of "$tmp/download")" || [ -z "$got" ]; then err "no sha256sum or shasum to check $url with"
  elif [ "$got" != "$sha" ]; then err "$url doesn't match its pinned sha256; nothing installed"
  elif ! mv "$tmp/download" "$dest"; then err "couldn't write $dest"
  else ok=0; fi
  rm -rf "$tmp"
  return "$ok"
}

# key-url keyring list-line fingerprint: an apt repository signed by its own key, as root, then apt-get update.
# - keyring: /usr/share/keyrings/<name> or /etc/apt/keyrings/<name>, name of [A-Za-z0-9._-] not starting with a dot;
# - list-line: one line, signed-by=<keyring>, no trusted=; it goes into sources.list.d/<name without extension>.list;
# - fingerprint: the key's pinned primary fingerprint (40 or 64 hex digits; spaces and case don't matter). The key is
#   fetched (https only) and must hold exactly one key with that fingerprint (gpg --show-keys) before it goes
#   through gpg --dearmor into keyring (mode 644).
# False with the reason; nothing is written before every check passes. The caller installs gpg first when missing.
add_apt_repo() {
  local key_url="$1" keyring="$2" line="$3" want sources="$APT_ROOT/etc/apt/sources.list.d" name dir tmp keys ok=1
  local nl=$'\n' cr=$'\r'
  want="$(printf '%s' "${4:-}" | tr -d ' ' | tr 'a-f' 'A-F')"
  case "$want" in *[!0-9A-F]*|"") want="" ;; esac
  case "${#want}" in 40|64) ;; *) err "the pinned key fingerprint for $key_url isn't 40 or 64 hex digits"; return 1 ;; esac
  name="${keyring##*/}"; dir="${keyring%/*}"
  case "$dir" in /usr/share/keyrings|/etc/apt/keyrings) ;; *) name="" ;; esac
  case "$name" in ""|.*|*[!A-Za-z0-9._-]*)
    err "the keyring must be /usr/share/keyrings/<name> or /etc/apt/keyrings/<name> ([A-Za-z0-9._-]): $keyring"
    return 1 ;;
  esac
  case "$line" in
    *"$nl"*|*"$cr"*) err "the apt line for $key_url must be one line"; return 1 ;;
    *trusted=*) err "the apt line for $key_url must not say trusted="; return 1 ;;
    *"signed-by=$keyring]"*|*"signed-by=$keyring "*) ;;
    *) err "the apt line for $key_url must be signed by its key (signed-by=$keyring)"; return 1 ;;
  esac
  name="${name%.*}"
  has gpg || { err "gpg is needed to add the apt repository for $key_url"; return 1; }
  tmp="$(mktemp -d)" || { err "mktemp failed"; return 1; }
  if ! fetch "$key_url" "$tmp/key"; then err "couldn't download $key_url"
  elif ! keys="$(gpg --batch --show-keys --with-colons "$tmp/key" 2>/dev/null)"; then err "$key_url isn't a key gpg can read"
  elif ! keys="$(printf '%s\n' "$keys" | awk -F: '$1 == "pub" { p = 1; next } $1 == "fpr" && p { print $10; p = 0 }')" ||
    [ -z "$keys" ]; then err "$key_url isn't a key gpg can read"
  elif [ "$(printf '%s\n' "$keys" | wc -l | tr -d ' ')" != 1 ]; then err "$key_url holds more than one key"
  elif [ "$keys" != "$want" ]; then err "$key_url's fingerprint $keys isn't the pinned $want; nothing added"
  elif ! gpg --batch --dearmor < "$tmp/key" > "$tmp/keyring"; then err "$key_url isn't a key gpg can read"
  elif ! printf '%s\n' "$line" > "$tmp/list"; then err "couldn't write the apt line"
  elif ! as_root mkdir -p "$APT_ROOT$dir" "$sources"; then err "couldn't create $APT_ROOT$dir or $sources"
  elif ! { as_root cp "$tmp/keyring" "$APT_ROOT$keyring" && as_root chmod 644 "$APT_ROOT$keyring"; }; then
    err "couldn't write $APT_ROOT$keyring"
  elif ! { as_root cp "$tmp/list" "$sources/$name.list" && as_root chmod 644 "$sources/$name.list"; }; then
    err "couldn't write $sources/$name.list"
  else ok=0; fi
  rm -rf "$tmp"
  [ "$ok" = 0 ] || return 1
  as_root apt-get update || { err "apt-get update failed after adding $sources/$name.list"; return 1; }
}

# --- Database and file storage without Docker (task 113) -----------------------------------------------------------
# Linux without a reachable Docker: Postgres 16 from apt and the fake-gcs-server release binary run directly, on
# localhost:5433 and localhost:4443 with docker-compose.yml's settings, so .env.example works unchanged. Data, pid files
# and logs live outside the repo in DATA_HOME. As root the database lives in the postgres user's home and runs as that
# user (initdb refuses root).
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/mng-projects"
PG_BIN="${SETUP_PG_BIN:-/usr/lib/postgresql/16/bin}" # initdb and pg_ctl aren't on PATH on Debian or Ubuntu
PG_ADMIN_URL="postgres://postgres:postgres@localhost:5433/postgres" # docker-compose.yml's throwaway credentials
GCS_DIR="$DATA_HOME/fake-gcs-server-$GCS_VERSION"; GCS_BIN="$GCS_DIR/fake-gcs-server"
GCS_PID="$DATA_HOME/fake-gcs-server.pid"; GCS_LOG="$DATA_HOME/fake-gcs-server.log"
OS_RELEASE="/etc/os-release"
PG_PARENT=""; PG_DATA=""; PG_LOG=""
pg_paths() { # sets PG_PARENT, PG_DATA, PG_LOG: in DATA_HOME, or as root in the postgres user's home
  local home=""
  if [ -z "$SUDO" ]; then
    home="$(getent passwd postgres 2>/dev/null | cut -d: -f6)"
    [ -n "$home" ] && [ -d "$home" ] || home="/var/lib/postgresql"
    PG_PARENT="$home/mng-projects"
  else PG_PARENT="$DATA_HOME"; fi
  PG_DATA="$PG_PARENT/postgres"; PG_LOG="$PG_PARENT/postgres.log"
}
# Pid files are only trusted when the process runs the program they're for, at its exact path: a pid may be reused
# after a restart.
pid_of() { # pid-file: the number on its first line
  local pid; pid="$(head -1 "$1" 2>/dev/null)"
  case "$pid" in ""|*[!0-9]*) return 1 ;; esac
  echo "$pid"
}
pid_cmd() { # pid: its command line
  if [ -r "/proc/$1/cmdline" ]; then tr '\0' ' ' < "/proc/$1/cmdline"; else ps -ww -o args= -p "$1" 2>/dev/null; fi
}
pid_is() { # pid-file text: true when its pid runs, with text in its command line
  local pid; pid="$(pid_of "$1")" && kill -0 "$pid" 2>/dev/null || return 1
  case " $(pid_cmd "$pid") " in *"$2"*) return 0 ;; esac
  return 1
}
pid_stale() { # pid-file text: true when its pid doesn't run, or runs a command line (readable) without text
  local pid cmd; pid="$(pid_of "$1")" && kill -0 "$pid" 2>/dev/null || return 0
  cmd="$(pid_cmd "$pid")"; [ -n "$cmd" ] || return 1
  case " $cmd " in *"$2"*) return 1 ;; esac
  return 0
}
gcs_running() { pid_is "$GCS_PID" "$GCS_BIN "; } # the exact path (INF-5)
# A database server command as the database's owner: the current user, or as root the postgres user with a cleared
# environment, so root's variables (tokens) never reach the server, where the public password and COPY ... TO
# PROGRAM 'env' could read them (INF-4).
as_pg() {
  if [ -z "$SUDO" ]; then runuser -u postgres -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 "$@"; else "$@"; fi
}
pg_psql() { if [ -x "$PG_BIN/psql" ]; then "$PG_BIN/psql" "$@"; else psql "$@"; fi; }
pg_installed() { [ -x "$PG_BIN/initdb" ] && [ -x "$PG_BIN/pg_ctl" ]; }
pg_running() { # pg_ctl status alone would trust a postmaster.pid naming a reused pid
  [ -f "$PG_DATA/PG_VERSION" ] && pid_is "$PG_DATA/postmaster.pid" "$PG_BIN/postgres " &&
    as_pg "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1
}
os_codename() { # this distribution's codename (VERSION_CODENAME), only [a-z0-9]; false otherwise
  local c; c="$(sed -n 's/^VERSION_CODENAME=//p' "$OS_RELEASE" 2>/dev/null | head -1 | tr -d '"')"
  case "$c" in ""|*[!a-z0-9]*) return 1 ;; esac
  echo "$c"
}

# Postgres 16 from apt, as root, once the caller has confirmed. First a createcluster.d drop-in, so the package creates
# and starts no default 16/main cluster on 5432 (a drop-in rather than createcluster.conf, which postgresql-common
# installs through ucf: an edited copy makes ucf ask). Then postgresql-16 from the distro when it has it, else from the
# PostgreSQL apt repository. False with the reason.
install_pg() {
  local tmp codename ok=1 dropin="$APT_ROOT/etc/postgresql-common/createcluster.d/mng-projects.conf"
  as_root apt-get update || warn "apt-get update failed; trying the install anyway"
  tmp="$(mktemp)" || { err "mktemp failed"; return 1; }
  if printf '%s\n' "# bash scripts/setup.sh (task 113): no default cluster; setup.sh runs its own on port 5433" \
      "create_main_cluster = false" > "$tmp" && as_root install -D -m 644 "$tmp" "$dropin"; then ok=0
  else err "couldn't write $dropin"; fi
  rm -f "$tmp"
  [ "$ok" = 0 ] || return 1
  if ! apt-cache show postgresql-16 >/dev/null 2>&1; then
    codename="$(os_codename)" ||
      { err "can't tell this distribution's codename (VERSION_CODENAME in /etc/os-release) for the PostgreSQL apt repository"; return 1; }
    if ! has gpg; then as_root apt-get install -y gnupg || { err "apt-get install -y gnupg failed"; return 1; }; fi
    add_apt_repo "$PGDG_KEY_URL" "$PGDG_KEYRING" \
      "deb [signed-by=$PGDG_KEYRING] https://apt.postgresql.org/pub/repos/apt $codename-pgdg main" "$PGDG_FINGERPRINT" ||
      return 1
  fi
  as_root apt-get install -y postgresql-16 || { err "apt-get install -y postgresql-16 failed"; return 1; }
}

# The database running on localhost:5433: initdb the first time (user postgres, password postgres; password auth over
# TCP and trust on its own socket, like the Docker image), then pg_ctl unless it runs. The directories are created and
# written by the database's owner (as root: the postgres user), never through a symlink. False with the reason.
pg_up() {
  local pw ok=1
  if [ -L "$PG_PARENT" ] || [ -L "$PG_DATA" ]; then
    err "$PG_PARENT or $PG_DATA is a symlink: refusing to put the database there"; return 1
  fi
  if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    as_pg mkdir -p -m 700 "$PG_PARENT" || { err "couldn't create $PG_PARENT"; return 1; }
    pw="$(mktemp)" || { err "mktemp failed"; return 1; }
    # The compose file's throwaway password; readable by the postgres user when run as root. Collation: ICU en-US,
    # close to the Docker image's glibc en_US.utf8 (not identical in every edge case) without the locales package;
    # C.UTF-8, which every Debian and Ubuntu has, for the rest.
    if printf 'postgres\n' > "$pw" && chmod 644 "$pw" &&
      as_pg "$PG_BIN/initdb" -D "$PG_DATA" -U postgres --pwfile="$pw" --auth-local=trust --auth-host=scram-sha-256 \
        -E UTF8 --locale=C.UTF-8 --locale-provider=icu --icu-locale=en-US >/dev/null; then ok=0; fi
    rm -f "$pw"
    [ "$ok" = 0 ] || { err "initdb failed for $PG_DATA"; return 1; }
  fi
  # Its sockets in its own directory: the default /var/run/postgresql belongs to the postgres user.
  if ! grep -q '^unix_socket_directories' "$PG_DATA/postgresql.conf" 2>/dev/null; then
    printf "unix_socket_directories = '%s'\n" "$(printf '%s' "$PG_DATA" | sed "s/'/''/g")" |
      as_pg tee -a "$PG_DATA/postgresql.conf" > /dev/null || { err "couldn't write $PG_DATA/postgresql.conf"; return 1; }
  fi
  pg_running && return 0
  if [ -f "$PG_DATA/postmaster.pid" ] && pid_stale "$PG_DATA/postmaster.pid" "$PG_BIN/postgres "; then
    as_pg rm -f "$PG_DATA/postmaster.pid" || { err "couldn't remove the stale $PG_DATA/postmaster.pid"; return 1; }
  fi
  as_pg "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -w -t 60 -o "-p 5433 -h localhost" start >/dev/null ||
    { err "Postgres didn't start on localhost:5433: is the port taken (lsof -i :5433)? See $PG_LOG"; return 1; }
}
# Database app (once), and a warning when the server's minor isn't the Docker image's. False with the reason.
pg_db() {
  local found version
  found="$(pg_psql "$PG_ADMIN_URL" -v ON_ERROR_STOP=1 -tAqc "select 1 from pg_database where datname = 'app'")" ||
    { err "can't connect to Postgres on localhost:5433 as postgres (see $PG_LOG)"; return 1; }
  if [ -z "$found" ]; then
    pg_psql "$PG_ADMIN_URL" -v ON_ERROR_STOP=1 -qc "create database app" || { err "couldn't create database app"; return 1; }
  fi
  version="$(pg_psql "$PG_ADMIN_URL" -tAqc "show server_version" 2>/dev/null)"; version="${version%% *}"
  [ "$version" = "$PG_MINOR" ] || warn "Postgres here is ${version:-of an unknown version}, not $PG_MINOR (docker-compose.yml and CI): the infra role-check pins (infra/scripts/rls-pins.mjs, pnpm test:infra) may differ on another minor; the app, unit and database tests are unaffected"
  return 0
}

# The pinned fake-gcs-server release into GCS_DIR, unless it's there. False with the reason.
gcs_fetch() {
  local arch sha url tmp
  [ -x "$GCS_BIN" ] && return 0
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64; sha="$GCS_SHA256_LINUX_AMD64" ;;
    aarch64|arm64) arch=arm64; sha="$GCS_SHA256_LINUX_ARM64" ;;
    *) err "no pinned fake-gcs-server for $(uname -m)"; return 1 ;;
  esac
  url="https://github.com/fsouza/fake-gcs-server/releases/download/v$GCS_VERSION/fake-gcs-server_${GCS_VERSION}_Linux_$arch.tar.gz"
  tmp="$(mktemp -d)" || { err "mktemp failed"; return 1; }
  if ! download_checked "$url" "$sha" "$tmp/release.tar.gz"; then :
  elif ! tar -xzf "$tmp/release.tar.gz" -C "$tmp" fake-gcs-server; then err "couldn't unpack $url"
  elif ! { mkdir -p "$GCS_DIR" && mv "$tmp/fake-gcs-server" "$GCS_BIN" && chmod 755 "$GCS_BIN"; }; then
    err "couldn't install fake-gcs-server into $GCS_DIR"
  else rm -rf "$tmp"; installed "fake-gcs-server $GCS_VERSION in $GCS_DIR"; return 0; fi
  rm -rf "$tmp"
  return 1
}
# Starts the emulator in the background with docker-compose.yml's arguments, on 127.0.0.1 only, with the seed buckets
# from packages/storage/dev-bucket (only read). Uploads stay in memory (-backend memory): 1.52.2's filesystem backend
# joins object names to its root unescaped, so an upload named ../../.bashrc writes outside it (SEC-52). They're gone
# when the emulator stops. Watches it for SETUP_GCS_WAIT seconds (1): false with the reason when it has ended by then,
# as it does at once when the port is taken. (An answering port can't tell whose server it is.)
gcs_start() {
  local nohup="" n i=0 pid
  has nohup && nohup="nohup"
  mkdir -p "$DATA_HOME" || { err "couldn't create $DATA_HOME"; return 1; }
  ${nohup:+"$nohup"} "$GCS_BIN" -scheme http -host 127.0.0.1 -port 4443 -public-host localhost:4443 \
    -external-url http://localhost:4443 -backend memory -data "${ROOT:-$PWD}/packages/storage/dev-bucket" \
    -cors-headers Content-Type,Content-Disposition,x-goog-if-generation-match,x-goog-content-length-range \
    < /dev/null >> "$GCS_LOG" 2>&1 &
  pid=$!
  echo "$pid" > "$GCS_PID"
  n="$(awk -v w="${SETUP_GCS_WAIT:-1}" 'BEGIN { n = int(w * 10); print (n < 1 ? 1 : n) }')"
  while [ "$i" -lt "$n" ]; do
    sleep 0.1; i=$((i + 1))
    kill -0 "$pid" 2>/dev/null || break
  done
  kill -0 "$pid" 2>/dev/null && return 0
  rm -f "$GCS_PID"
  err "fake-gcs-server didn't start on localhost:4443: is the port taken (lsof -i :4443)? See $GCS_LOG"
  return 1
}
gcs_up() { gcs_running && return 0; rm -f "$GCS_PID"; gcs_fetch && gcs_start; }

need_value() { # flag args-from-the-flag-on: exits 1 unless a value (not another flag) follows the flag
  case "${2:-}" in ""|-*) die "$1 needs a value" ;; esac
}

# Sourced: the helpers only. The test hooks SETUP_APT_ROOT (apt's files under a directory) and SETUP_OS_RELEASE are
# read only when sourced.
APT_ROOT=""
if [ "${BASH_SOURCE[0]}" != "$0" ]; then APT_ROOT="${SETUP_APT_ROOT:-}"; OS_RELEASE="${SETUP_OS_RELEASE:-$OS_RELEASE}"; return 0; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# --- Subcommand and its flags --------------------------------------------------------------------------------------
SUBCOMMAND="${1:-}" # "" is the developer setup
case "$SUBCOMMAND" in infra|infra-push|services) shift ;; *) SUBCOMMAND="" ;; esac
NO_INSTALL=0; YES=0; NO_DOCKER=0; SKIP_BROWSERS=0; SERVICES_STOP=0
parse_args() { # the flags $SUBCOMMAND takes. One with a value: `sub:--flag) need_value "$@"; VAR="$2"; shift ;;`
  while [ $# -gt 0 ]; do
    case "$SUBCOMMAND:$1" in
      *:-h|*:--help) usage; exit 0 ;;
      :--no-install) NO_INSTALL=1 ;;
      :--yes|:-y) YES=1 ;;
      :--no-docker) NO_DOCKER=1 ;;
      :--skip-browsers) SKIP_BROWSERS=1 ;;
      services:--stop) SERVICES_STOP=1 ;;
      *) err "unknown option '$1'"; usage >&2; exit 1 ;;
    esac
    shift
  done
}
parse_args "$@"

# --- 1. Environment ------------------------------------------------------------------------------------------------
KERNEL="$(uname -s 2>/dev/null || echo unknown)"
case "$KERNEL" in
  Darwin) ENV=macos; ENV_LABEL="macOS" ;;
  MINGW*|MSYS*|CYGWIN*) ENV=windows; ENV_LABEL="Windows outside WSL ($KERNEL)" ;;
  Linux)
    if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft "${SETUP_PROC_VERSION:-/proc/version}" 2>/dev/null; then
      ENV=wsl; ENV_LABEL="WSL2${WSL_DISTRO_NAME:+ ($WSL_DISTRO_NAME)}"
    elif [ "${CLOUD_SHELL:-}" = true ]; then ENV=linux; ENV_LABEL="Cloud Shell (Linux)"
    elif [ "${CODESPACES:-}" = true ]; then ENV=linux; ENV_LABEL="Linux (GitHub Codespaces)"
    else ENV=linux; ENV_LABEL="Linux"
    fi ;;
  *) ENV=unknown; ENV_LABEL="$KERNEL" ;;
esac

# --- Subcommands branch off here -----------------------------------------------------------------------------------
run_infra() { # setup.sh infra and infra-push (task 112)
  echo "setup.sh $SUBCOMMAND comes with task 112 (owner and GCP admin setup)." >&2
  exit 1
}

# Task 112 fills run_infra above and task 113 run_services below, each in its own lane.

run_services() { # setup.sh services [--stop] (task 113): the database and file storage of the no-Docker setup
  local code=0 pid
  if [ "$ENV" != linux ]; then
    err "setup.sh services is for Linux without Docker (what setup.sh set up there); here: pnpm db:up (Docker running)"
    exit 1
  fi
  pg_paths
  if [ "$SERVICES_STOP" = 1 ]; then
    if pg_installed && pg_running; then
      as_pg "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast -w stop >/dev/null || { err "pg_ctl couldn't stop Postgres"; code=1; }
    fi
    if gcs_running; then
      pid="$(pid_of "$GCS_PID")"; kill "$pid" 2>/dev/null
      for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
      if kill -0 "$pid" 2>/dev/null; then err "fake-gcs-server (pid $pid) is still running"; code=1; fi
    fi
    gcs_running || rm -f "$GCS_PID"
    [ "$code" = 0 ] && say "Stopped: Postgres (localhost:5433) and fake-gcs-server (localhost:4443)."
    exit "$code"
  fi
  if [ ! -f "$PG_DATA/PG_VERSION" ] && has docker && docker info >/dev/null 2>&1; then
    say "Uses Docker here: pnpm db:up starts the database and file storage."; exit 1
  fi
  if [ ! -f "$PG_DATA/PG_VERSION" ]; then err "no database here yet: run bash scripts/setup.sh first"; code=1
  elif ! pg_installed; then
    err "Postgres 16 isn't installed any more (a restarted sandbox can drop packages); its data in $PG_DATA is kept: rerun bash scripts/setup.sh"
    code=1
  elif pg_up; then say "Postgres 16: running on localhost:5433 ($PG_DATA)"
  else code=1; fi
  if gcs_running; then say "fake-gcs-server: running on localhost:4443 (uploaded files are kept in memory)"
  elif [ ! -x "$GCS_BIN" ]; then rm -f "$GCS_PID"; err "no fake-gcs-server here yet: run bash scripts/setup.sh first"; code=1
  elif rm -f "$GCS_PID" && gcs_start; then say "fake-gcs-server: running on localhost:4443 (uploaded files are kept in memory)"
  else code=1; fi
  exit "$code"
}

case "$SUBCOMMAND" in
  infra|infra-push) run_infra ;;
  services) run_services ;;
esac

say "Environment: $ENV_LABEL"

if [ "$ENV" = windows ]; then
  say "Run this inside WSL2: \`wsl --install -d Ubuntu\`, then clone the repo inside WSL and rerun \`bash scripts/setup.sh\`."
  say "Docker comes from Docker Desktop for Windows with WSL integration turned on for that distro."
  exit 1
fi
[ "$ENV" = unknown ] && die "unsupported system '$KERNEL': macOS, Linux and WSL2 are supported"

NODE_MAJOR="$(tr -d ' \r\n' < .nvmrc)"; NODE_MAJOR="${NODE_MAJOR#v}"; NODE_MAJOR="${NODE_MAJOR%%.*}"
PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\).*/\1/p' package.json | head -1)"
[ -n "$NODE_MAJOR" ] && [ -n "$PNPM_VERSION" ] || die "can't read the Node version (.nvmrc) or pnpm's (package.json)"

# --- Version managers and Homebrew, wherever they already are -------------------------------------------------------
FNM_HOME="$HOME/.local/share/fnm"
load_nvm() {
  type nvm >/dev/null 2>&1 && return 0
  local dir="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$dir/nvm.sh" ] || return 1
  export NVM_DIR="$dir"
  # shellcheck disable=SC1091
  set +u; . "$dir/nvm.sh" >/dev/null 2>&1; set -u
  type nvm >/dev/null 2>&1
}
nvm_() { local code; set +u; nvm "$@"; code=$?; set -u; return $code; }
find_fnm() {
  has fnm && return 0
  [ -x "$FNM_HOME/fnm" ] || return 1
  PATH="$FNM_HOME:$PATH"; export PATH
}
fnm_activate() { eval "$(fnm env --shell bash 2>/dev/null)"; }
if load_nvm; then NODE_MANAGER=nvm; elif find_fnm; then NODE_MANAGER=fnm; fnm_activate; else NODE_MANAGER=""; fi

# --- 2. Check every tool -------------------------------------------------------------------------------------------
node_major() { local v; v="$(node -v 2>/dev/null)" || return 1; v="${v#v}"; [ -n "$v" ] && echo "${v%%.*}"; }
pnpm_ok() { [ "$(pnpm -v 2>/dev/null)" = "$PNPM_VERSION" ]; }
docker_state() { # ok | absent | nocompose | denied | down
  has docker || { echo absent; return; }
  docker compose version >/dev/null 2>&1 || { echo nocompose; return; }
  local out
  if out="$(docker info 2>&1)"; then echo ok
  elif printf '%s' "$out" | grep -qi 'permission denied'; then echo denied
  else echo down
  fi
}

TOOLS="git curl openssl jq perl"
MISSING_TOOLS=""; NODE_BAD=0; PNPM_BAD=0; DOCKER="skipped"
check_tools() {
  local t
  MISSING_TOOLS=""
  for t in $TOOLS; do has "$t" || MISSING_TOOLS="$MISSING_TOOLS $t"; done
  NODE_BAD=0; [ "$(node_major)" = "$NODE_MAJOR" ] || NODE_BAD=1
  PNPM_BAD=0; pnpm_ok || PNPM_BAD=1
  if [ "$NO_DOCKER" = 1 ]; then DOCKER=skipped; else DOCKER="$(docker_state)"; fi
}

node_cmd() {
  case "$NODE_MANAGER" in
    nvm) echo "nvm install $NODE_MAJOR && nvm use $NODE_MAJOR" ;;
    fnm) echo "fnm install $NODE_MAJOR && fnm use $NODE_MAJOR" ;;
    *) if [ "$ENV" = macos ]; then echo "brew install fnm && fnm install $NODE_MAJOR && fnm use $NODE_MAJOR"
       else echo "install fnm $FNM_VERSION (https://github.com/Schniz/fnm/releases/tag/v$FNM_VERSION; this script checks its sha256), then fnm install $NODE_MAJOR && fnm use $NODE_MAJOR"; fi ;;
  esac
}
docker_fix() { # the fix for the current Docker state, in this environment
  case "$ENV:$DOCKER" in
    wsl:*) echo "Docker isn't reachable from WSL. Install Docker Desktop for Windows, then Settings → Resources → WSL integration → turn on \`${WSL_DISTRO_NAME:-your distro}\`, apply, and rerun in a new WSL shell." ;;
    macos:absent|macos:nocompose) echo "brew install --cask docker-desktop, then start Docker Desktop once and rerun" ;;
    macos:*) echo "start Docker Desktop once (open -a Docker), wait until it runs, then rerun bash scripts/setup.sh" ;;
    linux:absent) echo "${SUDO}apt-get install -y docker.io docker-compose-v2 (with Docker's own apt repository: docker-ce docker-compose-plugin)" ;;
    linux:nocompose) echo "${SUDO}apt-get install -y docker-compose-v2 (with Docker's own apt repository: docker-compose-plugin)" ;;
    linux:denied) echo "sudo usermod -aG docker \$USER (the docker group is root on this host), then start a new shell and rerun" ;;
    linux:down) echo "start the Docker daemon (sudo systemctl start docker), or rerun with --no-docker" ;;
  esac
}
report_missing() { # one line per missing or wrong tool, with the command that fixes it
  local t
  for t in $MISSING_TOOLS; do
    if [ "$ENV" = macos ]; then say "  - $t: not found. Install: brew install $t"
    else say "  - $t: not found. Install: ${SUDO}apt-get install -y $t"; fi
  done
  if [ "$NODE_BAD" = 1 ]; then
    local now; now="$(node -v 2>/dev/null || echo "not found")"
    say "  - Node: $now, need $NODE_MAJOR (.nvmrc). Install: $(node_cmd)"
  fi
  [ "$PNPM_BAD" = 1 ] && say "  - pnpm: need $PNPM_VERSION (package.json). Install: corepack enable pnpm && corepack install"
  case "$DOCKER" in ok|skipped) ;; *) say "  - Docker ($DOCKER): $(docker_fix)" ;; esac
}
anything_missing() { [ -n "$MISSING_TOOLS" ] || [ "$NODE_BAD" = 1 ] || [ "$PNPM_BAD" = 1 ] || { [ "$DOCKER" != ok ] && [ "$DOCKER" != skipped ]; }; }

check_tools
if anything_missing; then say "Missing or wrong:"; report_missing; else say "Tools: all present (Node $NODE_MAJOR, pnpm $PNPM_VERSION)."; fi

# --- 9. Ports (a warning only) -------------------------------------------------------------------------------------
port_taken() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
ours_running() { # db|storage: the compose service, or (when the no-Docker setup runs) its own server (task 113)
  if [ "$ENV" = linux ] && [ "$NO_DOCKER" = 0 ] && [ "$DOCKER" != ok ]; then
    case "$1" in
      db) pg_running && return 0 ;;
      storage) gcs_running && return 0 ;;
    esac
  fi
  [ "$DOCKER" = ok ] && [ -n "$(docker compose ps -q --status running "$1" 2>/dev/null)" ]
}
pg_paths
for port in ${SETUP_PORTS-3000 3001 3002 4443 5433 6006}; do
  port_taken "$port" || continue
  case "$port" in 5433) ours_running db && continue ;; 4443) ours_running storage && continue ;; esac
  warn "port $port is in use; pnpm dev, pnpm db:up or Storybook need it free (lsof -i :$port)"
done

# --- 3, 4. Install what is missing ---------------------------------------------------------------------------------
BREW_FORMULAS=""; BREW_CASK=""; APT_PACKAGES=""; APT_DOCKER=""; NODE_ACTION=""; PNPM_ACTION=""
# shellcheck disable=SC2048,SC2086 # trims and joins a list
words() { echo $*; }
plan_installs() {
  if [ "$ENV" = macos ]; then
    BREW_FORMULAS="$(words $MISSING_TOOLS)"
    case "$DOCKER" in absent|nocompose) BREW_CASK="docker-desktop" ;; esac
  else
    APT_PACKAGES="$(words $MISSING_TOOLS)"
    if [ "$ENV" = linux ]; then
      case "$DOCKER" in absent) APT_DOCKER="docker.io docker-compose-v2" ;; nocompose) APT_DOCKER="docker-compose-v2" ;; esac
    fi
  fi
  if [ "$NODE_BAD" = 1 ]; then
    if [ -n "$NODE_MANAGER" ]; then NODE_ACTION="$NODE_MANAGER"
    elif [ "$ENV" = macos ]; then NODE_ACTION="fnm-brew"; BREW_FORMULAS="$(words $BREW_FORMULAS fnm)"
    else
      NODE_ACTION="fnm-download"
      has unzip || APT_PACKAGES="$(words $APT_PACKAGES unzip)"
    fi
  fi
  [ "$PNPM_BAD" = 1 ] && PNPM_ACTION="corepack"
  return 0
}
plan_text() {
  [ -n "$BREW_FORMULAS" ] && say "  - brew install $BREW_FORMULAS"
  [ -n "$BREW_CASK" ] && say "  - brew install --cask $BREW_CASK (Docker Desktop)"
  [ -n "$APT_PACKAGES" ] && say "  - ${SUDO}apt-get install -y $APT_PACKAGES"
  [ -n "$APT_DOCKER" ] && say "  - ${SUDO}apt-get install -y $APT_DOCKER"
  case "$NODE_ACTION" in
    nvm|fnm) say "  - Node $NODE_MAJOR: $NODE_ACTION install $NODE_MAJOR, $NODE_ACTION use $NODE_MAJOR" ;;
    fnm-brew) say "  - Node $NODE_MAJOR: fnm (Homebrew), fnm install $NODE_MAJOR" ;;
    fnm-download) say "  - Node $NODE_MAJOR: fnm $FNM_VERSION into $FNM_HOME (sha256 checked), fnm install $NODE_MAJOR" ;;
  esac
  [ -n "$PNPM_ACTION" ] && say "  - pnpm $PNPM_VERSION: corepack enable pnpm, corepack install"
  return 0
}
plan_installs
PLAN="$(plan_text)"

if [ "$NO_INSTALL" = 1 ]; then
  if [ -f .env ]; then say ".env: present (kept as is)"; else say ".env: missing (setup creates it from .env.example)"; fi
  say "Then: pnpm install --frozen-lockfile; pnpm db:up && pnpm db:migrate; pnpm --filter @repo/e2e exec playwright install$([ "$ENV" = macos ] || echo " --with-deps") chromium"
  if anything_missing; then say "Check only (--no-install): nothing changed. Fix the above, then run bash scripts/setup.sh."; exit 1; fi
  say "Check only (--no-install): everything is installed."
  exit 0
fi

# What can't be installed here, before asking: no apt-get, or no root.
if [ "$ENV" != macos ]; then
  if [ -n "$APT_DOCKER" ] && ! has apt-get; then warn "no apt-get here to install Docker with"; APT_DOCKER=""; fi
  if [ -n "$APT_DOCKER" ] && ! can_root; then warn "no sudo here to install Docker with"; APT_DOCKER=""; fi
  if [ -n "$APT_PACKAGES" ] && ! has apt-get; then
    say "There is no apt-get here: install these yourself, then rerun bash scripts/setup.sh:"; report_missing; exit 1
  fi
  if [ -n "$APT_PACKAGES" ] && ! can_root; then
    say "Installing these needs root, and there is no sudo: run as root or install sudo, then rerun:"; report_missing; exit 1
  fi
  PLAN="$(plan_text)"
fi

# Playwright's --with-deps runs sudo apt-get: only when approved, with the installs or on its own.
WITH_DEPS="pnpm --filter @repo/e2e exec playwright install --with-deps chromium"
DEPS_TEXT="chromium system libraries (sudo apt-get, via Playwright)"
WANT_DEPS=0; DEPS_OK=0
[ "$ENV" != macos ] && [ "$SKIP_BROWSERS" = 0 ] && can_root && WANT_DEPS=1

if [ -n "$PLAN" ]; then
  [ "$WANT_DEPS" = 1 ] && PLAN="$PLAN"$'\n'"  - $DEPS_TEXT"
  if [ "$YES" != 1 ] && ! interactive; then
    say "No terminal to ask in: nothing installed. Rerun with --yes to install the above, or --no-install to only check."
    exit 1
  fi
  say "To install:"; say "$PLAN"
  if [ "$YES" != 1 ] && ! ask "Install these?"; then say "Nothing installed. The commands are listed above."; exit 1; fi
  DEPS_OK="$WANT_DEPS"

  if [ -n "$BREW_FORMULAS$BREW_CASK" ]; then ensure_brew; fi
  if [ -n "$BREW_FORMULAS" ]; then
    # shellcheck disable=SC2086 # a list of formulas
    brew install $BREW_FORMULAS || die "brew install $BREW_FORMULAS failed"; installed "brew: $BREW_FORMULAS"
  fi
  if [ -n "$BREW_CASK" ]; then
    brew install --cask "$BREW_CASK" || die "brew install --cask $BREW_CASK failed"; installed "Docker Desktop (start it once)"
  fi
  if [ -n "$APT_PACKAGES$APT_DOCKER" ]; then
    as_root apt-get update || warn "apt-get update failed; trying the install anyway"
  fi
  if [ -n "$APT_PACKAGES" ]; then
    # shellcheck disable=SC2086 # a list of packages
    as_root apt-get install -y $APT_PACKAGES || die "apt-get install -y $APT_PACKAGES failed"; installed "apt: $APT_PACKAGES"
  fi
  if [ -n "$APT_DOCKER" ]; then
    # shellcheck disable=SC2086
    if as_root apt-get install -y $APT_DOCKER; then installed "apt: $APT_DOCKER"
    else warn "couldn't install Docker ($APT_DOCKER); continuing without it"; fi
  fi
elif [ "$WANT_DEPS" = 1 ]; then
  if [ "$YES" = 1 ] || ask "Install $DEPS_TEXT?"; then DEPS_OK=1; fi
fi

download_fnm() {
  local asset sha url tmp
  case "$(uname -m)" in
    x86_64|amd64) asset="fnm-linux.zip"; sha="$FNM_SHA256_LINUX_X64" ;;
    aarch64|arm64) asset="fnm-arm64.zip"; sha="$FNM_SHA256_LINUX_ARM64" ;;
    *) die "no pinned fnm for $(uname -m): install Node $NODE_MAJOR yourself, then rerun" ;;
  esac
  url="https://github.com/Schniz/fnm/releases/download/v${FNM_VERSION}/${asset}"
  tmp="$(mktemp -d)" || die "mktemp failed"
  download_checked "$url" "$sha" "$tmp/$asset" || { rm -rf "$tmp"; die "fnm $FNM_VERSION not installed"; }
  unzip -q -o "$tmp/$asset" fnm -d "$tmp" || { rm -rf "$tmp"; die "couldn't unpack $asset"; }
  mkdir -p "$FNM_HOME" && mv "$tmp/fnm" "$FNM_HOME/fnm" && chmod 755 "$FNM_HOME/fnm" || { rm -rf "$tmp"; die "couldn't install fnm into $FNM_HOME"; }
  rm -rf "$tmp"
  PATH="$FNM_HOME:$PATH"; export PATH
  installed "fnm $FNM_VERSION in $FNM_HOME"
}

FNM_PROFILE='eval "$(fnm env --use-on-cd)"'
NODE_HINT=""
case "$NODE_ACTION" in
  nvm)
    nvm_ install "$NODE_MAJOR" && nvm_ use "$NODE_MAJOR" >/dev/null || die "nvm couldn't install Node $NODE_MAJOR"
    installed "Node $NODE_MAJOR (nvm)"
    NODE_HINT="in it, run nvm use (or once: nvm alias default $NODE_MAJOR)" ;;
  fnm|fnm-brew|fnm-download)
    [ "$NODE_ACTION" = fnm-download ] && download_fnm
    has fnm || die "fnm isn't on PATH"
    fnm install "$NODE_MAJOR" && fnm_activate && fnm use "$NODE_MAJOR" >/dev/null || die "fnm couldn't install Node $NODE_MAJOR"
    installed "Node $NODE_MAJOR (fnm)"
    say "fnm: add this line to your shell profile (~/.zshrc or ~/.bashrc) so new shells find Node $NODE_MAJOR:"
    say "  $FNM_PROFILE"
    NODE_HINT="with $FNM_PROFILE in your profile" ;;
esac
if [ -n "$NODE_ACTION" ] && ! pnpm_ok; then PNPM_ACTION=corepack; fi
if [ -n "$PNPM_ACTION" ]; then
  has corepack || die "corepack not found (it comes with Node $NODE_MAJOR)"
  { corepack enable pnpm && corepack install; } ||
    die "corepack couldn't set up pnpm $PNPM_VERSION (an old corepack? npm i -g corepack@latest, then rerun)"
  installed "pnpm $PNPM_VERSION (corepack)"
fi

check_tools
[ -z "$MISSING_TOOLS" ] || die "still missing:$MISSING_TOOLS"
[ "$NODE_BAD" = 0 ] || die "Node is $(node -v 2>/dev/null || echo "not found"), need $NODE_MAJOR"
[ "$PNPM_BAD" = 0 ] || die "pnpm isn't $PNPM_VERSION"

# --- 5. .env -------------------------------------------------------------------------------------------------------
ENV_TMP=""
cleanup() { if [ -n "$ENV_TMP" ]; then rm -f "$ENV_TMP"; fi; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
env_keys() { sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$1"; }
if [ -f .env ]; then
  lacking=""
  for key in $(env_keys .env.example); do grep -q "^$key=" .env || lacking="$lacking $key"; done
  if [ -n "$lacking" ]; then say ".env: kept as is; it lacks keys in .env.example:$lacking"
  else say ".env: kept as is"; fi
else
  secret="$(openssl rand -base64 32)" && [ "${#secret}" -ge 32 ] || die "openssl rand failed"
  ENV_TMP=".env.setup.$$" # git-ignored (.env.*); removed on exit or interrupt
  ( umask 077; SETUP_SECRET="$secret" awk \
      '/^BETTER_AUTH_SECRET=/ { print "BETTER_AUTH_SECRET=" ENVIRON["SETUP_SECRET"]; next } { print }' \
      .env.example > "$ENV_TMP" ) || die "couldn't write .env"
  unset secret
  chmod 600 "$ENV_TMP" || die "couldn't write .env"
  mv -n "$ENV_TMP" .env
  if [ -e "$ENV_TMP" ]; then
    rm -f "$ENV_TMP"; warn ".env appeared while setup ran: kept it as is"
  elif [ -e .env ]; then
    say ".env: created from .env.example with a new BETTER_AUTH_SECRET (mode 600)"; installed ".env"
  else
    die "couldn't write .env"
  fi
  ENV_TMP=""
fi

# --- 6. Packages ---------------------------------------------------------------------------------------------------
pnpm install --frozen-lockfile || die "pnpm install --frozen-lockfile failed"

# --- 7. Database and file storage ----------------------------------------------------------------------------------
wait_db() { # true once the db service's healthcheck says healthy, false after SETUP_DB_TIMEOUT seconds
  local limit="${SETUP_DB_TIMEOUT:-60}" start=$SECONDS cid
  while :; do
    cid="$(docker compose ps -q db 2>/dev/null | head -1)"
    if [ -n "$cid" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = healthy ]; then return 0; fi
    [ $((SECONDS - start)) -ge "$limit" ] && return 1
    sleep 1
  done
}
# Linux without Docker (task 113): Postgres 16 (its own confirmation unless --yes) and the storage emulator, directly.
FALLBACK=0; PG_PROBLEM=""; STORAGE_PROBLEM=""; DOCKER_HINT=""
run_fallback() {
  FALLBACK=1
  say "No Docker here: Postgres 16 and fake-gcs-server run directly on localhost:5433 and :4443 (data in $DATA_HOME)."
  if ! pg_installed; then
    if ! has apt-get; then PG_PROBLEM="can't be installed: there is no apt-get here (install postgresql-16, then rerun)"
    elif ! can_root; then PG_PROBLEM="can't be installed: that needs root, and there is no sudo (run as root or install sudo, then rerun)"
    elif [ "$YES" != 1 ] && ! interactive; then PG_PROBLEM="isn't installed: no terminal to ask in; rerun with --yes to install it"
    elif [ "$YES" != 1 ] && ! ask "Install PostgreSQL 16 (${SUDO}apt-get install -y postgresql-16) and run it on localhost:5433?"; then
      PG_PROBLEM="isn't installed (declined)"
    elif ! install_pg; then PG_PROBLEM="isn't installed: the install failed (see above)"
    elif ! pg_installed; then PG_PROBLEM="isn't usable: postgresql-16 is installed, but $PG_BIN has no initdb or pg_ctl"
    else installed "apt: postgresql-16"; fi
  fi
  gcs_up || STORAGE_PROBLEM="fake-gcs-server isn't running (see above)"
  if [ -z "$PG_PROBLEM" ]; then
    pg_paths
    if pg_up && pg_db; then pnpm db:migrate || die "pnpm db:migrate failed"
    else PG_PROBLEM="isn't running (see above)"; fi
  fi
  [ -n "$PG_PROBLEM" ] && { skipped "database: PostgreSQL 16 $PG_PROBLEM"; STATUS=1; }
  [ -n "$STORAGE_PROBLEM" ] && { skipped "file storage: $STORAGE_PROBLEM"; STATUS=1; }
  return 0
}
DOCKER_PROBLEM=""
if [ "$NO_DOCKER" = 1 ]; then
  skipped "database and file storage (--no-docker): later, pnpm db:up && pnpm db:migrate"
elif [ "$DOCKER" = ok ]; then
  pnpm db:up || die "pnpm db:up failed (docker compose logs)"
  wait_db || die "the database didn't get healthy within ${SETUP_DB_TIMEOUT:-60} s: is port 5433 taken (lsof -i :5433)? See docker compose logs db"
  pnpm db:migrate || die "pnpm db:migrate failed"
else
  case "$ENV" in
    macos) DOCKER_PROBLEM="Docker isn't reachable: start Docker Desktop once (open -a Docker), then rerun bash scripts/setup.sh." ;;
    wsl) DOCKER_PROBLEM="$(docker_fix)" ;;
  esac
  if [ -n "$DOCKER_PROBLEM" ]; then skipped "database and file storage (no Docker)"; STATUS=1
  else
    run_fallback
    case "$DOCKER" in denied|down) DOCKER_HINT="If Docker should run here: $(docker_fix)." ;; esac
  fi
fi

# --- 8. Browsers ---------------------------------------------------------------------------------------------------
if [ "$SKIP_BROWSERS" = 1 ]; then
  skipped "Playwright chromium (--skip-browsers)"
elif [ "$ENV" = macos ]; then
  pnpm --filter @repo/e2e exec playwright install chromium || die "playwright install failed"
elif [ "$DEPS_OK" = 1 ]; then
  pnpm --filter @repo/e2e exec playwright install --with-deps chromium || die "playwright install failed"
else
  pnpm --filter @repo/e2e exec playwright install chromium || die "playwright install failed"
  skipped "$DEPS_TEXT: if chromium doesn't start, run $WITH_DEPS"
fi

# --- 10. Summary ---------------------------------------------------------------------------------------------------
say ""
say "Summary"
say "  Environment: $ENV_LABEL"
indent() { printf '%s' "$1" | sed 's/^/  /'; }
if [ -n "$INSTALLED" ]; then say "  Installed:"; indent "$INSTALLED"; else say "  Installed: nothing (already set up)"; fi
if [ -n "$SKIPPED" ]; then say "  Skipped:"; indent "$SKIPPED"; fi
[ -n "$NODE_HINT" ] && say "  Node changed: open a new shell before pnpm dev ($NODE_HINT)."
if [ -n "$DOCKER_PROBLEM" ]; then
  say ""; say "$DOCKER_PROBLEM"
  say "(Or rerun with --no-docker to finish without the database.)"
  exit "$STATUS"
fi
[ -n "$DOCKER_HINT" ] && say "  $DOCKER_HINT"
if [ "$FALLBACK" = 1 ]; then
  [ -z "$PG_PROBLEM" ] && say "  Database: Postgres 16 on localhost:5433, data in $PG_DATA."
  [ -z "$STORAGE_PROBLEM" ] &&
    say "  File storage: fake-gcs-server on localhost:4443; uploaded files are kept in memory, gone when it stops."
  say "  After a restart: bash scripts/setup.sh services starts the database and file storage (--stop stops them)."
  [ -n "$PG_PROBLEM" ] && say "  PostgreSQL 16 $PG_PROBLEM. Unit tests (\`pnpm test\`) work without it."
  [ -n "$STORAGE_PROBLEM" ] && say "  File storage: $STORAGE_PROBLEM."
else
  say "  After a restart: pnpm db:up (Docker running) starts the database and file storage."
fi
say "  Next: pnpm dev (http://localhost:3000), sign up, then"
say "        pnpm --filter @repo/dashboard seed:demo --email <you>"
say "  GCP admins: bash scripts/setup.sh infra (coming with task 112)."
exit "$STATUS"
