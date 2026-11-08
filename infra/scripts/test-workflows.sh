#!/usr/bin/env bash
# Invariants of the workflows and the image build that a review could miss.
# 1) deploy.yml's "Seed demo data" step (task 076): main pushes only, never blocks the deploy, after the shell is
#    deployed, the secret tested in the shell, the email and password masked before use, DATABASE_URL only in the
#    seed's environment, one connection.
# 2) Build hygiene (task 078): the image build gets tracked files only and no intermediate layers are cached;
#    every action is pinned to a commit SHA, the Node image to a digest, turbo to the lockfile, and the
#    cloud-sql-proxy download is checked against its sha256 (also run against a file with the wrong hash).
# 3) CI security checks (task 082): every workflow has a top-level permissions: (ci.yml: contents: read), the
#    security job runs the dependency audit and the gitleaks scan of the PR's commits (base..head) or the pushed
#    commits on main, gitleaks is pinned by version and sha256, and deploy.yml skips Dependabot pull requests
#    (no secrets or OIDC token there) but never a push to main.
# Text checks on the repository files (no YAML parser needed). Probes at the end run the checks on a copy with
# one change each and expect the matching check to fail. Run: bash infra/scripts/test-workflows.sh
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
none_in() { ! grep -qE -- "$1" "${@:2}"; }   # pattern, files...
ignores() { grep -qxF -- "$2" "$ROOT/$1"; }   # file, exact line
for pattern in 'gha-creds-*.json' 'cloud-sql-proxy' '*.log'; do
  check ".dockerignore ignores $pattern" ignores .dockerignore "$pattern"
  check ".gitignore ignores $pattern" ignores .gitignore "$pattern"
done

# Build context: every docker/build-push-action step names exactly `context: ${{ env.BUILD_CONTEXT }}`, and
# BUILD_CONTEXT is the Git URL of the commit the job checked out, defined once and never reassigned.
# (No context at all would be the action's default, which fetches a PR's merge ref by name while it builds.)
BUILD_CONTEXT_LINE='BUILD_CONTEXT: ${{ github.server_url }}/${{ github.repository }}.git#${{ github.sha }}'
build_steps_use_commit_context() {
  local f n=0 out
  for f in "${WORKFLOWS[@]}"; do
    out="$(awk '
      function flush() { if (bp) { steps++; if (nctx != 1 || ctx != "${{ env.BUILD_CONTEXT }}") bad++ } bp = 0; nctx = 0; ctx = "" }
      /^[[:space:]]*- / { flush() }
      /uses:[[:space:]]*["'\'']?docker\/build-push-action@/ { bp = 1 }
      /^[[:space:]]*context:/ { nctx++; ctx = $0; sub(/^[[:space:]]*context:[[:space:]]*/, "", ctx) }
      END { flush(); print steps + 0, bad + 0 }
    ' "$f")"
    [ "${out#* }" -eq 0 ] || return 1
    n=$((n + ${out% *}))
  done
  [ "$n" -gt 0 ]
}
build_context_defined_once() {
  local f defs users=0
  for f in "${WORKFLOWS[@]}"; do
    grep -q 'BUILD_CONTEXT' "$f" || continue
    users=$((users + 1))
    defs="$(grep -E 'BUILD_CONTEXT[[:space:]]*[:=]' "$f")"
    [ "$(grep -c . <<<"$defs")" -eq 1 ] || return 1
    [ "$(sed -E 's/^[[:space:]]+//' <<<"$defs")" = "$BUILD_CONTEXT_LINE" ] || return 1
  done
  [ "$users" -gt 0 ]
}
check "every docker/build-push-action step sets context: \${{ env.BUILD_CONTEXT }}" build_steps_use_commit_context
check "BUILD_CONTEXT is the Git URL of github.sha, defined once and never reassigned" build_context_defined_once
check "no other image build in the workflows (docker build, buildx build/bake, bake-action, gcloud builds)" \
  none_in 'docker[[:space:]]+(image[[:space:]]+)?build([[:space:]]|$)|buildx[[:space:]]+(build|bake)|docker/bake-action|buildctl|gcloud[[:space:]]+builds' \
  "${WORKFLOWS[@]}"

# Every `uses:` (other than a local ./action) names a full commit SHA, with its version in a comment.
all_uses_pinned() {
  ! grep -hE '^[[:space:]]*(- )?uses:' "${WORKFLOWS[@]}" | grep -vE 'uses:[[:space:]]*\./' |
    grep -vqE 'uses: [^@[:space:]]+@[0-9a-f]{40}[[:space:]]+# v[0-9]'
}
check "every uses: is pinned to a 40-hex commit SHA with a # v<version> comment" all_uses_pinned
check "no ad hoc package runs (pnpm dlx, npx, yarn dlx, bunx, pnpm <tool>@<version>) in the Dockerfile or the workflows" \
  none_in '(^|[^[:alnum:]_-])(pnpm[[:space:]]+dlx|npx|yarn[[:space:]]+dlx|bunx)[[:space:]]|pnpm[[:space:]]+(exec[[:space:]]+)?[[:alnum:]._/-]*[[:alnum:]]@[0-9^~v]' \
  "$DOCKERFILE" "${WORKFLOWS[@]}"
check "no build cache exports intermediate layers (mode=max)" none_in 'mode=max' "${WORKFLOWS[@]}"
cache_to_min() { ! grep -hE '^[[:space:]]+cache-to:' "${WORKFLOWS[@]}" | grep -vq 'mode=min'; }
check "every cache-to uses mode=min" cache_to_min
# Every image the Dockerfile pulls (FROM, COPY/RUN --from=) is an earlier stage or pinned by digest.
external_images_by_digest() {
  awk '
    function pinned(img) { return (tolower(img) in stages) || img == "scratch" || img ~ /^[0-9]+$/ || img ~ /@sha256:[0-9a-f]{64}$/ }
    toupper($1) == "FROM" {
      i = 2; while ($i ~ /^--/) i++
      froms++; if (!pinned($i)) bad++
      for (j = i + 1; j < NF; j++) if (toupper($j) == "AS") stages[tolower($(j + 1))] = 1
      next
    }
    { for (j = 1; j <= NF; j++) if ($j ~ /(^|,)--?from=/ || $j ~ /^--mount=.*from=/) {
        img = $j; sub(/.*from=/, "", img); sub(/,.*/, "", img); if (!pinned(img)) bad++ } }
    END { exit (froms == 0 || bad > 0) }
  ' "$DOCKERFILE"
}
check "every external image in the Dockerfile (FROM, --from=) is pinned by digest" external_images_by_digest

# Each download of a pinned tool (curl or wget, any host) is followed by a sha256 check, with no `||` on that line,
# before the file is used (tar, chmod +x). Lines continued with a backslash are joined first.
logical() { perl -0pe 's/\\\n[ \t]*/ /g' "$1"; }
downloads_verified() { # file, tool
  logical "$1" | awk -v tool="$2" '
    /(curl|wget)[[:space:]]/ && index($0, tool) { d[++nd] = NR }
    /sha256sum[[:space:]].*(-c|--check)/ && !/\|\|/ { s[++ns] = NR }
    /chmod[[:space:]].*\+x|(^|[^[:alnum:]_-])tar[[:space:]]/ { c[++nc] = NR }
    END {
      if (nd == 0) exit 1
      for (i = 1; i <= nd; i++) {
        sum = 0; for (j = 1; j <= ns; j++) if (s[j] > d[i]) { sum = s[j]; break }
        if (!sum) exit 1
        for (j = 1; j <= nc; j++) if (c[j] > d[i] && c[j] < sum) exit 1
      }
    }'
}
for tool in cloud-sql-proxy gitleaks; do
  downloads=0
  for f in "${WORKFLOWS[@]}" "$ROOT"/infra/scripts/*.sh "$DOCKERFILE"; do
    case "$(basename "$f")" in test-*.sh) continue ;; esac
    logical "$f" | grep -E '(curl|wget)[[:space:]]' | grep -qF "$tool" || continue
    downloads=$((downloads+1))
    check "${f#"$ROOT"/} checks the $tool sha256 (no ||) after each download, before chmod +x or tar" \
      downloads_verified "$f" "$tool"
  done
  check "the $tool download is found (somewhere to check)" test "$downloads" -gt 0
done
check "the expected cloud-sql-proxy sha256 is a full 64-hex value" \
  grep -rqE '^CLOUD_SQL_PROXY_SHA256="[0-9a-f]{64}"' "$ROOT/infra/scripts"
check "the expected gitleaks sha256 is a full 64-hex value" \
  grep -rqE '^GITLEAKS_SHA256="[0-9a-f]{64}"' "$ROOT/infra/scripts"
check "the workflows never override the proxy's download URL" none_in 'CLOUD_SQL_PROXY_(URL|SHA256)' "${WORKFLOWS[@]}"
check "the workflows never override gitleaks' download URL or hash" none_in 'GITLEAKS_(URL|SHA256)' "${WORKFLOWS[@]}"

# Behaviour, not text: the helper refuses a file that doesn't match the hash, and leaves nothing behind.
helper_rejects_wrong_hash() {
  local tmp out code
  tmp="$(mktemp -d)"; printf 'not the proxy\n' > "$tmp/fake"
  out="$(cd "$tmp" && CLOUD_SQL_PROXY_URL="file://$tmp/fake" bash "$ROOT/infra/scripts/get-cloud-sql-proxy.sh" 2>&1)"; code=$?
  [ ! -e "$tmp/cloud-sql-proxy" ] || code=0
  rm -rf "$tmp"
  [ "$code" -ne 0 ] && grep -q "match its published sha256" <<<"$out"
}
gitleaks_helper_rejects_wrong_hash() {
  local tmp out code
  tmp="$(mktemp -d)"; printf 'not gitleaks\n' > "$tmp/fake"
  out="$(GITLEAKS_URL="file://$tmp/fake" bash "$ROOT/infra/scripts/get-gitleaks.sh" "$tmp" 2>&1)"; code=$?
  [ ! -e "$tmp/gitleaks" ] && [ ! -e "$tmp/gitleaks.tar.gz" ] || code=0
  rm -rf "$tmp"
  [ "$code" -ne 0 ] && grep -q "match its published sha256" <<<"$out"
}
if [ -z "${TEST_WORKFLOWS_PROBE:-}" ]; then
  check "get-cloud-sql-proxy.sh refuses a download with the wrong sha256 (and removes it)" helper_rejects_wrong_hash
  check "get-gitleaks.sh refuses a download with the wrong sha256 (and removes it)" gitleaks_helper_rejects_wrong_hash
fi

# --- CI security checks (task 082) ---
CI="$ROOT/.github/workflows/ci.yml"
for f in "${WORKFLOWS[@]}"; do
  check "${f#"$ROOT"/} has a top-level permissions:" grep -qE '^permissions:' "$f"
done
# The block under a top-level key, without comments and blank lines.
top_block() { awk -v key="$1:" '$0 == key { inside = 1; next } /^[^ #]/ { inside = 0 } inside && !/^[[:space:]]*(#|$)/' "$2"; }
ci_permissions_read_only() { [ "$(top_block permissions "$CI")" = "  contents: read" ]; }
check "ci.yml's top-level permissions are contents: read, nothing else" ci_permissions_read_only
# The security job: from "  security:" to the next job.
JOB="$(awk '/^  [[:alnum:]_-]+:/ { inside = ($0 == "  security:") } /^[^ ]/ { inside = 0 } inside' "$CI")"
job_has() { grep -qE -- "$1" <<<"$JOB"; }
check "ci.yml has a security job" test -n "$JOB"
check "the security job runs the audit of runtime dependencies at high" job_has '^      - run: pnpm audit --prod --audit-level=high$'
check "ci.yml never lets a step fail quietly (no continue-on-error)" none_in 'continue-on-error' "$CI"
check "the security job checks out the whole history (fetch-depth: 0)" job_has '^          fetch-depth: 0$'
check "the security job gets the pinned gitleaks" job_has '^      - run: bash infra/scripts/get-gitleaks.sh "\$RUNNER_TEMP"$'
check "the security job tests the secret scan against a planted fake secret" \
  job_has '^      - run: GITLEAKS="\$RUNNER_TEMP/gitleaks" bash infra/scripts/test-secret-scan.sh$'
check "the scan's base is the PR's base, or the commit before a push" \
  job_has "^          SCAN_BASE: \\$\\{\\{ github.event_name == 'pull_request' && github.event.pull_request.base.sha \\|\\| github.event.before \\}\\}\$"
check "the scan's head is the PR's head, or the pushed commit" \
  job_has "^          SCAN_HEAD: \\$\\{\\{ github.event_name == 'pull_request' && github.event.pull_request.head.sha \\|\\| github.sha \\}\\}\$"
check "the security job scans base..head with the pinned gitleaks" \
  job_has '^        run: GITLEAKS="\$RUNNER_TEMP/gitleaks" bash infra/scripts/scan-secrets.sh "\$SCAN_BASE" "\$SCAN_HEAD"$'
# deploy.yml: fork and Dependabot pull requests get no OIDC token or secrets, so the job skips them; every push to
# main still deploys (the condition's first branch).
DEPLOY_IF="    if: github.event_name != 'pull_request' || (github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]')"
check "deploy.yml runs on every push to main and skips fork and Dependabot pull requests" grep -qxF -- "$DEPLOY_IF" "$WF"

# --- Probes: each check above catches the change it is for ---
# A copy of the files these checks read, with one change, must fail the named check. A clean copy passes.
if [ -z "${TEST_WORKFLOWS_PROBE:-}" ]; then
  PROBE_DIR="$(mktemp -d)"; trap 'rm -rf "$PROBE_DIR"' EXIT
  probe() { # expected FAIL text (empty: the copy must pass), shell command run inside the copy
    local dir="$PROBE_DIR/p$((pass + fail))" out
    mkdir -p "$dir/.github/workflows" "$dir/infra/scripts"
    cp "$ROOT"/.github/workflows/*.yml "$dir/.github/workflows/"
    cp "$ROOT"/Dockerfile "$ROOT"/.dockerignore "$ROOT"/.gitignore "$dir/"
    cp "$ROOT"/infra/scripts/*.sh "$dir/infra/scripts/"
    (cd "$dir" && eval "$2") || return 1
    # The change must have changed something (a probe whose edit matches nothing proves nothing).
    if [ -n "$1" ]; then
      diff -rq "$ROOT/.github/workflows" "$dir/.github/workflows" >/dev/null &&
        diff -q "$ROOT/Dockerfile" "$dir/Dockerfile" >/dev/null && diff -q "$ROOT/.dockerignore" "$dir/.dockerignore" >/dev/null &&
        diff -q "$ROOT/infra/scripts/get-cloud-sql-proxy.sh" "$dir/infra/scripts/get-cloud-sql-proxy.sh" >/dev/null &&
        diff -q "$ROOT/infra/scripts/get-gitleaks.sh" "$dir/infra/scripts/get-gitleaks.sh" >/dev/null && return 1
    fi
    out="$(TEST_WORKFLOWS_PROBE=1 bash "$dir/infra/scripts/test-workflows.sh" 2>&1)"
    if [ -z "$1" ]; then grep -q ', 0 failed$' <<<"$out"; else grep -qF -- "FAIL - $1" <<<"$out"; fi
  }
  DEPLOY=.github/workflows/deploy.yml
  first_ctx='s/context: \$\{\{ env\.BUILD_CONTEXT \}\}/'
  check "probe: an unchanged copy passes" probe "" true
  check 'probe: context: "." is caught' probe "every docker/build-push-action step" "perl -0pi -e '${first_ctx}context: \".\"/' $DEPLOY"
  check 'probe: context: ${{ github.workspace }} is caught' probe "every docker/build-push-action step" \
    "perl -0pi -e '${first_ctx}context: \\\${{ github.workspace }}/' $DEPLOY"
  check 'probe: context: . # x is caught' probe "every docker/build-push-action step" "perl -0pi -e '${first_ctx}context: . # x/' $DEPLOY"
  check "probe: a build step without context: is caught" probe "every docker/build-push-action step" \
    "perl -0pi -e 's/\n *context: \\\$\{\{ env\.BUILD_CONTEXT \}\}//' $DEPLOY"
  check "probe: BUILD_CONTEXT on a moving ref is caught" probe "BUILD_CONTEXT is the Git URL" \
    "perl -0pi -e 's/#\\\$\{\{ github\.sha \}\}/#\\\${{ github.ref }}/' $DEPLOY"
  check "probe: BUILD_CONTEXT reassigned in a step is caught" probe "BUILD_CONTEXT is the Git URL" \
    "printf '      - run: echo \"BUILD_CONTEXT=.\" >> \"\$GITHUB_ENV\"\n' >> $DEPLOY"
  check "probe: a run: docker buildx build step is caught" probe "no other image build" \
    "printf '      - run: docker buildx build -t x .\n' >> $DEPLOY"
  check "probe: docker/bake-action is caught" probe "no other image build" \
    "printf '      - uses: docker/bake-action@0123456789abcdef0123456789abcdef01234567 # v6.0.0\n' >> $DEPLOY"
  check "probe: an action by tag is caught" probe "every uses: is pinned" \
    "perl -pi -e 's/checkout\@[0-9a-f]{40}.*/checkout\@v4/' .github/workflows/ci.yml"
  check "probe: a pinned action without its version comment is caught" probe "every uses: is pinned" \
    "perl -pi -e 's/(checkout\@[0-9a-f]{40}) #.*/\$1/' .github/workflows/ci.yml"
  check "probe: FROM docker.io/library/node:22-alpine is caught" probe "every external image in the Dockerfile" \
    "perl -pi -e 's/^FROM node:22-alpine\@sha256:[0-9a-f]+ AS base/FROM docker.io\/library\/node:22-alpine AS base/' Dockerfile"
  check "probe: COPY --from=<unpinned image> is caught" probe "every external image in the Dockerfile" \
    "printf 'COPY --from=node:22-alpine /usr/local/bin/node /tmp/node\n' >> Dockerfile"
  check "probe: npx in the Dockerfile is caught" probe "no ad hoc package runs" "perl -pi -e 's/RUN pnpm turbo prune/RUN npx turbo prune/' Dockerfile"
  check "probe: pnpm exec turbo@2 in the Dockerfile is caught" probe "no ad hoc package runs" \
    "perl -pi -e 's/RUN pnpm turbo prune/RUN pnpm exec turbo\@2 prune/' Dockerfile"
  check "probe: pnpm dlx in the Dockerfile is caught" probe "no ad hoc package runs" \
    "perl -pi -e 's/RUN pnpm turbo prune/RUN pnpm dlx turbo prune/' Dockerfile"
  check "probe: mode=max is caught" probe "no build cache exports intermediate layers" "perl -0pi -e 's/mode=min/mode=max/' $DEPLOY"
  check "probe: an unchecked wget of the proxy is caught" probe "$DEPLOY checks the cloud-sql-proxy sha256" \
    "printf '      - run: wget -O cloud-sql-proxy https://example.com/cloud-sql-proxy && chmod +x cloud-sql-proxy\n' >> $DEPLOY"
  check "probe: an unchecked curl of the proxy from another host, over two lines, is caught" probe \
    "$DEPLOY checks the cloud-sql-proxy sha256" \
    "printf '      - run: |\n          curl -fsSL -o cloud-sql-proxy \\\\\n            https://mirror.example/x\n          chmod +x cloud-sql-proxy\n' >> $DEPLOY"
  check "probe: a sha256 check ending in || true is caught" probe "infra/scripts/get-cloud-sql-proxy.sh checks the cloud-sql-proxy sha256" \
    "perl -pi -e 's/sha256sum -c --quiet -; then/sha256sum -c --quiet - || true; then/' infra/scripts/get-cloud-sql-proxy.sh"
  check "probe: a workflow overriding the proxy URL is caught" probe "the workflows never override" \
    "printf '      - run: CLOUD_SQL_PROXY_URL=https://x infra/scripts/get-cloud-sql-proxy.sh\n' >> $DEPLOY"
  check "probe: .dockerignore without gha-creds-*.json is caught" probe ".dockerignore ignores gha-creds-*.json" \
    "grep -vxF 'gha-creds-*.json' .dockerignore > i.tmp; mv i.tmp .dockerignore"
  CIW=.github/workflows/ci.yml
  check "probe: a workflow without top-level permissions: is caught" probe "$CIW has a top-level permissions:" \
    "perl -0pi -e 's/^permissions:\n(  .*\n)+//m' $CIW"
  check "probe: contents: write in ci.yml is caught" probe "ci.yml's top-level permissions are contents: read" \
    "perl -0pi -e 's/^permissions:\n  contents: read/permissions:\n  contents: write/m' $CIW"
  check "probe: an extra top-level permission in ci.yml is caught" probe "ci.yml's top-level permissions are contents: read" \
    "perl -0pi -e 's/^permissions:\n  contents: read\n/permissions:\n  contents: read\n  pull-requests: write\n/m' $CIW"
  check "probe: an audit at critical is caught" probe "the security job runs the audit" \
    "perl -pi -e 's/--audit-level=high/--audit-level=critical/' $CIW"
  check "probe: an audit ending in || true is caught" probe "the security job runs the audit" \
    "perl -pi -e 's/(pnpm audit --prod --audit-level=high)\$/\$1 || true/' $CIW"
  check "probe: continue-on-error in ci.yml is caught" probe "ci.yml never lets a step fail quietly" \
    "perl -pi -e 's/^(      - run: pnpm audit.*)\$/\$1\n        continue-on-error: true/' $CIW"
  check "probe: a shallow checkout in the security job is caught" probe "the security job checks out the whole history" \
    "perl -pi -e 's/fetch-depth: 0/fetch-depth: 1/' $CIW"
  check "probe: scanning only the head commit is caught" probe "the scan's base is the PR's base" \
    "perl -pi -e 's/github\.event\.pull_request\.base\.sha/github.event.pull_request.head.sha/' $CIW"
  check "probe: a deploy that also runs on Dependabot PRs is caught" probe "deploy.yml runs on every push to main" \
    "perl -pi -e \"s/ && github\\.actor != 'dependabot\\[bot\\]'//\" $DEPLOY"
  check "probe: a deploy that skips every Dependabot run (pushes too) is caught" probe "deploy.yml runs on every push to main" \
    "perl -pi -e \"s/^    if: github\\.event_name != 'pull_request' \\|\\| \\((.*)\\)\\\$/    if: github.actor != 'dependabot[bot]' && (github.event_name != 'pull_request' || \\\$1)/\" $DEPLOY"
  check "probe: a gitleaks sha256 check ending in || true is caught" probe "infra/scripts/get-gitleaks.sh checks the gitleaks sha256" \
    "perl -pi -e 's/sha256sum -c --quiet -; then/sha256sum -c --quiet - || true; then/' infra/scripts/get-gitleaks.sh"
  check "probe: extracting gitleaks before its sha256 check is caught" probe "infra/scripts/get-gitleaks.sh checks the gitleaks sha256" \
    "perl -0pi -e 's/^(curl .*\n)/\$1tar -xzf gitleaks.tar.gz gitleaks\n/m' infra/scripts/get-gitleaks.sh"
  check "probe: a workflow overriding gitleaks' URL is caught" probe "the workflows never override gitleaks" \
    "printf '      - run: GITLEAKS_URL=https://x bash infra/scripts/get-gitleaks.sh\n' >> $CIW"
fi

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
