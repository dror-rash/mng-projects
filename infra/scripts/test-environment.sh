#!/usr/bin/env bash
# Tests for infra/scripts/environment.sh (task 068): previews and main never share a database, login, secret,
# bucket, image repository, Cloud Run service or runtime identity, and every name matches Terraform's `local.environments` (infra/main.tf),
# so a rename on one side fails here. No GCP access needed. Run: bash infra/scripts/test-environment.sh
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
MAIN_TF="$DIR/../main.tf"
VARIABLES_TF="$DIR/../variables.tf"
pass=0; fail=0
expect() { # name, expected, actual
  if [ -n "$2" ] && [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   - $1"; else fail=$((fail+1)); echo "FAIL - $1 (expected '$2', got '$3')"; fi
}
# The value of `expr` after sourcing environment.sh with the given IS_PR.
in_env() { # is_pr, expr
  (PROJECT=demo-project IS_PR="$1"; . "$DIR/environment.sh" && eval "printf '%s' \"$2\"") 2>/dev/null
}
# A string in Terraform's local.environments.<env> block: `<key> = "<value>"`.
tf_env() { # env, key
  awk -v env="$1" -v key="$2" '
    $0 ~ "^  environments = \\{" { inside = 1; next }
    inside && $0 ~ "^  \\}" { inside = 0 }
    inside && $0 ~ "^    " env " = \\{" { block = 1; next }
    block && $0 ~ "^    \\}" { block = 0 }
    block && $1 == key { gsub(/"/, "", $3); print $3; exit }
  ' "$MAIN_TF"
}

# The default of a Terraform variable in variables.tf: a number, or the number of strings in a list.
tf_default() { # name
  awk -v name="$1" '
    $0 ~ "^variable \"" name "\" \\{" { inside = 1; next }
    inside && /^\}/ { exit }
    inside && $1 == "default" {
      sub(/^[^=]*=[ ]*/, "")
      if ($0 ~ /^\[/) { print gsub(/"[^"]*"/, ""); exit }
      print $0; exit
    }
  ' "$VARIABLES_TF"
}

# Previews and main never share.
expect "previews use the preview database"             app_preview                 "$(in_env true '$DB_NAME')"
expect "main uses the main database"                   app                         "$(in_env false '$DB_NAME')"
expect "previews migrate as the preview owner login"   preview_owner               "$(in_env true '$DB_MIGRATE_LOGIN')"
expect "main migrates as the owner login"              app                         "$(in_env false '$DB_MIGRATE_LOGIN')"
expect "previews' runtime logs in as preview_runtime"  preview_runtime             "$(in_env true '$DB_LOGIN')"
expect "main's runtime logs in as the owner login"     app                         "$(in_env false '$DB_LOGIN')"
expect "previews never read db-password"               db-preview-owner-password   "$(in_env true '$DB_MIGRATE_PASSWORD_SECRET')"
expect "previews read the preview runtime password"    db-preview-password         "$(in_env true '$DB_PASSWORD_SECRET')"
expect "main reads the owner's password"               db-password                 "$(in_env false '$DB_PASSWORD_SECRET')"
expect "previews get their own auth secret"            better-auth-secret-preview  "$(in_env true '$AUTH_SECRET_NAME')"
expect "main gets the main auth secret"                better-auth-secret          "$(in_env false '$AUTH_SECRET_NAME')"
expect "previews use the preview bucket"               demo-project-files-preview  "$(in_env true '$FILES_BUCKET')"
expect "main uses the main bucket"                     demo-project-files          "$(in_env false '$FILES_BUCKET')"
expect "a preview dashboard runs as dashboard-preview" dashboard-preview@demo-project.iam.gserviceaccount.com "$(in_env true '$(runtime_sa dashboard)')"
expect "a main dashboard runs as dashboard-runtime"    dashboard-runtime@demo-project.iam.gserviceaccount.com "$(in_env false '$(runtime_sa dashboard)')"
expect "previews push to their own image repository"    images-preview              "$(in_env true '$IMAGE_REPOSITORY')"
expect "main pushes to the main image repository"      images                      "$(in_env false '$IMAGE_REPOSITORY')"
expect "a preview deploys to its own services"         dashboard-preview           "$(in_env true '$(service_name dashboard)')"
expect "main deploys to the main services"             dashboard                   "$(in_env false '$(service_name dashboard)')"
expect "previews run 2 database connections per instance" 2                    "$(in_env true '$DB_POOL_MAX')"
expect "main runs 4 database connections per instance"   4                    "$(in_env false '$DB_POOL_MAX')"
expect "previews' DB_POOL_MAX is PREVIEW_DB_POOL_MAX"   "$(in_env true '$PREVIEW_DB_POOL_MAX')" "$(in_env true '$DB_POOL_MAX')"
expect "main's DB_POOL_MAX is MAIN_DB_POOL_MAX"         "$(in_env false '$MAIN_DB_POOL_MAX')"   "$(in_env false '$DB_POOL_MAX')"
expect "refuses to run without PROJECT"                refused \
  "$( (unset PROJECT; IS_PR=false; . "$DIR/environment.sh") >/dev/null 2>&1 && echo sourced || echo refused)"

# Every name matches Terraform.
for pair in "true preview" "false main"; do
  set -- $pair; is_pr="$1"; env="$2"
  expect "$env: database matches Terraform"          "$(tf_env "$env" db_name)"        "$(in_env "$is_pr" '$DB_NAME')"
  expect "$env: runtime login matches Terraform"     "$(tf_env "$env" db_login)"       "$(in_env "$is_pr" '$DB_LOGIN')"
  expect "$env: runtime password secret matches"     "$(tf_env "$env" db_secret)"      "$(in_env "$is_pr" '$DB_PASSWORD_SECRET')"
  expect "$env: migrating login matches Terraform"   "$(tf_env "$env" migrate_login)"  "$(in_env "$is_pr" '$DB_MIGRATE_LOGIN')"
  expect "$env: migrating password secret matches"   "$(tf_env "$env" migrate_secret)" "$(in_env "$is_pr" '$DB_MIGRATE_PASSWORD_SECRET')"
  expect "$env: auth secret matches Terraform"       "$(tf_env "$env" auth_secret)"    "$(in_env "$is_pr" '$AUTH_SECRET_NAME')"
  expect "$env: runtime identity suffix matches"     "$(tf_env "$env" runtime_suffix)" "$(in_env "$is_pr" '$RUNTIME_SA_SUFFIX')"
  expect "$env: bucket matches Terraform"            "demo-project-$(tf_env "$env" bucket_suffix)" "$(in_env "$is_pr" '$FILES_BUCKET')"
  expect "$env: services match Terraform"            "shell$(tf_env "$env" service_suffix)"        "$(in_env "$is_pr" '$(service_name shell)')"
  expect "$env: image repository matches Terraform"  "$(tf_env "$env" image_repository)" "$(in_env "$is_pr" '$IMAGE_REPOSITORY')"
done
expect "the fixed names agree with the per-environment ones" \
  "app app_preview app preview_owner preview_runtime" \
  "$(in_env true '$MAIN_DB_NAME $PREVIEW_DB_NAME $MAIN_OWNER_LOGIN $PREVIEW_OWNER_LOGIN $PREVIEW_RUNTIME_LOGIN')"

# main's connection budget (task 091, SEC-14): every zone at its maximum instances, each with a full pool, fits
# main's share of db-f1-micro's login connections. Above it, a burst scales the zones until new connections fail.
zones="$(tf_default zones)"; max_instances="$(tf_default max_instances)"
main_pool="$(in_env false '$MAIN_DB_POOL_MAX')"; main_share="$(in_env false '$MAIN_DB_CONNECTIONS')"
expect "reads the zones and main's max_instances from variables.tf" yes \
  "$(printf '%s %s' "$zones" "$max_instances" | grep -qE '^[0-9]+ [0-9]+$' && echo yes || echo no)"
main_worst=$(( ${zones:-0} * ${max_instances:-0} * ${main_pool:-0} ))
expect "main's worst case ($zones zones x $max_instances instances x pool $main_pool = $main_worst) fits its $main_share connections" \
  yes "$( [ -n "$main_share" ] && [ "$main_worst" -le "$main_share" ] && echo yes || echo no)"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
