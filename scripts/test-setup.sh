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
  # postgresql-16 isn't installed: apt-get puts initdb and pg_ctl into $W/pgbin (SETUP_PG_BIN). They log like stubs;
  # pg_ctl start runs a sleep as the server (its pid in postmaster.pid). Every started pid goes into state/pids.
  mkdir -p "$W/pgbin" "$W/pgavail" "$W/pghome"
  cat > "$W/pgavail/initdb" <<'EOF'
#!/bin/bash
echo "initdb $*" >> "$STUB_LOG"
d=; while [ $# -gt 0 ]; do case "$1" in -D) d="$2";; --pwfile=*) cp "${1#--pwfile=}" "$STUB_STATE/pwfile";; esac; shift; done
mkdir -p "$d" && echo 16 > "$d/PG_VERSION" && : > "$d/postgresql.conf"
EOF
  cat > "$W/pgavail/pg_ctl" <<'EOF'
#!/bin/bash
echo "pg_ctl $*" >> "$STUB_LOG"
d=; for a in "$@"; do [ "$prev" = -D ] && d="$a"; prev="$a"; done
pid="$(head -1 "$d/postmaster.pid" 2>/dev/null)"
case "$a" in
  status) [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && exit 0; exit 3 ;;
  start) [ -f "$STUB_STATE/pg_start_fails" ] && exit 1
    "$(dirname "$0")/postgres" -D "$d" </dev/null >/dev/null 2>&1 & echo $! > "$d/postmaster.pid"; echo $! >> "$STUB_STATE/pids" ;;
  stop) [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -f "$d/postmaster.pid" ;;
esac
exit 0
EOF
  # The server: a process whose command line names .../bin/postgres, like the real postmaster.
  printf '#!/bin/bash\ntrap '"'"'kill $! 2>/dev/null; exit 0'"'"' TERM\nsleep 60 & wait\n' > "$W/pgavail/postgres"
  chmod +x "$W/pgavail/initdb" "$W/pgavail/pg_ctl" "$W/pgavail/postgres"
  local S='"$STUB_STATE"'
  stub psql "case \"\$*\" in
  *pg_database*) [ -f $S/db_app ] && echo 1;;
  *'create database app'*) touch $S/db_app;;
  *server_version*) cat $S/pg_version;;
esac; exit 0"
  stub apt-cache "[ \"\$1 \$2\" = 'show postgresql-16' ] && [ -f $S/pg_in_distro ]"
  stub install "for a in \"\$@\"; do src=\"\$dst\"; dst=\"\$a\"; done; cp \"\$src\" $S/createcluster"
  stub getent "echo \"postgres:x:999:999::\$(dirname $S)/pghome:/bin/bash\""
  stub chown; stub runuser 'while [ "$1" != -- ]; do shift; done; shift; exec "$@"'
  stub postgresql-16; stub gnupg; stub gpg
  stub fake-gcs-server 'echo $$ >> "$STUB_STATE/pids"; [ -f "$STUB_STATE/gcs_exits" ] && exit 1
trap '"'"'kill $! 2>/dev/null; exit 0'"'"' TERM; sleep 60 & wait'
  mv "$W/avail/apt-get" "$W/avail/apt-get-base"
  cat > "$W/avail/apt-get" <<'EOF'
#!/bin/bash
for p in "$@"; do case "$p" in
  postgresql-16) if [ -f "$STUB_STATE/pg_apt_fails" ]; then echo "apt-get $*" >> "$STUB_LOG"; exit 100; fi
    cp "$(dirname "$STUB_STATE")"/pgavail/* "$(dirname "$STUB_STATE")/pgbin/" ;;
  gnupg) cp -P "$STUB_AVAIL/gpg" "$STUB_BIN/gpg" ;;
esac; done
exec "$STUB_AVAIL/apt-get-base" "$@"
EOF
  chmod +x "$W/avail/apt-get"
  present apt-get apt-cache psql install getent chown runuser
  local t p; for t in tar gzip ps; do p="$(command -v "$t" 2>/dev/null)" && ln -s "$p" "$W/bin/$t"; done
  state pg_in_distro yes; state pg_version "16.15 (Ubuntu 16.15-1.pgdg24.04+1)"
}
sandbox() { # Linux without Docker, which can't be installed either; postgresql-16 in the distro, not installed yet
  world; state uname Linux; absent brew docker; touch "$W/state/apt_docker_fails"
}
gcs_ready() { # curl hands out a fake-gcs-server release archive, pinned in the world's setup.sh for its arch
  local sum var
  mkdir -p "$W/gcs"; cp "$W/avail/fake-gcs-server" "$W/gcs/fake-gcs-server"
  tar -czf "$W/state/download" -C "$W/gcs" fake-gcs-server
  sum="$( (sha256sum "$W/state/download" 2>/dev/null || shasum -a 256 "$W/state/download") | cut -d' ' -f1)"
  case "$(cat "$W/state/arch")" in x86_64) var=GCS_SHA256_LINUX_AMD64 ;; *) var=GCS_SHA256_LINUX_ARM64 ;; esac
  sed "s/^$var=.*/$var=\"$sum\"/" "$W/repo/scripts/setup.sh" > "$W/setup.pinned" && mv "$W/setup.pinned" "$W/repo/scripts/setup.sh"
}

run() { # [VAR=value ...] [-- args...]: runs setup.sh in the world's repo; sets CODE, output in $W/out
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  : > "$W/log"
  ( cd "$W/repo" && /usr/bin/env -i HOME="$W/home" PATH="$W/bin" STUB_LOG="$W/log" STUB_STATE="$W/state" \
      STUB_AVAIL="$W/avail" STUB_BIN="$W/bin" SETUP_PROC_VERSION="$W/proc_version" SETUP_BREW_PREFIXES="$W/nobrew" \
      SETUP_PG_BIN="$W/pgbin" SETUP_GCS_WAIT=0.2 SETUP_PORTS="" ${envs[@]+"${envs[@]}"} /bin/bash scripts/setup.sh ${@+"$@"} ) < "${STDIN:-/dev/null}" > "$W/out" 2>&1
  CODE=$?
}

call() { # [VAR=value ...] -- code: sources setup.sh (its helpers only) in the world's repo, then runs code with them
  local envs=()
  while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  [ $# -gt 0 ] && shift
  : > "$W/log"; mkdir -p "$W/tmp"
  ( cd "$W/repo" && /usr/bin/env -i HOME="$W/home" PATH="$W/bin" STUB_LOG="$W/log" STUB_STATE="$W/state" \
      STUB_AVAIL="$W/avail" STUB_BIN="$W/bin" SETUP_PROC_VERSION="$W/proc_version" SETUP_BREW_PREFIXES="$W/nobrew" \
      SETUP_PG_BIN="$W/pgbin" SETUP_GCS_WAIT=0.2 TMPDIR="$W/tmp" ${envs[@]+"${envs[@]}"} /bin/bash -c '. scripts/setup.sh || exit 99; eval "$1"' setup-test "$1" ) \
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
sandbox; gcs_ready; run -- --yes
check "sandbox: tries the distro's Docker"                  logged 'apt-get install -y docker\.io docker-compose-v2'
check "sandbox: still writes .env"                          test -f "$W/repo/.env"
check "sandbox: still installs the packages and chromium"   sh -c "grep -q '^pnpm install --frozen-lockfile$' '$W/log' && grep -q '$CHROMIUM' '$W/log'"
check "sandbox: no pnpm db:up, but migrates"                sh -c "! grep -q '^pnpm db:up' '$W/log' && grep -q '^pnpm db:migrate$' '$W/log'"
check "sandbox: runs the database and file storage without Docker (task 113)" said "After a restart: bash scripts/setup.sh services"
check "sandbox: exits 0"                                    code_is 0

world; state uname Linux; absent brew docker; run -- --yes --no-docker
check "sandbox with --no-docker: doesn't install Docker"    not_logged 'docker\.io'
check "sandbox with --no-docker: exits 0"                   code_is 0

sandbox; absent sudo; gcs_ready; run -- --yes
check "sandbox without sudo: drops Docker instead of failing" not_logged 'docker\.io'
check "sandbox without sudo: still writes .env"             test -f "$W/repo/.env"
check "sandbox without sudo: still installs the packages"   logged '^pnpm install --frozen-lockfile$'
check "sandbox without sudo: chromium without --with-deps"  logged "$CHROMIUM chromium$"
check "sandbox without sudo: prints the --with-deps command" said "$WITH_DEPS"
check "sandbox without sudo: says Postgres can't be installed (task 113)" said "PostgreSQL 16 can't be installed"
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
check "services on macOS: says pnpm db:up instead"          said "pnpm db:up"
check "services on macOS: exits 1 running nothing"          sh -c "[ $CODE = 1 ] && [ ! -s '$W/log' ] && [ ! -e '$W/repo/.env' ]"
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

# --- Database and file storage without Docker (task 113) -----------------------------------------------------------
logged_f() { grep -Fq -- "$1" "$W/log"; }
# The emulator runs in the background: its stub logs its call a moment after setup.sh started it. Wait for that line
# (up to 5 s) before checking it, so it never lands in the next run's log.
eventually() { local i; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do "$@" && return 0; sleep 0.25; done; return 1; }
repo_files() { (cd "$W/repo" && find . -type f | sort); }
DATA="home/.local/share/mng-projects"
GCS_ARGS="-scheme http -host 127.0.0.1 -port 4443 -public-host localhost:4443 -external-url http://localhost:4443"
CORS="-cors-headers Content-Type,Content-Disposition,x-goog-if-generation-match,x-goog-content-length-range"
ADMIN_URL="postgres://postgres:postgres@localhost:5433/postgres"

sandbox; gcs_ready; REPO_BEFORE="$(repo_files)"; run -- --yes; eventually logged '^fake-gcs-server '
check "fallback: writes create_main_cluster = false"         grep -qx 'create_main_cluster = false' "$W/state/createcluster"
check "fallback: in a createcluster.d drop-in, as root"      logged '^sudo install -D -m 644 .* /etc/postgresql-common/createcluster\.d/mng-projects\.conf$'
check "fallback: then installs postgresql-16 through sudo"  in_order 'createcluster\.d' '^sudo apt-get install -y postgresql-16$'
check "fallback: never installs postgresql-common's default cluster or other versions" not_logged 'install -y .*postgresql-(1[^6]|common)'
check "fallback: runs initdb from SETUP_PG_BIN outside the repo" logged_f "initdb -D $W/$DATA/postgres "
check "fallback: initdb as user postgres with password postgres" sh -c "grep -q '^initdb .*-U postgres ' '$W/log' && [ \"\$(cat '$W/state/pwfile')\" = postgres ]"
check "fallback: password auth over TCP, like the Docker image" logged '^initdb .*--auth-host=scram-sha-256'
check "fallback: ICU collation (en-US)"                      logged '^initdb .*--locale-provider=icu --icu-locale=en-US'
check "fallback: not root, so never runuser"                 not_logged '^runuser'
check "fallback: the summary shows where the data is"        said "data in $W/$DATA/postgres"
check "fallback: pg_ctl starts it on 5433, localhost only"   logged_f "pg_ctl -D $W/$DATA/postgres -l $W/$DATA/postgres.log -w -t 60 -o -p 5433 -h localhost start"
check "fallback: its sockets stay in the data directory"     grep -qF "unix_socket_directories = '$W/$DATA/postgres'" "$W/$DATA/postgres/postgresql.conf"
check "fallback: creates database app as postgres/postgres"  sh -c "grep -qF '$ADMIN_URL' '$W/log' && grep -q 'create database app' '$W/log'"
check "fallback: in that order, then migrates"               in_order createcluster 'apt-get install -y postgresql-16' '^initdb ' '^pg_ctl .* start$' 'create database app' '^pnpm db:migrate$'
check "fallback: 16.15 prints no rls-pins warning"           not_said "rls-pins"
check "fallback: nothing is written inside the repo"         test "$(repo_files)" = "$(printf '%s\n' "$REPO_BEFORE" ./.env | sort)"
check "fallback: the summary names setup.sh services, not pnpm db:up" \
  sh -c "grep -qF 'After a restart: bash scripts/setup.sh services' '$W/out' && ! grep -qF 'After a restart: pnpm db:up' '$W/out'"
check "fallback: exits 0"                                    code_is 0
check "fallback storage: fetches the pinned release"         logged '^curl .*https://github\.com/fsouza/fake-gcs-server/releases/download/v1\.52\.2/fake-gcs-server_1\.52\.2_Linux_arm64\.tar\.gz$'
check "fallback storage: started with the compose file's arguments, on 127.0.0.1" \
  sh -c "grep -F -- 'fake-gcs-server $GCS_ARGS -backend memory -data ' '$W/log' | grep -qF -- '/repo/packages/storage/dev-bucket $CORS'"
check "fallback storage: memory backend, no filesystem root (the emulator writes unescaped object names)" \
  sh -c "grep -q '^fake-gcs-server .*-backend memory' '$W/log' && ! grep -q -- '-filesystem-root' '$W/log' && [ ! -e '$W/$DATA/storage' ]"
check "fallback storage: the summary says uploads live in memory" said "uploaded files are kept in memory"
check "fallback storage: its pid file and log next to the database's" \
  sh -c "[ -s '$W/$DATA/fake-gcs-server.pid' ] && [ -f '$W/$DATA/fake-gcs-server.log' ]"
check "fallback storage: running"                            sh -c "kill -0 \"\$(cat '$W/$DATA/fake-gcs-server.pid')\""

# A rerun: nothing set up again; with 5433 and 4443 taken (by the fallback's own servers) it warns about neither.
hold_port() { # port: a listener on it, unless something already listens there; its pid (or nothing) in HELD
  HELD=""; command -v python3 >/dev/null 2>&1 || return 1
  python3 -I -c 'import socket, sys, time
s = socket.socket()
try: s.bind(("127.0.0.1", int(sys.argv[1])))
except OSError: sys.exit(0)
s.listen(16); s.settimeout(1); end = time.time() + 60
while time.time() < end:
    try: s.accept()[0].close()
    except OSError: pass' "$1" & HELD=$!
  sleep 0.5; kill -0 "$HELD" 2>/dev/null || HELD=""; return 0
}
GCS_PID_BEFORE="$(cat "$W/$DATA/fake-gcs-server.pid" 2>/dev/null)"
PORTS_HELD=""
if hold_port 5433; then PORTS_HELD="$PORTS_HELD $HELD"; hold_port 4443; PORTS_HELD="$PORTS_HELD $HELD"; fi
run SETUP_PORTS="5433 4443" -- --yes
check "rerun: no initdb, no role or database created"        not_logged '^initdb|create (database|role|user)'
check "rerun: installs and fetches nothing for Postgres or storage" not_logged 'install -y postgresql|createcluster|^curl'
check "rerun: starts neither again"                          sh -c "! grep -q '^pg_ctl .* start$' '$W/log' && ! grep -q '^fake-gcs-server' '$W/log' && [ \"\$(cat '$W/$DATA/fake-gcs-server.pid')\" = '$GCS_PID_BEFORE' ]"
check "rerun: still migrates"                                logged '^pnpm db:migrate$'
if command -v python3 >/dev/null 2>&1; then
  check "rerun: no warning about 5433 or 4443"               sh -c "! grep -qE 'port (5433|4443) is in use' '$W/out'"
fi
check "rerun: exits 0"                                       code_is 0
check "rerun: one unix_socket_directories line"              test "$(grep -c '^unix_socket_directories' "$W/$DATA/postgres/postgresql.conf")" = 1
sed '/^unix_socket_directories/d' "$W/$DATA/postgres/postgresql.conf" > "$W/conf" && cat "$W/conf" > "$W/$DATA/postgres/postgresql.conf"
run -- --yes
check "rerun: a missing unix_socket_directories line comes back once" \
  test "$(grep -c '^unix_socket_directories' "$W/$DATA/postgres/postgresql.conf")" = 1
if command -v python3 >/dev/null 2>&1; then
  sandbox; run SETUP_PORTS="5433 4443" -- --yes --no-docker
  check "ports: 5433 and 4443 taken by something else warn"  sh -c "grep -qF 'port 5433 is in use' '$W/out' && grep -qF 'port 4443 is in use' '$W/out'"
fi
if command -v python3 >/dev/null 2>&1; then
  sandbox; gcs_ready; run -- --yes; eventually logged '^fake-gcs-server '
  run SETUP_PORTS="5433" -- --yes --no-docker
  check "ports: with --no-docker the fallback's own Postgres on 5433 warns" said "port 5433 is in use"
fi
for p in $PORTS_HELD; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done

sandbox; gcs_ready; answer y n; run SETUP_INTERACTIVE=1; STDIN=
check "no --yes, a terminal: asks before installing Postgres" said "Install PostgreSQL 16"
check "no --yes, declined: installs nothing for it"          not_logged 'postgresql-16|createcluster|^initdb|^pg_ctl'
check "no --yes, declined: says so, exits 1"                 sh -c "[ $CODE = 1 ] && grep -qF 'PostgreSQL 16' '$W/out'"
sandbox; gcs_ready; state docker down; present docker; run
check "no --yes, no terminal: installs nothing for Postgres" not_logged 'postgresql-16|createcluster|^initdb|^pg_ctl'
check "no --yes, no terminal: says to rerun with --yes"      said "rerun with --yes"
check "no --yes, no terminal: exits 1"                       code_is 1
check "Docker down: offered the fallback, with the Docker hint" said "If Docker should run here: start the Docker daemon"
sandbox; gcs_ready; run -- --yes --no-docker
check "--no-docker: no fallback step"                        not_logged 'postgresql|createcluster|fake-gcs-server|^initdb|^pg_ctl|^psql'
check "--no-docker: exits 0"                                 code_is 0

sandbox; gcs_ready; state pg_version "16.4 (Debian 16.4-1.pgdg120+2)"; run -- --yes; eventually logged '^fake-gcs-server '
check "a server other than 16.15 prints the rls-pins warning" sh -c "grep -qF 'rls-pins' '$W/out' && grep -qF '16.4' '$W/out'"
check "a server other than 16.15 still exits 0"              code_is 0

PGDG_FPR="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"
pgdg_world() { # sourced install_pg on a distro without postgresql-16 (apt's files under $W/aptroot)
  sandbox; rm -f "$W/state/pg_in_distro"; printf 'NAME="Ubuntu"\nVERSION_CODENAME=jammy\n' > "$W/os-release"
  printf 'pub:-:4096:1:7FCC7D46ACCC4CF8:1318537154:::-:::scSC::::::23::0:\nfpr:::::::::%s:\n' "${1:-$PGDG_FPR}" > "$W/state/gpg_keys"
  stub gpg 'case "$*" in *--show-keys*) cat "$STUB_STATE/gpg_keys";; *) cat;; esac'; present gpg
  call SETUP_APT_ROOT="$W/aptroot" SETUP_OS_RELEASE="$W/os-release" -- 'install_pg && echo installed'
}
PGDG_LIST="$W/aptroot/etc/apt/sources.list.d/postgresql-pgdg.list"
pgdg_world; PGDG_LIST="$W/aptroot/etc/apt/sources.list.d/postgresql-pgdg.list"
check "no postgresql-16 in the distro: fetches the PostgreSQL key" logged '^curl .*https://www\.postgresql\.org/media/keys/ACCC4CF8\.asc$'
check "no postgresql-16 in the distro: adds apt.postgresql.org, signed by its key" \
  test "$(cat "$PGDG_LIST" 2>/dev/null)" = "deb [signed-by=/usr/share/keyrings/postgresql-pgdg.gpg] https://apt.postgresql.org/pub/repos/apt jammy-pgdg main"
check "no postgresql-16 in the distro: the repository first, then postgresql-16" in_order '^gpg .*--dearmor' '^sudo apt-get install -y postgresql-16$'
check "no postgresql-16 in the distro: installed"            sh -c "grep -qx installed '$W/out'"
pgdg_world 0123456789ABCDEF0123456789ABCDEF01234567
check "a PostgreSQL key with another fingerprint: installs nothing" sh -c "! grep -qx installed '$W/out' && ! grep -q 'install -y postgresql-16' '$W/log'"
sandbox; printf 'VERSION_CODENAME="jammy main\nevil"\n' > "$W/os-release"; rm -f "$W/state/pg_in_distro"
call SETUP_APT_ROOT="$W/aptroot" SETUP_OS_RELEASE="$W/os-release" -- 'install_pg && echo installed'
check "an odd distribution codename: adds no repository"     sh -c "! grep -qx installed '$W/out' && [ ! -e '$W/aptroot/etc/apt/sources.list.d' ] && ! grep -q '^curl' '$W/log'"

sandbox; run -- --yes
check "storage, wrong sha256: fails naming it"               sh -c "[ $CODE != 0 ] && grep -q 'sha256' '$W/out'"
check "storage, wrong sha256: never runs it"                 not_logged '^fake-gcs-server'
check "storage, wrong sha256: leaves no binary"              test -z "$(find "$W/$DATA" -name fake-gcs-server -type f 2>/dev/null)"
check "storage, wrong sha256: Postgres still set up"         logged '^pnpm db:migrate$'
sandbox; state arch x86_64; gcs_ready; run -- --yes
check "storage on amd64: the amd64 release"                  logged '^curl .*fake-gcs-server_1\.52\.2_Linux_amd64\.tar\.gz$'
check "storage on amd64: runs"                               sh -c "[ $CODE = 0 ] && kill -0 \"\$(cat '$W/$DATA/fake-gcs-server.pid')\""

sandbox; state uid 0; gcs_ready; run -- --yes; eventually logged '^fake-gcs-server '
check "as root: no sudo"                                     not_logged '^sudo'
check "as root: initdb as user postgres (initdb refuses root)" logged '^runuser -u postgres -- .*/initdb '
check "as root: the database in the postgres user's home"    logged_f "initdb -D $W/pghome/mng-projects/postgres "
check "as root: that directory is created by the postgres user" logged_f "runuser -u postgres -- mkdir -p -m 700 $W/pghome/mng-projects"
check "as root: postgresql.conf is written by the postgres user" logged_f "runuser -u postgres -- tee -a $W/pghome/mng-projects/postgres/postgresql.conf"
check "as root: the summary shows the data in postgres's home" said "data in $W/pghome/mng-projects/postgres"
check "as root: pg_ctl as user postgres"                     logged '^runuser -u postgres -- .*/pg_ctl .* start$'
check "as root: exits 0"                                     code_is 0
sandbox; state uid 0; gcs_ready; mkdir -p "$W/elsewhere"; ln -s "$W/elsewhere" "$W/pghome/mng-projects"; run -- --yes
check "as root, the data directory a symlink: refused"       sh -c "[ $CODE = 1 ] && grep -q 'symlink' '$W/out'"
check "as root, the data directory a symlink: no initdb, nothing written there" \
  sh -c "! grep -q 'initdb' '$W/log' && [ -z \"\$(ls -A '$W/elsewhere')\" ]"

sandbox; absent sudo; gcs_ready; run -- --yes
check "without root or sudo: says Postgres can't be installed" said "PostgreSQL 16 can't be installed"
check "without root or sudo: installs nothing for Postgres"  not_logged 'postgresql-16|createcluster|^initdb|^pg_ctl'
check "without root or sudo: still starts the storage emulator" eventually logged '^fake-gcs-server '
check "without root or sudo: still finishes pnpm install"    logged '^pnpm install --frozen-lockfile$'
check "without root or sudo: names only Postgres"            sh -c "grep -qF 'database: PostgreSQL 16' '$W/out' && ! grep -q 'file storage:' '$W/out'"
check "without root or sudo: exits 1"                        code_is 1

sandbox; state pg_in_distro yes; touch "$W/state/pg_apt_fails"; gcs_ready; run -- --yes
check "apt-get install postgresql-16 fails: no initdb, exits 1" sh -c "[ $CODE = 1 ] && ! grep -q '^initdb' '$W/log' && grep -qF 'PostgreSQL 16' '$W/out'"

sandbox; gcs_ready; touch "$W/state/gcs_exits"; run SETUP_GCS_WAIT=2 -- --yes
check "an emulator that exits at once: didn't start"         said "fake-gcs-server didn't start"
check "an emulator that exits at once: no pid file left"     test ! -e "$W/$DATA/fake-gcs-server.pid"
check "an emulator that exits at once: exits 1"              code_is 1
sandbox; gcs_ready; touch "$W/state/pg_start_fails"; run -- --yes
check "Postgres that doesn't start: says so"                 said "Postgres didn't start"
check "Postgres that doesn't start: no migration"            not_logged '^pnpm db:migrate'
check "Postgres that doesn't start: exits 1"                 code_is 1

# setup.sh services: after a restart, both again; idempotent; --stop stops both.
pg_pid() { head -1 "$W/$DATA/postgres/postmaster.pid" 2>/dev/null; }
gcs_pid() { cat "$W/$DATA/fake-gcs-server.pid" 2>/dev/null; }
alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }
sandbox; run -- services
check "services before setup: says to run setup.sh first"    sh -c "[ $CODE = 1 ] && grep -qF 'bash scripts/setup.sh' '$W/out' && ! grep -q '^initdb' '$W/log'"
sandbox; gcs_ready; run -- --yes; eventually logged '^fake-gcs-server '; run -- services --stop
check "services --stop: stops the database"                  sh -c "grep -q '^pg_ctl .* stop$' '$W/log' && [ ! -e '$W/$DATA/postgres/postmaster.pid' ]"
check "services --stop: stops the storage emulator"          sh -c "[ ! -e '$W/$DATA/fake-gcs-server.pid' ]"
check "services --stop: exits 0"                             code_is 0
run -- services
P1="$(pg_pid)"; G1="$(gcs_pid)"
check "services: starts the database again"                  sh -c "grep -q '^pg_ctl .* start$' '$W/log' && kill -0 '$P1'"
check "services: starts the storage emulator again"          sh -c "kill -0 '$G1'"
check "services: with the same arguments"                    eventually logged_f "fake-gcs-server $GCS_ARGS -backend memory -data "
check "services: runs no initdb, install or migration"       not_logged '^initdb|apt-get|^curl|^pnpm'
check "services: exits 0"                                    code_is 0
run -- services
check "services twice: starts nothing the second time"       sh -c "! grep -q '^pg_ctl .* start$' '$W/log' && ! grep -q '^fake-gcs-server' '$W/log'"
check "services twice: one of each running"                  sh -c "[ '$(pg_pid)' = '$P1' ] && [ '$(gcs_pid)' = '$G1' ] && kill -0 '$P1' && kill -0 '$G1'"
check "services twice: exits 0"                              code_is 0
run -- services --stop
check "services --stop: both stopped"                        sh -c "! kill -0 '$P1' 2>/dev/null && ! kill -0 '$G1' 2>/dev/null"
run -- services --stop
check "services --stop when stopped: exits 0"                code_is 0
sleep 60 & UNRELATED=$!
printf '%s\n' "$UNRELATED" > "$W/$DATA/fake-gcs-server.pid"; printf '%s\n' "$UNRELATED" > "$W/$DATA/postgres/postmaster.pid"
run -- services; eventually logged '^fake-gcs-server '
check "services, pid files naming another process: starts the emulator" sh -c "[ '$(gcs_pid)' != '$UNRELATED' ] && kill -0 \"\$(cat '$W/$DATA/fake-gcs-server.pid')\""
check "services, pid files naming another process: starts Postgres" sh -c "grep -q '^pg_ctl .* start$' '$W/log' && [ \"\$(head -1 '$W/$DATA/postgres/postmaster.pid')\" != '$UNRELATED' ]"
printf '%s\n' "$UNRELATED" > "$W/$DATA/fake-gcs-server.pid"; run -- services --stop
check "services --stop: leaves another process in a pid file running" kill -0 "$UNRELATED"
check "services --stop: drops that stale pid file"           test ! -e "$W/$DATA/fake-gcs-server.pid"
kill "$UNRELATED" 2>/dev/null; wait "$UNRELATED" 2>/dev/null
rm -f "$W"/pgbin/*; run -- services
check "services, Postgres uninstalled (data kept): says to rerun setup.sh" sh -c "[ $CODE = 1 ] && grep -qF 'rerun bash scripts/setup.sh' '$W/out' && grep -qF 'kept' '$W/out'"
world; state uname Linux; run -- services
check "services where Docker runs: says pnpm db:up"          sh -c "[ $CODE = 1 ] && grep -qF 'Uses Docker here: pnpm db:up' '$W/out'"
world; state uname Linux; run -- services --yes
check "services takes only --stop"                           sh -c "[ $CODE = 1 ] && grep -qF \"unknown option '--yes'\" '$W/out'"

for f in "$TMP"/w.*/state/pids "$TMP"/w.*/home/.local/share/mng-projects/fake-gcs-server.pid; do
  [ -f "$f" ] && while read -r p; do kill "$p" 2>/dev/null; done < "$f"
done

echo; echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
