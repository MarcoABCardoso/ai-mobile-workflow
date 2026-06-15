# infra/gcp/dev/main.tf
# GCP dev environment baseline — provisioned by bootstrap skill (Step 5).
# Covers: service account, Secret Manager, Artifact Registry, Cloud Run.
# Firebase Auth is enabled via CLI after this apply — see bootstrap skill Step 5.
#
# Deploy:
#   cp terraform.tfvars.example terraform.tfvars   # fill in values
#   terraform init && terraform apply

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ─── Variables ──────────────────────────────────────────────────────────────────

variable "project_id" {
  description = "GCP project ID (bootstrap-seed.json → subscription_id)"
  type        = string
}

variable "project_name" {
  description = "Project name — lowercase hyphens only, max 32 chars"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,31}$", var.project_name))
    error_message = "project_name must be lowercase, start with a letter, hyphens allowed, max 32 chars."
  }
}

variable "region" {
  description = "GCP region (e.g. us-central1)"
  type        = string
}

variable "github_org" {
  description = "GitHub org or username — stored in resource labels"
  type        = string
}

# ─── Locals ─────────────────────────────────────────────────────────────────────

locals {
  # Service account IDs: max 30 chars. Truncate project_name to 22 chars + "-dev-sa" = 29 chars.
  sa_id = "${substr(var.project_name, 0, min(length(var.project_name), 22))}-dev-sa"

  labels = {
    project     = var.project_name
    environment = "dev"
    # Label values can't contain slashes (e.g. org/repo) — replace with hyphens
    owner      = replace(var.github_org, "/", "-")
    ai-managed = "true"
  }
}

# ─── Enable required APIs ────────────────────────────────────────────────────────

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "firebase.googleapis.com",
    "identityplatform.googleapis.com",  # required for Firebase Authentication
  ])
  service            = each.value
  disable_on_destroy = false
}

# ─── Service Account (runtime identity) ─────────────────────────────────────────

resource "google_service_account" "app" {
  account_id   = local.sa_id
  display_name = "${var.project_name} dev runtime"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.app.email}"

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.app.email}"

  depends_on = [google_project_service.apis]
}

# ─── Secret Manager (secrets store) ─────────────────────────────────────────────
# Bootstrap creates one placeholder secret. Real values are written by CI/CD —
# never committed. Add secrets here as services require them.

resource "google_secret_manager_secret" "app_config" {
  secret_id = "${var.project_name}-dev-config"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ─── Artifact Registry ──────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "images" {
  repository_id = "${var.project_name}-dev"
  format        = "DOCKER"
  location      = var.region
  description   = "${var.project_name} dev container images"
  labels        = local.labels

  depends_on = [google_project_service.apis]
}

# ─── Cloud Run — first service placeholder ──────────────────────────────────────
# Bootstrap skill replaces 'api' with the first service from bootstrap-seed.json.
# Add one resource block per additional service (copy this block, change the name).

resource "google_cloud_run_v2_service" "api" {
  name     = "${var.project_name}-dev-api"
  location = var.region
  labels   = local.labels
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app.email
    labels          = local.labels

    scaling {
      min_instance_count = 0   # scale to zero when idle — dev cost saving
      max_instance_count = 3
    }

    containers {
      # Placeholder image — replaced on first deploy by CI/CD
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true   # only bill when processing a request
      }

      env {
        name  = "NODE_ENV"
        value = "development"
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Allow unauthenticated HTTP requests — auth is enforced by the application
# via Firebase JWT validation, not at the Cloud Run ingress layer.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = google_cloud_run_v2_service.api.project
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Outputs ────────────────────────────────────────────────────────────────────
# Bootstrap skill stores these in infra/bootstrap.json after provisioning.

output "service_account_email" {
  description = "Runtime service account — reference in CI/CD and app config"
  value       = google_service_account.app.email
}

output "artifact_registry_url" {
  description = "Docker registry URL — use as REGISTRY in deploy-prod.yml"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "cloud_run_url" {
  description = "Cloud Run service URL — use as PRODUCTION_URL in CI secrets"
  value       = google_cloud_run_v2_service.api.uri
}

output "secret_manager_prefix" {
  description = "Secret Manager path prefix — use when writing secrets from bootstrap Step 5"
  value       = "projects/${var.project_id}/secrets/${var.project_name}-dev"
}
