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
# Task 112's fixture values: none may ever show in setup.sh's output. The tfvars, backend and secret fixtures are
# generated here (the guard refuses writing *.tfvars and backend.hcl).
TFV_MARK="alert-owner-7f3a@example.test"; BILL_MARK="0A1B2C-3D4E5F-6A7B8C"; BACK_MARK="state-prefix-9c1d"
SECRET_MARK="ws-secret-value-5e8b"; LOCAL_MARK="local-edit-4d2f"; PROJ="p-owner-123"
stub_stdin() { stub "$1" "$(cat)"; } # name: a stub whose body comes on stdin
infra_world() { # task 112: terraform, gcloud and gh for setup.sh infra / infra-push
  local s="$W/state"
  mkdir -p "$s/bucket" "$s/secrets"
  state gcloud_account owner@example.test; state gcloud_project "$PROJ"; state bucket_project "$PROJ"
  state terraform 1.13.4; touch "$s/adc" "$s/gh_login"
  state project_number 123456789012; state bucket_project_number 123456789012
  printf 'project = "%s"\nalert_email = "%s"\nbilling_account = "%s"\n' "$PROJ" "$TFV_MARK" "$BILL_MARK" > "$s/bucket/terraform.tfvars"
  printf 'bucket = "%s-tfstate"\nprefix = "%s"\n' "$PROJ" "$BACK_MARK" > "$s/bucket/backend.hcl"
  echo 1700000000000001 > "$s/bucket/terraform.tfvars.gen"; echo 1700000000000002 > "$s/bucket/backend.hcl.gen"
  # gcloud: accounts, ADC, the configured project, the state bucket's config/ objects (with generations and
  # --if-generation-match) and Secret Manager values, all from state/.
  stub_stdin gcloud <<'EOF'
S="$STUB_STATE"; B="$S/bucket"
obj() { # gs://<project>-tfstate/config/<name>[#generation]: the name when that object exists
  local u="${1%%#*}" b="${1#gs://}"; b="${b%%/*}"
  [ "$b" = "$(cat "$S/bucket_project")-tfstate" ] || return 1
  u="${u#gs://*/config/}"; [ -f "$B/$u" ] || return 1; echo "$u"; }
case "$1 $2" in
  "auth list") [ -f "$S/gcloud_account" ] && cat "$S/gcloud_account"; exit 0 ;;
  "auth application-default") [ "$3" = print-access-token ] || exit 0
    [ -f "$S/adc" ] && { echo ya29.stub-token; exit 0; }; echo "no application default credentials" >&2; exit 1 ;;
  "config get") [ -f "$S/gcloud_project" ] && cat "$S/gcloud_project"; exit 0 ;;
  "projects describe") cat "$S/project_number"; exit 0 ;;
  "storage buckets") [ "$4" = "gs://$(cat "$S/bucket_project")-tfstate" ] || { echo "ERROR: $4 not found: 404" >&2; exit 1; }
    cat "$S/bucket_project_number"; exit 0 ;;
  "storage objects") n="$(obj "$4")" || { echo "ERROR: $4 not found: 404" >&2; exit 1; }; cat "$B/$n.gen"; exit 0 ;;
  "storage cp") shift 2; src=""; dst=""; match=""; created=""
    for a in "$@"; do case "$a" in --if-generation-match=*) match="${a#*=}" ;; --print-created-message) created=1 ;; -*) ;; *) if [ -z "$src" ]; then src="$a"; else dst="$a"; fi ;; esac; done
    case "$src" in
      gs://*) n="$(obj "$src")" || { echo "ERROR: $src not found: 404" >&2; exit 1; }; cp "$B/$n" "$dst" ;;
      *) n="${dst#gs://*/config/}"
         if [ -n "$match" ] && [ "$match" != "$(cat "$B/$n.gen" 2>/dev/null)" ]; then echo "ERROR: 412 Precondition Failed" >&2; exit 1; fi
         cp "$src" "$B/$n"; echo $(( $(cat "$B/$n.gen") + 1 )) > "$B/$n.gen.new"; mv "$B/$n.gen.new" "$B/$n.gen"
         [ -n "$created" ] && echo "Created: ${dst}#$(cat "$B/$n.gen")" >&2 ;;
    esac; exit 0 ;;
  "secrets versions") n=""; for a in "$@"; do case "$a" in --secret=*) n="${a#*=}" ;; esac; done
    [ -f "$S/secrets/$n" ] || { echo "ERROR: NOT_FOUND" >&2; exit 1; }; cat "$S/secrets/$n"; exit 0 ;;
esac
exit 0
EOF
  stub gh '[ "$1 $2" = "auth status" ] && { [ -f "$STUB_STATE/gh_login" ] || { echo "You are not logged into any GitHub hosts" >&2; exit 1; }; }; exit 0'
  stub terraform 'case "$1" in version|-version|--version) echo "Terraform v$(cat "$STUB_STATE/terraform")" ;; esac; exit 0'
  present gcloud gh terraform
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

# --- Task 112: setup.sh infra and infra-push ------------------------------------------------------------------------
# The world's repo is a real git repo with the repo's .gitignore and workstation-secrets.list, so `git check-ignore`
# decides as it would in a clone (task 111's world stubs git to always succeed).
REAL_GIT="$(command -v git)"
iworld() { # world [setup.sh flags...]: a world for setup.sh infra, everything set up and logged in
  world; rm -f "$W/bin/git"; ln -s "$REAL_GIT" "$W/bin/git"
  mkdir -p "$W/repo/infra"; cp "$ROOT/.gitignore" "$W/repo/"
  [ -f "$ROOT/infra/workstation-secrets.list" ] && cp "$ROOT/infra/workstation-secrets.list" "$W/repo/infra/"
  (cd "$W/repo" && HOME="$W/home" git init -q)
}
ws_list() { # lines: the manifest after its committed header
  { grep '^#' "$ROOT/infra/workstation-secrets.list" 2>/dev/null; printf '%s\n' "$@"; } > "$W/repo/infra/workstation-secrets.list"; }
infra_brew() { # brew that installs a tap formula or the gcloud cask under the command's name
  stub_stdin brew <<'EOF'
[ "$1" = install ] || exit 0; shift
for p in "$@"; do case "$p" in
  --cask) ;; gcloud-cli) cp -P "$STUB_AVAIL/gcloud" "$STUB_BIN/gcloud" ;;
  *) n="${p##*/}"; rm -f "$STUB_BIN/$n"; cp -P "$STUB_AVAIL/$n" "$STUB_BIN/$n" ;; esac; done
EOF
present brew; }
sum_of()    { (sha256sum "$1" 2>/dev/null || shasum -a 256 "$1") | cut -d' ' -f1; }
stored_edit() { # file: another machine stored a new copy of it
  printf 'other = "machine"\n' >> "$W/state/bucket/$1"; echo $(( $(cat "$W/state/bucket/$1.gen") + 7 )) > "$W/state/bucket/$1.gen.n"
  mv "$W/state/bucket/$1.gen.n" "$W/state/bucket/$1.gen"; }
mode600()   { ls -l "$1" 2>/dev/null | grep -q '^-rw-------'; }
no_marks()  { ! grep -qE "$TFV_MARK|$BILL_MARK|$BACK_MARK|$SECRET_MARK|$LOCAL_MARK|$PROJ-tfstate\"|ya29" "$W/out"; }
last_line() { [ "$(grep -v '^$' "$W/out" | tail -1)" = "$1" ]; }
READY='Ready: `cd infra && terraform plan`'
UPLOAD_LINE="gcloud storage cp infra/terraform.tfvars infra/backend.hcl gs://$PROJ-tfstate/config/"

iworld; run -- infra --yes; TFV="$W/repo/infra/terraform.tfvars"
check "infra: exits 0"                                      code_is 0
check "infra: says the environment"                         said "Environment: macOS"
check "infra: writes terraform.tfvars from the stored copy" cmp -s "$W/state/bucket/terraform.tfvars" "$TFV"
check "infra: writes backend.hcl from the stored copy"      cmp -s "$W/state/bucket/backend.hcl" "$W/repo/infra/backend.hcl"
check "infra: terraform.tfvars is mode 600"                 mode600 "$TFV"
check "infra: backend.hcl is mode 600"                      mode600 "$W/repo/infra/backend.hcl"
check "infra: records both generations and sha256s" \
  sh -c "grep -qx 'terraform.tfvars 1700000000000001 $(sum_of "$W/state/bucket/terraform.tfvars")' '$W/repo/infra/.config-generation' && grep -qx 'backend.hcl 1700000000000002 $(sum_of "$W/state/bucket/backend.hcl")' '$W/repo/infra/.config-generation'"
check "infra: reads the state bucket's config/"             logged "^gcloud storage cp gs://$PROJ-tfstate/config/terraform\\.tfvars"
check "infra: runs terraform init with backend.hcl"         logged '^terraform -chdir=infra init -backend-config=backend\.hcl$'
check "infra: init after both files are written"            in_order "^gcloud storage cp gs://.*/backend\\.hcl" '^terraform -chdir=infra init'
check "infra: never terraform plan or apply"                not_logged '^terraform .*(plan|apply)'
check "infra: ends with the Ready line"                     last_line "$READY"
check "infra: an empty manifest makes no Secret Manager call" not_logged '^gcloud secrets'
check "infra: an empty manifest says so"                    said "No workstation secrets listed"
check "infra: everything there installs nothing"            not_logged '^(brew|apt-get|sudo|curl)'
check "infra: not the developer flow"                       sh -c "! grep -Eq '^(pnpm|docker|corepack|node|fnm|nvm)' '$W/log' && [ ! -e '$W/repo/.env' ]"
check "infra: prints no config value"                       no_marks
run -- infra --yes
check "infra rerun: the same stored copy exits 0"           code_is 0
check "infra rerun: keeps the files"                        cmp -s "$W/state/bucket/terraform.tfvars" "$TFV"

iworld; TFV="$W/repo/infra/terraform.tfvars"; printf 'alert_email = "%s"\n' "$LOCAL_MARK" > "$TFV"; cp "$TFV" "$W/tfv.before"
run -- infra --yes
check "infra, a differing local tfvars: exits 1"            code_is 1
check "infra, a differing local tfvars: says so"            said "infra/terraform.tfvars differs from the stored copy"
check "infra, a differing local tfvars: names infra-push and --force" sh -c "grep -q 'setup.sh infra-push' '$W/out' && grep -q -- '--force' '$W/out'"
check "infra, a differing local tfvars: keeps it"           cmp -s "$W/tfv.before" "$TFV"
check "infra, a differing local tfvars: writes nothing else" test ! -e "$W/repo/infra/backend.hcl"
check "infra, a differing local tfvars: no init"            not_logged '^terraform -chdir'
check "infra, a differing local tfvars: prints neither content" no_marks
run -- infra --yes --force
check "infra --force: replaces it with the stored copy"     sh -c "[ $CODE = 0 ] && cmp -s '$W/state/bucket/terraform.tfvars' '$TFV'"
check "infra --force: mode 600"                             mode600 "$TFV"
check "infra --force: prints neither content"               no_marks

# The pull/push loop: the recorded sha256 tells an untouched local file from a local edit
iworld; run -- infra --yes; TFV="$W/repo/infra/terraform.tfvars"; stored_edit terraform.tfvars; run -- infra --yes
check "infra, stored copy changed, local untouched: pulls, exits 0" sh -c "[ $CODE = 0 ] && cmp -s '$W/state/bucket/terraform.tfvars' '$TFV'"
check "infra, stored copy changed, local untouched: records the new generation" \
  grep -q "^terraform.tfvars 1700000000000008 " "$W/repo/infra/.config-generation"
check "infra, stored copy changed, local untouched: prints no content" no_marks
iworld; run -- infra --yes; TFV="$W/repo/infra/terraform.tfvars"; printf 'x = "%s"\n' "$LOCAL_MARK" >> "$TFV"; cp "$TFV" "$W/tfv.before"
run -- infra --yes
check "infra, an unpushed local edit: refused naming infra-push" \
  sh -c "[ $CODE = 1 ] && grep -q 'infra/terraform.tfvars differs from the stored copy' '$W/out' && grep -q 'setup.sh infra-push' '$W/out'"
check "infra, an unpushed local edit: kept"                 cmp -s "$W/tfv.before" "$TFV"
stored_edit terraform.tfvars; run -- infra --yes
check "infra, both changed: refused, says to keep a copy"   sh -c "[ $CODE = 1 ] && grep -q 'keep a copy' '$W/out' && grep -q -- '--force' '$W/out' && grep -q 'infra-push' '$W/out'"
check "infra, both changed: the local edit is kept"         cmp -s "$W/tfv.before" "$TFV"
check "infra, both changed: prints neither content"         no_marks

# The bucket belongs to the project, and backend.hcl names that bucket
iworld; state bucket_project_number 999999999999; run -- infra --yes
check "infra, a bucket of another project: refused"         sh -c "[ $CODE = 1 ] && grep -q 'project' '$W/out'"
check "infra, a bucket of another project: reads no config" sh -c "! grep -q '^gcloud storage cp' '$W/log' && [ ! -e '$W/repo/infra/terraform.tfvars' ]"
iworld; printf 'bucket = "someone-else-tfstate"\nprefix = "%s"\n' "$BACK_MARK" > "$W/state/bucket/backend.hcl"; run -- infra --yes
check "infra, backend.hcl names another bucket: refused"    sh -c "[ $CODE = 1 ] && grep -q 'backend.hcl' '$W/out'"
check "infra, backend.hcl names another bucket: writes nothing" \
  sh -c "[ ! -e '$W/repo/infra/terraform.tfvars' ] && [ ! -e '$W/repo/infra/backend.hcl' ] && ! grep -q '^terraform -chdir' '$W/log'"
check "infra, backend.hcl names another bucket: prints no content" no_marks

for obj in terraform.tfvars backend.hcl; do
  iworld; rm -f "$W/state/bucket/$obj"; run -- infra --yes
  check "infra, no stored $obj: exits 1"                    code_is 1
  check "infra, no stored $obj: prints the first upload"    said "$UPLOAD_LINE"
  check "infra, no stored $obj: writes nothing"             sh -c "[ ! -e '$W/repo/infra/terraform.tfvars' ] && [ ! -e '$W/repo/infra/backend.hcl' ] && [ ! -e '$W/repo/infra/.config-generation' ]"
done

iworld; state gcloud_project other-project-1; run -- infra --yes --project "$PROJ"
check "infra --project: wins over gcloud's project"         sh -c "[ $CODE = 0 ] && grep -q 'gs://$PROJ-tfstate/config/' '$W/log' && ! grep -q 'other-project-1' '$W/log'"
iworld; run -- infra --yes
check "infra: the project comes from gcloud config"         logged '^gcloud config get project'
iworld; rm "$W/state/gcloud_project"; run -- infra --yes
check "infra, no project: exits 1 asking for --project"     sh -c "[ $CODE = 1 ] && grep -q -- '--project' '$W/out'"
check "infra, no project: reads nothing"                    not_logged '^gcloud (storage|secrets)'
iworld; rm "$W/state/gcloud_project" "$W/state/gcloud_account"; run -- infra --yes
check "infra, logged out and no project: the logins come first" \
  sh -c "[ $CODE = 1 ] && grep -qF 'gcloud auth login' '$W/out' && grep -qF 'set-quota-project <project-id>' '$W/out' && ! grep -qF 'rerun with --project' '$W/out'"
iworld; run -- infra --project
check "infra --project without a value: refused"            sh -c "[ $CODE = 1 ] && grep -qF -- '--project needs a value' '$W/out'"
iworld; run -- infra --yes --project 'Bad_Project;x'
check "infra --project, not a project id: refused"          sh -c "[ $CODE = 1 ] && ! grep -q '^gcloud storage' '$W/log'"

for gone in gcloud_account adc; do
  iworld; rm "$W/state/$gone"; run -- infra --yes
  check "infra, no $gone: exits 1"                          code_is 1
  check "infra, no $gone: prints the three login commands" \
    sh -c "grep -qF 'gcloud auth login' '$W/out' && grep -qF 'gcloud auth application-default login' '$W/out' && grep -qF 'gcloud auth application-default set-quota-project $PROJ' '$W/out'"
  check "infra, no $gone: reads nothing"                    not_logged '^gcloud (storage|secrets)|^terraform -chdir'
done
iworld; rm "$W/state/gh_login"; run -- infra --yes
check "infra, gh logged out: prints gh auth login"          said "gh auth login"
check "infra, gh logged out: continues"                     sh -c "[ $CODE = 0 ] && grep -q '^terraform -chdir=infra init' '$W/log'"

# Tools
iworld; absent terraform; infra_brew; run -- infra --yes
check "infra, macOS without terraform: the HashiCorp tap"   logged '^brew install hashicorp/tap/terraform$'
check "infra, macOS without terraform: then runs init"      sh -c "[ $CODE = 0 ] && grep -q '^terraform -chdir=infra init' '$W/log'"
iworld; absent gcloud gh; infra_brew; run -- infra --yes
check "infra, macOS without gcloud: the gcloud-cli cask"    logged '^brew install --cask gcloud-cli$'
check "infra, macOS without gh: brew install gh"            logged '^brew install gh$'
check "infra, macOS: never apt-get"                         not_logged '^(sudo )?apt-get'
iworld; absent terraform; run -- infra
check "infra, no terminal, no --yes: installs nothing"      not_logged '^(brew|apt-get|sudo|curl)'
check "infra, no terminal, no --yes: prints the command"    sh -c "[ $CODE = 1 ] && grep -q 'brew install hashicorp/tap/terraform' '$W/out'"
iworld; absent terraform; answer n; run SETUP_INTERACTIVE=1 -- infra; STDIN=
check "infra, declined: asks, installs nothing, exits 1"    sh -c "[ $CODE = 1 ] && grep -q 'Install these?' '$W/out' && ! grep -q '^brew install' '$W/log'"
iworld; absent terraform; run -- infra --no-install
check "infra --no-install: prints the command, exits 1"     sh -c "[ $CODE = 1 ] && grep -q 'brew install hashicorp/tap/terraform' '$W/out'"
check "infra --no-install: installs and reads nothing"      not_logged '^(brew|apt-get|sudo|curl)|^gcloud (storage|secrets)'
iworld; BEFORE="$(snapshot)"; run -- infra --no-install
check "infra --no-install, all present: exits 0"            code_is 0
check "infra --no-install, all present: runs and reads nothing" not_logged '^(gcloud|gh|terraform -chdir|brew|apt-get|sudo|curl)'
check "infra --no-install, all present: changes no file"    test "$BEFORE" = "$(snapshot)"
iworld; state terraform 1.5.7; run -- infra --no-install
check "infra: Terraform older than 1.9 counts as missing"   sh -c "[ $CODE = 1 ] && grep -q '1.9' '$W/out'"
iworld; state uname Linux; absent brew gcloud gh; run -- infra --no-install
check "infra --no-install, Linux: gcloud from Google's apt repository" said "apt-get install -y google-cloud-cli"
check "infra --no-install, Linux: gh from GitHub's apt repository" said "apt-get install -y gh"
check "infra --no-install, Linux: no brew"                  not_said "brew install"
iworld; state uname Linux; state arch x86_64; absent brew terraform unzip; run -- infra --yes
check "infra, Linux: fetches the pinned Terraform zip" \
  logged '^curl .*https://releases\.hashicorp\.com/terraform/[0-9.]+/terraform_[0-9.]+_linux_amd64\.zip$'
check "infra, Linux: a wrong zip sha256 fails naming it"    sh -c "[ $CODE != 0 ] && grep -q 'sha256' '$W/out'"
check "infra, Linux: a wrong zip sha256 installs nothing"   not_logged '^(sudo |)apt-get|^unzip|^terraform -chdir'
check "infra, Linux: a wrong zip sha256 leaves no terraform" test ! -e "$W/home/.local/bin/terraform"
if command -v python3 >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
  iworld; state uname Linux; state arch aarch64; absent brew terraform unzip; ln -s "$(command -v unzip)" "$W/bin/unzip"
  python3 -I - "$W/avail/terraform" "$W/state/download" <<'EOF'
import sys, zipfile
info = zipfile.ZipInfo("terraform"); info.external_attr = 0o755 << 16
with zipfile.ZipFile(sys.argv[2], "w") as z: z.writestr(info, open(sys.argv[1]).read())
EOF
  SUM="$( (sha256sum "$W/state/download" 2>/dev/null || shasum -a 256 "$W/state/download") | cut -d' ' -f1)"
  sed "s/^TERRAFORM_SHA256_LINUX_ARM64=.*/TERRAFORM_SHA256_LINUX_ARM64=\"$SUM\"/" "$SETUP" > "$W/repo/scripts/setup.sh"
  run -- infra --yes
  check "infra, Linux arm64: fetches the arm64 zip"         logged '^curl .*/terraform_[0-9.]+_linux_arm64\.zip$'
  check "infra, Linux: a matching sha256 installs terraform into ~/.local/bin" test -x "$W/home/.local/bin/terraform"
  check "infra, Linux: then runs init with it"              sh -c "[ $CODE = 0 ] && grep -q '^terraform -chdir=infra init' '$W/log'"
  iworld; state uname Linux; state arch aarch64; state terraform 1.5.7; absent brew unzip; ln -s "$(command -v unzip)" "$W/bin/unzip"
  printf '#!/bin/bash\necho "tfnew $*" >> "$STUB_LOG"\n[ "$1" = version ] && echo "Terraform v1.17.2"\nexit 0\n' > "$W/tfnew"
  python3 -I - "$W/tfnew" "$W/state/download" <<'EOF'
import sys, zipfile
info = zipfile.ZipInfo("terraform"); info.external_attr = 0o755 << 16
with zipfile.ZipFile(sys.argv[2], "w") as z: z.writestr(info, open(sys.argv[1]).read())
EOF
  SUM="$(sum_of "$W/state/download")"
  sed "s/^TERRAFORM_SHA256_LINUX_ARM64=.*/TERRAFORM_SHA256_LINUX_ARM64=\"$SUM\"/" "$SETUP" > "$W/repo/scripts/setup.sh"
  run PATH="$W/bin:$W/home/.local/bin" -- infra --yes
  check "infra, Linux: the installed terraform wins over an old one on PATH" sh -c "[ $CODE = 0 ] && grep -q '^tfnew -chdir=infra init' '$W/log'"
fi

# Pinned keys: each repository's line, keyring and fingerprints pass add_apt_repo with the vendor's key
GOOGLE_KEY='pub:-:2048:1:C0BA5CE6DC6315A3:1620162483:::-:::scSC::::::23::0:
fpr:::::::::35BAA0B33E9EB396F59CA838C0BA5CE6DC6315A3:'
GH_KEYS='pub:e:4096:1:23F3D4EA75716059:1662463626:1788612228::-:::sc::::::23::0:
fpr:::::::::2C6106201985B60E6C7AC87323F3D4EA75716059:
sub:e:4096:1:E5FAF19590714157:1662463626:1788612228:::::e::::::23:
fpr:::::::::5700BAB26C8DE75F3EE323FEE5FAF19590714157:
pub:-:4096:1:5612B36462313325:1775559160:::-:::scESC::::::23::0:
fpr:::::::::7F38BBB59D064DBCB3D84D725612B36462313325:'
pinned_repo() { # vendor key listing, prefix (GCLOUD or GH)
  apt_repo_world; printf '%s\n' "$1" > "$W/state/gpg_keys"
  call SETUP_APT_ROOT="$APT" -- "add_apt_repo \"\$${2}_APT_KEY_URL\" \"\$${2}_KEYRING\" \"\$${2}_APT_LINE\" \"\$${2}_APT_KEY_FPR\" && echo added && echo \"\$${2}_APT_LINE\""; }
pinned_repo "$GOOGLE_KEY" GCLOUD
check "pins: Google Cloud's key passes its pinned fingerprint" sh -c "grep -qx added '$W/out' && grep -q '^curl .*https://packages\.cloud\.google\.com/apt/doc/apt-key\.gpg$' '$W/log'"
check "pins: Google Cloud's repository line"                 said "https://packages.cloud.google.com/apt cloud-sdk main"
pinned_repo "$GH_KEYS" GH
check "pins: GitHub CLI's two keys pass their pinned fingerprints" sh -c "grep -qx added '$W/out' && grep -q '^curl .*https://cli\.github\.com/packages/githubcli-archive-keyring\.asc$' '$W/log'"
check "pins: GitHub CLI's repository line"                   said "https://cli.github.com/packages stable main"
pinned_repo "$GOOGLE_KEY" GH
check "pins: another vendor's key fails GitHub CLI's pins"   sh -c "! grep -qx added '$W/out' && [ ! -e '$APT' ]"

# add_apt_repo with several pinned fingerprints (GitHub CLI's keyring holds two keys): the key file must hold
# exactly the pinned set.
FPR2="FEDCBA9876543210FEDCBA9876543210FEDCBA98"
two_keys() { printf 'pub:-:4096:1:89ABCDEF01234567:1600000000:::-:::scESC::::::23::0:\nfpr:::::::::%s:\npub:-:4096:1:FEDCBA9876543210:1600000000:::-:::scESC::::::23::0:\nfpr:::::::::%s:\n' "$FPR" "$FPR2" > "$W/state/gpg_keys"; }
apt_repo_world; two_keys; add_repo "$LINE" "$KR" "$FPR,$FPR2"
check "add_apt_repo: several pins, exactly those keys: added" sh -c "grep -qx added '$W/out'"
apt_repo_world; two_keys; add_repo "$LINE" "$KR" "$FPR2, $(printf '%s' "$FPR" | tr 'A-F' 'a-f')"
check "add_apt_repo: several pins in any order and case"    sh -c "grep -qx added '$W/out'"
apt_repo_world; two_keys; add_repo "$LINE" "$KR" "$FPR"
check "add_apt_repo: an unpinned second key is refused"     sh -c "grep -q 'more than one key' '$W/out'"
check "add_apt_repo: an unpinned second key adds nothing"   added_nothing
apt_repo_world; add_repo "$LINE" "$KR" "$FPR,$FPR2"
check "add_apt_repo: a pinned key missing from the file is refused" sh -c "grep -q 'fingerprint' '$W/out'"
check "add_apt_repo: a missing pinned key adds nothing"     added_nothing
apt_repo_world; two_keys; add_repo "$LINE" "$KR" "$FPR,0123"
check "add_apt_repo: one bad pin in the list refuses before fetching" sh -c "grep -q 'fingerprint' '$W/out' && [ ! -s '$W/log' ] && [ ! -e '$APT' ]"
apt_repo_world; two_keys; add_repo "$LINE" "$KR" "$FPR,"
check "add_apt_repo: an empty pin in the list is refused"   sh -c "grep -q 'fingerprint' '$W/out' && [ ! -s '$W/log' ]"

# Workstation secrets (class 3)
check "manifest: committed, no entries"                     sh -c "[ -f '$ROOT/infra/workstation-secrets.list' ] && ! grep -Ev '^[[:space:]]*(#|$)' '$ROOT/infra/workstation-secrets.list'"
iworld; ws_list "" "  # an indented comment" "tool-token .env.workstation"; printf '%s' "$SECRET_MARK" > "$W/state/secrets/tool-token"
run -- infra --yes
check "secrets: fetches the listed secret from the project" logged "^gcloud secrets versions access latest --secret=tool-token --project $PROJ\$"
check "secrets: comments and blank lines are skipped"       test "$(grep -c '^gcloud secrets' "$W/log")" = 1
check "secrets: writes the value to its git-ignored path"   test "$(cat "$W/repo/.env.workstation" 2>/dev/null)" = "$SECRET_MARK"
check "secrets: mode 600"                                   mode600 "$W/repo/.env.workstation"
check "secrets: never prints the value"                     no_marks
check "secrets: then init, exits 0"                         sh -c "[ $CODE = 0 ] && grep -q '^terraform -chdir=infra init' '$W/log'"
for p in infra/token.txt ../outside-token "infra/../.env.workstation" .. .env .env.example infra/terraform.tfvars \
  infra/backend.hcl infra/.config-generation .env.Tool .env.-x secrets/.env.tool; do
  iworld; ws_list "tool-token $p"; printf '%s' "$SECRET_MARK" > "$W/state/secrets/tool-token"; run -- infra --yes
  check "secrets: refuses the path '$p'"                    sh -c "[ $CODE = 1 ] && grep -qF -- '$p' '$W/out'"
  check "secrets: '$p' fetches nothing"                     sh -c "! grep -q '^gcloud secrets' '$W/log' && [ ! -e '$W/repo/infra/token.txt' ] && [ ! -e '$W/outside-token' ]"
done
iworld; ws_list "tool-token $W/repo/.env.workstation"; printf '%s' "$SECRET_MARK" > "$W/state/secrets/tool-token"; run -- infra --yes
check "secrets: refuses an absolute path, even a git-ignored one in the repo" \
  sh -c "[ $CODE = 1 ] && [ ! -e '$W/repo/.env.workstation' ] && ! grep -q '^gcloud secrets' '$W/log'"
iworld; ws_list "only-a-name"; run -- infra --yes
check "secrets: refuses a line without a path"              sh -c "[ $CODE = 1 ] && ! grep -q '^gcloud secrets' '$W/log'"
iworld; ws_list 'bad$name .env.workstation'; run -- infra --yes
check "secrets: refuses a name that isn't a secret id"      sh -c "[ $CODE = 1 ] && ! grep -q '^gcloud secrets' '$W/log'"

# infra-push
iworld; run -- infra --yes; TFV="$W/repo/infra/terraform.tfvars"; printf 'budget = "%s"\n' "$LOCAL_MARK" >> "$TFV"
ws_list "tool-token .env.workstation"; printf '%s' "$SECRET_MARK" > "$W/repo/.env.workstation"; cp "$W/repo/.env.workstation" "$W/state/secrets/tool-token"
run -- infra-push
check "infra-push: exits 0"                                 code_is 0
check "infra-push: uploads tfvars with the recorded generation" \
  logged "^gcloud storage cp infra/terraform\\.tfvars gs://$PROJ-tfstate/config/terraform\\.tfvars --if-generation-match=1700000000000001 --print-created-message\$"
check "infra-push: skips backend.hcl, unchanged since the pull" not_logged '^gcloud storage cp infra/backend\.hcl'
check "infra-push: the stored copy is the local edit"       cmp -s "$TFV" "$W/state/bucket/terraform.tfvars"
check "infra-push: uploads only the changed file"           sh -c "[ \"\$(grep -c '^gcloud storage cp' '$W/log')\" = 1 ] && ! grep -q 'workstation' '$W/log'"
check "infra-push: prints the new generation"               said "generation 1700000000000002"
check "infra-push: takes it from the upload's own result"   sh -c "grep -q -- '--print-created-message' '$W/log' && [ \"\$(grep -c '^gcloud storage objects describe' '$W/log')\" = 1 ]"
check "infra-push: records it with the new sha256" \
  grep -qx "terraform.tfvars 1700000000000002 $(sum_of "$TFV")" "$W/repo/infra/.config-generation"
check "infra-push: prints no content"                       no_marks
run -- infra --yes
check "infra after infra-push: in step, exits 0"            code_is 0
run -- infra-push
check "infra-push, nothing changed: uploads nothing, exits 0" sh -c "[ $CODE = 0 ] && ! grep -q '^gcloud storage cp' '$W/log' && grep -q 'Nothing to push' '$W/out'"
rm "$W/repo/infra/backend.hcl"; run -- infra-push
check "infra-push, a local file missing: exits 1, uploads nothing" sh -c "[ $CODE = 1 ] && ! grep -q '^gcloud storage cp' '$W/log'"
iworld; run -- infra --yes; state bucket_project_number 999999999999; printf 'x = 1\n' >> "$W/repo/infra/terraform.tfvars"; run -- infra-push
check "infra-push, a bucket of another project: uploads nothing" sh -c "[ $CODE = 1 ] && ! grep -q '^gcloud storage cp' '$W/log'"
iworld; run -- infra --yes; TFV="$W/repo/infra/terraform.tfvars"; printf 'budget = "%s"\n' "$LOCAL_MARK" >> "$TFV"
cp "$W/state/bucket/terraform.tfvars" "$W/stored.before"; echo 1700000000000009 > "$W/state/bucket/terraform.tfvars.gen"
run -- infra-push
check "infra-push, stored copy changed since the pull: refused" sh -c "[ $CODE = 1 ] && grep -qF 'pull first: \`setup.sh infra\`' '$W/out'"
check "infra-push, stale: the stored copy is kept"          cmp -s "$W/stored.before" "$W/state/bucket/terraform.tfvars"
check "infra-push, stale: uploads nothing"                  not_logged '^gcloud storage cp infra/'
check "infra-push, stale: prints no content"                no_marks
iworld; run -- infra-push
check "infra-push before any pull: pull first"              sh -c "[ $CODE = 1 ] && grep -qF 'pull first' '$W/out' && ! grep -q '^gcloud storage cp' '$W/log'"
iworld; run -- infra --yes; printf 'x = 1\n' >> "$W/repo/infra/terraform.tfvars"; rm "$W/state/gcloud_account"; run -- infra-push
check "infra-push, logged out: prints gcloud auth login, uploads nothing" \
  sh -c "[ $CODE = 1 ] && grep -qF 'gcloud auth login' '$W/out' && ! grep -q '^gcloud storage cp' '$W/log'"

# Agents, Windows, flags, summary
for sub in infra infra-push; do
  iworld; run CLAUDECODE=1 -- "$sub"
  check "$sub in an agent session: exits 1 running nothing" sh -c "[ $CODE = 1 ] && [ ! -s '$W/log' ] && grep -qi 'agent' '$W/out'"
  iworld; state uname MINGW64_NT-10.0-22631; run -- "$sub"
  check "$sub on Windows outside WSL: the WSL2 message"    sh -c "[ $CODE = 1 ] && grep -q 'wsl --install -d Ubuntu' '$W/out' && [ ! -s '$W/log' ]"
done
world; run -- infra --help
check "infra --help: its usage line"                        said "bash scripts/setup.sh infra [--project <id>] [--force] [--no-install] [--yes]"
check "infra --help: infra-push's usage line"               said "bash scripts/setup.sh infra-push"
world; run -- infra-push --force
check "infra-push takes no --force"                         sh -c "[ $CODE = 1 ] && grep -qF \"unknown option '--force'\" '$W/out'"
world; run -- --force
check "the developer setup takes no --force"                sh -c "[ $CODE = 1 ] && grep -qF \"unknown option '--force'\" '$W/out'"
world; run -- --project x
check "the developer setup takes no --project"              sh -c "[ $CODE = 1 ] && grep -qF \"unknown option '--project'\" '$W/out'"
world; run -- --yes
check "summary: GCP admins run setup.sh infra"              said "  GCP admins: bash scripts/setup.sh infra"
check "summary: no 'coming with task 112'"                  not_said "coming with task 112"
check ".gitignore: ignores infra/.config-generation"        git -C "$ROOT" check-ignore -q infra/.config-generation

echo; echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
