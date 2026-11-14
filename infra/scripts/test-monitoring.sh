#!/usr/bin/env bash
# Invariants of the alerts and the budget (task 092, register SEC-17) in infra/monitoring.tf:
# - one email channel to var.alert_email; every alert policy and the budget notify it;
# - log-match alerts on IAM policy changes, service-account keys and Cloud Run service changes by anyone but the
#   two deployers, each at most one notification per 5 minutes;
# - metric alerts on main's 5xx ratio (> 5% over 5 minutes, per main service) and Cloud SQL connections (> 80%
#   of the login connections for 5 minutes);
# - a monthly budget on the project from var.billing_account and var.monthly_budget, at 50%, 90% and 100%;
# - the address, the billing account and the amount come from terraform.tfvars only: the variables have no
#   default, terraform.tfvars.example has placeholders, and no address or billing id is in infra/.
# Text checks on the Terraform files (no GCP access). Probes at the end run the checks on a copy with one change
# each and expect the matching check to fail. Run: bash infra/scripts/test-monitoring.sh
set -u
INFRA="${TEST_MONITORING_INFRA:-$(cd "$(dirname "$0")/.." && pwd)}"
MON="$INFRA/monitoring.tf"
VARS="$INFRA/variables.tf"
EXAMPLE="$INFRA/terraform.tfvars.example"
MAIN="$INFRA/main.tf"

pass=0; fail=0
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass=$((pass+1)); echo "ok   - $name"; else fail=$((fail+1)); echo "FAIL - $name"; fi
}
# A top-level block of a file: from `<kind> "<a>" ["<b>"] {` to the closing `}` at column 0.
block() { # file, header regex (after the kind)
  [ -f "$1" ] || return 0
  awk -v re="$2" '$0 ~ "^" re " \\{$" { inside = 1 } inside { print } inside && /^}$/ { exit }' "$1"
}
resource() { block "$MON" "resource \"$1\" \"$2\""; }
variable() { block "$VARS" "variable \"$1\""; }
in_block() { grep -qE -- "$2" <<<"$1"; }   # text, regex
not_in_block() { ! grep -qE -- "$2" <<<"$1"; }

CHANNEL="$(resource google_monitoring_notification_channel email)"
IAM="$(resource google_monitoring_alert_policy iam_policy_change)"
KEYS="$(resource google_monitoring_alert_policy service_account_key)"
RUN="$(resource google_monitoring_alert_policy run_change_outside_ci)"
SECURITY="$(resource google_monitoring_alert_policy security_config_change)"
ERRORS="$(resource google_monitoring_alert_policy main_5xx)"
SQL="$(resource google_monitoring_alert_policy sql_connections)"
BUDGET="$(resource google_billing_budget monthly)"

# --- Variables: set in terraform.tfvars only ---
for v in alert_email billing_account monthly_budget budget_currency; do
  check "variable $v exists" test -n "$(variable "$v")"
  check "variable $v has no default (set in terraform.tfvars)" not_in_block "$(variable "$v")" '^  default'
  check "variable $v is validated" in_block "$(variable "$v")" '^  validation \{'
  check "terraform.tfvars.example sets $v" grep -qE "^$v +=" "$EXAMPLE"
done
check "alert_email is sensitive (plan output hides it)" in_block "$(variable alert_email)" '^  sensitive += true$'
check "billing_account is sensitive (plan output hides it)" in_block "$(variable billing_account)" '^  sensitive += true$'
check "terraform.tfvars.example's address is a placeholder" grep -qE '^alert_email += "[^"@]+@example\.com"$' "$EXAMPLE"
check "terraform.tfvars.example's billing account is a placeholder" grep -qE '^billing_account += "000000-000000-000000"$' "$EXAMPLE"
no_real_address() { ! grep -rhoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$INFRA"/*.tf "$EXAMPLE" | grep -vE '@(example\.com|noreply\.github\.com)$|\.gserviceaccount\.com$'; }
check "no email address in infra/*.tf or the example" no_real_address
no_billing_id() { ! grep -rhoE '[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}' "$INFRA"/*.tf "$EXAMPLE" | grep -v '^000000-000000-000000$'; }
check "no billing account id in infra/*.tf or the example" no_billing_id

# --- APIs ---
check "enables the Monitoring API" grep -qE '^    "monitoring\.googleapis\.com",$' "$MAIN"
check "enables the Billing Budget API" grep -qE '^    "billingbudgets\.googleapis\.com",$' "$MAIN"

# --- The channel ---
check "the email channel exists" test -n "$CHANNEL"
check "the channel is an email channel" in_block "$CHANNEL" '^  type += "email"$'
check "the channel sends to var.alert_email" in_block "$CHANNEL" 'email_address += var\.alert_email'

# --- Every alert policy: notifies the channel, says what to do first ---
for p in IAM KEYS RUN SECURITY ERRORS SQL; do
  text="${!p}"
  check "$p: the policy exists" test -n "$text"
  check "$p: notifies the email channel" in_block "$text" 'notification_channels += \[google_monitoring_notification_channel\.email\.id\]'
  check "$p: documents what to do first" in_block "$text" '^  documentation \{'
done
for p in IAM KEYS RUN SECURITY; do
  text="${!p}"
  check "$p: is a log-match alert" in_block "$text" 'condition_matched_log \{'
  check "$p: notifies at most once per 5 minutes" in_block "$text" 'period += "300s"'
  check "$p: reads the Admin Activity audit log" in_block "$text" '^ +logName = "\$\{local\.audit_activity_log\}"$'
done
check "the audit log is the project's Admin Activity log" \
  grep -qE '^  audit_activity_log += "projects/\$\{var\.project_id\}/logs/cloudaudit\.googleapis\.com%2Factivity"$' "$MON"

# --- Log filters (checked against the project's audit log, task 092) ---
# The method regexes live in locals, as plain strings with no backslash: Terraform heredocs keep a backslash as
# is, and Cloud Logging reads "\\." in a filter as a literal backslash, so an escaped dot matches nothing
# (a filter of task 092's first version did). Literal dots are written [.] instead.
# A regex from local.log_alert_methods (`  name = "regex"`), or the security list joined with |.
method_re() { # name
  if [ "$1" = security_config ]; then
    awk '/^  security_config_methods = \[$/ { inside = 1; next } inside && /^  \]$/ { exit }
         inside { line = $0; sub(/^ +"/, "", line); sub(/",?( *#.*)?$/, "", line); printf "%s%s", sep, line; sep = "|" }' "$MON"
  else
    awk -v name="$1" '/^  log_alert_methods = \{$/ { inside = 1; next } inside && /^  \}$/ { exit }
         inside && $1 == name { line = $0; sub(/^[^"]*"/, "", line); sub(/"$/, "", line); print line; exit }' "$MON"
  fi
}
matches() { # regex, method name: Perl's regex, which reads these patterns like RE2
  [ -n "$1" ] && perl -e 'exit(($ARGV[1] =~ /$ARGV[0]/) ? 0 : 1)' "$1" "$2"
}
no_backslash() { [ -n "$1" ] && ! grep -qF '\' <<<"$1"; }
for name in iam_policy service_account_key run_service security_config; do
  check "$name: the regex has no backslash (Logging would read it literally)" no_backslash "$(method_re "$name")"
done
check "no methodName filter in monitoring.tf has a backslash" bash -c "! grep -E 'methodName' '$MON' | grep -qF '\\'"
check "IAM: filters on local.log_alert_methods.iam_policy" in_block "$IAM" 'protoPayload\.methodName =~ "\$\{local\.log_alert_methods\.iam_policy\}"$'
check "keys: filters on local.log_alert_methods.service_account_key" in_block "$KEYS" 'protoPayload\.methodName =~ "\$\{local\.log_alert_methods\.service_account_key\}"$'
check "run: filters on local.log_alert_methods.run_service" in_block "$RUN" 'protoPayload\.methodName =~ "\$\{local\.log_alert_methods\.run_service\}"$'
check "security: filters on every local.security_config_methods" in_block "$SECURITY" 'protoPayload\.methodName =~ "\$\{join\("\|", local\.security_config_methods\)\}"$'
check "security: leaves out no one (not even the deployers)" not_in_block "$SECURITY" 'principalEmail'

# Method names from the project's audit log and the APIs' docs: each must match its alert, or not.
table() { # yes|no, regex name, method...
  local want="$1" name="$2" re m; shift 2; re="$(method_re "$name")"
  for m in "$@"; do
    if [ "$want" = yes ]; then check "$name matches $m" matches "$re" "$m"
    else check "$name doesn't match $m" bash -c '[ -n "$1" ] && ! perl -e '"'"'exit(($ARGV[1] =~ /$ARGV[0]/) ? 0 : 1)'"'"' "$1" "$2"' _ "$re" "$m"; fi
  done
}
table yes iam_policy SetIamPolicy google.iam.admin.v1.SetIAMPolicy storage.setIamPermissions \
  google.cloud.secretmanager.v1.SecretManagerService.SetIamPolicy google.cloud.run.v2.Services.SetIamPolicy \
  google.devtools.artifactregistry.v1.ArtifactRegistry.SetIamPolicy
table no iam_policy GetIamPolicy google.iam.admin.v1.GetIAMPolicy storage.getIamPermissions \
  google.cloud.run.v2.Services.TestIamPermissions SetIamPolicyX
table yes service_account_key google.iam.admin.v1.CreateServiceAccountKey google.iam.admin.v1.UploadServiceAccountKey
table no service_account_key google.iam.admin.v1.DeleteServiceAccountKey google.iam.admin.v1.CreateServiceAccount \
  google_iam_admin_v1_CreateServiceAccountKey
table yes run_service google.cloud.run.v1.Services.ReplaceService google.cloud.run.v2.Services.UpdateService \
  google.cloud.run.v1.Services.CreateService google.cloud.run.v2.Services.CreateService \
  google.cloud.run.v1.Services.DeleteService google.cloud.run.v2.Services.DeleteService
table no run_service google.cloud.run.v2.Services.GetService google.cloud.run.v2.Jobs.CreateJob \
  google.cloud.run.v2.Revisions.DeleteRevision google.cloud.run.v3.Services.UpdateService
table yes security_config \
  google.iam.v1.WorkloadIdentityPools.CreateWorkloadIdentityPool google.iam.v1.WorkloadIdentityPools.UpdateWorkloadIdentityPool \
  google.iam.v1.WorkloadIdentityPools.DeleteWorkloadIdentityPool google.iam.v1.WorkloadIdentityPools.UndeleteWorkloadIdentityPool \
  google.iam.v1.WorkloadIdentityPools.CreateWorkloadIdentityPoolProvider google.iam.v1.WorkloadIdentityPools.UpdateWorkloadIdentityPoolProvider \
  google.iam.v1.WorkloadIdentityPools.DeleteWorkloadIdentityPoolProvider google.iam.v1.WorkloadIdentityPools.UndeleteWorkloadIdentityPoolProvider \
  google.iam.admin.v1.CreateRole google.iam.admin.v1.UpdateRole google.iam.admin.v1.DeleteRole google.iam.admin.v1.UndeleteRole \
  storage.hmacKeys.create \
  google.cloud.secretmanager.v1.SecretManagerService.AddSecretVersion google.cloud.secretmanager.v1.SecretManagerService.DisableSecretVersion \
  google.cloud.secretmanager.v1.SecretManagerService.DestroySecretVersion google.cloud.secretmanager.v1.SecretManagerService.DeleteSecret \
  cloudsql.users.create cloudsql.users.update cloudsql.users.delete cloudsql.instances.update \
  google.cloud.run.v1.Jobs.CreateJob google.cloud.run.v1.Jobs.ReplaceJob google.cloud.run.v2.Jobs.CreateJob google.cloud.run.v2.Jobs.UpdateJob \
  google.logging.v2.ConfigServiceV2.CreateSink google.logging.v2.ConfigServiceV2.UpdateSink google.logging.v2.ConfigServiceV2.DeleteSink \
  google.logging.v2.ConfigServiceV2.CreateExclusion google.logging.v2.ConfigServiceV2.UpdateExclusion google.logging.v2.ConfigServiceV2.DeleteExclusion \
  storage.buckets.update \
  google.monitoring.v3.NotificationChannelService.UpdateNotificationChannel google.monitoring.v3.NotificationChannelService.DeleteNotificationChannel \
  google.monitoring.v3.AlertPolicyService.UpdateAlertPolicy google.monitoring.v3.AlertPolicyService.DeleteAlertPolicy
table no security_config cloudsql.instances.connect cloudsql.users.list google.iam.admin.v1.GetRole \
  google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion google.cloud.secretmanager.v1.SecretManagerService.GetSecret \
  storage.hmacKeys.list storage.buckets.get google.cloud.run.v2.Jobs.RunJob google.logging.v2.ConfigServiceV2.ListSinks \
  google.monitoring.v3.AlertPolicyService.ListAlertPolicies google.cloud.run.v1.Services.ReplaceService SetIamPolicy
check "run: leaves out the two deployers, by their Terraform emails" \
  in_block "$RUN" 'NOT protoPayload\.authenticationInfo\.principalEmail = \(.*google_service_account\.deployer'
check "run: the deployers are taken from local.environments (both of them)" \
  in_block "$RUN" 'for env in keys\(local\.environments\)'

# --- Metric alerts ---
check "5xx: counts Cloud Run requests of class 5xx" in_block "$ERRORS" 'metric\.label\.response_code_class = \\"5xx\\"'
check "5xx: is a ratio of all requests" in_block "$ERRORS" 'denominator_filter'
main_only() {
  grep -qE '^  main_services += sort\(\[for key, runtime in local\.runtimes : runtime\.service_name if runtime\.environment == "main"\]\)$' "$MON" &&
    [ "$(grep -cE 'service_name = one_of\(\$\{join\(", ", \[for name in local\.main_services : ' <<<"$ERRORS")" -eq 3 ] &&
    ! grep -qE 'local\.runtimes' <<<"$ERRORS"
}
check "5xx: on main's services only (every filter)" main_only
check "5xx: per service" in_block "$ERRORS" 'group_by_fields += \["resource\.label\.service_name"\]'
check "5xx: above 5%" in_block "$ERRORS" 'threshold_value += 0\.05$'
check "5xx: over 5 minutes" in_block "$ERRORS" 'alignment_period += "300s"'
check "5xx: greater than" in_block "$ERRORS" 'comparison += "COMPARISON_GT"'
check "5xx: both conditions must hold for the same service" in_block "$ERRORS" '^  combiner += "AND_WITH_MATCHING_RESOURCE"$'
check "5xx: two conditions" test "$(grep -cE '^  conditions \{$' <<<"$ERRORS")" -eq 2
check "5xx: and at least 3 errors in the window (more than 2)" in_block "$ERRORS" 'threshold_value += 2 # at least 3'
check "sql: counts Postgres backends" in_block "$SQL" 'cloudsql\.googleapis\.com/database/postgresql/num_backends'
check "sql: on the app instance" in_block "$SQL" 'google_sql_database_instance\.main\.name'
check "sql: above 80% of the login connections" in_block "$SQL" 'threshold_value += local\.sql_connection_alert$'
check "sql: db-f1-micro allows 25 connections" bash -c "awk '/^  sql_max_connections = \\{\$/,/^  \\}\$/' '$MON' | grep -qE '^    \"db-f1-micro\" += 25\$'"
check "sql: 80% of the tier's connections minus 3 reserved" \
  grep -qE '^  sql_connection_alert += 0\.8 \* \(lookup\(local\.sql_max_connections, var\.db_tier, 0\) - 3\)' "$MON"
check "sql: refuses a tier it doesn't know" in_block "$SQL" 'condition += contains\(keys\(local\.sql_max_connections\), var\.db_tier\)'

check "sql: for 5 minutes" in_block "$SQL" 'duration += "300s"'

# --- Budget ---
check "the budget exists" test -n "$BUDGET"
check "budget: on var.billing_account" in_block "$BUDGET" 'billing_account += var\.billing_account'
check "budget: of var.monthly_budget" in_block "$BUDGET" 'units += tostring\(var\.monthly_budget\)'
check "budget: in var.budget_currency (the billing account's currency)" in_block "$BUDGET" 'currency_code += var\.budget_currency'
check "budget: this project only" in_block "$BUDGET" 'projects += \["projects/\$\{data\.google_project\.this\.number\}"\]'
check "budget: at 50%, 90% and 100%" grep -qE '^  budget_thresholds += \[0\.5, 0\.9, 1(\.0)?\]$' "$MON"
check "budget: one rule per threshold" in_block "$BUDGET" 'for_each += local\.budget_thresholds'
check "budget: also emails the channel" in_block "$BUDGET" 'monitoring_notification_channels += \[google_monitoring_notification_channel\.email\.id\]'
check "budget: still emails the billing admins" not_in_block "$BUDGET" 'disable_default_iam_recipients += true'
check "budget: sends a quota project (the API needs one with user credentials)" in_block "$BUDGET" 'provider += google\.billing'
check "the billing provider bills the project" in_block "$(block "$MON" 'provider "google"')" 'user_project_override += true'

# --- Probes: each check above catches the change it is for ---
if [ -z "${TEST_MONITORING_PROBE:-}" ]; then
  PROBE_DIR="$(mktemp -d)"; trap 'rm -rf "$PROBE_DIR"' EXIT
  probe() { # expected FAIL text (empty: the copy must pass), shell command run inside the copy
    local dir="$PROBE_DIR/p$((pass + fail))" out
    mkdir -p "$dir"
    cp "$INFRA"/*.tf "$EXAMPLE" "$dir/" 2>/dev/null
    (cd "$dir" && eval "$2") || return 1
    if [ -n "$1" ]; then # a probe whose edit matches nothing proves nothing
      local f changed=""
      for f in "$dir"/*; do cmp -s "$INFRA/${f##*/}" "$f" || changed=1; done
      [ -n "$changed" ] || return 1
    fi
    out="$(TEST_MONITORING_PROBE=1 TEST_MONITORING_INFRA="$dir" bash "$0" 2>&1)"
    if [ -z "$1" ]; then grep -q ', 0 failed$' <<<"$out"; else grep -qF -- "FAIL - $1" <<<"$out"; fi
  }
  check "probe: an unchanged copy passes" probe "" true
  check "probe: a default address is caught" probe "variable alert_email has no default" \
    "perl -0pi -e 's/(variable \"alert_email\" \\{\n)/\$1  default = \"\"\n/' variables.tf"
  check "probe: a real address in a .tf file is caught" probe "no email address in infra/*.tf" \
    "printf '# alerts go to someone@gmail.com\n' >> monitoring.tf"
  check "probe: a billing id in a .tf file is caught" probe "no billing account id in infra/*.tf" \
    "printf '# billing 01A2B3-C4D5E6-F7A8B9\n' >> monitoring.tf"
  check "probe: an address that isn't a placeholder in the example is caught" probe "terraform.tfvars.example's address is a placeholder" \
    "perl -pi -e 's/\@example\\.com/\@gmail.com/' terraform.tfvars.example"
  check "probe: a visible address is caught" probe "alert_email is sensitive" \
    "perl -0pi -e 's/(variable \"alert_email\" \\{.*?)\n  sensitive += true/\$1/s' variables.tf"
  check "probe: a policy without the channel is caught" probe "KEYS: notifies the email channel" \
    "perl -0pi -e 's/(resource \"google_monitoring_alert_policy\" \"service_account_key\" \\{.*?)notification_channels += \\[[^\\]]*\\]/\$1notification_channels = []/s' monitoring.tf"
  check "probe: no rate limit on a log alert is caught" probe "RUN: notifies at most once per 5 minutes" \
    "perl -0pi -e 's/(resource \"google_monitoring_alert_policy\" \"run_change_outside_ci\" \\{.*?)period += \"300s\"/\$1period = \"3600s\"/s' monitoring.tf"
  check "probe: dropping the deployer exclusion is caught" probe "run: leaves out the two deployers" \
    "perl -pi -e 's/NOT protoPayload\\.authenticationInfo\\.principalEmail/protoPayload.authenticationInfo.principalEmail/' monitoring.tf"
  check "probe: a backslash-escaped dot is caught" probe "run_service: the regex has no backslash" \
    "perl -pi -e 's/\\^google\\[\\.\\]cloud/^google\\\\\\\\.cloud/' monitoring.tf"
  check "probe: an IAM regex that matches GetIamPolicy is caught" probe "iam_policy doesn't match GetIamPolicy" \
    "perl -pi -e 's/\\(setiampolicy\\|/(iampolicy|/' monitoring.tf"
  check "probe: dropping Secret Manager from the security alert is caught" probe "security_config matches google.cloud.secretmanager.v1.SecretManagerService.AddSecretVersion" \
    "perl -ni -e 'print unless /secretmanager/ && /AddSecretVersion/' monitoring.tf"
  check "probe: dropping the alert policy deletes from the security alert is caught" probe "security_config matches google.monitoring.v3.AlertPolicyService.DeleteAlertPolicy" \
    "perl -ni -e 'print unless /AlertPolicyService/' monitoring.tf"
  check "probe: dropping the 5xx count condition's combiner is caught" probe "5xx: both conditions must hold" \
    "perl -pi -e 's/AND_WITH_MATCHING_RESOURCE/OR/' monitoring.tf"
  check "probe: dropping the tier precondition is caught" probe "sql: refuses a tier it doesn't know" \
    "perl -pi -e 's/condition( +)= contains\\(keys\\(local\\.sql_max_connections\\), var\\.db_tier\\)/condition\$1= true/' monitoring.tf"
  check "probe: a 10% threshold is caught" probe "5xx: above 5%" "perl -pi -e 's/threshold_value( +)= 0\\.05/threshold_value\${1}= 0.1/' monitoring.tf"
  check "probe: 5xx on previews too is caught" probe "5xx: on main's services only" \
    "perl -pi -e 's/ if runtime\\.environment == \"main\"//' monitoring.tf"
  check "probe: a missing budget threshold is caught" probe "budget: at 50%, 90% and 100%" \
    "perl -pi -e 's/\\[0\\.5, 0\\.9, /[0.5, /' monitoring.tf"
  check "probe: a hard-coded amount is caught" probe "budget: of var.monthly_budget" \
    "perl -pi -e 's/tostring\\(var\\.monthly_budget\\)/\"25\"/' monitoring.tf"
  check "probe: silencing the billing admins is caught" probe "budget: still emails the billing admins" \
    "perl -0pi -e 's/(monitoring_notification_channels += \\[google_monitoring_notification_channel\\.email\\.id\\])/\$1\n    disable_default_iam_recipients = true/' monitoring.tf"
  check "probe: dropping the Billing Budget API is caught" probe "enables the Billing Budget API" \
    "perl -ni -e 'print unless /billingbudgets/' main.tf"
fi

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
