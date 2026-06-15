# infra/gcp/dev/main.tf
# Starter IaC template for GCP dev environment.
# Provisions: Cloud Run, Artifact Registry, Secret Manager.
# Firebase Auth is added separately via the Firebase CLI (see bootstrap skill Step 5).
# Copy as-is to new projects — variables are supplied via terraform.tfvars.
#
# Usage:
#   cd infra/gcp/dev
#   terraform init
#   terraform apply

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "project_name" {
  description = "Project name (lowercase, hyphens). Used for resource naming and labels."
  type        = string
}

variable "github_org" {
  description = "GitHub org or username (used for labels)"
  type        = string
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  env = "dev"
  labels = {
    project     = var.project_name
    environment = local.env
    owner       = var.github_org
    ai-managed  = "true"
  }
}

# ── Enable required APIs ──────────────────────────────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ── Artifact Registry ───────────────────────────────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "registry" {
  repository_id = "${var.project_name}-${local.env}"
  location      = var.region
  format        = "DOCKER"
  description   = "Container images for ${var.project_name} ${local.env}"
  labels        = local.labels

  depends_on = [google_project_service.apis]
}

# ── Cloud Run service (API) ─────────────────────────────────────────────────────────────────────────────
# One service per entry in bootstrap-seed.json services[]. Add more blocks as needed.
resource "google_cloud_run_v2_service" "api" {
  name     = "${var.project_name}-api"
  location = var.region
  labels   = local.labels

  template {
    scaling {
      min_instance_count = 0  # scales to zero when idle — $0 cost in dev
      max_instance_count = 3
    }
    timeout = "300s"  # realtime addon needs longer timeout for SSE connections

    containers {
      # Placeholder image — replaced by deploy-prod.yml on first deploy
      image = "gcr.io/cloudrun/hello"
      resources {
        limits = { memory = "512Mi", cpu = "1" }
        startup_cpu_boost = true
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Allow unauthenticated HTTPS access (auth is enforced at the application layer via Firebase Auth JWT)
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Secret Manager ────────────────────────────────────────────────────────────────────────────────────
resource "google_secret_manager_secret" "firebase_config" {
  secret_id = "${var.project_name}-${local.env}-firebase-config"
  labels    = { for k, v in local.labels : k => replace(v, "-", "_") }

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ── Outputs ────────────────────────────────────────────────────────────────────────────────────────────────
output "artifact_registry_url" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.registry.repository_id}"
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "firebase_config_secret" {
  value = google_secret_manager_secret.firebase_config.secret_id
}
