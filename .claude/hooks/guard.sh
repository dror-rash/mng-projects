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
# gcloud [alpha|beta] [global flags, with or without a value] <group>; FL: flags between a group and its verb
GCLOUD="(^|[^[:alnum:]_-])gcloud([[:space:]]+(alpha|beta|-[^[:space:];&|]+([[:space:]]+[^-[:space:];&|][^[:space:];&|]*)?))*[[:space:]]+"
FL="([[:space:]]+-[^[:space:];&|]+([[:space:]]+[^-[:space:];&|][^[:space:];&|]*)?)*"

# The rules on what a command runs, checked on the command as written and again on its de-quoted words (below).
cloud_rules() { # text
  grep -Eq '(^|[^[:alnum:]_-])terraform[[:space:]]+(.*[[:space:]])?(apply|destroy)([[:space:]]|$)' <<<"$1" \
    && deny "terraform apply/destroy runs only in CI or by the owner (CLAUDE.md rule 10). Run terraform plan and put its output in the PR."
  grep -Eq "${GCLOUD}run$FL[[:space:]]+(deploy|services$FL[[:space:]]+(replace|update|update-traffic|delete))([[:space:]]|$)" <<<"$1" \
    && deny "Cloud Run changes go through .github/workflows/deploy.yml and infra/ Terraform, never by hand, on any release track (CLAUDE.md rule 10)."
  grep -Eq "${GCLOUD}secrets$FL[[:space:]]+versions$FL[[:space:]]+access([[:space:]]|$)" <<<"$1" \
    && deny "Secret Manager values are never read by agents (CLAUDE.md rule 7). Ask the owner, or use the local .env."
  # Git takes unambiguous prefixes of long options, so --for… (--force, --force-with-lease, --force-if-includes),
  # --mi… (--mirror), --d… (--delete), --pru… (--prune) and --no-ve… (--no-verify) count as the full option.
  # Force: -f alone or in combined short flags (-uf), --for…[=…], a +refspec.
  grep -Eq "(^|[[:space:]])(-[[:alnum:]]*f[[:alnum:]]*|--for[-a-z]*(=[^[:space:]]*)?|[\"']?\\+[^[:space:]]+)([[:space:]]|$)" <<<"$(git_args push "$1")" \
    && deny "No force pushes (--force, -f, --force-with-lease, --force-if-includes or a +refspec). Add a commit instead, or ask the owner."
  return 0
}
cloud_rules "$cmd"
push_args="$(git_args push)"
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

# The rest looks at what the shell runs: only for a commit, or a command that mentions setup, gcloud, terraform or
# push with its quotes and backslashes removed (a cheap first check; the words can't hide behind quotes from it).
dq="$(tr -d "\"'\\\\" <<<"$cmd")"
scan=0; case "$dq" in *setup*|*gcloud*|*terraform*|*push*) scan=1 ;; esac

# A git alias set on the command line (-c alias.*, --config-env=alias.*, GIT_CONFIG_*) runs any command, unchecked.
if grep -Eq -- '(^|[[:space:]])(-c[[:space:]]*|--config-env[=[:space:]]+)alias\.|GIT_CONFIG_KEY_[0-9]+=alias\.|GIT_CONFIG_PARAMETERS=.*alias\.' <<<"$dq" &&
  grep -Eq 'commit|push|setup\.sh' <<<"$dq"; then
  deny "No git alias set on the command line (-c alias.*, --config-env, GIT_CONFIG_*) with a commit, push or setup.sh: it runs unchecked. Run the real command."
fi

[ "$scan" = 1 ] || grep -Eq "$(git_sub commit)([[:space:]]|$)" <<<"$cmd" || exit 0

# What the shell runs: the command without heredoc bodies (h; the bodies in body), and h with the insides of quotes
# blanked (m, the same length), so a message or a quoted argument can't pass for a command.
# A heredoc starts at a << in code: not in quotes, a comment, $((…)) or ${…}, and not a here-string (<<<). Its
# delimiter is the next word with its quotes and backslashes removed; several on a line end in order. The context
# (quotes, $(…), $((…)), ${…}) carries over lines; a heredoc body starts on the next line, even inside $(…).
strip_heredocs() { # sets h and body
  local line delims="" d tabs t tab=$'\t' nl=$'\n' st="" top i j n c c2 part out="" sq="'" dqc='"'
  local sep='[[:space:];&|()]'
  body=""
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$delims" ]; then
      d="${delims%%"$nl"*}"; tabs="${d%%:*}"; d="${d#*:}"
      t="$line"; [ "$tabs" = 1 ] && t="${t#"${t%%[!$tab]*}"}"
      if [ "$t" = "$d" ]; then delims="${delims#*"$nl"}"; else body="$body$line$nl"; fi
      continue
    fi
    out="$out$line$nl"
    i=0; n=${#line}
    while [ "$i" -lt "$n" ]; do
      c="${line:i:1}"; top="${st:${#st}-1:1}"
      case "$top" in
        S) [ "$c" = "'" ] && st="${st%?}" ;;
        D)
          if [ "$c" = '"' ]; then st="${st%?}"
          elif [ "$c" = '\' ]; then i=$((i + 1))
          elif [ "${line:i:3}" = '$((' ]; then st="${st}A"; i=$((i + 2))
          elif [ "${line:i:2}" = '$(' ]; then st="${st}P"; i=$((i + 1))
          elif [ "${line:i:2}" = '${' ]; then st="${st}B"; i=$((i + 1))
          fi ;;
        A|a)
          if [ "$c" = '(' ]; then st="${st}a"
          elif [ "$c" = ')' ]; then
            st="${st%?}"; [ "$top" = A ] && [ "${line:i+1:1}" = ')' ] && i=$((i + 1))
          fi ;;
        B)
          if [ "$c" = '}' ]; then st="${st%?}"
          elif [ "$c" = "'" ]; then st="${st}S"
          elif [ "$c" = '"' ]; then st="${st}D"
          elif [ "$c" = '\' ]; then i=$((i + 1))
          elif [ "${line:i:2}" = '${' ]; then st="${st}B"; i=$((i + 1))
          fi ;;
        *) # code: the top level, $(…) or (…)
          if [ "$c" = '#' ] && { [ "$i" = 0 ] || [[ "${line:i-1:1}" =~ $sep ]]; }; then break
          elif [ "$c" = "'" ]; then st="${st}S"
          elif [ "$c" = '"' ]; then st="${st}D"
          elif [ "$c" = '\' ]; then i=$((i + 1))
          elif [ "${line:i:3}" = '$((' ]; then st="${st}A"; i=$((i + 2))
          elif [ "${line:i:2}" = '$(' ]; then st="${st}P"; i=$((i + 1))
          elif [ "${line:i:2}" = '${' ]; then st="${st}B"; i=$((i + 1))
          elif [ "${line:i:2}" = '((' ]; then st="${st}A"; i=$((i + 1))
          elif [ "$c" = '(' ]; then st="${st}Q"
          elif [ "$c" = ')' ]; then case "$top" in P|Q) st="${st%?}" ;; esac
          elif [ "${line:i:3}" = '<<<' ]; then i=$((i + 2))
          elif [ "${line:i:2}" = '<<' ]; then
            j=$((i + 2)); tabs=0
            [ "${line:j:1}" = - ] && { tabs=1; j=$((j + 1)); }
            while [ "${line:j:1}" = ' ' ] || [ "${line:j:1}" = "$tab" ]; do j=$((j + 1)); done
            d=""
            while [ "$j" -lt "$n" ]; do
              c2="${line:j:1}"
              case "$c2" in
                ' '|"$tab"|';'|'&'|'|'|'<'|'>'|'('|')') break ;;
                "'") part="${line:j+1}"; part="${part%%"$sq"*}"; d="$d$part"; j=$((j + ${#part} + 2)); continue ;;
                '"') part="${line:j+1}"; part="${part%%"$dqc"*}"; d="$d$part"; j=$((j + ${#part} + 2)); continue ;;
                '\') d="$d${line:j+1:1}"; j=$((j + 2)); continue ;;
                *) d="$d$c2" ;;
              esac
              j=$((j + 1))
            done
            [ -n "$d" ] && delims="$delims$tabs:$d$nl"
            i=$((j - 1))
          fi ;;
      esac
      i=$((i + 1))
    done
  done <<<"$1"
  while [ "${out%"$nl"}" != "$out" ]; do out="${out%"$nl"}"; done
  h="$out"
}
strip_heredocs "$cmd"
m="$(perl -0777 -pe 's/"[^"]*"|\x27[^\x27]*\x27/my $q = $&; substr($q, 1, -1) =~ s|.|_|gs; $q/ge' <<<"$h")"

B='(^|[[:space:];&|(/])' SH='(bash|sh|zsh|dash|ksh)([[:space:]]+-[[:alnum:]]+)*'

# A command that runs another through a shell (bash/sh -c, a heredoc or pipe into a shell), eval or env -C.
RUNS_SHELL="$B$SH[[:space:]]+-[[:alnum:]]*c[[:alnum:]]*([[:space:]]|$)|$B$SH[[:space:]]*(<|$|[;&|)])|${B}eval([[:space:]]|$)|${B}env([[:space:]]+(-[^[:space:]]*|[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*))*[[:space:]]+(-C|--chdir)"

INFRA_REFUSED="setup.sh infra and infra-push fetch the owner's config and workstation secrets: a person runs them in their own terminal, never an agent (ADR-0013, CLAUDE.md rule 7). Ask the owner."
# A heredoc body line that would be refused as a command on its own is refused (fail closed: the scanner may
# misjudge where a body ends). A message line that only mentions them passes.
if [ -n "$body" ]; then
  grep -Eq "^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*git([[:space:]]+$GITOPT)*[[:space:]]+commit([[:space:]].*)?[[:space:]](--no-ve[a-z]*|-[aqsvuen]*n[aqsvuen]*[mFC]?)([[:space:]=\"']|$)" <<<"$body" \
    && deny "a heredoc line is a git commit that skips checks (--no-verify, -n). Run the commit as its own command."
  tr -d "\"'\\\\" <<<"$body" | grep -Eq '^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|exec|command|time|nohup|nice|xargs|source|\.|timeout([[:space:]]+[0-9][^[:space:]]*)?)([[:space:]]+-[^[:space:]]+)*[[:space:]]+)*(([^[:space:]]*/)?(bash|sh|zsh|dash|ksh)([[:space:]]+-[^[:space:]]*)*[[:space:]]+)?([^[:space:]]*/)?setup\.sh[[:space:]]+(infra|infra-push|[^[:space:]]*\$)' \
    && deny "a heredoc line runs setup.sh infra or infra-push. $INFRA_REFUSED"
fi

if [ "$scan" = 1 ]; then
  # h as the shell splits it: one simple command per line, each word with its quotes and backslashes removed and
  # its inner spaces as _ (so a quoted message stays one word), redirections and their targets dropped.
  words="$(perl -e '
    my $s = do { local $/; <STDIN> }; my (@seg, @out);
    sub flush { push @out, join(" ", @seg); @seg = (); }
    sub word { my $w = "";
      while (length $s && $s !~ /^[\s;&|()`<>]/) {
        if ($s =~ s/^\x27([^\x27]*)\x27?//) { $w .= $1 }
        elsif ($s =~ s/^"((?:[^"\\]|\\.)*)"?//s) { my $x = $1; $x =~ s/\\(.)/$1/gs; $w .= $x }
        elsif ($s =~ s/^\\(.)//s) { $w .= $1 }
        elsif ($s =~ s/^([^\s;&|()`<>\x27"\\]+)//) { $w .= $1 }
        else { last } }
      $w =~ s/\s/_/g; return $w; }
    while (length $s) {
      next if $s =~ s/^[ \t]+// || $s =~ s/^\\\n//;
      if ($s =~ s/^(?:&>>?|\d*(?:<<<|<<-?|<>|>>|>\||>&|<&|<|>))//) { $s =~ s/^[ \t]*//; word(); next }
      if ($s =~ s/^[\n;&|()`]//) { flush(); next }
      my $len = length $s; my $w = word();
      if (length $s == $len) { substr($s, 0, 1) = ""; next }
      push @seg, $w; }
    flush(); print "$_\n" for grep { length } @out;' <<<"$h")"

  cloud_rules "$words"

  # setup.sh infra / infra-push fetch the owner config and workstation secrets: a person runs them, never an agent
  # (task 112, ADR-0013; setup.sh also refuses CLAUDECODE=1, which a command can unset). Refused: setup.sh followed
  # by infra, infra-push or a word with a variable in any simple command (whatever runs it: a shell by any path,
  # env, sudo, timeout, source, xargs, { ! ` then do else), and setup.sh with an infra or infra-push word anywhere
  # in it (git grep -O<cmd> runs a pager), except one that only reads files (grep, cat, ls, …; never git or less:
  # aliases, pagers and LESSOPEN run commands); a setting whose value runs it (PAGER=…, core.pager=…); and the words
  # anywhere behind a shell wrapper or a command substitution (outside heredoc bodies). A quoted message is one
  # word, so a commit, echo or grep mentioning them passes.
  if { { grep -Eq "$RUNS_SHELL" <<<"$m" || grep -Eq "$RUNS_SHELL" <<<"$h"; } &&
       grep -Eq 'setup\.sh[[:space:]]+(infra(-push)?([^[:alnum:]_-]|$)|\$)' <<<"$dq"; } ||
     { grep -Eq '`|\$\(' <<<"$h" &&
       tr -d "\"'\\\\" <<<"$h" | grep -Eq 'setup\.sh[[:space:]]+(infra(-push)?([^[:alnum:]_-]|$)|\$)'; }; then
    deny "$INFRA_REFUSED"
  fi
  grep -Eq '(^| )[^ ]*=[^ ]*setup\.sh_+(infra|infra-push)(_|$| )' <<<"$words" && deny "$INFRA_REFUSED"
  while IFS= read -r seg; do
    case " $seg " in *" setup.sh "*|*"/setup.sh "*) ;; *) continue ;; esac
    first="$(sed -E 's/^([A-Za-z_][A-Za-z0-9_]*=[^ ]* +)*//' <<<"$seg")"
    case "${first%% *}" in
      grep|egrep|fgrep|rg|cat|head|tail|wc|ls|diff|stat|file|shellcheck) continue ;;
    esac
    if grep -Eq '(^| )([^ ]*/)?setup\.sh +[^ ]*[$`]' <<<"$seg" || grep -Eq '(^| )(infra|infra-push)( |$)' <<<"$seg" ||
      grep -Eq '(^| )xargs( |$)' <<<"$seg"; then
      deny "$INFRA_REFUSED"
    fi
  done <<<"$words"
fi

grep -Eq "$(git_sub commit)([[:space:]]|$)" <<<"$cmd" || exit 0

if grep -Eq "$RUNS_SHELL" <<<"$m"; then
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
