# GCP Deployment Strategy

## 🎯 Overview

**Purpose**: Google Cloud Platform deployment patterns, service integration, and infrastructure automation for scalable applications.

**Scope**: GCP service selection, deployment automation, cost optimization, and operational excellence within the Google Cloud ecosystem.

**Prerequisites**: GCP account setup, service account configuration, and basic familiarity with Google Cloud services.

---

## 🚀 Quick Start Decision Tree

```
Do you need GCP deployment?
├─ Yes → What type of application?
│  ├─ Containerized → Consider [Cloud Run](#serverless-containers) (serverless) or [GKE](#kubernetes-deployment)
│  ├─ Web Application → Use [App Engine](#app-engine-deployment)
│  └─ Custom Infrastructure → Use [Compute Engine](#traditional-deployment)
├─ No → Consider [other cloud providers](README.md)
└─ Unsure → Review [GCP Service Selection](#service-selection)
```

---

## 📋 Service Selection Matrix

| Use Case | Compute Service | Database | Storage | Deployment Method |
|----------|----------------|----------|---------|-------------------|
| **Web App** | Cloud Run/App Engine | Cloud SQL | Cloud Storage | Cloud Build |
| **API Service** | Cloud Functions/Run | Firestore | Cloud Storage | Cloud Build |
| **Enterprise** | GKE | Cloud SQL HA | Cloud Storage/Filestore | Terraform |
| **Microservices** | GKE/Cloud Run | Multiple Cloud SQL | Cloud Storage | Service Mesh |

---

## 🔧 Deployment Patterns

### Serverless Containers

**Best for**: Containerized applications, auto-scaling, pay-per-use model.

**Cloud Run Deployment**:

```yaml
# cloudbuild.yaml
steps:
  # Build container image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/app:$COMMIT_SHA', '.']
  
  # Push to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/app:$COMMIT_SHA']
  
  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'app'
      - '--image=gcr.io/$PROJECT_ID/app:$COMMIT_SHA'
      - '--platform=managed'
      - '--region=us-central1'
      - '--allow-unauthenticated'
      - '--set-env-vars=NODE_ENV=production'
      - '--max-instances=100'
      - '--concurrency=80'

substitutions:
  _SERVICE_NAME: app
  _REGION: us-central1
```

**Cloud Run Service Configuration**:

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: app
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/cpu-throttling: "false"
        run.googleapis.com/execution-environment: gen2
    spec:
      containerConcurrency: 80
      containers:
      - image: gcr.io/PROJECT_ID/app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        resources:
          limits:
            memory: "512Mi"
            cpu: "1000m"
```

### App Engine Deployment

**Best for**: Traditional web applications, integrated services, managed infrastructure.

```yaml
# app.yaml
runtime: nodejs18

env_variables:
  NODE_ENV: production
  DATABASE_URL: ${DATABASE_URL}

automatic_scaling:
  min_instances: 1
  max_instances: 10
  target_cpu_utilization: 0.6

resources:
  cpu: 1
  memory_gb: 1
  disk_size_gb: 10

handlers:
- url: /_ah/health
  script: auto
  
- url: /static
  static_dir: public
  
- url: /.*
  script: auto
  secure: always
  redirect_http_response_code: 301
```

### Kubernetes Deployment

**Best for**: Complex orchestration, microservices, enterprise workloads.

**GKE Cluster Configuration**:

```yaml
# terraform/gke-cluster.tf
resource "google_container_cluster" "primary" {
  name               = "app-cluster"
  location           = "us-central1"
  initial_node_count = 1

  # Enable Autopilot for managed Kubernetes
  enable_autopilot = true

  # Network configuration
  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name

  # Security configuration
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }

  # Workload Identity for secure pod access
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
}
```

**Application Deployment**:

```yaml
# k8s/app-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      serviceAccountName: app-ksa
      containers:
      - name: app
        image: gcr.io/PROJECT_ID/app:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

---

## 🛠️ Infrastructure Setup

### Core GCP Services Configuration

**VPC Network and Security**:

```terraform
# terraform/network.tf
resource "google_compute_network" "vpc" {
  name                    = "app-vpc"
  auto_create_subnetworks = false
  routing_mode           = "REGIONAL"
}

resource "google_compute_subnetwork" "subnet" {
  name          = "app-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = "us-central1"
  network       = google_compute_network.vpc.id

  secondary_ip_range {
    range_name    = "services-range"
    ip_cidr_range = "10.1.0.0/24"
  }

  secondary_ip_range {
    range_name    = "pod-ranges"
    ip_cidr_range = "10.2.0.0/16"
  }
}

resource "google_compute_firewall" "allow_internal" {
  name    = "allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  source_ranges = ["10.0.0.0/8"]
}
```

**Cloud SQL Database**:

```terraform
# terraform/database.tf
resource "google_sql_database_instance" "main" {
  name             = "app-db-instance"
  database_version = "POSTGRES_15"
  region           = "us-central1"

  settings {
    tier                        = "db-f1-micro"
    availability_type          = "REGIONAL"
    disk_type                  = "PD_SSD"
    disk_size                  = 20
    disk_autoresize           = true
    disk_autoresize_limit     = 100

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      location                       = "us"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
      require_ssl     = true
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "database" {
  name     = "app"
  instance = google_sql_database_instance.main.name
}
```

### Security Configuration

**Service Accounts and IAM**:

```terraform
# terraform/iam.tf
resource "google_service_account" "app_sa" {
  account_id   = "app-service-account"
  display_name = "Application Service Account"
  description  = "Service account for the application"
}

# Workload Identity binding for GKE
resource "google_service_account_iam_binding" "workload_identity" {
  service_account_id = google_service_account.app_sa.name
  role               = "roles/iam.workloadIdentityUser"

  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[production/app-ksa]"
  ]
}

# Application-specific permissions
resource "google_project_iam_member" "app_permissions" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectViewer"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}
```

---

## 🔄 CI/CD Integration

### Cloud Build with GitHub

```yaml
# cloudbuild.yaml
steps:
  # Run tests
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['ci']
  
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['test']

  # Build Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: [
      'build',
      '-t', 'gcr.io/$PROJECT_ID/app:$COMMIT_SHA',
      '-t', 'gcr.io/$PROJECT_ID/app:latest',
      '.'
    ]

  # Push to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '--all-tags', 'gcr.io/$PROJECT_ID/app']

  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'app'
      - '--image=gcr.io/$PROJECT_ID/app:$COMMIT_SHA'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'

# Build triggers
trigger:
  github:
    owner: 'your-org'
    name: 'your-repo'
    push:
      branch: '^main$'

options:
  logging: CLOUD_LOGGING_ONLY
  substitution_option: ALLOW_LOOSE
```

### GitHub Actions with GCP

```yaml
# .github/workflows/deploy-gcp.yml
name: Deploy to GCP

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build and push Docker image
        run: |
          docker build -t gcr.io/${{ secrets.GCP_PROJECT_ID }}/app:${{ github.sha }} .
          docker push gcr.io/${{ secrets.GCP_PROJECT_ID }}/app:${{ github.sha }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy app \
            --image gcr.io/${{ secrets.GCP_PROJECT_ID }}/app:${{ github.sha }} \
            --platform managed \
            --region us-central1 \
            --allow-unauthenticated
```

---

## 💰 Cost Optimization

### Cost Management Strategies

**Right-sizing and Auto-scaling**:
- Use sustained use discounts for long-running workloads
- Implement auto-scaling for variable workloads
- Monitor usage with Cloud Monitoring

**Preemptible and Spot Instances**:
- Use preemptible VMs for fault-tolerant workloads
- Implement proper handling for instance preemption
- Leverage Spot VMs for batch processing

**Resource Management**:
- Use committed use contracts for predictable workloads
- Implement resource quotas and budgets
- Optimize storage with lifecycle policies

---

## 📊 Monitoring and Observability

### Cloud Monitoring Integration

```terraform
# terraform/monitoring.tf
resource "google_monitoring_dashboard" "app_dashboard" {
  dashboard_json = jsonencode({
    displayName = "Application Dashboard"
    mosaicLayout = {
      tiles = [
        {
          width = 6
          height = 4
          widget = {
            title = "Cloud Run Request Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod = "60s"
                      perSeriesAligner = "ALIGN_RATE"
                    }
                  }
                }
              }]
            }
          }
        }
      ]
    }
  })
}

resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx errors"
    
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\""
      duration        = "60s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 0.05

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [
    google_monitoring_notification_channel.email.id
  ]
}
```

---

## 🔐 Security Best Practices

### Security Implementation Checklist

- [ ] **IAM Least Privilege**: Use service accounts with minimal permissions
- [ ] **VPC Security**: Implement private networks and firewall rules
- [ ] **Encryption**: Enable encryption at rest and in transit
- [ ] **Secret Management**: Use Secret Manager for sensitive data
- [ ] **Audit Logging**: Enable Cloud Audit Logs for compliance
- [ ] **Binary Authorization**: Ensure only verified images are deployed
- [ ] **Workload Identity**: Secure pod-to-GCP service communication

---

## 🚀 Next Steps

1. **Choose Deployment Pattern**: Select based on application architecture
2. **Set Up Infrastructure**: Use Terraform for infrastructure as code
3. **Configure CI/CD**: Implement Cloud Build or GitHub Actions pipeline
4. **Enable Monitoring**: Set up Cloud Monitoring dashboards and alerts
5. **Optimize Costs**: Implement cost monitoring and resource optimization

---

## 🔗 Related Resources

- **[Infrastructure as Code](../infrastructure-as-code/README.md)**: IaC implementation patterns
- **[Container Orchestration](../container-orchestration/README.md)**: Kubernetes and Docker strategies
- **[Deployment Patterns](../deployment-patterns/README.md)**: General deployment strategies
- **[Cost Optimization](cost-optimization.md)**: Multi-cloud cost management

---

**Next**: [Vercel Deployment](vercel-deployment.md) | **Previous**: [AWS Deployment](aws-deployment.md)