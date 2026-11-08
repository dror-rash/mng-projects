#!/usr/bin/env bash
# Invariants of the workflows and the image build that a review could miss.
# 1) deploy.yml's "Seed demo data" step (task 076): main pushes only, never blocks the deploy, after the shell is
#    deployed, the secret tested in the shell, the email and password masked before use, DATABASE_URL only in the
#    seed's environment, one connection.
# 2) Build hygiene (task 078): the image build gets tracked files only and no intermediate layers are cached;
#    every action is pinned to a commit SHA, the Node image to a digest, turbo to the lockfile, and the
#    cloud-sql-proxy download is checked against its sha256.
# Text checks on the repository files (no YAML parser needed). Run: bash infra/scripts/test-workflows.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WF="$ROOT/.github/workflows/deploy.yml"

# The step's lines: from its "- name:" to the next step at the same indent.
STEP="$(awk '
  /^      - / { inside = ($0 ~ /^      - name: Seed demo data$/) }
  /^[^ ]/     { inside = 0 }
  inside
' "$WF")"

pass=0; fail=0
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass+1)); echo "ok   - $name"; else fail=$((fail+1)); echo "FAIL - $name"; fi
}
has() { grep -qE -- "$1" <<<"$STEP"; }
hasnt() { ! grep -qE -- "$1" <<<"$STEP"; }
line_of() { grep -nE -- "$1" <<<"$STEP" | head -1 | cut -d: -f1; }
before() { local a b; a="$(line_of "$1")"; b="$(line_of "$2")"; [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; }
# Step order in the whole file.
step_line() { grep -nE -- "^      - name: $1\$" "$WF" | head -1 | cut -d: -f1; }
after_step() { local a b; a="$(step_line "$1")"; b="$(step_line "$2")"; [ -n "$a" ] && [ -n "$b" ] && [ "$a" -gt "$b" ]; }

check "the step exists" test -n "$STEP"
check "runs only on a push to main" has "^        if: github.event_name == 'push' && github.ref == 'refs/heads/main'\$"
check "never blocks the deploy (continue-on-error)" has '^        continue-on-error: true$'
check "has a timeout" has '^        timeout-minutes: 10$'
check "runs after the shell is deployed and checked" after_step "Seed demo data" "Check shell URL"
check "reads DEMO_EMAIL from secrets, not vars" has '^          DEMO_EMAIL: \$\{\{ secrets\.DEMO_EMAIL \}\}$'
check "never names the secret in if: (it can't read secrets)" hasnt '^        if:.*secrets\.'
check "tests DEMO_EMAIL in the shell and skips with a notice" has 'if \[ -z "\$DEMO_EMAIL" \]'
check "masks the email before reading the password" before '::add-mask::\$DEMO_EMAIL' 'gcloud secrets'
check "masks the password right after reading it" before '::add-mask::\$PASSWORD' 'pnpm install'
check "connects as the environment's owner login (no new identity)" has 'DB_MIGRATE_PASSWORD_SECRET'
check "seeds with one connection" has 'DB_POOL_MAX=1 '
check "runs the seed in --deploy mode, silently (no command line with the email)" \
  has 'pnpm --silent --filter @repo/dashboard seed:demo --deploy --email "\$DEMO_EMAIL"'
check "installs the dashboard itself" has 'pnpm install --frozen-lockfile --filter @repo/dashboard\.\.\.'
check "DATABASE_URL only in the seed command's environment (never exported or echoed)" \
  hasnt '(export +DATABASE_URL|echo .*DATABASE_URL|^ +DATABASE_URL=[^ ]*$)'
check "no shell tracing" hasnt 'set -[a-z]*x'
check "fails with the proxy's log when the proxy doesn't start" \
  has 'fail "The Cloud SQL proxy didn.t start: \$\(tail -c 300 proxy-seed\.log \| oneline\)"'
check "defines oneline before the proxy check uses it" before '^ +oneline\(\) ' 'proxy didn.t start'
check "a skip is a notice" has '::notice title=Demo data::'
check "a refusal or failure is a warning" has '::warning title=Demo data::'

# --- Build hygiene (task 078) ---
WORKFLOWS=("$ROOT"/.github/workflows/*.yml)
DOCKERFILE="$ROOT/Dockerfile"
ignores() { grep -qxF -- "$2" "$ROOT/$1"; }   # file, exact line
for pattern in 'gha-creds-*.json' 'cloud-sql-proxy' '*.log'; do
  check ".dockerignore ignores $pattern" ignores .dockerignore "$pattern"
  check ".gitignore ignores $pattern" ignores .gitignore "$pattern"
done
# Every `uses:` names a full commit SHA (a trailing comment with the version is allowed).
all_uses_pinned() {
  ! grep -hE '^[[:space:]]*(- )?uses:' "${WORKFLOWS[@]}" |
    grep -vqE 'uses: [^@[:space:]]+@[0-9a-f]{40}([[:space:]]+#.*)?$'
}
none_in() { ! grep -qE -- "$1" "${@:2}"; }   # pattern, files...
cache_to_min() { ! grep -hE '^[[:space:]]+cache-to:' "${WORKFLOWS[@]}" | grep -vq 'mode=min'; }
node_by_digest() {
  grep -qE '^FROM node:' "$DOCKERFILE" && ! grep -E '^FROM node:' "$DOCKERFILE" | grep -vqE '@sha256:[0-9a-f]{64}( |$)'
}
check "every uses: in the workflows is pinned to a 40-hex commit SHA" all_uses_pinned
check "no pnpm dlx in the Dockerfile or the workflows" none_in 'pnpm dlx' "$DOCKERFILE" "${WORKFLOWS[@]}"
# Build steps use the action's Git context (the commit's tracked files), never the workspace.
check "no build step uses the workspace as its context (context: .)" \
  none_in '^[[:space:]]+context: \./?[[:space:]]*$' "${WORKFLOWS[@]}"
check "no build cache exports intermediate layers (mode=max)" none_in 'mode=max' "${WORKFLOWS[@]}"
check "every cache-to uses mode=min" cache_to_min
check "every node: image in the Dockerfile is pinned by digest" node_by_digest
# Each file that downloads cloud-sql-proxy checks its sha256 after the download and before chmod +x.
proxy_verified() { # file
  local dl sum mode
  dl="$(grep -nE 'curl .*cloud-sql-proxy|cloud-sql-connectors/cloud-sql-proxy/' "$1" | head -1 | cut -d: -f1)"
  sum="$(grep -nE 'sha256sum (-c|--check)' "$1" | head -1 | cut -d: -f1)"
  mode="$(grep -nE 'chmod \+x .*cloud-sql-proxy|chmod \+x "?\$' "$1" | head -1 | cut -d: -f1)"
  [ -n "$dl" ] && [ -n "$sum" ] && [ -n "$mode" ] && [ "$dl" -lt "$sum" ] && [ "$sum" -lt "$mode" ]
}
downloads=0
for f in "${WORKFLOWS[@]}" "$ROOT"/infra/scripts/*.sh; do
  [ "$(basename "$f")" = test-workflows.sh ] && continue
  grep -qE 'cloud-sql-connectors/cloud-sql-proxy/' "$f" || continue
  downloads=$((downloads+1))
  check "${f#"$ROOT"/} checks the cloud-sql-proxy sha256 before chmod +x" proxy_verified "$f"
done
check "the cloud-sql-proxy download is found (somewhere to check)" test "$downloads" -gt 0
check "the expected cloud-sql-proxy sha256 is a full 64-hex value" \
  grep -rqE '^CLOUD_SQL_PROXY_SHA256="[0-9a-f]{64}"' "$ROOT/infra/scripts"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
