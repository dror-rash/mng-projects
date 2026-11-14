#!/usr/bin/env bash
# Tests for scripts/setup.sh (task 111). Run: bash scripts/test-setup.sh (CI runs it in verify).
# Each case builds a world in a temp dir: a copy of the repo's setup files, a HOME, and a PATH that holds only stubs
# (brew, apt-get, sudo, docker, node, fnm, corepack, pnpm, curl, uname, …) and the plain utilities the script uses.
# Stubs append "<name> <args>" to a log; "installing" a tool copies its stub from avail/ into bin/. Nothing real is
# installed, downloaded or started. setup.sh runs under /bin/bash (3.2 on macOS).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETUP="$ROOT/scripts/setup.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass+1)); echo "ok   - $name"
  else fail=$((fail+1)); echo "FAIL - $name"; [ -n "${VERBOSE:-}" ] && sed 's/^/       /' "$W/out"; fi
}

# The utilities setup.sh may use, linked from the real system (missing ones are skipped).
UTILS="bash cat sed grep awk cp mv rm chmod mkdir mktemp dirname basename tr head tail cut sleep date wc sort ls
  stat cmp shasum sha256sum touch find xargs tee printf"

stub() { # name [body]: a stub in avail/ that logs its call, then runs body
  printf '#!/bin/bash\necho "%s $*" >> "$STUB_LOG"\n%s\n' "$1" "${2:-exit 0}" > "$W/avail/$1"
  chmod +x "$W/avail/$1"
}
# Never cp onto an existing name in bin/: it may be a link to a real system binary.
present() { local t; for t in "$@"; do rm -f "$W/bin/$t"; cp -P "$W/avail/$t" "$W/bin/$t"; done; }
absent()  { local t; for t in "$@"; do rm -f "$W/bin/$t"; done; }
state()   { printf '%s\n' "$2" > "$W/state/$1"; }

# A fresh world where everything is set up: macOS, every tool, Node 22, pnpm as pinned, Docker running.
world() {
  W="$(mktemp -d "$TMP/w.XXXXXX")"
  mkdir -p "$W/bin" "$W/avail" "$W/state" "$W/home" "$W/repo/scripts" "$W/nobrew"
  cp "$ROOT/.env.example" "$ROOT/.nvmrc" "$ROOT/package.json" "$W/repo/"
  [ -f "$SETUP" ] && cp "$SETUP" "$W/repo/scripts/setup.sh"
  : > "$W/log"; echo "Linux version 6.8.0-generic (gcc) #1 SMP" > "$W/proc_version"
  local t p
  for t in $UTILS; do p="$(command -v "$t" 2>/dev/null)" && [ -n "$p" ] && [ "${p#/}" != "$p" ] && ln -s "$p" "$W/bin/$t"; done
  ln -s "$(command -v openssl)" "$W/avail/openssl"
  state uname Darwin; state arch arm64; state uid 1000; state node 22.11.0; state pnpm 10.18.0; state docker ok
  state health healthy

  printf '#!/bin/bash\ncase "$1" in -m) cat "$STUB_STATE/arch";; *) cat "$STUB_STATE/uname";; esac\n' > "$W/bin/uname"
  printf '#!/bin/bash\ncat "$STUB_STATE/uid"\n' > "$W/bin/id"
  chmod +x "$W/bin/uname" "$W/bin/id"

  local S='"$STUB_STATE"' A='"$STUB_AVAIL"' B='"$STUB_BIN"'
  stub git; stub curl; stub jq; stub perl; stub unzip; stub gcloud; stub gh; stub terraform
  stub curl "case \"\$*\" in *Homebrew/install*)
  echo 'p=\${SETUP_BREW_PREFIXES%% *}; mkdir -p \"\$p/bin\" && cp \"\$STUB_AVAIL/brew\" \"\$p/bin/brew\"'; exit 0;; esac
out=; while [ \$# -gt 0 ]; do [ \"\$1\" = -o ] && out=\"\$2\"; shift; done
if [ -f $S/download ]; then cp $S/download \"\$out\"; else echo 'not the fnm release' > \"\$out\"; fi"
  stub node "[ \"\$1\" = -v ] && echo \"v\$(cat $S/node)\"; exit 0"
  stub pnpm "case \"\$1\" in -v|--version) [ -f $S/pnpm ] && cat $S/pnpm || exit 1;; esac; exit 0"
  stub corepack "[ \"\$1\" = install ] && { echo 10.18.0 > $S/pnpm; cp -P $A/pnpm $B/pnpm; }; exit 0"
  stub fnm "case \"\$1\" in --version) echo 'fnm 1.39.0';; use) echo \"\$2.0.0\" > $S/node; cp -P $A/node $A/corepack $B/;; esac; exit 0"
  stub sudo 'exec "$@"'
  stub docker "mode=\$(cat $S/docker)
case \"\$1\" in
  compose) case \"\$2\" in ps) echo cid1;; esac; exit 0;;
  info) case \$mode in ok) exit 0;; denied) echo 'permission denied while trying to connect to the Docker daemon socket' >&2;;
    *) echo 'Cannot connect to the Docker daemon' >&2;; esac; exit 1;;
  inspect) cat $S/health;;
esac; exit 0"
  stub brew "[ \"\$1\" = shellenv ] && echo \"export PATH=\\\"\$(dirname \"\$0\"):\\\$PATH\\\"\"
[ \"\$1\" = install ] || exit 0; shift
for p in \"\$@\"; do case \"\$p\" in
  --cask) ;; docker-desktop) rm -f $B/docker; cp -P $A/docker $B/docker; echo down > $S/docker;;
  *) rm -f $B/\$p; cp -P $A/\$p $B/\$p;; esac; done"
  stub apt-get "[ \"\$1\" = install ] || exit 0; shift
for p in \"\$@\"; do case \"\$p\" in
  -*) ;; docker.io|docker-compose-v2) [ -f $S/apt_docker_fails ] && exit 100; cp -P $A/docker $B/docker; echo ok > $S/docker;;
  *) rm -f $B/\$p; cp -P $A/\$p $B/\$p;; esac; done"
  present git curl jq perl openssl node pnpm corepack docker brew apt-get gcloud gh terraform sudo unzip
  infra_world; pg_world
}

# Each task's own stubs and state, added to every world: task 112 fills infra_world, task 113 fills pg_world (stub,
# present, state), so their lanes never edit world() or its shared present line.
infra_world() { # task 112: terraform, gcloud and gh for setup.sh infra / infra-push
  :
}

nvm_in_home() { # a nvm the way Cloud Shell has it: a function in ~/.nvm/nvm.sh
  mkdir -p "$W/home/.nvm"
  cat > "$W/home/.nvm/nvm.sh" <<'EOF'
nvm() {
  echo "nvm $*" >> "$STUB_LOG"
  case "$1" in install|use) echo "${2#v}.0.0" > "$STUB_STATE/node"; cp -P "$STUB_AVAIL/node" "$STUB_AVAIL/corepack" "$STUB_BIN/";; esac
}
EOF
}

pg_world() { # task 113: Postgres and the storage emulator without Docker
  :
}

run() { # [VAR=value ...] [-- args...]: runs setup.sh in the world's repo; sets CODE, output in $W/out
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  : > "$W/log"
  ( cd "$W/repo" && /usr/bin/env -i HOME="$W/home" PATH="$W/bin" STUB_LOG="$W/log" STUB_STATE="$W/state" \
      STUB_AVAIL="$W/avail" STUB_BIN="$W/bin" SETUP_PROC_VERSION="$W/proc_version" SETUP_BREW_PREFIXES="$W/nobrew" \
      SETUP_PORTS="" ${envs[@]+"${envs[@]}"} /bin/bash scripts/setup.sh ${@+"$@"} ) < "${STDIN:-/dev/null}" > "$W/out" 2>&1
  CODE=$?
}

call() { # [VAR=value ...] -- code: sources setup.sh (its helpers only) in the world's repo, then runs code with them
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  : > "$W/log"; mkdir -p "$W/tmp"
  ( cd "$W/repo" && /usr/bin/env -i HOME="$W/home" PATH="$W/bin" STUB_LOG="$W/log" STUB_STATE="$W/state" \
      STUB_AVAIL="$W/avail" STUB_BIN="$W/bin" SETUP_PROC_VERSION="$W/proc_version" SETUP_BREW_PREFIXES="$W/nobrew" \
      TMPDIR="$W/tmp" ${envs[@]+"${envs[@]}"} /bin/bash -c '. scripts/setup.sh || exit 99; eval "$1"' setup-test "$1" ) \
      < "${STDIN:-/dev/null}" > "$W/out" 2>&1
  CODE=$?
}

logged()     { grep -Eq -- "$1" "$W/log"; }
not_logged() { ! grep -Eq -- "$1" "$W/log"; }
said()       { grep -Fq -- "$1" "$W/out"; }
not_said()   { ! grep -Fq -- "$1" "$W/out"; }
code_is()    { [ "$CODE" = "$1" ]; }
no_env()     { [ ! -e "$W/repo/.env" ]; }
before()     { # regex-a regex-b: the first a is logged before the first b
  local a b; a="$(grep -nE "$1" "$W/log" | head -1 | cut -d: -f1)"; b="$(grep -nE "$2" "$W/log" | head -1 | cut -d: -f1)"
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; }
in_order()   { while [ $# -gt 1 ]; do before "$1" "$2" || return 1; shift; done; }
same_but_secret() { cmp -s <(grep -v '^BETTER_AUTH_SECRET=' "$1") <(grep -v '^BETTER_AUTH_SECRET=' "$2"); }
said_before() { # text-a text-b: a is printed on an earlier line than b
  local a b; a="$(grep -nF -- "$1" "$W/out" | head -1 | cut -d: -f1)"; b="$(grep -nF -- "$2" "$W/out" | head -1 | cut -d: -f1)"
  [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; }
no_leftovers() { ! ls -a "$W/repo" | grep -q '^\.env\.setup'; }
mv_stub() { # body run before the real mv
  local real; real="$(command -v mv)"; rm -f "$W/bin/mv"
  printf '#!/bin/bash\n%s\nexec %s "$@"\n' "$1" "$real" > "$W/bin/mv"; chmod +x "$W/bin/mv"; }
answer() { STDIN="$W/answer"; printf '%s\n' "$@" > "$STDIN"; }
snapshot()   { (cd "$W" && find repo home -type f | sort | while read -r f; do cksum "$f"; done; ls -l repo/.env 2>/dev/null); }
INSTALLS='^(brew install|apt-get|sudo|nvm (install|use)|fnm (install|use)|corepack|curl)'
CHROMIUM='^pnpm --filter @repo/e2e exec playwright install'
FNM_PROFILE='eval "$(fnm env --use-on-cd)"'
WITH_DEPS='pnpm --filter @repo/e2e exec playwright install --with-deps chromium'

# --- macOS ---------------------------------------------------------------------------------------------------------
world; absent jq docker; run -- --yes
check "macOS: says the environment on the first line"       sh -c "head -1 '$W/out' | grep -q '^Environment: macOS'"
check "macOS: installs jq with Homebrew"                    logged '^brew install jq$'
check "macOS: installs the Docker Desktop cask"             logged '^brew install --cask docker-desktop$'
check "macOS: never uses apt-get or sudo"                   not_logged '^(apt-get|sudo)'
check "macOS: then installs the packages"                   logged '^pnpm install --frozen-lockfile$'
check "macOS: then installs chromium without --with-deps"   logged "$CHROMIUM chromium$"
check "macOS: asks to start Docker Desktop once and rerun"  said "start Docker Desktop"

world; absent brew jq; STDIN="$W/no"; echo n > "$STDIN"; run SETUP_INTERACTIVE=1 -- --yes; STDIN=
check "macOS without Homebrew: asks even with --yes"        said "Install Homebrew now with its official installer? [y/N]"
check "macOS without Homebrew: declining exits 1"           code_is 1
check "macOS without Homebrew: declining prints the installer command" \
  said 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh'
check "macOS without Homebrew: declining installs nothing"  not_logged "$INSTALLS|^pnpm install"
check "macOS without Homebrew: declining creates no .env"   no_env

world; absent brew jq; answer y; run SETUP_INTERACTIVE=1 SETUP_BREW_PREFIXES="$W/newbrew" -- --yes; STDIN=
check "macOS without Homebrew: yes runs Homebrew's installer" logged '^curl .*Homebrew/install/HEAD/install\.sh'
check "macOS without Homebrew: then brew install jq"        in_order 'Homebrew/install' '^brew install jq$'
check "macOS without Homebrew: yes finishes"                code_is 0

world; state node 23.6.0; run -- --yes
check "macOS, Node 23 without a manager: brew install fnm"  logged '^brew install fnm$'
check "macOS, Node 23 without a manager: fnm install and use 22" in_order '^fnm install 22$' '^fnm use 22$'
check "macOS, Node 23 without a manager: prints the fnm profile line" said "$FNM_PROFILE"
check "macOS, Node 23 without a manager: a new shell before pnpm dev" said_before "Node changed: open a new shell" "  Next: pnpm dev"
check "macOS, Node 23 without a manager: exits 0"           code_is 0

world; absent brew jq; run -- --yes
check "macOS without Homebrew, no terminal: --yes doesn't install it" not_logged "$INSTALLS|^pnpm install"
check "macOS without Homebrew, no terminal: exits 1 with the command" \
  sh -c "[ $CODE = 1 ] && grep -q 'Homebrew/install/HEAD/install.sh' '$W/out'"

# --- Linux ---------------------------------------------------------------------------------------------------------
world; state uname Linux; absent brew jq; run -- --yes
check "Linux: says the environment"                         sh -c "head -1 '$W/out' | grep -q '^Environment: Linux'"
check "Linux: installs jq through sudo apt-get"             logged '^sudo apt-get install -y jq$'
check "Linux: never uses brew"                              not_logged '^brew'
check "Linux: the plan lists chromium's system libraries"   said "chromium system libraries (sudo apt-get, via Playwright)"
check "Linux: then the packages, the database and chromium with --with-deps" \
  sh -c "grep -q '^pnpm install --frozen-lockfile$' '$W/log' && grep -q '^pnpm db:migrate$' '$W/log' && grep -q '$CHROMIUM --with-deps chromium$' '$W/log'"
check "Linux: exits 0"                                      code_is 0

world; state uname Linux; absent brew jq; run CODESPACES=true -- --yes
check "Codespaces: installs jq through sudo apt-get"        logged '^sudo apt-get install -y jq$'
check "Codespaces: exits 0"                                 code_is 0

world; state uname Linux; state uid 0; absent brew jq; run -- --yes
check "Linux as root: apt-get without sudo"                 sh -c "grep -q '^apt-get install -y jq$' '$W/log' && ! grep -q '^sudo' '$W/log'"

# --- Cloud Shell ---------------------------------------------------------------------------------------------------
world; state uname Linux; absent brew; state node 20.10.0; nvm_in_home; run CLOUD_SHELL=true -- --yes
check "Cloud Shell: says the environment"                   sh -c "head -1 '$W/out' | grep -q '^Environment: Cloud Shell'"
check "Cloud Shell: nvm install for the .nvmrc version"     logged '^nvm install 22$'
check "Cloud Shell: nvm use for the .nvmrc version"         logged '^nvm use 22$'
check "Cloud Shell: no apt-get, sudo, brew or fnm"          not_logged '^(apt-get|sudo|brew|fnm|curl)'
check "Cloud Shell: exits 0"                                code_is 0

# --- WSL -----------------------------------------------------------------------------------------------------------
world; state uname Linux; absent brew; state docker down; run WSL_DISTRO_NAME=Ubuntu-24.04 -- --yes
check "WSL: says the environment"                           sh -c "head -1 '$W/out' | grep -q '^Environment: WSL2 (Ubuntu-24.04)'"
check "WSL: never installs docker.io"                       not_logged 'docker\.io|docker-compose-v2'
check "WSL: prints the WSL-integration fix naming the distro" \
  sh -c "grep -q 'WSL integration' '$W/out' && grep -q 'Ubuntu-24.04' '$W/out'"
check "WSL: exits 1 without Docker"                         code_is 1
check "WSL: still installs the packages"                    logged '^pnpm install --frozen-lockfile$'

world; state uname Linux; absent brew docker; run WSL_DISTRO_NAME=Ubuntu -- --yes
check "WSL without Docker: never installs docker.io"        not_logged 'docker\.io|docker-compose'
check "WSL without Docker: prints the WSL-integration fix"  said "WSL integration → turn on \`Ubuntu\`"
check "WSL without Docker: exits 1"                         code_is 1

world; state uname Linux; absent brew docker; echo "Linux version 5.15.153.1-microsoft-standard-WSL2" > "$W/proc_version"
run -- --yes --no-docker
check "WSL from /proc/version: detected"                    sh -c "head -1 '$W/out' | grep -q '^Environment: WSL2'"
check "WSL with --no-docker: no docker.io, no database"     not_logged 'docker\.io|^pnpm db:'
check "WSL with --no-docker: exits 0"                       code_is 0
check "WSL with --no-docker: the summary says it skipped the database" said "--no-docker"

# --- Windows outside WSL -------------------------------------------------------------------------------------------
world; state uname MINGW64_NT-10.0-22631; absent brew; run -- --yes
check "Windows: prints the WSL2 instruction"                said "wsl --install -d Ubuntu"
check "Windows: exits 1"                                    code_is 1
check "Windows: runs nothing"                               test ! -s "$W/log"
check "Windows: creates no .env"                            no_env

# --- Sandbox without Docker ----------------------------------------------------------------------------------------
world; state uname Linux; absent brew docker; touch "$W/state/apt_docker_fails"; run -- --yes
check "sandbox: tries the distro's Docker"                  logged 'apt-get install -y docker\.io docker-compose-v2'
check "sandbox: still writes .env"                          test -f "$W/repo/.env"
check "sandbox: still installs the packages and chromium"   sh -c "grep -q '^pnpm install --frozen-lockfile$' '$W/log' && grep -q '$CHROMIUM' '$W/log'"
check "sandbox: no database steps"                          not_logged '^pnpm db:'
check "sandbox: prints the task 113 message"                said "task 113"
check "sandbox: exits 1"                                    code_is 1

world; state uname Linux; absent brew docker; run -- --yes --no-docker
check "sandbox with --no-docker: doesn't install Docker"    not_logged 'docker\.io'
check "sandbox with --no-docker: exits 0"                   code_is 0

world; state uname Linux; absent brew docker sudo; run -- --yes
check "sandbox without sudo: drops Docker instead of failing" not_logged 'docker\.io'
check "sandbox without sudo: still writes .env"             test -f "$W/repo/.env"
check "sandbox without sudo: still installs the packages"   logged '^pnpm install --frozen-lockfile$'
check "sandbox without sudo: chromium without --with-deps"  logged "$CHROMIUM chromium$"
check "sandbox without sudo: prints the --with-deps command" said "$WITH_DEPS"
check "sandbox without sudo: prints the task 113 message"   said "task 113"
check "sandbox without sudo: exits 1"                       code_is 1

world; state uname Linux; absent brew sudo jq; run -- --yes
check "Linux without sudo, jq missing: fails naming sudo"   sh -c "[ $CODE = 1 ] && grep -q 'sudo' '$W/out'"
check "Linux without sudo, jq missing: installs nothing"    not_logged "$INSTALLS|^pnpm install"

world; state uname Linux; absent brew apt-get jq; answer y; run SETUP_INTERACTIVE=1; STDIN=
check "no apt-get: doesn't ask"                             not_said "Install these?"
check "no apt-get: says so"                                 said "no apt-get"
check "no apt-get: exits 1 installing nothing"              sh -c "[ $CODE = 1 ] && ! grep -Eq '^pnpm install' '$W/log'"

# --- Playwright's system libraries (sudo apt-get) only when approved ------------------------------------------------
world; state uname Linux; absent brew; run
check "chromium deps, no terminal: no --with-deps"          sh -c "grep -q '$CHROMIUM chromium$' '$W/log' && ! grep -q -- '--with-deps' '$W/log'"
check "chromium deps, no terminal: prints the command"      said "$WITH_DEPS"
check "chromium deps, no terminal: exits 0"                 code_is 0
world; state uname Linux; absent brew; answer n; run SETUP_INTERACTIVE=1; STDIN=
check "chromium deps, declined: asks"                       said "chromium system libraries"
check "chromium deps, declined: no --with-deps"             not_logged '--with-deps'
world; state uname Linux; absent brew; answer y; run SETUP_INTERACTIVE=1; STDIN=
check "chromium deps, accepted: --with-deps"                logged "$CHROMIUM --with-deps chromium$"

# --- --no-install, no terminal -------------------------------------------------------------------------------------
world; state uname Linux; absent brew jq; state node 20.10.0; run -- --no-install
check "--no-install: installs nothing"                      not_logged "$INSTALLS|^pnpm install|^pnpm db:|$CHROMIUM"
check "--no-install: names jq and Node"                     sh -c "grep -q 'jq' '$W/out' && grep -q 'Node' '$W/out'"
check "--no-install: prints the command for jq"             said "sudo apt-get install -y jq"
check "--no-install: prints a command for Node 22"          said "fnm install 22"
check "--no-install: exits 1"                               code_is 1
check "--no-install: creates no .env"                       no_env

world; state uname Linux; absent brew jq; state node 20.10.0; run
check "no terminal, no --yes: installs nothing"             not_logged "$INSTALLS|^pnpm install"
check "no terminal, no --yes: prints the command for jq"    said "sudo apt-get install -y jq"
check "no terminal, no --yes: exits 1"                      code_is 1
check "no terminal, no --yes: creates no .env"              no_env

world; run -- --no-install
check "--no-install with nothing missing: exits 0"          code_is 0
check "--no-install with nothing missing: changes nothing"  sh -c "! grep -Eq '$INSTALLS|^pnpm (install|db:)' '$W/log' && [ ! -e '$W/repo/.env' ]"

# --- .env ----------------------------------------------------------------------------------------------------------
world; run -- --yes
check ".env: a fresh clone gets one"                        test -f "$W/repo/.env"
check ".env: mode 600"                                      sh -c "ls -l '$W/repo/.env' | grep -q '^-rw-------'"
SECRET1="$(grep '^BETTER_AUTH_SECRET=' "$W/repo/.env" 2>/dev/null | cut -d= -f2-)"
check ".env: the secret isn't the placeholder"              sh -c "[ -n '$SECRET1' ] && ! grep -qF -- '$SECRET1' '$ROOT/.env.example'"
check ".env: the secret is never printed"                   sh -c "[ -n '$SECRET1' ] && ! grep -qF -- '$SECRET1' '$W/out'"
check ".env: the other lines come from .env.example"        same_but_secret "$ROOT/.env.example" "$W/repo/.env"
FIRST="$W"; world; run -- --yes
SECRET2="$(grep '^BETTER_AUTH_SECRET=' "$W/repo/.env" 2>/dev/null | cut -d= -f2-)"
check ".env: two clones get different secrets"              sh -c "[ -n '$SECRET2' ] && [ '$SECRET1' != '$SECRET2' ]"

world; grep -v '^STORAGE_BUCKET=' "$ROOT/.env.example" | sed 's/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=hand-made-value-1234567890abcdef/' > "$W/repo/.env"
cp "$W/repo/.env" "$W/env.before"; run -- --yes
check ".env: an existing one stays byte-for-byte"           cmp -s "$W/env.before" "$W/repo/.env"
check ".env: names the key it lacks"                        said "STORAGE_BUCKET"
check ".env: never prints an existing value"                not_said "hand-made-value-1234567890abcdef"

world; mv_stub 'kill -TERM $PPID; exit 1'; run -- --yes
check ".env: an interrupted write leaves no temp file"      no_leftovers
check ".env: an interrupted write leaves no .env"           no_env
world; mv_stub 'echo existing > .env'; run -- --yes
check ".env: one that appears meanwhile is kept"            test "$(cat "$W/repo/.env")" = existing
check ".env: says created only when it was"                 not_said "created from .env.example"
check ".env: the race leaves no temp file"                  no_leftovers
check ".gitignore: ignores .env.* temp files"               git -C "$ROOT" check-ignore -q .env.setup.12345
check ".gitignore: keeps .env.example"                      sh -c "! git -C '$ROOT' check-ignore -q .env.example"

# --- Order, forbidden commands, database timeout, rerun, fnm sha256 -------------------------------------------------
world; run -- --yes
check "steps: install, db:up, migrate, chromium in that order" in_order '^pnpm install' '^pnpm db:up$' '^pnpm db:migrate$' "$CHROMIUM"
check "steps: never db:generate, gcloud, gh or terraform"   not_logged 'db:generate|^gcloud|^gh |^terraform'
check "steps: everything set up exits 0"                    code_is 0
BEFORE="$(snapshot)"; run -- --yes
check "rerun: installs nothing"                             not_logged "$INSTALLS"
check "rerun: changes no file"                              test "$BEFORE" = "$(snapshot)"
check "rerun: exits 0"                                      code_is 0

world; state health starting; start=$(date +%s); run SETUP_DB_TIMEOUT=2 -- --yes; took=$(( $(date +%s) - start ))
check "database never healthy: fails"                       sh -c "[ $CODE != 0 ]"
check "database never healthy: names port 5433"             said "5433"
check "database never healthy: within the timeout"          test "$took" -lt 10
check "database never healthy: doesn't migrate"             not_logged '^pnpm db:migrate'

world; state uname Linux; state arch x86_64; absent brew node corepack pnpm; run -- --yes
check "fnm download: fetches the pinned release"            logged '^curl .*github.com/Schniz/fnm/releases/download/v1\.39\.0/fnm-linux\.zip'
check "fnm download: a wrong sha256 fails"                  sh -c "[ $CODE != 0 ] && grep -q 'sha256' '$W/out'"
check "fnm download: a wrong sha256 runs nothing after it"  not_logged '^(unzip|fnm|pnpm install)'
check "fnm download: a wrong sha256 leaves no fnm binary"   test ! -e "$W/home/.local/share/fnm/fnm"

# --- Ports, --skip-browsers ----------------------------------------------------------------------------------------
world; run -- --yes --skip-browsers
check "--skip-browsers: no chromium"                         not_logged "$CHROMIUM"
check "--skip-browsers: the summary says so"                 said "--skip-browsers"
if command -v python3 >/dev/null 2>&1; then
  python3 -I -c 'import socket, time
s = socket.socket(); s.bind(("127.0.0.1", 0)); s.listen(1)
print(s.getsockname()[1], flush=True); time.sleep(30)' > "$TMP/port" &
  LISTENER=$!; for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TMP/port" ] && break; sleep 0.2; done; PORT="$(cat "$TMP/port")"
  world; run SETUP_PORTS="$PORT" -- --yes
  check "ports: warns when one is taken"                     said "port $PORT is in use"
  check "ports: a taken port doesn't fail the setup"         code_is 0
  kill "$LISTENER" 2>/dev/null; wait "$LISTENER" 2>/dev/null
fi

if command -v python3 >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
  world; state uname Linux; state arch x86_64; absent brew node corepack pnpm unzip; ln -s "$(command -v unzip)" "$W/bin/unzip"
  python3 -I - "$W/avail/fnm" "$W/state/download" <<'EOF'
import sys, zipfile
info = zipfile.ZipInfo("fnm"); info.external_attr = 0o755 << 16
with zipfile.ZipFile(sys.argv[2], "w") as z: z.writestr(info, open(sys.argv[1]).read())
EOF
  SUM="$( (sha256sum "$W/state/download" 2>/dev/null || shasum -a 256 "$W/state/download") | cut -d' ' -f1)"
  sed "s/^FNM_SHA256_LINUX_X64=.*/FNM_SHA256_LINUX_X64=\"$SUM\"/" "$SETUP" > "$W/repo/scripts/setup.sh"
  run -- --yes
  check "fnm download: a matching sha256 installs fnm"       test -x "$W/home/.local/share/fnm/fnm"
  check "fnm download: then fnm install and use 22"          in_order '^fnm install 22$' '^fnm use 22$' '^corepack enable pnpm$' '^pnpm install'
  check "fnm download: prints the fnm profile line"          said "$FNM_PROFILE"
  check "fnm download: a new shell before pnpm dev"          said_before "Node changed: open a new shell" "  Next: pnpm dev"
  check "fnm download: exits 0"                              code_is 0
fi

# --- Subcommands, flags and usage -----------------------------------------------------------------------------------
world; run -- --help
check "--help: prints the usage line"                       said "bash scripts/setup.sh [--no-install] [--yes] [--no-docker] [--skip-browsers]"
check "--help: explains every flag" \
  sh -c "for f in --no-install --yes --no-docker --skip-browsers; do grep -Eq -- \"^  \$f \" '$W/out' || exit 1; done"
check "--help: exits 0 running nothing"                     sh -c "[ $CODE = 0 ] && [ ! -s '$W/log' ] && ! grep -q Environment '$W/out'"
world; run -- --yes --bogus
check "an unknown flag: names it"                           said "setup: unknown option '--bogus'"
check "an unknown flag: prints the usage"                   said "bash scripts/setup.sh [--no-install]"
check "an unknown flag: exits 1 running nothing"            sh -c "[ $CODE = 1 ] && [ ! -s '$W/log' ] && [ ! -e '$W/repo/.env' ]"
world; run -- frobnicate
check "an unknown word: refused like a flag"                sh -c "[ $CODE = 1 ] && grep -qF \"unknown option 'frobnicate'\" '$W/out'"
world; run -- --yes infra
check "a subcommand comes first: after a flag it's unknown" sh -c "[ $CODE = 1 ] && grep -qF \"unknown option 'infra'\" '$W/out'"
for sub in infra infra-push; do
  world; run -- "$sub"
  check "$sub: comes with task 112"                         said "setup.sh $sub comes with task 112 (owner and GCP admin setup)."
  check "$sub: exits 1 running nothing"                     sh -c "[ $CODE = 1 ] && [ ! -s '$W/log' ] && [ ! -e '$W/repo/.env' ]"
  check "$sub: not the developer flow"                      not_said "Environment:"
done
world; run -- services
check "services: comes with task 113"                       said "setup.sh services comes with task 113 (local database and file storage without Docker)."
check "services: exits 1 running nothing"                   sh -c "[ $CODE = 1 ] && [ ! -s '$W/log' ] && [ ! -e '$W/repo/.env' ]"
world; run -- infra --no-docker
check "a subcommand takes only its own flags"               sh -c "[ $CODE = 1 ] && grep -qF \"unknown option '--no-docker'\" '$W/out'"
world; run -- services --help
check "a subcommand's --help prints the usage, exits 0"     sh -c "[ $CODE = 0 ] && grep -qF 'bash scripts/setup.sh [--no-install]' '$W/out'"

world; call -- 'true'
check "sourced: defines helpers, runs and prints nothing"   sh -c "[ $CODE = 0 ] && [ ! -s '$W/out' ] && [ ! -s '$W/log' ]"
call -- 'need_value --project my-project && echo next'
check "need_value: a flag's value is there"                 sh -c "[ $CODE = 0 ] && grep -qx next '$W/out'"
call -- 'need_value --project; echo next'
check "need_value: a missing value fails naming the flag"   sh -c "[ $CODE = 1 ] && grep -qF 'setup: --project needs a value' '$W/out' && ! grep -q next '$W/out'"
call -- 'need_value --project --force'
check "need_value: a flag isn't a value"                    sh -c "[ $CODE = 1 ] && grep -qF -- '--project needs a value' '$W/out'"

# --- Shared helpers (sourced): download_checked, ensure_brew, add_apt_repo -----------------------------------------
no_temp() { [ -z "$(ls -A "$W/tmp" 2>/dev/null)" ]; }
world; state download 'a pinned release'
SUM="$( (sha256sum "$W/state/download" 2>/dev/null || shasum -a 256 "$W/state/download") | cut -d' ' -f1)"
call -- "download_checked https://example.test/tool.zip $SUM '$W/home/tool.zip' && echo next"
check "download_checked: fetches the url"                   logged '^curl .*https://example\.test/tool\.zip$'
check "download_checked: a matching sha256 writes dest"     sh -c "[ $CODE = 0 ] && cmp -s '$W/state/download' '$W/home/tool.zip' && grep -qx next '$W/out'"
check "download_checked: leaves no temp dir"                no_temp
world; call -- "download_checked https://example.test/tool.zip $SUM '$W/home/tool.zip' || echo refused"
check "download_checked: a wrong sha256 fails naming it"    sh -c "grep -qx refused '$W/out' && grep -q 'sha256' '$W/out'"
check "download_checked: a wrong sha256 leaves no dest"     test ! -e "$W/home/tool.zip"
check "download_checked: a wrong sha256 leaves no temp dir" no_temp
world; stub curl 'exit 22'; present curl; call -- "download_checked https://example.test/tool.zip $SUM '$W/home/tool.zip' || echo refused"
check "download_checked: a failed download fails"           sh -c "grep -qx refused '$W/out' && grep -qF \"couldn't download https://example.test/tool.zip\" '$W/out'"
check "download_checked: a failed download leaves nothing"  sh -c "[ ! -e '$W/home/tool.zip' ] && [ -z \"\$(ls -A '$W/tmp')\" ]"
world; state download 'a pinned release'; absent sha256sum shasum
call -- "download_checked https://example.test/tool.zip $SUM '$W/home/tool.zip' || echo refused"
check "download_checked: no sha256 tool fails closed"       sh -c "grep -qx refused '$W/out' && [ ! -e '$W/home/tool.zip' ]"
world; state download 'a pinned release'; call -- "download_checked https://example.test/tool.zip $SUM '$W/home/tool.zip'"
check "download_checked: https only, redirects too"         logged '^curl --proto =https --proto-redir =https '
for bad in "" "${SUM%?}" "$(printf '%s' "$SUM" | tr 'a-f' 'A-F')" "${SUM%?}g"; do
  world; state download 'a pinned release'; call -- "download_checked https://example.test/tool.zip '$bad' '$W/home/tool.zip' || echo refused"
  check "download_checked: refuses the pin '${bad:-(empty)}' before downloading" \
    sh -c "grep -qx refused '$W/out' && grep -q 'sha256' '$W/out' && [ ! -s '$W/log' ] && [ ! -e '$W/home/tool.zip' ]"
done
world; state download 'a pinned release'; absent sha256sum shasum; stub sha256sum 'exit 0'; present sha256sum
call -- "download_checked https://example.test/tool.zip $SUM '$W/home/tool.zip' || echo refused"
check "download_checked: an empty computed hash fails closed" sh -c "grep -qx refused '$W/out' && [ ! -e '$W/home/tool.zip' ]"

world; call -- 'ensure_brew && echo ready'
check "ensure_brew: Homebrew there: asks and installs nothing" sh -c "grep -qx ready '$W/out' && ! grep -q 'Install Homebrew' '$W/out' && ! grep -q '^curl' '$W/log'"
world; absent brew; call -- 'ensure_brew; echo after'
check "ensure_brew: no terminal: exits 1 with the installer"  sh -c "[ $CODE = 1 ] && grep -q 'Homebrew/install/HEAD/install.sh' '$W/out' && ! grep -q after '$W/out' && [ ! -s '$W/log' ]"
world; absent brew; answer y; call SETUP_INTERACTIVE=1 SETUP_BREW_PREFIXES="$W/newbrew" -- 'ensure_brew && has brew && echo ready'; STDIN=
check "ensure_brew: yes runs Homebrew's installer"          sh -c "grep -q '^curl .*Homebrew/install/HEAD/install\.sh' '$W/log' && grep -q 'ready\$' '$W/out'"

FPR="0123456789ABCDEF0123456789ABCDEF01234567"
apt_repo_world() { # a Linux world with gpg; apt's files go under $W/aptroot (SETUP_APT_ROOT, honored when sourced)
  world; state uname Linux; APT="$W/aptroot"; KR="/etc/apt/keyrings/example.gpg"
  LINE="deb [arch=amd64 signed-by=$KR] https://example.test/apt stable main"
  printf 'pub:-:4096:1:89ABCDEF01234567:1600000000:::-:::scESC::::::23::0:\nfpr:::::::::%s:\nsub:-:4096:1:FEDCBA9876543210:1600000000::::::e::::::23:\nfpr:::::::::FEDCBA9876543210FEDCBA9876543210FEDCBA98:\n' "$FPR" > "$W/state/gpg_keys"
  stub gpg 'case "$*" in *--show-keys*) cat "$STUB_STATE/gpg_keys";; *) echo dearmored; cat;; esac'; present gpg
}
add_repo() { # line [keyring] [fingerprint]
  call SETUP_APT_ROOT="$APT" -- "add_apt_repo https://example.test/key.asc '${2:-$KR}' '$1' '${3-$FPR}' && echo added"; }
added_nothing() { ! grep -qx added "$W/out" && [ ! -e "$APT" ] && ! grep -q 'apt-get update' "$W/log"; }
apt_repo_world; add_repo "$LINE"
check "add_apt_repo: fetches the key, https only"           logged '^curl --proto =https --proto-redir =https .*https://example\.test/key\.asc$'
check "add_apt_repo: checks the key's fingerprint first"    in_order '^gpg .*--show-keys' '^gpg .*--dearmor'
check "add_apt_repo: the keyring is the key through gpg --dearmor" sh -c "grep -q '^gpg .*--dearmor' '$W/log' && [ \"\$(head -1 '$APT$KR')\" = dearmored ]"
check "add_apt_repo: the keyring is mode 644"               sh -c "ls -l '$APT$KR' | grep -q '^-rw-r--r--'"
check "add_apt_repo: the list holds the line"               test "$(cat "$APT/etc/apt/sources.list.d/example.list" 2>/dev/null)" = "$LINE"
check "add_apt_repo: writes through sudo"                   logged '^sudo (cp|mkdir|chmod)'
check "add_apt_repo: then apt-get update"                   in_order '^gpg .*--dearmor' '^apt-get update$'
check "add_apt_repo: true when added, no temp dir left"     sh -c "grep -qx added '$W/out' && [ -z \"\$(ls -A '$W/tmp')\" ]"
apt_repo_world; add_repo "$LINE" "$KR" "0123 4567 89ab cdef 0123  4567 89AB CDEF 0123 4567"
check "add_apt_repo: a fingerprint with spaces or lower case matches" sh -c "grep -qx added '$W/out'"
apt_repo_world; state uid 0; add_repo "$LINE"
check "add_apt_repo: as root, no sudo"                      sh -c "grep -qx added '$W/out' && ! grep -q '^sudo' '$W/log'"
apt_repo_world; add_repo "$LINE" "$KR" "FEDCBA9876543210FEDCBA9876543210FEDCBA98"
check "add_apt_repo: another key's fingerprint is refused"  sh -c "grep -q 'fingerprint' '$W/out'"
check "add_apt_repo: a wrong fingerprint adds nothing"      added_nothing
check "add_apt_repo: a wrong fingerprint doesn't dearmor"   not_logged '^gpg .*--dearmor'
apt_repo_world; cat "$W/state/gpg_keys" "$W/state/gpg_keys" > "$W/state/two"; mv "$W/state/two" "$W/state/gpg_keys"; add_repo "$LINE"
check "add_apt_repo: a key file with two keys is refused"   sh -c "grep -q 'more than one key' '$W/out'"
check "add_apt_repo: two keys add nothing"                  added_nothing
for bad in "" "0123" "${FPR}00" "Z123456789ABCDEF0123456789ABCDEF01234567"; do
  apt_repo_world; add_repo "$LINE" "$KR" "$bad"
  check "add_apt_repo: refuses the fingerprint '${bad:-(empty)}' before fetching" sh -c "grep -q 'fingerprint' '$W/out' && [ ! -s '$W/log' ] && [ ! -e '$APT' ]"
done
apt_repo_world; add_repo "deb https://example.test/apt stable main"
check "add_apt_repo: a line not signed by the keyring is refused" sh -c "[ $CODE != 0 ] && grep -q 'signed-by' '$W/out' && ! grep -qx added '$W/out'"
check "add_apt_repo: a refused line fetches and writes nothing" sh -c "[ ! -s '$W/log' ] && [ ! -e '$APT' ]"
apt_repo_world; add_repo "deb [signed-by=$KR trusted=yes] https://example.test/apt stable main"
check "add_apt_repo: a trusted= line is refused"            sh -c "grep -q 'trusted=' '$W/out' && [ ! -s '$W/log' ] && [ ! -e '$APT' ]"
apt_repo_world; add_repo "$LINE
deb [trusted=yes] https://evil.test/apt stable main"
check "add_apt_repo: a line with a newline is refused"      sh -c "grep -q 'one line' '$W/out' && [ ! -s '$W/log' ] && [ ! -e '$APT' ]"
for kr in /tmp/example.gpg /etc/apt/keyrings/sub/example.gpg /etc/apt/keyrings/../example.gpg /etc/apt/keyrings/.gpg \
  "/etc/apt/keyrings/ex ample.gpg" etc/apt/keyrings/example.gpg /usr/share/keyrings/; do
  apt_repo_world; add_repo "deb [signed-by=$kr] https://example.test/apt stable main" "$kr"
  check "add_apt_repo: refuses the keyring '$kr'"           sh -c "grep -q 'keyring' '$W/out' && [ ! -s '$W/log' ] && [ ! -e '$APT' ]"
done
apt_repo_world; KR=/usr/share/keyrings/example-archive.keyring.gpg; LINE="deb [signed-by=$KR] https://example.test/apt stable main"
add_repo "$LINE"
check "add_apt_repo: a keyring in /usr/share/keyrings"      sh -c "grep -qx added '$W/out' && [ -f '$APT$KR' ] && [ -f '$APT/etc/apt/sources.list.d/example-archive.keyring.list' ]"
apt_repo_world; stub curl 'exit 22'; present curl; add_repo "$LINE"
check "add_apt_repo: a failed key download adds nothing"    added_nothing
apt_repo_world; stub gpg 'exit 2'; present gpg; add_repo "$LINE"
check "add_apt_repo: a key gpg can't read adds nothing"     added_nothing
apt_repo_world; absent gpg; add_repo "$LINE"
check "add_apt_repo: without gpg it says so, adds nothing"  sh -c "! grep -qx added '$W/out' && grep -q gpg '$W/out' && [ ! -e '$APT' ]"

# --- Hints ---------------------------------------------------------------------------------------------------------
world; state uname Linux; absent brew docker; run -- --no-install
check "hint: Docker's own repository calls it docker-compose-plugin" said "docker-compose-plugin"
world; state uname Linux; absent brew; state docker denied; run -- --no-install
check "hint: the docker group is root on the host"          said "root on this host"
world; run -- --yes
check "summary: setup.sh infra is coming with task 112"     said "coming with task 112"

echo; echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
