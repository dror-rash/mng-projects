#!/usr/bin/env bash
# The secret scan (scan-secrets.sh, task 082) against throwaway repositories with a planted fake secret: it fails on
# a range that adds one (without printing it), passes on a range that doesn't, scans the whole history when there
# is no base, ignores inline gitleaks:allow, and refuses a shallow clone or an in-repo gitleaks config.
# Needs the pinned gitleaks: GITLEAKS=/path/to/gitleaks (CI: infra/scripts/get-gitleaks.sh "$RUNNER_TEMP").
# Run: GITLEAKS=… bash infra/scripts/test-secret-scan.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCAN="$ROOT/infra/scripts/scan-secrets.sh"
: "${GITLEAKS:?set GITLEAKS to the gitleaks binary (infra/scripts/get-gitleaks.sh)}"
GITLEAKS="$(cd "$(dirname "$GITLEAKS")" && pwd)/$(basename "$GITLEAKS")"
export GITLEAKS

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# An obviously fake, non-provider value, assembled here so this file never holds it in one piece (the scan of this
# repository's own commits would find it). It exists only in the temp repositories below.
FAKE="Zq7Xr2Lp9""Vw4Hk8Ns3""Jd6Mb5Tc1Gy0Fe"

pass=0; fail=0
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass+1)); echo "ok   - $name"; else fail=$((fail+1)); echo "FAIL - $name"; fi
}
g() { git -C "$REPO" -c user.name=test -c user.email=test@example.com -c commit.gpgsign=false "$@"; }
commit() { # file, content, message
  printf '%s\n' "$2" > "$REPO/$1"; g add "$1"; g commit -qm "$3"
}
scan() { # base, head (run in the repo); output in $OUT, exit code in $CODE
  OUT="$(cd "$REPO" && bash "$SCAN" "$1" "$2" 2>&1)"; CODE=$?
}

# A: clean. B: adds the fake secret. C: clean.
REPO="$TMP/repo"; mkdir -p "$REPO"; git -C "$REPO" init -q
commit README.md "hello" "a: clean"; A="$(g rev-parse HEAD)"
commit app.env "PLANTED_TEST_API_KEY=\"$FAKE\"" "b: planted fake secret"; B="$(g rev-parse HEAD)"
commit README.md "hello again" "c: clean"; C="$(g rev-parse HEAD)"

scan "$A" "$C"
check "a range that adds a secret fails" test "$CODE" -ne 0
check "it says leaks were found" grep -q "leaks found" <<<"$OUT"
check "it never prints the secret (redacted)" bash -c '! grep -qF -- "$1" <<<"$2"' _ "$FAKE" "$OUT"
check "it names the range it scanned" grep -qF "$A..$C" <<<"$OUT"

scan "$B" "$C"
check "a range after the secret's commit passes (only base..head is scanned)" test "$CODE" -eq 0

scan "0000000000000000000000000000000000000000" "$C"
check "no base (a new branch) scans the head's whole history, and finds the secret" test "$CODE" -ne 0

scan "1111111111111111111111111111111111111111" "$C"
check "a base that isn't in the clone scans the head's whole history" test "$CODE" -ne 0

scan "$A" "2222222222222222222222222222222222222222"
check "a head that isn't in the clone fails" test "$CODE" -ne 0

# An inline gitleaks:allow on the secret's line doesn't hide it.
REPO="$TMP/allow"; mkdir -p "$REPO"; git -C "$REPO" init -q
commit README.md "hello" "a: clean"; A2="$(g rev-parse HEAD)"
commit app.env "PLANTED_TEST_API_KEY=\"$FAKE\" # gitleaks:allow" "b: allowed inline"; B2="$(g rev-parse HEAD)"
scan "$A2" "$B2"
check "an inline gitleaks:allow doesn't hide a secret" test "$CODE" -ne 0

# An in-repo config or ignore file could switch rules off; the scan refuses to run with one.
for f in .gitleaks.toml .gitleaksignore; do
  REPO="$TMP/cfg-$f"; mkdir -p "$REPO"; git -C "$REPO" init -q
  commit README.md "hello" "a: clean"; A3="$(g rev-parse HEAD)"
  commit "$f" "# nothing" "b: add $f"; B3="$(g rev-parse HEAD)"
  scan "$A3" "$B3"
  check "a repository with $f is refused" test "$CODE" -ne 0
  check "the refusal names $f" grep -qF "$f" <<<"$OUT"
done

# A shallow clone can't show base..head; the scan refuses it rather than scan less.
REPO="$TMP/shallow"
git clone -q --depth 1 "file://$TMP/repo" "$REPO"
scan "$A" "$(g rev-parse HEAD)"
check "a shallow clone is refused" test "$CODE" -ne 0
check "the refusal says the clone is shallow" grep -q "shallow" <<<"$OUT"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
