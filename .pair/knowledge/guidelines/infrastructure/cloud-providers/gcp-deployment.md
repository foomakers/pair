# GCP Deployment Patterns

## Overview

Comprehensive guide for deploying applications on Google Cloud Platform, leveraging GCP's strengths in AI/ML, Kubernetes, and developer productivity.

## Core GCP Services for Deployment

### Compute Services

- **Compute Engine**: Virtual machines with custom machine types
- **Google Kubernetes Engine (GKE)**: Managed Kubernetes with autopilot mode
- **Cloud Run**: Fully managed serverless containers
- **Cloud Functions**: Event-driven serverless functions
- **App Engine**: Platform-as-a-service for web applications

### Storage and Database

- **Cloud Storage**: Object storage with global accessibility
- **Persistent Disk**: Block storage for compute instances
- **Cloud SQL**: Managed relational databases
- **Firestore**: NoSQL document database
- **BigQuery**: Data warehouse for analytics
- **Memorystore**: Managed Redis and Memcached

### Networking and Security

- **VPC**: Virtual private cloud with global reach
- **Cloud Load Balancing**: Global and regional load balancing
- **Cloud CDN**: Content delivery network
- **Cloud DNS**: Managed DNS service
- **Cloud IAM**: Identity and access management

## Deployment Architectures

### 1. Cloud-Native Microservices

```
Cloud Load Balancer (Global)
    ↓
GKE Cluster (Multi-regional)
    ↓
Cloud SQL (High Availability)
```

**Use Cases:** Modern applications, microservices, global scale
**Benefits:** Auto-scaling, fault tolerance, global reach
**GCP Advantages:** Best-in-class Kubernetes, global load balancing

### 2. Serverless-First Architecture

```
Cloud CDN
    ↓
Cloud Load Balancing
    ↓
Cloud Run Services
    ↓
Firestore/Cloud SQL
```

**Use Cases:** Event-driven applications, variable workloads
**Benefits:** Pay-per-use, automatic scaling, zero server management
**GCP Advantages:** Cloud Run's flexibility, seamless scaling

### 3. AI/ML-Enhanced Applications

```
Frontend (Cloud Run/GKE)
    ↓
AI Platform/Vertex AI
    ↓
BigQuery (Data Warehouse)
    ↓
Cloud Storage (Data Lake)
```

**Use Cases:** Data-driven applications, ML-powered features
**Benefits:** Integrated AI/ML services, scalable data processing
**GCP Advantages:** Industry-leading AI/ML services, BigQuery performance

## Infrastructure as Code with GCP

### Terraform Configuration

```hcl
# Configure the Google Cloud provider
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Create a VPC network
resource "google_compute_network" "vpc_network" {
  name                    = "terraform-network"
  auto_create_subnetworks = false
}

# Create a subnet
resource "google_compute_subnetwork" "default" {
  name          = "terraform-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.vpc_network.id
}

# Create GKE cluster
resource "google_container_cluster" "primary" {
  name     = "gke-cluster"
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc_network.name
  subnetwork = google_compute_subnetwork.default.name

  # Enable Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
}
```

### Deployment Manager Templates

```yaml
resources:
  - name: gke-cluster
    type: container.v1.cluster
    properties:
      zone: us-central1-a
      cluster:
        name: production-cluster
        nodeConfig:
          machineType: e2-standard-4
          diskSizeGb: 100
          oauthScopes:
            - https://www.googleapis.com/auth/devstorage.read_only
            - https://www.googleapis.com/auth/logging.write
            - https://www.googleapis.com/auth/monitoring
        initialNodeCount: 3
        autopilot:
          enabled: true
```

### Cloud Build Configuration

```yaml
steps:
  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/my-app:$COMMIT_SHA', '.']

  # Push the container image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/my-app:$COMMIT_SHA']

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'my-service'
      - '--image'
      - 'gcr.io/$PROJECT_ID/my-app:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'

images:
  - 'gcr.io/$PROJECT_ID/my-app:$COMMIT_SHA'
```

## GKE Deployment Patterns

### Autopilot vs Standard Mode

**GKE Autopilot:**

```yaml
apiVersion: container.v1
kind: Cluster
metadata:
  name: autopilot-cluster
spec:
  autopilot:
    enabled: true
  network: projects/PROJECT_ID/global/networks/default
  location: us-central1
```

**Benefits:** Fully managed nodes, optimal resource utilization, built-in security
**Use Cases:** Teams wanting minimal operational overhead

**GKE Standard:**

```yaml
apiVersion: container.v1
kind: Cluster
metadata:
  name: standard-cluster
spec:
  nodePools:
    - name: default-pool
      config:
        machineType: e2-standard-4
        diskSizeGb: 100
      initialNodeCount: 3
      autoscaling:
        enabled: true
        minNodeCount: 1
        maxNodeCount: 10
```

**Benefits:** Full control over nodes, custom machine types, specialized workloads
**Use Cases:** Teams needing specific configurations or compliance requirements

### Workload Identity Configuration

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: workload-identity-sa
  annotations:
    iam.gke.io/gcp-service-account: gsa-name@PROJECT_ID.iam.gserviceaccount.com
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workload-identity-deployment
spec:
  template:
    spec:
      serviceAccountName: workload-identity-sa
      containers:
        - name: app
          image: gcr.io/PROJECT_ID/app:latest
```

## Cloud Run Deployment Strategies

### Basic Cloud Run Service

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-service
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: '100'
        autoscaling.knative.dev/minScale: '0'
        run.googleapis.com/cpu-throttling: 'true'
        run.googleapis.com/execution-environment: gen2
    spec:
      containerConcurrency: 1000
      timeoutSeconds: 300
      containers:
        - image: gcr.io/PROJECT_ID/my-app:latest
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: '2'
              memory: '2Gi'
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
```

### Traffic Splitting for Canary Deployments

```bash
# Deploy new revision
gcloud run deploy my-service \
  --image gcr.io/PROJECT_ID/my-app:v2 \
  --region us-central1 \
  --no-traffic

# Split traffic: 90% to stable, 10% to new revision
gcloud run services update-traffic my-service \
  --to-revisions=my-service-v1=90,my-service-v2=10 \
  --region us-central1
```

## Security Best Practices

### VPC Security Configuration

```hcl
# VPC with private Google access
resource "google_compute_subnetwork" "private_subnet" {
  name          = "private-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc_network.id

  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "k8s-pod-range"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "k8s-service-range"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# Firewall rules
resource "google_compute_firewall" "allow_internal" {
  name    = "allow-internal"
  network = google_compute_network.vpc_network.name

  allow {
    protocol = "icmp"
  }

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

### IAM Best Practices

```hcl
# Service account for applications
resource "google_service_account" "app_service_account" {
  account_id   = "app-service-account"
  display_name = "Application Service Account"
  description  = "Service account for application workloads"
}

# Minimal permissions
resource "google_project_iam_member" "app_permissions" {
  for_each = toset([
    "roles/storage.objectViewer",
    "roles/cloudsql.client",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_service_account.email}"
}
```

### Secret Management

```yaml
# Using Secret Manager in Cloud Run
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: secure-app
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/secrets: |
          /secrets/db-password:db-secret:latest
        run.googleapis.com/service-account: app-service-account@PROJECT_ID.iam.gserviceaccount.com
    spec:
      containers:
        - image: gcr.io/PROJECT_ID/app:latest
          volumeMounts:
            - name: db-password
              mountPath: /secrets
              readOnly: true
          env:
            - name: DB_PASSWORD_FILE
              value: /secrets/db-password
      volumes:
        - name: db-password
          secret:
            secretName: db-secret
```

## Monitoring and Observability

### Cloud Monitoring Configuration

```yaml
# Monitoring dashboard
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: app-metrics
spec:
  selector:
    matchLabels:
      app: my-app
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
```

### Cloud Logging with Structured Logs

```typescript
import { Logging } from '@google-cloud/logging'

const logging = new Logging()
const log = logging.log('my-app-log')

const metadata = {
  resource: {
    type: 'cloud_run_revision',
    labels: {
      service_name: 'my-service',
      revision_name: process.env.K_REVISION,
      location: process.env.GCLOUD_REGION,
    },
  },
}

const entry = log.entry(metadata, {
  severity: 'INFO',
  message: 'Application started',
  user_id: '12345',
  trace: `projects/${projectId}/traces/${traceId}`,
})

await log.write(entry)
```

### Cloud Trace Integration

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'my-service',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
})

sdk.start()
```

## Cost Optimization Strategies

### Committed Use Discounts

```hcl
# Committed use contract for Compute Engine
resource "google_compute_region_commitment" "default" {
  name   = "my-commitment"
  region = "us-central1"
  plan   = "TWELVE_MONTH"

  resources {
    type   = "VCPU"
    amount = "4"
  }

  resources {
    type   = "MEMORY"
    amount = "8192"
  }
}
```

### Preemptible VM Configuration

```hcl
resource "google_compute_instance_template" "preemptible_template" {
  name_prefix  = "preemptible-template"
  machine_type = "e2-standard-4"

  scheduling {
    automatic_restart   = false
    on_host_maintenance = "TERMINATE"
    preemptible         = true
  }

  disk {
    source_image = "ubuntu-os-cloud/ubuntu-2004-lts"
    auto_delete  = true
    boot         = true
    disk_type    = "pd-standard"
    disk_size_gb = 20
  }
}
```

### Cloud Storage Lifecycle Management

```hcl
resource "google_storage_bucket" "auto_expire" {
  name     = "auto-expiring-bucket"
  location = "US"

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}
```

## Disaster Recovery and High Availability

### Multi-Regional Setup

```hcl
# Multi-regional Cloud SQL
resource "google_sql_database_instance" "main" {
  name             = "main-instance"
  database_version = "POSTGRES_13"
  region           = "us-central1"

  settings {
    tier              = "db-standard-2"
    availability_type = "REGIONAL"

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc_network.id
    }
  }

  deletion_protection = true
}

# Read replica in different region
resource "google_sql_database_instance" "replica" {
  name                 = "replica-instance"
  database_version     = "POSTGRES_13"
  region              = "us-east1"
  master_instance_name = google_sql_database_instance.main.name

  settings {
    tier              = "db-standard-2"
    availability_type = "ZONAL"
  }
}
```

### GKE Multi-Regional Cluster

```yaml
apiVersion: container.v1
kind: Cluster
metadata:
  name: multi-regional-cluster
spec:
  location: us-central1 # Regional cluster
  locations:
    - us-central1-a
    - us-central1-b
    - us-central1-c
  nodePools:
    - name: default-pool
      config:
        machineType: e2-standard-4
      initialNodeCount: 1
      locations:
        - us-central1-a
        - us-central1-b
        - us-central1-c
```

## Implementation Checklist

### Pre-Deployment

- [ ] Plan GCP project structure and organization
- [ ] Design network architecture with VPC
- [ ] Choose appropriate compute services (GKE vs Cloud Run vs Compute Engine)
- [ ] Plan data storage and database requirements
- [ ] Design security and IAM policies
- [ ] Estimate costs and set budgets

### Deployment Phase

- [ ] Implement infrastructure as code (Terraform recommended)
- [ ] Set up CI/CD pipelines with Cloud Build
- [ ] Configure monitoring and alerting
- [ ] Implement security policies and secrets management
- [ ] Set up backup and disaster recovery
- [ ] Test deployment pipeline end-to-end

### Post-Deployment

- [ ] Monitor performance and costs
- [ ] Optimize resource utilization
- [ ] Review and update security configurations
- [ ] Test backup and recovery procedures
- [ ] Plan for scaling and growth
- [ ] Establish operational runbooks

## GCP-Specific Advantages

### Developer Productivity

- **Cloud Shell**: Browser-based development environment
- **Cloud Code**: IDE integrations for development
- **Skaffold**: Kubernetes development workflow
- **Binary Authorization**: Container image security

### AI/ML Integration

- **Vertex AI**: Unified ML platform
- **BigQuery ML**: SQL-based machine learning
- **AutoML**: No-code ML model training
- **AI Platform**: Custom model deployment

### Data and Analytics

- **BigQuery**: Serverless data warehouse
- **Dataflow**: Stream and batch processing
- **Pub/Sub**: Global messaging service
- **Data Fusion**: Visual data integration
