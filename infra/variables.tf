variable "project_id" {
  description = "GCP project ID that hosts the app."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Artifact Registry, Cloud SQL and the file buckets (this project: me-west1). Required, so a missing tfvars line can't create everything somewhere else."
  type        = string
}

variable "github_repository_id" {
  description = "Numeric id of the GitHub repo (gh api repos/<owner>/<name> --jq .id). Workload Identity checks it with the name."
  type        = string
  default     = "1424672458" # dror-rash/mng-projects
}

variable "github_repository" {
  description = "GitHub repo allowed to deploy, as owner/name."
  type        = string
}

variable "zones" {
  description = "Zone names. Each becomes a Cloud Run service named after it (must match apps/<name>)."
  type        = set(string)
  default     = ["shell", "example-zone", "dashboard"]

  validation {
    condition     = contains(var.zones, "shell") && contains(var.zones, "dashboard")
    error_message = "zones must include \"shell\" (the public origin) and \"dashboard\" (it owns the file buckets)."
  }
}

variable "min_instances" {
  description = "Minimum Cloud Run instances per zone. 0 = scale to zero (cheapest, has cold starts)."
  type        = number
  default     = 0
}

variable "preview_max_instances" {
  description = "Maximum Cloud Run instances per revision of a preview service (each open PR's tagged revision can scale to this; provider 6.50 has no service-wide maximum). preview_runtime's CONNECTION LIMIT bounds the total (provision-db-logins.mjs)."
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum Cloud Run instances per main service (previews use preview_max_instances). Bounded by main's database connections: zones x max_instances x MAIN_DB_POOL_MAX must fit MAIN_DB_CONNECTIONS (infra/scripts/environment.sh; test-environment.sh fails otherwise), today 3 x 1 x 4 = 12. A burst queues or gets 429s instead of exhausting connections. Raise it with a bigger Cloud SQL tier or a pooler (infra/README.md, Known limits)."
  type        = number
  default     = 1
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is the cheapest; use a dedicated-core tier for production load."
  type        = string
  default     = "db-f1-micro"
}

variable "db_deletion_protection" {
  description = "Block terraform destroy of the database instance."
  type        = bool
  default     = true
}
