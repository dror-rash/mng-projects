#!/usr/bin/env bash
# End-to-end test of the deploy's database steps on fresh databases, set up like Cloud SQL (task 068):
# the databases belong to a cloudsqlsuperuser stand-in, and main's owner login is a non-superuser with
# CREATEROLE, a member of it, and ADMIN on app_user (it created it on Cloud SQL). Then, as the workflow does:
#   main:    migrate `app` as the owner -> provision the logins -> role check as main's runtime login (task 074)
#   preview: verify the logins -> migrate `app_preview` as preview_owner -> role check as preview_runtime
# and the preview logins can't connect to `app`. Every role and database gets a unique name and is dropped.
# Needs DATABASE_URL of a superuser on a cluster where the migrations have run once (app_user exists).
# Run: bash infra/scripts/test-preview-migrate.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL (a superuser on a migrated cluster)}"
BASE="${DATABASE_URL%/*}"                       # postgres://user:pw@host:port
HOSTPART="${BASE#*@}"                           # host:port
n="$$"
SU="role_check_cloudsqlsuperuser_$n"; APP="role_check_app_$n"; OWNER="role_check_preview_owner_$n"; RUNTIME="role_check_preview_runtime_$n"
MAIN_RT="role_check_app_runtime_$n"
MAIN_DB="role_check_app_$n"; PREVIEW_DB="role_check_app_preview_$n"
APP_PW="app-pw-$n-$RANDOM"; OWNER_PW="owner-pw-$n-$RANDOM"; RUNTIME_PW="runtime-pw-$n-$RANDOM"; MAIN_RT_PW="main-runtime-pw-$n-$RANDOM"
url() { echo "postgres://$1:$2@${HOSTPART}/$3"; }  # login, password, database
su_sql() { psql "${BASE}/postgres" -v ON_ERROR_STOP=1 -qtAc "$1"; }
NODE=(node --experimental-strip-types --no-warnings)

pass=0; fail=0
check() { # name, command...
  local name="$1"; shift
  local out; if out="$("$@" 2>&1)"; then pass=$((pass+1)); echo "ok   - $name"; else fail=$((fail+1)); echo "FAIL - $name"; echo "$out" | tail -15 | sed 's/^/       /'; fi
}
refused() { psql "$1" -qtAc "select 1" 2>&1 | grep -q "permission denied for database"; }  # not a wrong password
cleanup() {
  su_sql "drop database if exists $PREVIEW_DB with (force)" >/dev/null 2>&1
  su_sql "drop database if exists $MAIN_DB with (force)" >/dev/null 2>&1
  su_sql "drop owned by $OWNER, $RUNTIME, $MAIN_RT, $APP, $SU" >/dev/null 2>&1
  su_sql "drop role if exists $OWNER, $RUNTIME, $MAIN_RT" >/dev/null 2>&1
  su_sql "drop role if exists $APP, $SU" >/dev/null 2>&1
}
trap cleanup EXIT

su_sql "create role $SU nologin; create role $APP login createrole password '$APP_PW'; grant $SU to $APP;
        grant app_user to $APP with admin option" || exit 1
su_sql "create database $MAIN_DB owner $SU" && su_sql "create database $PREVIEW_DB owner $SU" || exit 1

export MAIN_DB_NAME="$MAIN_DB" PREVIEW_DB_NAME="$PREVIEW_DB" MAIN_OWNER_LOGIN="$APP" PREVIEW_OWNER_LOGIN="$OWNER" PREVIEW_RUNTIME_LOGIN="$RUNTIME" \
  MAIN_RUNTIME_LOGIN="$MAIN_RT" MAIN_RUNTIME_PASSWORD="$MAIN_RT_PW"
migrate() { (cd "$ROOT" && DATABASE_URL="$1" pnpm --silent --filter @repo/db db:migrate); }

check "main: migrations run as a non-superuser owner login" migrate "$(url "$APP" "$APP_PW" "$MAIN_DB")"
check "main: provisions the preview logins (as that login, on the main and preview databases)" \
  env MAIN_DATABASE_URL="$(url "$APP" "$APP_PW" "$MAIN_DB")" DATABASE_URL="$(url "$APP" "$APP_PW" "$PREVIEW_DB")" PREVIEW_OWNER_PASSWORD="$OWNER_PW" PREVIEW_RUNTIME_PASSWORD="$RUNTIME_PW" \
  "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs"
check "main: provisioning again changes nothing (idempotent)" \
  env MAIN_DATABASE_URL="$(url "$APP" "$APP_PW" "$MAIN_DB")" DATABASE_URL="$(url "$APP" "$APP_PW" "$PREVIEW_DB")" PREVIEW_OWNER_PASSWORD="$OWNER_PW" PREVIEW_RUNTIME_PASSWORD="$RUNTIME_PW" \
  "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs"
check "main: role check passes as main's runtime login (task 074)" \
  env DATABASE_URL="$(url "$MAIN_RT" "$MAIN_RT_PW" "$MAIN_DB")" "${NODE[@]}" "$ROOT/infra/scripts/check-runtime-role.mjs"
owner_check_fails() { # the role check run as the owner login must fail, saying why
  local out; out="$(env DATABASE_URL="$(url "$APP" "$APP_PW" "$MAIN_DB")" "${NODE[@]}" "$ROOT/infra/scripts/check-runtime-role.mjs" 2>&1)" && return 1
  grep -q "owns the tables" <<<"$out"
}
check "main: role check fails on purpose as the owner login" owner_check_fails
check "main: the runtime login can't SET ROLE to the owner login" \
  sh -c "psql '$(url "$MAIN_RT" "$MAIN_RT_PW" "$MAIN_DB")' -qtAc 'set role $APP' 2>&1 | grep -q 'permission denied to set role'"
check "main: the runtime login owns nothing" \
  test "$(su_sql "select count(*) from pg_shdepend where refobjid = '$MAIN_RT'::regrole and deptype = 'o'")" = 0
check "preview: verifies the logins as preview_owner (before its first migration)" \
  env DATABASE_URL="$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")" "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs" --verify-only
check "preview: migrations run as preview_owner on a fresh database" migrate "$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")"
check "preview: verifies again after migrating (0020's self-grant is the one allowed extra)" \
  env DATABASE_URL="$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")" "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs" --verify-only
check "main: provisioning after a preview migrated still passes" \
  env MAIN_DATABASE_URL="$(url "$APP" "$APP_PW" "$MAIN_DB")" DATABASE_URL="$(url "$APP" "$APP_PW" "$PREVIEW_DB")" PREVIEW_OWNER_PASSWORD="$OWNER_PW" PREVIEW_RUNTIME_PASSWORD="$RUNTIME_PW" \
  "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs"
check "preview: preview_owner owns the preview tables" \
  test "$(psql "$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")" -qtAc "select pg_get_userbyid(relowner) from pg_class where oid = 'public.workspace'::regclass")" = "$OWNER"
check "preview: role check passes as preview_runtime" \
  env DATABASE_URL="$(url "$RUNTIME" "$RUNTIME_PW" "$PREVIEW_DB")" "${NODE[@]}" "$ROOT/infra/scripts/check-runtime-role.mjs"
provision() { # extra env…
  env MAIN_DATABASE_URL="$(url "$APP" "$APP_PW" "$MAIN_DB")" DATABASE_URL="$(url "$APP" "$APP_PW" "$PREVIEW_DB")" \
    PREVIEW_OWNER_PASSWORD="$OWNER_PW" PREVIEW_RUNTIME_PASSWORD="$RUNTIME_PW" "$@" "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs"
}
verify_preview() { env DATABASE_URL="$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")" "${NODE[@]}" "$ROOT/infra/scripts/provision-db-logins.mjs" --verify-only; }

# A PR (as preview_owner) grants app_user to preview_runtime with INHERIT: previews fail, main doesn't, and
# main's provisioning removes the grant.
psql "$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")" -qtAc "grant app_user to $RUNTIME with inherit true, set true" >/dev/null
fails() { ! "$@"; }
check "preview: verify fails after preview_owner grants app_user with INHERIT" fails verify_preview
check "main: provisioning still passes" provision
check "main: and removed every grant preview_owner made" \
  test "$(su_sql "select count(*) from pg_auth_members where grantor = '$OWNER'::regrole")" = 0
check "preview: verify passes again" verify_preview

# Another session holds the preview migration lock (a stuck PR migration): main gives up on the preview side
# within its bound, warns, and exits 0.
psql "${BASE}/$PREVIEW_DB" -qtAc "select pg_advisory_lock(hashtext('migrate-$PREVIEW_DB')), pg_sleep(30)" >/dev/null 2>&1 &
holder=$!
sleep 1
started=$(date +%s)
lock_out="$(provision PREVIEW_SIDE_TIMEOUT_MS=2000 2>&1)"; lock_code=$?
elapsed=$(( $(date +%s) - started ))
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
check "main: exits 0 while a PR holds the preview migration lock" test "$lock_code" = 0
check "main: warns that the preview step was skipped" sh -c "printf '%s' \"\$1\" | grep -q '::warning::Preview database step skipped'" _ "$lock_out"
check "main: gives up within its bound (${elapsed}s)" test "$elapsed" -lt 15

# A preview login holds its own pg_authid row (ALTER ROLE <self> PASSWORD in an open transaction): main's
# provisioning must not wait on it. The role statements give up with a warning; what protects `app` still runs.
psql "$(url "$RUNTIME" "$RUNTIME_PW" "$PREVIEW_DB")" -qtAc "begin; alter role $RUNTIME password '$RUNTIME_PW'; select pg_sleep(30); commit" >/dev/null 2>&1 &
holder=$!
sleep 1
started=$(date +%s)
role_out="$(provision PREVIEW_SIDE_TIMEOUT_MS=2000 2>&1)"; role_code=$?
elapsed=$(( $(date +%s) - started ))
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
check "main: exits 0 while a preview login holds its own role row" test "$role_code" = 0
check "main: warns that a preview login step was skipped" sh -c "printf '%s' \"\$1\" | grep -q '::warning::Preview login step skipped'" _ "$role_out"
check "main: gives up on it within its bound (${elapsed}s)" test "$elapsed" -lt 15
check "main: app is still closed to the preview logins" refused "$(url "$RUNTIME" "$RUNTIME_PW" "$MAIN_DB")"

check "preview_runtime can't connect to the main database" refused "$(url "$RUNTIME" "$RUNTIME_PW" "$MAIN_DB")"
check "main's runtime login can't connect to the preview database" refused "$(url "$MAIN_RT" "$MAIN_RT_PW" "$PREVIEW_DB")"
check "preview_owner can't connect to the main database" refused "$(url "$OWNER" "$OWNER_PW" "$MAIN_DB")"
check "a function planted by a preview migration doesn't run during main's provisioning" \
  sh -c "psql '$(url "$OWNER" "$OWNER_PW" "$PREVIEW_DB")' -qtAc \"create function public.pg_has_role(oid, text, text) returns boolean language plpgsql as \\\$\\\$ begin raise exception 'planted function called'; end \\\$\\\$\" >/dev/null && MAIN_DATABASE_URL='$(url "$APP" "$APP_PW" "$MAIN_DB")' DATABASE_URL='$(url "$APP" "$APP_PW" "$PREVIEW_DB")' PREVIEW_OWNER_PASSWORD='$OWNER_PW' PREVIEW_RUNTIME_PASSWORD='$RUNTIME_PW' ${NODE[*]} '$ROOT/infra/scripts/provision-db-logins.mjs'"
check "preview_runtime can't create objects in the preview database" \
  sh -c "! psql '$(url "$RUNTIME" "$RUNTIME_PW" "$PREVIEW_DB")' -qtAc 'create table role_check_t (id int)' >/dev/null 2>&1"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
