#!/usr/bin/env bash
# Tests for .claude/hooks/guard.sh (tasks 067, 084). Run: bash scripts/test-hooks.sh (CI runs it in verify).
# Each case feeds a PreToolUse JSON payload to the guard and checks: 0 = allowed, 2 = refused.
# Cases on this repo count HEAD as "applied" (CI's checkout has no origin/main); set GUARD_BASE_REF to override.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GUARD="$ROOT/.claude/hooks/guard.sh"
pass=0; fail=0

payload() { # tool, json-input
  jq -nc --arg tool "$1" --argjson input "$2" --arg cwd "$ROOT" \
    '{hook_event_name:"PreToolUse", tool_name:$tool, tool_input:$input, cwd:$cwd}'
}

expect() { # want-exit, name, tool, json-input
  local want="$1" name="$2" out code
  out="$(payload "$3" "$4" | GUARD_SKIP_CHECKS=1 GUARD_BASE_REF="${GUARD_BASE_REF:-HEAD}" bash "$GUARD" 2>&1)"; code=$?
  if [ "$code" = "$want" ]; then pass=$((pass+1)); echo "ok   - $name"
  else fail=$((fail+1)); echo "FAIL - $name (exit $code, want $want) $out"; fi
}

edit()  { jq -nc --arg p "$1" --arg s "${2:-x}" '{file_path:$p, old_string:"a", new_string:$s}'; }
write() { jq -nc --arg p "$1" --arg s "${2:-x}" '{file_path:$p, content:$s}'; }
bash_() { jq -nc --arg c "$1" '{command:$c}'; }

# Files
expect 2 "refuses editing an applied migration"        Edit  "$(edit "$ROOT/packages/db/migrations/0001_modern_blindfold.sql")"
expect 2 "refuses editing an applied migration snapshot" Write "$(write "$ROOT/packages/db/migrations/meta/0001_snapshot.json")"
LINK_DIR="$(mktemp -d)"; trap 'rm -rf "$LINK_DIR" "${BASE:-}"' EXIT; ln -s "$ROOT" "$LINK_DIR/repo"
expect 2 "refuses editing an applied migration through a symlinked path" Edit "$(edit "$LINK_DIR/repo/packages/db/migrations/0001_modern_blindfold.sql")"
expect 0 "allows writing a new migration"               Write "$(write "$ROOT/packages/db/migrations/9999_new.sql")"
expect 0 "allows editing the migration journal"         Edit  "$(edit "$ROOT/packages/db/migrations/meta/_journal.json")"
expect 2 "refuses editing .env"                         Edit  "$(edit "$ROOT/.env")"
expect 0 "allows editing .env.example"                  Edit  "$(edit "$ROOT/.env.example")"
expect 2 "refuses editing terraform.tfvars"             Write "$(write "$ROOT/infra/terraform.tfvars")"
expect 2 "refuses editing backend.hcl"                  Write "$(write "$ROOT/infra/backend.hcl")"
expect 2 "refuses editing Terraform state"              Write "$(write "$ROOT/infra/terraform.tfstate")"
expect 2 "refuses a drizzle-orm import in an app"       Write "$(write "$ROOT/apps/dashboard/features/x.ts" 'import { eq } from "drizzle-orm";')"
expect 0 "allows a drizzle-orm import in packages/db"   Write "$(write "$ROOT/packages/db/src/x.ts" 'import { eq } from "drizzle-orm";')"
expect 0 "allows an @repo/db import in an app"          Edit  "$(edit "$ROOT/apps/dashboard/features/x.ts" 'import { eq } from "@repo/db";')"

# Commands
expect 2 "refuses terraform apply"                      Bash "$(bash_ "cd infra && terraform apply -auto-approve")"
expect 2 "refuses terraform destroy"                    Bash "$(bash_ "terraform destroy")"
expect 0 "allows terraform plan"                        Bash "$(bash_ "cd infra && terraform plan -no-color")"
expect 2 "refuses gcloud run deploy"                    Bash "$(bash_ "gcloud run deploy shell --image x")"
expect 2 "refuses a force push"                         Bash "$(bash_ "git push --force origin main")"
expect 2 "refuses a short force push"                   Bash "$(bash_ "git push -f")"
expect 0 "allows a normal push"                         Bash "$(bash_ "git push -u origin feat/x")"
expect 0 "allows ordinary commands"                     Bash "$(bash_ "pnpm test")"
expect 0 "allows -n elsewhere in a commit command"     Bash "$(bash_ "git commit -m 'docs: x' && git log -n 1")"
expect 2 "refuses --no-verify on commit"                Bash "$(bash_ "git commit --no-verify -m 'feat: x'")"

# Secret Manager values and Cloud Run changes by hand, on any release track (task 084)
expect 2 "refuses reading a secret value"               Bash "$(bash_ "gcloud secrets versions access latest --secret=x")"
expect 2 "refuses reading a secret value on beta"       Bash "$(bash_ "gcloud beta secrets versions access 1 --secret x")"
expect 2 "refuses reading a secret value after a global flag" Bash "$(bash_ "gcloud --project p secrets versions access latest --secret=x")"
expect 0 "allows listing secret versions"               Bash "$(bash_ "gcloud secrets versions list x")"
expect 0 "allows listing secrets"                       Bash "$(bash_ "gcloud secrets list --project p")"
expect 2 "refuses gcloud beta run deploy"               Bash "$(bash_ "gcloud beta run deploy shell --image x")"
expect 2 "refuses gcloud alpha run services update"     Bash "$(bash_ "gcloud alpha run services update shell --memory 1Gi")"
expect 2 "refuses gcloud run services replace"          Bash "$(bash_ "gcloud run services replace service.yaml")"
expect 2 "refuses gcloud run services update-traffic"   Bash "$(bash_ "gcloud run services update-traffic shell --to-latest")"
expect 2 "refuses gcloud run services delete after a global flag" Bash "$(bash_ "gcloud --quiet run services delete shell")"
expect 0 "allows gcloud run services describe"          Bash "$(bash_ "gcloud run services describe shell --region europe-west1")"
expect 0 "allows gcloud beta run services list"         Bash "$(bash_ "gcloud beta run services list")"
expect 0 "allows gcloud run revisions list"             Bash "$(bash_ "gcloud run revisions list --service shell")"

# setup.sh infra / infra-push fetch the owner config and workstation secrets: a person runs them (task 112)
expect 2 "refuses bash scripts/setup.sh infra"          Bash "$(bash_ "bash scripts/setup.sh infra")"
expect 2 "refuses setup.sh infra with flags"            Bash "$(bash_ "bash scripts/setup.sh infra --project p-1 --force --yes")"
expect 2 "refuses ./scripts/setup.sh infra-push"        Bash "$(bash_ "./scripts/setup.sh infra-push")"
expect 2 "refuses sh setup.sh infra in scripts/"        Bash "$(bash_ "cd scripts && sh setup.sh infra")"
expect 2 "refuses setup.sh infra after another command" Bash "$(bash_ "pnpm lint; bash scripts/setup.sh infra-push")"
expect 2 "refuses setup.sh infra with CLAUDECODE unset" Bash "$(bash_ "CLAUDECODE= env -u CLAUDECODE bash scripts/setup.sh infra")"
expect 2 "refuses setup.sh infra under sudo"            Bash "$(bash_ "sudo bash scripts/setup.sh infra")"
expect 2 "refuses setup.sh infra through lane.sh exec"  Bash "$(bash_ "scripts/lane.sh exec 1 -- bash scripts/setup.sh infra")"
expect 2 "refuses setup.sh infra behind bash -c"        Bash "$(bash_ "bash -c 'bash scripts/setup.sh infra'")"
expect 2 "refuses setup.sh infra in a heredoc fed to bash" Bash "$(bash_ "bash <<'EOF'
bash scripts/setup.sh infra-push
EOF")"
expect 2 "refuses setup.sh infra split over lines"      Bash "$(bash_ $'bash scripts/setup.sh \\\n  infra')"
expect 0 "allows the developer setup"                   Bash "$(bash_ "bash scripts/setup.sh --yes")"
expect 0 "allows setup.sh services"                     Bash "$(bash_ "bash scripts/setup.sh services")"
expect 0 "allows setup.sh infra's tests"                Bash "$(bash_ "bash scripts/test-setup.sh")"
expect 0 "allows grep for setup.sh infra, quoted"       Bash "$(bash_ "grep -n 'setup.sh infra' scripts/setup.sh README.md")"
expect 0 "allows grep for setup.sh infra, unquoted"     Bash "$(bash_ "grep -rn setup.sh infra")"
expect 0 "allows a commit message about setup.sh infra" Bash "$(bash_ "git commit -m 'docs: setup.sh infra and setup.sh infra-push'")"
expect 0 "allows echo of setup.sh infra"                Bash "$(bash_ "echo \"run bash scripts/setup.sh infra\"")"

# Force pushes in every spelling
expect 2 "refuses a +refspec push"                      Bash "$(bash_ "git push origin +main")"
expect 2 "refuses a quoted +refspec push"               Bash "$(bash_ "git push origin '+HEAD:main'")"
expect 2 "refuses combined short flags -uf"             Bash "$(bash_ "git push -uf origin feat/x")"
expect 2 "refuses combined short flags -fu"             Bash "$(bash_ "git push -fu origin feat/x")"
expect 2 "refuses --force-with-lease"                   Bash "$(bash_ "git push --force-with-lease origin feat/x")"
expect 2 "refuses --force-with-lease=<ref>"             Bash "$(bash_ "git push --force-with-lease=main:abc origin main")"
expect 2 "refuses --force-if-includes"                  Bash "$(bash_ "git push --force-if-includes origin feat/x")"
expect 2 "refuses a force push behind global options"   Bash "$(bash_ "git -C /tmp/x -c a=b push --force")"
expect 0 "allows a push of a branch named like a flag"  Bash "$(bash_ "git push -u origin feat/fix-force")"
expect 0 "allows --follow-tags"                         Bash "$(bash_ "git push --follow-tags origin main")"
expect 0 "allows git log --format=%f"                   Bash "$(bash_ "git log --format=%f -n 3")"
expect 0 "allows -f in a later command than the push"   Bash "$(bash_ "git push origin main && git log -f x")"
expect 0 "allows gh pr merge --merge"                   Bash "$(bash_ "gh pr merge 59 --merge --delete-branch")"

# Destructive pushes (review of task 084)
expect 2 "refuses git push --mirror"                    Bash "$(bash_ "git push --mirror origin")"
expect 2 "refuses deleting main with :main"             Bash "$(bash_ "git push origin :main")"
expect 2 "refuses deleting main with :refs/heads/main"  Bash "$(bash_ "git push origin :refs/heads/main")"
expect 2 "refuses deleting main with --delete"          Bash "$(bash_ "git push origin --delete main")"
expect 2 "refuses deleting main with -d"                Bash "$(bash_ "git push -d origin main")"
expect 2 "refuses a forced push refspec from git -c"    Bash "$(bash_ "git -c 'remote.origin.push=+refs/heads/*:refs/heads/*' push")"
expect 0 "allows deleting a feature branch"             Bash "$(bash_ "git push origin --delete feat/x")"
expect 0 "allows deleting a feature branch with :"      Bash "$(bash_ "git push origin :feat/x")"
expect 0 "allows deleting a branch named like main"     Bash "$(bash_ "git push origin --delete feat/main")"

# Unambiguous long-option prefixes, --prune, and push config from the environment or git config (re-review)
expect 2 "refuses a --mirror prefix --mirr"             Bash "$(bash_ "git push --mirr origin")"
expect 2 "refuses a --mirror prefix --mi"               Bash "$(bash_ "git push --mi origin")"
expect 2 "refuses deleting main with --del"             Bash "$(bash_ "git push origin --del main")"
expect 2 "refuses deleting main with --d"               Bash "$(bash_ "git push origin --d main")"
expect 2 "refuses a --force-with-lease prefix"          Bash "$(bash_ "git push --force-w origin feat/x")"
expect 2 "refuses a --force-if-includes prefix"         Bash "$(bash_ "git push --force-i origin feat/x")"
expect 2 "refuses a --force prefix"                     Bash "$(bash_ "git push --forc origin feat/x")"
expect 2 "refuses git push --prune"                     Bash "$(bash_ "git push --prune origin")"
expect 2 "refuses a --prune prefix"                     Bash "$(bash_ "git push --pru origin")"
expect 2 "refuses a push with GIT_CONFIG_COUNT"         Bash "$(bash_ "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.push GIT_CONFIG_VALUE_0=+x git push")"
expect 2 "refuses a push with GIT_CONFIG_PARAMETERS"    Bash "$(bash_ "GIT_CONFIG_PARAMETERS=\"'remote.origin.push'='+x'\" git push")"
expect 2 "refuses a push with --config-env"             Bash "$(bash_ "git --config-env=remote.origin.push=V push")"
expect 2 "refuses git config remote.*.push"             Bash "$(bash_ "git config remote.origin.push '+refs/heads/*:refs/heads/*'")"
expect 2 "refuses git config remote.*.mirror"           Bash "$(bash_ "git config --add remote.origin.mirror true")"
expect 0 "allows deleting a feature branch with --del"  Bash "$(bash_ "git push origin --del feat/x")"
expect 0 "allows git push --dry-run"                    Bash "$(bash_ "git push --dry-run origin feat/x")"
expect 0 "allows git config user.name"                  Bash "$(bash_ "git config user.name x")"
expect 0 "allows reading remote.origin.url"             Bash "$(bash_ "git config --get remote.origin.url")"

# Backslash-newline continuations
expect 2 "refuses a force push split over lines"        Bash "$(bash_ $'git push origin \\\n  --force')"
expect 2 "refuses gcloud run services update split over lines" Bash "$(bash_ $'gcloud run services \\\n  update shell')"

# git add -f
expect 2 "refuses git add -f"                           Bash "$(bash_ "git add -f .env")"
expect 2 "refuses git add --force"                      Bash "$(bash_ "git add --force infra/terraform.tfvars")"
expect 2 "refuses git add -fA"                          Bash "$(bash_ "git add -fA")"
expect 0 "allows git add .env.example"                  Bash "$(bash_ "git add .env.example")"
expect 0 "allows git add -A with a path containing f"   Bash "$(bash_ "git add -A docs/features/fix.feature")"

# Commits behind git global options
expect 2 "refuses --no-verify after git -c"             Bash "$(bash_ "git -c x=y commit --no-verify -m 'feat: x'")"
expect 2 "refuses -n after git --no-pager"              Bash "$(bash_ "git --no-pager commit -n -m 'docs: x'")"
expect 0 "allows git -c with another command"           Bash "$(bash_ "git -c color.ui=never log -n 1")"
expect 2 "refuses -n in combined short flags"           Bash "$(bash_ "git commit -nm 'docs: x'")"
expect 2 "refuses -n in combined short flags -anm"      Bash "$(bash_ "git commit -anm 'docs: x'")"
expect 0 "allows -n after a ; inside a message"         Bash "$(bash_ "git commit -m 'docs: a; b -n c'")"
expect 2 "refuses a --no-verify prefix"                 Bash "$(bash_ "git commit --no-ve -m 'docs: x'")"
expect 0 "allows -main in a message"                    Bash "$(bash_ "git commit -m \"docs: the -main flag\"")"
expect 0 "allows -only and -config in a message"        Bash "$(bash_ "git commit -m 'docs: -only and -config'")"

# Commits, in a throwaway repo where "main" plays origin/main
# Laid out like a real checkout: lanes in <repo>-lanes/lane-<n>, where lane.sh puts them without LANES_DIR.
BASE="$(mktemp -d)"; REPO="$BASE/proj"; LANES="$BASE/proj-lanes"; mkdir -p "$REPO"
git -C "$REPO" init -q -b main && git -C "$REPO" config user.email t@example.com && git -C "$REPO" config user.name t
mkdir -p "$REPO/packages/db/migrations" "$REPO/docs/features" "$REPO/apps/dashboard"
echo "select 1;" > "$REPO/packages/db/migrations/0001_init.sql"; echo "Feature: x" > "$REPO/docs/features/x.feature"; touch "$REPO/apps/dashboard/.gitkeep"
git -C "$REPO" add -A && git -C "$REPO" commit -qm init
# A second worktree where scripts/lane.sh puts lane 7.
WT="$LANES/lane-7"; git -C "$REPO" worktree add -q -b lane-test "$WT" main
stage() { # dir, setup: clean both checkouts, then change and stage in dir
  local d; for d in "$REPO" "$WT"; do git -C "$d" reset -q --hard; git -C "$d" clean -qfd; done
  (cd "$1" && eval "$2" && git add -A)
}
guard_cmd() { # want-exit, name, command, cwd
  local want="$1" name="$2" out code
  out="$(jq -nc --arg c "$3" --arg cwd "$4" '{tool_name:"Bash", tool_input:{command:$c}, cwd:$cwd}' \
    | GUARD_SKIP_CHECKS=1 GUARD_BASE_REF=main bash "$GUARD" 2>&1)"; code=$?
  if [ "$code" = "$want" ]; then pass=$((pass+1)); echo "ok   - $name"
  else fail=$((fail+1)); echo "FAIL - $name (exit $code, want $want) $out"; fi
}
commit() { # want-exit, name, message, setup
  stage "$REPO" "$4"; guard_cmd "$1" "$2" "git commit -m \"$3\"" "$REPO"
}
commit 2 "refuses a feat: commit that changes a feature file" "feat(dashboard): x"     'echo more >> docs/features/x.feature'
commit 2 "refuses a fix: commit that changes a feature file"  "fix: x"                 'echo more >> docs/features/x.feature'
commit 0 "allows a docs: commit that changes a feature file"  "docs(features): x"      'echo more >> docs/features/x.feature'
commit 0 "allows a test: commit that removes @wip"            "test: x, red"           'echo more >> docs/features/x.feature'
commit 2 "refuses a commit that changes an applied migration" "fix(db): x"             'echo more >> packages/db/migrations/0001_init.sql'
commit 0 "allows a commit that adds a migration"              "feat(db): x"            'echo "select 2;" > packages/db/migrations/0002_x.sql'
commit 2 "refuses a commit that adds a drizzle-orm import to an app" "feat: x"         "echo 'import { eq } from \"drizzle-orm\";' > apps/dashboard/x.ts"

# Commits behind git global options get the full checks
FEATURE='echo more >> docs/features/x.feature'
MIGRATION='echo more >> packages/db/migrations/0001_init.sql'
stage "$REPO" "$FEATURE"; guard_cmd 2 "refuses a feat: commit after git -c"        'git -c user.name=x commit -m "feat: x"' "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 2 "refuses a feat: commit after git --no-pager" 'git --no-pager commit -m "feat: x"' "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 2 "refuses a feat: commit after git -c and -C"  "git -c a=b -C '$REPO' commit -m 'feat: x'" "$LANES"

# Commits in another worktree are checked there, not in the session's cwd
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses a feat: commit changing a feature file via cd <wt> &&" "cd '$WT' && git commit -m 'feat: x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses a feat: commit changing a feature file via cd <wt>;"   "cd $WT; git add -A; git commit -m 'feat: x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses a feat: commit changing a feature file via git -C <wt>" "git -C \"$WT\" commit -m 'feat: x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses a feat: commit changing a feature file via a relative cd" "cd ../../$(basename "$LANES")/lane-7 && git commit -m 'feat: x'" "$REPO/docs"
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses a feat: commit changing a feature file via lane.sh exec" "scripts/lane.sh exec 7 -- git commit -m 'feat: x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses a feat: commit via bash lane.sh exec after cd" "cd '$REPO' && bash scripts/lane.sh exec 7 -- git commit -m 'feat: x'" "$LANES"
stage "$WT" "$MIGRATION"; guard_cmd 2 "refuses a commit changing an applied migration via cd <wt> &&" "cd '$WT' && git commit -m 'fix(db): x'" "$REPO"
stage "$WT" "$MIGRATION"; guard_cmd 2 "refuses a commit changing an applied migration via git -C <wt>" "git -C '$WT' commit -m 'fix(db): x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows a docs: commit changing a feature file in a worktree" "cd '$WT' && git commit -m 'docs(features): x'" "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 0 "checks the worktree, not the session's checkout" "git -C '$WT' commit -m 'feat: x'" "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 0 "checks the lane, not the session's checkout" "scripts/lane.sh exec 7 -- git commit -m 'feat: x'" "$REPO"

# The resolver fails closed: a directory it can't resolve to a literal path is refused, not skipped
DOCS='git commit -m "docs: x"'
stage "$REPO" true; guard_cmd 2 "refuses a cd to a directory that doesn't exist"   "cd /nonexistent-084; $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses cd -"                                     "cd - && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a cd to a variable"                       "cd \$PWD && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses git -C with a command substitution"       "git -C \"\$(pwd)\" commit -m 'docs: x'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses git -C with backticks"                    "git -C \`pwd\` commit -m 'docs: x'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a cd to an escaped-space path"            "cd /tmp/a\\ b && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a cd to ~user"                            "cd ~someone && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a git -C that doesn't exist"              "git -C /nonexistent-084 commit -m 'docs: x'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a cd in a subshell"                       "(cd '$WT' && $DOCS)" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a cd that isn't leading"                  "pnpm lint && cd '$WT' && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses cd <dir> || exit; git commit"             "cd '$WT' || exit; $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses pushd"                                    "pushd '$WT' && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses GIT_DIR="                                 "GIT_DIR='$WT/.git' $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses git --git-dir"                            "git --git-dir='$REPO/.git' commit -m 'docs: x'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses git --work-tree"                          "git --work-tree '$WT' commit -m 'docs: x'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a lane.sh exec that isn't leading"        "pnpm lint && scripts/lane.sh exec 7 -- $DOCS" "$REPO"

# One commit per command, never behind a shell, eval or env -C (re-review)
stage "$REPO" true; guard_cmd 2 "refuses a cd after a quoted git commit"           "echo \"git commit\" && cd '$WT' && $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses two commits in one command"               "git commit -m 'docs: a' && git commit -m 'docs: b'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a commit behind bash -c"                  "bash -c \"git commit -m 'docs: x'\"" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a commit behind sh -c"                    "sh -c 'cd $WT && git commit -m docs:x'" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a commit behind eval"                     "eval \"git commit -m 'docs: x'\"" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a commit behind env -C"                   "env -C '$WT' $DOCS" "$REPO"
stage "$REPO" true; guard_cmd 2 "refuses a commit in a heredoc fed to bash"        "bash <<'EOF'
$DOCS
EOF" "$REPO"
stage "$REPO" true; guard_cmd 0 "allows git commit and cd quoted in another command" "gh pr create --title x --body \"cd x and git commit\"" "$REPO"
stage "$REPO" true; guard_cmd 0 "allows git commit and cd quoted in the message"   "git commit -m 'docs: git commit after cd x'" "$REPO"
stage "$REPO" true; guard_cmd 0 "allows env with variables before git commit"      "env FOO=1 $DOCS" "$REPO"
stage "$WT" "$FEATURE"; guard_cmd 0 "allows a heredoc message mentioning git commit, bash -c and eval" "git -C '$WT' commit -q -F - <<'EOF'
docs: x

git commit; bash -c y; eval z; cd w
EOF" "$REPO"

# ... and the normal flows still pass, including the agents' "$(scripts/lane.sh path <n>)"
stage "$WT" "$FEATURE";   guard_cmd 2 "resolves git -C \"\$(scripts/lane.sh path n)\" to the lane" "git -C \"\$(scripts/lane.sh path 7)\" commit -m 'feat: x'" "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 0 "checks \$(scripts/lane.sh path n), not the session's checkout" "git -C \"\$(scripts/lane.sh path 7)\" commit -m 'feat: x'" "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 0 "resolves cd \$(./scripts/lane.sh path n)" "cd \$(./scripts/lane.sh path 7) && git commit -m 'feat: x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows a docs: commit via lane.sh exec" "scripts/lane.sh exec 7 -- $DOCS" "$REPO"
stage "$REPO" "$FEATURE"; guard_cmd 0 "allows a docs: commit in the cwd" "$DOCS" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows git add and commit after cd <wt>" "cd '$WT' && git add -A && $DOCS" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows a heredoc message that mentions cd and --git-dir" "git -C '$WT' commit -q -F - <<'EOF'
docs: x

cd somewhere; pushd there; GIT_DIR=x --git-dir y
EOF" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows cd and pushd in the message"  "git -C '$WT' commit -m 'docs: cd and pushd, GIT_DIR=x'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows a commit whose message mentions setup.sh infra" "cd '$WT' && git commit -m 'docs: bash scripts/setup.sh infra, then setup.sh infra-push'" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 0 "allows a heredoc message that mentions setup.sh infra" "git -C '$WT' commit -q -F - <<'EOF'
docs: x

Run bash scripts/setup.sh infra; then ./scripts/setup.sh infra-push.
EOF" "$REPO"
stage "$WT" "$FEATURE";   guard_cmd 2 "refuses setup.sh infra after a commit"  "cd '$WT' && git commit -m 'docs: x' && bash scripts/setup.sh infra" "$REPO"

echo; echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
