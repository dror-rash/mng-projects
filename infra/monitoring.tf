# ---------- Alerts and budget (task 092, register SEC-17) ----------
# Email to the owner when someone changes IAM, creates a service-account key or changes a Cloud Run service outside
# CI, when main starts failing, when the database runs out of connections, and when spend passes 50/90/100% of the
# monthly budget. The address, the billing account and the amount are in terraform.tfvars only (variables.tf).
# The log filters were checked against the project's Admin Activity audit log. What to do first for each alert is
# in its documentation (shown in the email) and in infra/README.md.
locals {
  audit_activity_log = "projects/${var.project_id}/logs/cloudaudit.googleapis.com%2Factivity"

  # Main's Cloud Run services (one per zone).
  main_services = sort([for key, runtime in local.runtimes : runtime.service_name if runtime.environment == "main"])

  # Cloud SQL's default max_connections per tier, 3 of them reserved for its superusers. The connection alert
  # fires above 80% of the rest (db-f1-micro: 22, so 17.6). A tier not listed here fails the plan (precondition
  # on google_monitoring_alert_policy.sql_connections): add its limit when var.db_tier changes.
  sql_max_connections = {
    "db-f1-micro" = 25
    "db-g1-small" = 50
  }
  sql_connection_alert = 0.8 * (lookup(local.sql_max_connections, var.db_tier, 0) - 3)

  # Method-name regexes of the log alerts, as Cloud Logging receives them (RE2). No backslashes: a Terraform
  # heredoc keeps every backslash as written, and Logging reads "\\." as a literal backslash, so it matches nothing.
  # Literal dots are [.]. infra/scripts/test-monitoring.sh runs them against known method names.
  log_alert_methods = {
    iam_policy          = "(?i)(setiampolicy|setiampermissions)$"
    service_account_key = "^google[.]iam[.]admin[.]v1[.](Create|Upload)ServiceAccountKey$"
    run_service         = "^google[.]cloud[.]run[.]v[12][.]Services[.](Create|Replace|Update|Delete)Service$"
  }

  # Changes to what guards the project, by anyone (deployers included): joined with | into one filter.
  security_config_methods = [
    "^google[.]iam[.]v1[.]WorkloadIdentityPools[.](Create|Update|Delete|Undelete)WorkloadIdentityPool(Provider)?$",
    "^google[.]iam[.]admin[.]v1[.](Create|Update|Delete|Undelete)Role$", # custom roles (runDeployer)
    "^storage[.]hmacKeys[.]create$",
    "^google[.]cloud[.]secretmanager[.]v1[.]SecretManagerService[.](AddSecretVersion|DisableSecretVersion|DestroySecretVersion|DeleteSecret)$",
    "^cloudsql[.]users[.](create|update|delete)$",
    "^cloudsql[.]instances[.]update$",
    "^google[.]cloud[.]run[.]v[12][.]Jobs[.](Create|Replace|Update)Job$",
    "^google[.]logging[.]v2[.]ConfigServiceV2[.](Create|Update|Delete)(Sink|Exclusion)$",
    "^storage[.]buckets[.]update$",
    "^google[.]monitoring[.]v3[.]NotificationChannelService[.](Update|Delete)NotificationChannel$", # silencing
    "^google[.]monitoring[.]v3[.]AlertPolicyService[.](Update|Delete)AlertPolicy$",                 # silencing
  ]

  budget_thresholds = [0.5, 0.9, 1.0]
}

data "google_project" "this" {}

resource "google_monitoring_notification_channel" "email" {
  display_name = "Owner email (alerts)"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.enabled]
}

# ---------- Log-match alerts on the Admin Activity audit log (always on, free) ----------
resource "google_monitoring_alert_policy" "iam_policy_change" {
  display_name          = "IAM policy changed"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "SetIamPolicy on the project or any resource"
    condition_matched_log {
      # Project (SetIamPolicy), service account (google.iam.admin.v1.SetIAMPolicy), secret, Cloud Run service,
      # Artifact Registry repository, and bucket IAM (storage.setIamPermissions).
      filter = <<-EOT
        logName = "${local.audit_activity_log}"
        protoPayload.methodName =~ "${local.log_alert_methods.iam_policy}"
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      An IAM policy changed in the project. Expected after a `terraform apply` by the owner; nothing else changes IAM.
      First: open the log entry (Logs Explorer, the incident's link) and check the principal and the binding. If it
      wasn't you, remove the binding, then run `terraform plan` from `infra/` to see any other drift.
    EOT
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "service_account_key" {
  display_name          = "Service-account key created"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "CreateServiceAccountKey or UploadServiceAccountKey"
    condition_matched_log {
      filter = <<-EOT
        logName = "${local.audit_activity_log}"
        protoPayload.methodName =~ "${local.log_alert_methods.service_account_key}"
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      Someone created or uploaded a key for a service account. This project uses no keys (GitHub deploys through
      Workload Identity Federation). First: delete the key (`gcloud iam service-accounts keys list --iam-account=<sa>`,
      then `… keys delete`), then find who made it in the log entry and remove their access.
    EOT
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "run_change_outside_ci" {
  display_name          = "Cloud Run service changed outside CI"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Create, replace, update or delete a service, not by a deployer"
    condition_matched_log {
      # Deploys and tag cleanups replace the service as deployer-main or deployer-preview (v1 ReplaceService);
      # Terraform creates and updates through v2. Leaving the deployers out means a misused deployer (say,
      # deployer-main deploying something odd) isn't reported here: Workload Identity lets only pushes to main of
      # this repository use it, and the ruleset guards main. The filter relies on CI impersonating the deployer
      # service accounts (principalEmail is the account); with direct Workload Identity access it would be a
      # principal:// subject instead and every deploy would alert.
      filter = <<-EOT
        logName = "${local.audit_activity_log}"
        protoPayload.methodName =~ "${local.log_alert_methods.run_service}"
        NOT protoPayload.authenticationInfo.principalEmail = (${join(" OR ", [for env in keys(local.environments) : "\"${google_service_account.deployer[env].email}\""])})
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      A Cloud Run service was created, changed or deleted by someone other than the CI deployers. Expected after a
      `terraform apply` by the owner. First: check the principal in the log entry. If it wasn't you, look at the
      service's latest revision (`gcloud run revisions list --service <name> --region <region>`), route traffic back
      to the last revision CI deployed, or re-run the last Deploy run on `main`, and remove that principal's access.
    EOT
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "security_config_change" {
  display_name          = "Security config changed"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Workload Identity, custom roles, HMAC keys, secrets, SQL users, jobs, log sinks, buckets, alerts"
    condition_matched_log {
      filter = <<-EOT
        logName = "${local.audit_activity_log}"
        protoPayload.methodName =~ "${join("|", local.security_config_methods)}"
      EOT
    }
  }

  alert_strategy {
    notification_rate_limit {
      period = "300s"
    }
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      Something that guards the project changed: Workload Identity pool or provider, a custom role, an HMAC key,
      a secret version or secret, a Cloud SQL user or the instance, a Cloud Run job, a log sink or exclusion, a
      bucket's settings, or an alert policy or notification channel (silencing these alerts). Expected after a
      `terraform apply` by the owner. Otherwise: check the method and principal in the log entry, undo it
      (`terraform plan` from `infra/` shows the drift), and remove that principal's access. For a new secret
      version or SQL user password, rotate the secret.
    EOT
  }

  depends_on = [google_project_service.enabled]
}

# ---------- Metric alerts ----------
resource "google_monitoring_alert_policy" "main_5xx" {
  display_name = "main: more than 5% 5xx responses"
  # Both conditions for the same service: a single error at low traffic doesn't page.
  combiner              = "AND_WITH_MATCHING_RESOURCE"
  severity              = "ERROR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "5xx / all requests > 5% over 5 minutes, per main service"
    condition_threshold {
      filter             = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND resource.label.service_name = one_of(${join(", ", [for name in local.main_services : "\"${name}\""])}) AND metric.label.response_code_class = \"5xx\""
      denominator_filter = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND resource.label.service_name = one_of(${join(", ", [for name in local.main_services : "\"${name}\""])})"
      comparison         = "COMPARISON_GT"
      threshold_value    = 0.05
      duration           = "0s" # one 5-minute window is enough

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }
      denominator_aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "At least 3 5xx responses over 5 minutes, per main service"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND resource.label.service_name = one_of(${join(", ", [for name in local.main_services : "\"${name}\""])}) AND metric.label.response_code_class = \"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 2 # at least 3
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      More than 5% of a `main` service's requests, and at least 3 of them, failed with 5xx over 5 minutes. First: the service's error logs (`resource.type="cloud_run_revision" severity>=ERROR`). If the latest
      deploy caused it, route traffic back to the previous revision or revert the commit on `main`. "too many
      connections" points at the Cloud SQL connection alert.
    EOT
  }

  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "sql_connections" {
  display_name          = "Cloud SQL: connections above 80%"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Backends of all databases > 80% of the login connections for 5 minutes"
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND resource.label.database_id = \"${var.project_id}:${google_sql_database_instance.main.name}\" AND metric.type = \"cloudsql.googleapis.com/database/postgresql/num_backends\""
      comparison      = "COMPARISON_GT"
      threshold_value = local.sql_connection_alert
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.database_id"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      The database instance has used more than 80% of its login connections for 5 minutes (db-f1-micro: 22).
      First: see who holds them (`select usename, datname, state, count(*) from pg_stat_activity group by 1, 2, 3`
      as `app` through the Cloud SQL proxy). Previews can take at most 10 (README, Known limits); if `main` needs
      more, lower its `max_instances` or move to a bigger tier.
    EOT
  }

  lifecycle {
    precondition {
      condition     = contains(keys(local.sql_max_connections), var.db_tier)
      error_message = "Add var.db_tier's connection limit to local.sql_max_connections (infra/monitoring.tf) so the connection alert's threshold fits the tier."
    }
  }

  depends_on = [google_project_service.enabled]
}

# ---------- Budget ----------
# The Billing Budget API needs a quota project; with the owner's user credentials it takes it from this provider
# (billed to the project), so only the budget uses it. Creating a budget needs Billing Account Administrator or
# Costs Manager on the billing account (task 092: the owner applies it with their own account).
provider "google" {
  alias                 = "billing"
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

resource "google_billing_budget" "monthly" {
  provider        = google.billing
  billing_account = var.billing_account
  display_name    = "${var.project_id} monthly"

  budget_filter {
    projects        = ["projects/${data.google_project.this.number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency # must be the billing account's currency
      units         = tostring(var.monthly_budget)
    }
  }

  dynamic "threshold_rules" {
    for_each = local.budget_thresholds
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  # The billing account's admins still get the emails; the channel adds the owner's address.
  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.id]
  }

  depends_on = [google_project_service.enabled]
}
