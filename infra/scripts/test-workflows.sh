#!/usr/bin/env bash
# Invariants of .github/workflows/deploy.yml's "Seed demo data" step (task 076) that a review could miss:
# main pushes only, never blocks the deploy, after the shell is deployed, the secret tested in the shell, the
# email and password masked before use, DATABASE_URL only in the seed's environment, one connection.
# Text checks on the step's block (no YAML parser needed). Run: bash infra/scripts/test-workflows.sh
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

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
