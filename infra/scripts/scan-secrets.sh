#!/usr/bin/env bash
# Scans the commits in <base>..<head> for secrets with gitleaks' default rules (task 082). A PR passes its base and
# head SHAs, a push to main the commit before the push and the pushed one. With no usable base (all zeros, or not in
# the clone), the head's whole history is scanned. Findings are redacted: the log names the rule, file, line and commit,
# never the value.
# Refuses a shallow clone (it can't show the range) and an in-repo .gitleaks.toml or .gitleaksignore (either could
# switch rules off without touching this script). Inline `gitleaks:allow` comments are ignored.
# Usage: GITLEAKS=/path/to/gitleaks infra/scripts/scan-secrets.sh <base> <head>   (run from the repository root)
# Tested by infra/scripts/test-secret-scan.sh.
set -euo pipefail
GITLEAKS="${GITLEAKS:-./gitleaks}"
base="${1:?usage: scan-secrets.sh <base> <head>}"
head="${2:?usage: scan-secrets.sh <base> <head>}"
fail() { echo "::error title=Secret scan::$1" >&2; exit 1; }

[ "$(git rev-parse --is-shallow-repository)" = "false" ] || fail "the clone is shallow; check out with fetch-depth: 0"
for f in .gitleaks.toml .gitleaksignore; do
  [ ! -e "$f" ] || fail "$f in the repository would change what the scan reports; remove it (allowlists go through review of this script)"
done
git cat-file -e "${head}^{commit}" 2>/dev/null || fail "head $head isn't in the clone"

if [[ "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  range="$head"
  echo "No usable base ($base); scanning the whole history of $head."
else
  range="$base..$head"
fi
echo "Scanning $range ($(git rev-list --count "$range") commits)."
"$GITLEAKS" git --no-banner --redact --verbose --ignore-gitleaks-allow --log-opts="$range" .
