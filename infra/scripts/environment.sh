# Per-environment names for deploys (task 068). Source it; don't run it:  . infra/scripts/environment.sh
# The one place the workflow and deploy-service.sh choose preview vs main. Terraform's `local.environments`
# (infra/main.tf) carries the same names; test-environment.sh fails when the two differ.
# Env in: PROJECT, IS_PR ("true" for PR previews).
# Tests: bash infra/scripts/test-environment.sh
: "${PROJECT:?PROJECT is required}"

# Fixed for both environments.
MAIN_DB_NAME="app"
PREVIEW_DB_NAME="app_preview"
MAIN_OWNER_LOGIN="app"                                   # Terraform's Cloud SQL user; owns `app`'s objects
MAIN_OWNER_PASSWORD_SECRET="db-password"
MAIN_RUNTIME_LOGIN="app_runtime"                         # provision-db-logins.mjs: SET-only member of app_user (task 074)
MAIN_RUNTIME_PASSWORD_SECRET="db-runtime-password"
PREVIEW_OWNER_LOGIN="preview_owner"                      # provision-db-logins.mjs: owns `app_preview`'s objects
PREVIEW_OWNER_PASSWORD_SECRET="db-preview-owner-password"
PREVIEW_RUNTIME_LOGIN="preview_runtime"                  # provision-db-logins.mjs: SET-only member of app_user
PREVIEW_RUNTIME_PASSWORD_SECRET="db-preview-password"
# Database connections per instance (DB_POOL_MAX, packages/db pool-config.ts; task 075). Cloud SQL's 22 login
# connections are shared: provision-db-logins.mjs derives preview_runtime's CONNECTION LIMIT from the preview
# size (its test fails when they differ), and infra/README.md shows the arithmetic.
MAIN_DB_POOL_MAX="4"                                     # 3 zones x 1 busy instance x 4 = 12
PREVIEW_DB_POOL_MAX="2"                                  # 3 zones x 1 instance x 2 = 6 per active preview

if [ "${IS_PR:-false}" = "true" ]; then
  DEPLOY_ENV="preview"
  DB_NAME="$PREVIEW_DB_NAME"
  DB_MIGRATE_LOGIN="$PREVIEW_OWNER_LOGIN"
  DB_MIGRATE_PASSWORD_SECRET="$PREVIEW_OWNER_PASSWORD_SECRET"
  DB_LOGIN="$PREVIEW_RUNTIME_LOGIN"
  DB_PASSWORD_SECRET="$PREVIEW_RUNTIME_PASSWORD_SECRET"
  DB_POOL_MAX="$PREVIEW_DB_POOL_MAX"
  AUTH_SECRET_NAME="better-auth-secret-preview"
  FILES_BUCKET="${PROJECT}-files-preview"
  RUNTIME_SA_SUFFIX="preview"
  SERVICE_SUFFIX="-preview"
  IMAGE_REPOSITORY="images-preview"
else
  DEPLOY_ENV="main"
  DB_NAME="$MAIN_DB_NAME"
  DB_MIGRATE_LOGIN="$MAIN_OWNER_LOGIN"
  DB_MIGRATE_PASSWORD_SECRET="$MAIN_OWNER_PASSWORD_SECRET"
  DB_LOGIN="$MAIN_RUNTIME_LOGIN"                         # owns nothing; switches to app_user on connect (ADR-0006)
  DB_PASSWORD_SECRET="$MAIN_RUNTIME_PASSWORD_SECRET"
  DB_POOL_MAX="$MAIN_DB_POOL_MAX"
  AUTH_SECRET_NAME="better-auth-secret"
  FILES_BUCKET="${PROJECT}-files"
  RUNTIME_SA_SUFFIX="runtime"
  SERVICE_SUFFIX=""
  IMAGE_REPOSITORY="images"
fi

# The runtime identity of <zone> in this environment: <zone>-runtime (main) or <zone>-preview.
runtime_sa() { echo "${1}-${RUNTIME_SA_SUFFIX}@${PROJECT}.iam.gserviceaccount.com"; }
# The Cloud Run service of <zone> in this environment: <zone> (main) or <zone>-preview.
service_name() { echo "${1}${SERVICE_SUFFIX}"; }

export DEPLOY_ENV DB_NAME DB_MIGRATE_LOGIN DB_MIGRATE_PASSWORD_SECRET DB_LOGIN DB_PASSWORD_SECRET DB_POOL_MAX AUTH_SECRET_NAME \
  FILES_BUCKET RUNTIME_SA_SUFFIX SERVICE_SUFFIX IMAGE_REPOSITORY MAIN_DB_NAME PREVIEW_DB_NAME MAIN_OWNER_LOGIN MAIN_OWNER_PASSWORD_SECRET \
  MAIN_RUNTIME_LOGIN MAIN_RUNTIME_PASSWORD_SECRET PREVIEW_OWNER_LOGIN PREVIEW_OWNER_PASSWORD_SECRET PREVIEW_RUNTIME_LOGIN PREVIEW_RUNTIME_PASSWORD_SECRET \
  MAIN_DB_POOL_MAX PREVIEW_DB_POOL_MAX
