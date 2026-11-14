#!/usr/bin/env bash
# One command from a fresh clone to "pnpm dev works and the tests run" (task 111). Local development shares no
# secret (ADR-0013 class 4): the only secret, BETTER_AUTH_SECRET, is generated here per machine.
#
# Usage: bash scripts/setup.sh --help (usage() below). A subcommand comes first (setup.sh infra ...) and takes only
# its own flags (parse_args); subcommands branch off right after environment detection.
#
# Environments: macOS (Homebrew), Linux incl. Codespaces and Cloud Shell (apt-get), Windows through WSL2 (apt-get;
# Docker comes from Docker Desktop for Windows). Windows outside WSL: it says to use WSL2 and changes nothing.
# Without Docker (claude.ai/code and similar) it stops after the other steps: the fallback is task 113.
#
# Bash 3.2 compatible (macOS's bash): it runs before Node or pnpm exist. It never prints a secret, never changes
# an existing .env, never runs pnpm db:generate, gcloud, gh or terraform, and uses sudo only for apt-get (its own,
# and Playwright's --with-deps once approved) and an apt repository's key and list (add_apt_repo). Rerunning on a
# set-up workspace installs nothing and changes no file.
# Tests: bash scripts/test-setup.sh, under /bin/bash; CI (Ubuntu) runs it with bash 5, so bash 3.2 is checked by
# running it on macOS.
#
# Test hooks (scripts/test-setup.sh): sourced (. scripts/setup.sh), it only defines its helpers, so the tests call
# them directly, and then SETUP_APT_ROOT puts add_apt_repo's files under a directory. SETUP_INTERACTIVE=1 treats
# stdin as a terminal; SETUP_PROC_VERSION, SETUP_BREW_PREFIXES, SETUP_PORTS and SETUP_DB_TIMEOUT replace
# /proc/version, Homebrew's install prefixes, the ports checked and the database wait (60 s).
set -u

# fnm for Linux and WSL when there is neither nvm nor fnm. To upgrade: change the version and both hashes together.
# The hashes are the release assets' sha256 digests (GitHub's release API, "digest"), checked against the downloads:
#   https://github.com/Schniz/fnm/releases/tag/v<version> (fnm-linux.zip, fnm-arm64.zip)
FNM_VERSION="1.39.0"
FNM_SHA256_LINUX_X64="7807664f39d39fc518da1c35ba0181e4b3267603c4b1dedeb4b5fc6ae440a224"
FNM_SHA256_LINUX_ARM64="4eaff58b2c5bf30d0934027572dd0b5bbb60d2a1af309230b53662d4b1d45599"
# shellcheck disable=SC2016 # printed, not run
HOMEBREW_INSTALL='/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'

usage() {
  cat <<'EOF'
  bash scripts/setup.sh [--no-install] [--yes] [--no-docker] [--skip-browsers]

  --no-install     check only: change nothing, print the command for each missing tool (exit 1 if any)
  --yes            install what is missing without asking (Homebrew itself is still asked for)
  --no-docker      skip Docker and the database and file storage (pnpm db:up, pnpm db:migrate)
  --skip-browsers  skip Playwright's chromium
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

need_value() { # flag args-from-the-flag-on: exits 1 unless a value (not another flag) follows the flag
  case "${2:-}" in ""|-*) die "$1 needs a value" ;; esac
}

# Sourced: the helpers only. SETUP_APT_ROOT (a test hook) puts apt's files under a directory, and only when sourced.
APT_ROOT=""
if [ "${BASH_SOURCE[0]}" != "$0" ]; then APT_ROOT="${SETUP_APT_ROOT:-}"; return 0; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# --- Subcommand and its flags --------------------------------------------------------------------------------------
SUBCOMMAND="${1:-}" # "" is the developer setup
case "$SUBCOMMAND" in infra|infra-push|services) shift ;; *) SUBCOMMAND="" ;; esac
NO_INSTALL=0; YES=0; NO_DOCKER=0; SKIP_BROWSERS=0
parse_args() { # the flags $SUBCOMMAND takes. One with a value: `sub:--flag) need_value "$@"; VAR="$2"; shift ;;`
  while [ $# -gt 0 ]; do
    case "$SUBCOMMAND:$1" in
      *:-h|*:--help) usage; exit 0 ;;
      :--no-install) NO_INSTALL=1 ;;
      :--yes|:-y) YES=1 ;;
      :--no-docker) NO_DOCKER=1 ;;
      :--skip-browsers) SKIP_BROWSERS=1 ;;
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

run_services() { # setup.sh services (task 113)
  echo "setup.sh services comes with task 113 (local database and file storage without Docker)." >&2
  exit 1
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
ours_running() { [ "$DOCKER" = ok ] && [ -n "$(docker compose ps -q --status running "$1" 2>/dev/null)" ]; }
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
    *) DOCKER_PROBLEM="No Docker here: the database fallback comes with task 113; unit tests (\`pnpm test\`) work."
       case "$DOCKER" in denied|down) DOCKER_PROBLEM="$DOCKER_PROBLEM If Docker should run here: $(docker_fix)." ;; esac ;;
  esac
  skipped "database and file storage (no Docker)"
  STATUS=1
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
say "  After a restart: pnpm db:up (Docker running) starts the database and file storage."
say "  Next: pnpm dev (http://localhost:3000), sign up, then"
say "        pnpm --filter @repo/dashboard seed:demo --email <you>"
say "  GCP admins: bash scripts/setup.sh infra (coming with task 112)."
exit "$STATUS"
