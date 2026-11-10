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

  # db-f1-micro allows 25 connections, 3 of them reserved for Cloud SQL's superusers: 80% of the 22 left.
  # Change it with var.db_tier (README, Known limits).
  sql_connection_alert = 0.8 * (25 - 3)

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
        protoPayload.methodName =~ "(?i)(setiampolicy|setiampermissions)$"
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
        protoPayload.methodName =~ "^google\\.iam\\.admin\\.v1\\.(Create|Upload)ServiceAccountKey$"
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
      # Terraform creates and updates through v2.
      filter = <<-EOT
        logName = "${local.audit_activity_log}"
        protoPayload.methodName =~ "^google\\.cloud\\.run\\.v[12]\\.Services\\.(Create|Replace|Update|Delete)Service$"
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

# ---------- Metric alerts ----------
resource "google_monitoring_alert_policy" "main_5xx" {
  display_name          = "main: more than 5% 5xx responses"
  combiner              = "OR"
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

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = <<-EOT
      More than 5% of a `main` service's requests failed with 5xx over 5 minutes (at low traffic a single error can
      do it). First: the service's error logs (`resource.type="cloud_run_revision" severity>=ERROR`). If the latest
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
      currency_code = "USD" # must be the billing account's currency
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
