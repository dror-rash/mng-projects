#!/usr/bin/env bash
# PreToolUse guard for the agent team (task 067, ADR-0010).
# Exit 2 refuses the tool call; stderr goes back to the agent as the reason.
# Env: GUARD_BASE_REF (default origin/main): what counts as "applied" for migrations.
#      GUARD_SKIP_CHECKS=1 skips lint/typecheck on commit (tests only).
set -uo pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // ""' <<<"$input")"
cwd="$(jq -r '.cwd // empty' <<<"$input")"; cwd="${cwd:-$PWD}"

deny() { echo "Refused by .claude/hooks/guard.sh: $*" >&2; exit 2; }

base_ref() { # $1 = repo root
  local ref="${GUARD_BASE_REF:-origin/main}"
  git -C "$1" rev-parse -q --verify "$ref" >/dev/null 2>&1 && { echo "$ref"; return; }
  git -C "$1" rev-parse -q --verify main >/dev/null 2>&1 && echo main
}

is_applied_migration() { # $1 = repo root, $2 = path relative to root
  case "$2" in
    packages/db/migrations/meta/_journal.json) return 1 ;;
    packages/db/migrations/*) ;;
    *) return 1 ;;
  esac
  local ref; ref="$(base_ref "$1")"; [ -n "$ref" ] || return 1
  git -C "$1" cat-file -e "$ref:$2" 2>/dev/null
}

imports_drizzle() { grep -Eq "(from|require\(|import\()[[:space:]]*['\"]drizzle-orm" ; }

# ---------- file edits ----------
case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit)
    path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$input")"
    name="$(basename "$path")"
    case "$name" in
      .env.example) ;;
      .env|.env.*) deny "$name holds local secrets and is never edited by agents (CLAUDE.md rule 7). Change .env.example instead and tell the owner." ;;
    esac
    case "$path" in
      *.tfvars|*/backend.hcl|*.tfstate|*.tfstate.*)
        deny "$name is Terraform config/state the owner keeps out of the repo (CLAUDE.md rule 10). Change variables.tf or the .example files." ;;
    esac
    dir="$(dirname "$path")"; while [ ! -d "$dir" ]; do dir="$(dirname "$dir")"; done
    path="$(cd "$dir" && pwd -P)${path#"$dir"}" # resolve symlinks, as git does for the root
    root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)"
    if [ -n "$root" ] && is_applied_migration "$root" "${path#"$root"/}"; then
      deny "${path#"$root"/} is an applied migration (it is in $(base_ref "$root")). Never edit applied migrations (CLAUDE.md rule 12): change packages/db/src/schema.ts and run pnpm db:generate for a new one."
    fi
    case "$path" in
      */apps/*)
        if jq -r '[.tool_input.new_string, .tool_input.content, (.tool_input.edits // [] | .[].new_string)] | map(select(. != null)) | join("\n")' <<<"$input" | imports_drizzle; then
          deny "apps import query operators from @repo/db, not drizzle-orm (CLAUDE.md rule 12)."
        fi ;;
    esac
    exit 0 ;;
  Bash) ;;
  *) exit 0 ;;
esac

# ---------- shell commands ----------
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
continuation=$'\\\n'; cmd="${cmd//"$continuation"/ }" # join backslash-newline continuations (bash 3.2-safe)

# Pattern pieces. A word in a command: quoted, a $(…), or up to a space or a shell separator.
WORD="(\"[^\"]*\"|'[^']*'|\\$\\([^)]*\\)|[^[:space:];&|]+)"
# git <global options> <sub>: -C <dir>, -c <k=v>, --git-dir/--work-tree <path>, and flags (--no-pager, --git-dir=x).
GITOPT="(-[Cc][[:space:]]+$WORD|--(git-dir|work-tree|namespace|exec-path|config-env)[[:space:]]+$WORD|-[^[:space:];&|]+)"
git_sub() { echo "(^|[^[:alnum:]_-])git([[:space:]]+$GITOPT)*[[:space:]]+$1"; }
# The arguments of every `git … <sub>` in the command (or in $2), one line each.
git_args() { grep -Eo "$(git_sub "$1")([[:space:]][^;&|]*)?" <<<"${2-$cmd}" | sed -E "s#^$(git_sub "$1")##"; }
# gcloud [alpha|beta] [global flags, with or without a value] <group>
GCLOUD="(^|[^[:alnum:]_-])gcloud([[:space:]]+(alpha|beta|-[^[:space:];&|]+([[:space:]]+[^-[:space:];&|][^[:space:];&|]*)?))*[[:space:]]+"

grep -Eq '(^|[^[:alnum:]_-])terraform[[:space:]]+(.*[[:space:]])?(apply|destroy)([[:space:]]|$)' <<<"$cmd" \
  && deny "terraform apply/destroy runs only in CI or by the owner (CLAUDE.md rule 10). Run terraform plan and put its output in the PR."
grep -Eq "${GCLOUD}run[[:space:]]+(deploy|services[[:space:]]+(replace|update|update-traffic|delete))([[:space:]]|$)" <<<"$cmd" \
  && deny "Cloud Run changes go through .github/workflows/deploy.yml and infra/ Terraform, never by hand, on any release track (CLAUDE.md rule 10)."
grep -Eq "${GCLOUD}secrets[[:space:]]+versions[[:space:]]+access([[:space:]]|$)" <<<"$cmd" \
  && deny "Secret Manager values are never read by agents (CLAUDE.md rule 7). Ask the owner, or use the local .env."
# Git takes unambiguous prefixes of long options, so --for… (--force, --force-with-lease, --force-if-includes),
# --mi… (--mirror), --d… (--delete), --pru… (--prune) and --no-ve… (--no-verify) count as the full option.
# Force: -f alone or in combined short flags (-uf), --for…[=…], a +refspec.
push_args="$(git_args push)"
grep -Eq "(^|[[:space:]])(-[[:alnum:]]*f[[:alnum:]]*|--for[-a-z]*(=[^[:space:]]*)?|[\"']?\\+[^[:space:]]+)([[:space:]]|$)" <<<"$push_args" \
  && deny "No force pushes (--force, -f, --force-with-lease, --force-if-includes or a +refspec). Add a commit instead, or ask the owner."
MAIN="[\"']?(refs/heads/)?(main|master)[\"']?"
if grep -Eq '(^|[[:space:]])(--mi[a-z]*|--pru[a-z]*)([[:space:]]|$)' <<<"$push_args" \
  || grep -Eq "(^|[[:space:]])[\"']?:(refs/heads/)?(main|master)[\"']?([[:space:]]|$)" <<<"$push_args" \
  || { grep -Eq '(^|[[:space:]])(--d[a-z]*|-[[:alnum:]]*d[[:alnum:]]*)([[:space:]]|$)' <<<"$push_args" \
       && grep -Eq "(^|[[:space:]])$MAIN([[:space:]]|$)" <<<"$push_args"; } \
  || grep -Eo "$(git_sub push)" <<<"$cmd" | grep -Eq "remote\.[^=[:space:]]+\.(push=[\"']?\+|mirror=)" \
  || { grep -Eq "$(git_sub push)([[:space:]]|$)" <<<"$cmd" \
       && grep -Eq '(^|[^[:alnum:]_])GIT_CONFIG_(COUNT|PARAMETERS|KEY_[0-9]+|VALUE_[0-9]+)=|--config-env' <<<"$cmd"; }; then
  deny "No destructive pushes (--mirror, --prune, deleting main, push config from git -c, --config-env or GIT_CONFIG_*). Ask the owner."
fi
grep -Eq "remote\.[^[:space:]]+\.(push|mirror)" <<<"$(git_args config)" \
  && deny "No git config remote.*.push / remote.*.mirror: it turns a later git push into a forced or mirror push. Ask the owner."
grep -Eq '(^|[[:space:]])(-[[:alnum:]]*f[[:alnum:]]*|--force)([[:space:]]|$)' <<<"$(git_args add)" \
  && deny "No git add -f/--force: ignored files (.env, *.tfvars, keys) stay out of the repo (CLAUDE.md rule 7). Ask the owner if a file really belongs in git."

grep -Eq "$(git_sub commit)([[:space:]]|$)" <<<"$cmd" || exit 0

# What the shell runs: the command without heredoc bodies (h), and h with the insides of quotes blanked (m, the
# same length), so a message or a quoted argument can't pass for a command.
strip_heredocs() {
  local line delim="" tabs=0 t tab=$'\t' re="<<(-?)[[:space:]]*[\"']?([A-Za-z_][A-Za-z0-9_]*)"
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$delim" ]; then
      t="$line"; [ "$tabs" = 1 ] && t="${t#"${t%%[!$tab]*}"}"
      [ "$t" = "$delim" ] && delim=""
      continue
    fi
    printf '%s\n' "$line"
    if [[ "$line" =~ $re ]]; then delim="${BASH_REMATCH[2]}"; tabs=0; [ -n "${BASH_REMATCH[1]}" ] && tabs=1; fi
  done <<<"$1"
}
h="$(strip_heredocs "$cmd")"
m="$(perl -0777 -pe 's/"[^"]*"|\x27[^\x27]*\x27/my $q = $&; substr($q, 1, -1) =~ s|.|_|gs; $q/ge' <<<"$h")"

B='(^|[[:space:];&|(/])' SH='(bash|sh|zsh|dash|ksh)([[:space:]]+-[[:alnum:]]+)*'
if grep -Eq "$B$SH[[:space:]]+-[[:alnum:]]*c[[:alnum:]]*([[:space:]]|$)|$B$SH[[:space:]]*(<|$|[;&|)])|${B}eval([[:space:]]|$)|${B}env([[:space:]]+(-[^[:space:]]*|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*))*[[:space:]]+(-C|--chdir)" <<<"$m"; then
  deny "a git commit in a command that also runs a shell (bash/sh -c, a heredoc or pipe into a shell), eval or env -C can't be checked. Run the commit as its own command."
fi
commits="$(grep -Eo "$(git_sub commit)([[:space:]]|$)" <<<"$m" | wc -l | tr -d ' ')"
[ "$commits" = 0 ] && exit 0 # git commit only inside quotes or a heredoc, and nothing runs it
[ "$commits" = 1 ] || deny "one git commit per command, so the guard can tell which repository each is in."

commit_args="$(git_args commit "$m")"
# --no-ve… or -n on its own or in a short-option cluster (-nm, -anm); message text is blanked in m.
grep -Eq "(^|[[:space:]])(--no-ve[a-z]*|-[aqsvuen]*n[aqsvuen]*[mFC]?)([[:space:]=\"']|$)" <<<"$commit_args" \
  && deny "Commits never skip checks (--no-verify, -n)."

# Which repository the commit is made in: the session cwd, then a leading `cd <dir> &&` (or `;`),
# then `scripts/lane.sh exec <n> --` (the lane's worktree, as lane.sh computes it), then `git -C <dir>`.
# Fails closed: a directory it can't resolve to a literal path, or a cd/pushd/GIT_DIR/--git-dir/--work-tree
# it didn't consume, refuses the commit.
unresolved() {
  deny "can't tell which repository this commit is in ($1). Use a literal path (cd /abs/path && git commit, or git -C /abs/path commit) or scripts/lane.sh exec <n> -- git commit."
}
lane_dir() { # dir in the repo whose lane.sh runs, lane number (the same default as scripts/lane.sh)
  local common main
  common="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  main="$(dirname "$common")"
  echo "${LANES_DIR:-$(dirname "$main")/$(basename "$main")-lanes}/lane-$2"
}
resolve_dir() { # base, dir as written (quoted, ~, relative, or "$(scripts/lane.sh path <n>)")
  local d="$2" lane_re="^\"?\\$\\(((bash|sh)[[:space:]]+)?([^[:space:])]*/)?scripts/lane\\.sh[[:space:]]+path[[:space:]]+([1-9])[[:space:]]*\\)\"?$"
  if [[ "$d" =~ $lane_re ]]; then
    local n="${BASH_REMATCH[4]}" sd
    sd="$(resolve_dir "$1" "${BASH_REMATCH[3]:-.}")" && sd="$(lane_dir "$sd" "$n")" && resolve_dir / "$sd"
    return
  fi
  case "$d" in \"*\") d="${d:1:${#d}-2}" ;; \'*\') d="${d:1:${#d}-2}" ;; esac
  case "$d" in *'$'* | *'`'* | *'\'* | - | "") return 1 ;; esac
  case "$d" in "~") d="$HOME" ;; "~/"*) d="$HOME/${d#"~/"}" ;; "~"*) return 1 ;; esac
  case "$d" in /*) ;; *) d="$1/$d" ;; esac
  (cd "$d" 2>/dev/null && pwd -P)
}
commit_repo() { # sets root, or refuses
  # rest walks h; mrest walks m in step (same length), and finds the real commit and what precedes it.
  local dir="$cwd" rest="$h" mrest="$m" seg mseg prefix k
  local cd_re="^[[:space:]]*cd[[:space:]]+$WORD[[:space:]]*(&&|;)"
  while [[ "$rest" =~ $cd_re ]]; do
    dir="$(resolve_dir "$dir" "${BASH_REMATCH[1]}")" || unresolved "cd ${BASH_REMATCH[1]}"
    k=${#BASH_REMATCH[0]}; rest="${rest:k}"; mrest="${mrest:k}"
  done
  local lane_re="^[[:space:]]*((bash|sh)[[:space:]]+)?([^[:space:]]*/)?scripts/lane\.sh[[:space:]]+exec[[:space:]]+([1-9])[[:space:]]+--[[:space:]]"
  if [[ "$rest" =~ $lane_re ]]; then
    local n="${BASH_REMATCH[4]}"
    k=${#BASH_REMATCH[0]}
    { dir="$(resolve_dir "$dir" "${BASH_REMATCH[3]:-.}")" && dir="$(lane_dir "$dir" "$n")" && [ -d "$dir" ]; } \
      || unresolved "lane $n has no worktree"
    rest="${rest:k}"; mrest="${mrest:k}"
  fi
  mseg="$(grep -Eo "$(git_sub commit)" <<<"$mrest" | head -1)"
  prefix="${mrest%%"$mseg"*}"
  seg="${rest:${#prefix}:${#mseg}}"
  if grep -Eq '(^|[[:space:];&|(`{])(cd|pushd|popd)([[:space:];&|)]|$)|(^|[^[:alnum:]_])GIT_(DIR|WORK_TREE)=|lane\.sh[[:space:]]+exec' <<<"$prefix"; then
    unresolved "a cd, pushd, GIT_DIR or lane.sh exec that isn't at the start of the command"
  fi
  grep -Eq -- '--(git-dir|work-tree)' <<<"$seg" && unresolved "--git-dir/--work-tree"
  local c_re="(^|[[:space:]])-C[[:space:]]+$WORD(.*)$"
  while [[ "$seg" =~ $c_re ]]; do
    dir="$(resolve_dir "$dir" "${BASH_REMATCH[2]}")" || unresolved "git -C ${BASH_REMATCH[2]}"
    seg="${BASH_REMATCH[3]}"
  done
  root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)"
}

root=""; commit_repo
[ -n "$root" ] || exit 0 # not a repository: git commit fails on its own
type="$(grep -Eo '(feat|fix|refactor|test|docs|chore|perf|build|ci|style)(\([^)]*\))?!?:' <<<"$cmd" | head -1 | sed -E 's/[(!:].*//')"

# What the commit will contain: the index, plus the working tree when the same command stages (git add / commit -a).
changes="$(git -C "$root" diff --cached --name-status)"
staging=0
if grep -Eq "$(git_sub add)([[:space:]]|$)" <<<"$cmd" || grep -Eq '(^|[[:space:]])(-[[:alnum:]]*a[[:alnum:]]*|--all)([[:space:]]|$)' <<<"$commit_args"; then
  staging=1
  changes="$changes"$'\n'"$(git -C "$root" diff --name-status)"
fi

if [[ "$type" =~ ^(feat|fix|refactor)$ ]] && grep -Eq $'\tdocs/features/[^\t]*\.feature$' <<<"$changes"; then
  deny "a $type: commit must not change docs/features/*.feature (CLAUDE.md rule 2). Commit feature changes on their own as docs(features): with the reason, or remove @wip in the task's test: commit."
fi

while IFS=$'\t' read -r status file rest; do
  [ -n "${file:-}" ] || continue
  case "$status" in M*|D*|R*) ;; *) continue ;; esac
  is_applied_migration "$root" "$file" && deny "$file is an applied migration and must not change (CLAUDE.md rule 12). Unstage it and generate a new migration."
done <<<"$changes"

if { git -C "$root" diff --cached -U0 -- apps; if [ "$staging" = 1 ]; then git -C "$root" diff -U0 -- apps; fi; } | grep '^+' | imports_drizzle; then
  deny "the commit adds a drizzle-orm import under apps/. Import query operators from @repo/db (CLAUDE.md rule 12)."
fi

if [ "${GUARD_SKIP_CHECKS:-}" != 1 ]; then
  if ! out="$(cd "$root" && pnpm -s lint 2>&1 && pnpm -s typecheck 2>&1)"; then
    deny "pnpm lint && pnpm typecheck must pass before any commit. Last lines:
$(tail -n 30 <<<"$out")"
  fi
fi
exit 0
