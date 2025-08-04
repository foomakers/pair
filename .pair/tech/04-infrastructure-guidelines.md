# Infrastructure Guidelines

## Purpose

Define infrastructure standards, deployment strategies, and operational practices that support scalable, reliable, and maintainable systems across all environments.

## Scope

**In Scope:**

- Infrastructure standards and deployment strategies
- Environment management (local/dev/staging/production)
- Environment variables and configuration management
- Container orchestration and Docker strategies
- CI/CD pipeline configuration (GitHub Actions recommended)
- Local development deployment setups
- Production platform selection (Vercel, AWS, GCP)
- Platform-specific deployment patterns
- Infrastructure as Code (Terraform, AWS CDK)
- Repository strategy (GitHub recommended)

**Out of Scope:**

- Application code and business logic
- Security policies and compliance frameworks
- Performance monitoring and observability
- Database design and data modeling
- Third-party service integrations

**📝 Note**: This document must comprehensively cover:

- **Local Development Deployment**: Docker Compose setup for complete local environment
- **Environment Management**: Clear strategies for dev/staging/production environments
- **Containerization Standards**: Docker standards for Next.js BFF and Fastify APIs
- **Cross-Reference**: Integration with [Technical Guidelines](03-technical-guidelines_TBR.md) deployment requirements

---

## 📋 Table of Contents

1. [🏗️ Infrastructure Principles](#️-infrastructure-principles)

   - [Infrastructure as Code](#1-infrastructure-as-code)
   - [Environment Consistency](#2-environment-consistency)
   - [Operational Excellence](#3-operational-excellence)

2. [🚀 Deployment Strategies](#-deployment-strategies)

   - [Container Strategy](#container-strategy)
   - [Orchestration Platform](#orchestration-platform)
   - [Deployment Patterns](#deployment-patterns)

3. [🔧 Environment Configuration](#-environment-configuration)

   - [Local Development Environment](#local-development-environment)
   - [Development Environment](#development-environment)
   - [Staging Environment](#staging-environment)
   - [Production Environment](#production-environment)
   - [Environment Variables Management](#environment-variables-management)

4. [🐳 Local Development Setup](#-local-development-setup)

5. [🔧 Technology Integration Process](#-technology-integration-process)

6. [☁️ Cloud & Production Platforms](#️-cloud--production-platforms)

   - [Platform Selection Strategy](#platform-selection-strategy)
   - [Vercel Deployment](#vercel-deployment)
   - [AWS Deployment](#aws-deployment)
   - [GCP Deployment](#gcp-deployment)

7. [🏗️ Infrastructure as Code](#️-infrastructure-as-code)

   - [IaC Tool Selection](#iac-tool-selection)
   - [Terraform Implementation](#terraform-implementation)
   - [AWS CDK Implementation](#aws-cdk-implementation)

8. [🔄 CI/CD Pipeline](#-cicd-pipeline)

   - [CI/CD Platform Selection](#cicd-platform-selection)
   - [GitHub Actions Implementation](#github-actions-implementation)
   - [Build Pipeline](#build-pipeline)
   - [Deployment Pipeline](#deployment-pipeline)
   - [Quality Gates](#quality-gates)
   - [Secrets Management](#secrets-management)

---

## 🏗️ Infrastructure Principles

### 1. Infrastructure as Code

- **Version Control**: All infrastructure definitions in version control
- **Repository Strategy**: GitHub recommended for version control and collaboration
- **Reproducible Environments**: Consistent infrastructure across all environments
- **Declarative Configuration**: Infrastructure defined declaratively, not imperatively
- **Automated Provisioning**: Infrastructure provisioned through automation

### 2. Environment Consistency

- **Environment Parity**: Minimize differences between development, staging, and production
- **Configuration Management**: Environment-specific configuration without code changes
- **Isolated Environments**: Each environment operates independently
- **Progressive Promotion**: Changes flow through environments systematically

### 3. Operational Excellence

- **Monitoring First**: Infrastructure instrumented for observability from deployment
- **Self-Healing**: Automated recovery from common failure scenarios
- **Scalability**: Infrastructure scales with demand automatically
- **Cost Optimization**: Resource usage optimized for cost efficiency

---

## 🚀 Deployment Strategies

### Container Strategy

- **Standardized Containerization**: Docker for all deployable workspaces (apps and services)
- **Base Images**: Standardized, security-scanned base images
- **Multi-stage Builds**: Optimized production images with minimal attack surface
- **Registry Management**: Centralized container registry with vulnerability scanning

### Orchestration Platform

- **Kubernetes**: Primary orchestration platform for production deployments
- **Docker Compose**: Local development and simple staging environments
- **Helm Charts**: Standardized deployment configurations and templating
- **GitOps**: Infrastructure and deployment managed through Git workflows

### Deployment Patterns

- **Progressive Deployment**: Blue-green, canary, or rolling deployment strategies
- **Health Checks**: Automated deployment verification and rollback
- **Resource Limits**: Proper resource allocation and limits for all workloads
- **Secrets Management**: Secure handling of sensitive configuration

---

## 🔧 Environment Configuration

### Local Development Environment

**Objective**: Complete local development environment with zero external dependencies.

**Strategy**:

- **Dockerized Services**: All external services (PostgreSQL, Redis, etc.) run in Docker containers
- **Zero Installation Policy**: No local installations required beyond Docker and Node.js
- **Self-Contained**: Complete development stack available via `npm run dev:setup`
- **Service Mocking**: External APIs and services mocked for local development

**Configuration Management**:

- **Environment Files**: `.env.local` for local-specific configuration
- **Service Defaults**: Sensible defaults for all containerized services
- **Port Management**: Standardized port allocation to avoid conflicts
- **Data Persistence**: Local volumes for development data persistence

### Development Environment

**Objective**: Connect to real external services while developing from local machine.

**Strategy**:

- **External Service Integration**: Connect to development instances of external services
- **Service Discovery**: Configuration-driven service endpoint resolution
- **Authentication**: Development credentials for external service access
- **Environment Isolation**: Dedicated development environment resources

**Configuration Management**:

- **Environment Files**: `.env.development` for development-specific configuration
- **Service Endpoints**: Real external service URLs and credentials
- **Feature Flags**: Environment-specific feature toggle configuration (see [Technical Guidelines](./03-technical-guidelines.md#feature-flag-management))
- **Monitoring Integration**: Basic observability for development debugging

### Staging Environment

**Objective**: Production-like environment for final validation and testing.

**Strategy**:

- **Production Parity**: Mirror production configuration with staging data
- **External Services**: Staging instances of all external dependencies
- **Automated Deployment**: GitOps-driven deployment from development branch
- **Testing Integration**: End-to-end and integration testing validation

### Production Environment

**Objective**: Highly available, scalable, and secure production deployment.

**Strategy**:

- **Kubernetes Orchestration**: Container orchestration for high availability
- **Managed Services**: Cloud-managed databases and infrastructure services
- **Auto-scaling**: Demand-based scaling policies
- **Security Hardening**: Production security policies and access controls

### Environment Variables Management

**Strategy**: Environment-specific configuration without code changes, supporting platform flexibility per bounded context.

**Configuration Hierarchy**:

1. **Local Environment** (`.env.local`)
2. **Development Environment** (`.env.development`)
3. **Staging Environment** (Platform-specific configuration)
4. **Production Environment** (Platform-specific secure configuration)

**Environment Variable Categories**:

```typescript
// Environment variable schema
type EnvironmentConfig = {
  // Application Configuration
  NODE_ENV: "local" | "development" | "staging" | "production";
  PORT: number;

  // Database Configuration
  DATABASE_URL: string;
  DB_HOST?: string;
  DB_PORT?: number;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;

  // Cache Configuration
  REDIS_URL: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;

  // External Services
  [SERVICE_NAME]_URL: string;
  [SERVICE_NAME]_API_KEY?: string;

  // Platform-Specific
  VERCEL_URL?: string;
  AWS_REGION?: string;
  GCP_PROJECT_ID?: string;
};
```

**Environment-Specific Management**:

**Local Development**:

```bash
# .env.local
NODE_ENV=local
DATABASE_URL=postgresql://developer:development@localhost:5432/app_development
REDIS_URL=redis://localhost:6379
PAYMENT_SERVICE_URL=http://localhost:3001/mock/payment
EMAIL_SERVICE_URL=http://localhost:3002/mock/email
```

**Development Environment**:

```bash
# .env.development
NODE_ENV=development
DATABASE_URL=${DEV_DATABASE_URL}
REDIS_URL=${DEV_REDIS_URL}
PAYMENT_SERVICE_URL=${DEV_PAYMENT_SERVICE_URL}
PAYMENT_API_KEY=${DEV_PAYMENT_API_KEY}
EMAIL_SERVICE_URL=${DEV_EMAIL_SERVICE_URL}
EMAIL_API_KEY=${DEV_EMAIL_API_KEY}
```

**Staging/Production**:

- **Vercel**: Environment variables through Vercel dashboard/CLI
- **AWS**: Parameter Store, Secrets Manager, or Lambda environment variables
- **GCP**: Secret Manager, Cloud Run environment variables

**Security Guidelines**:

- **Never commit** sensitive values to version control
- **Use platform-specific secrets management** for production
- **Rotate secrets regularly** in staging and production
- **Validate all environment variables** at application startup

```typescript
// Environment validation example
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["local", "development", "staging", "production"]),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  // Add validation for all required variables
});

export const validateEnvironment = () => {
  try {
    return environmentSchema.parse(process.env);
  } catch (error) {
    console.error("Environment validation failed:", error);
    process.exit(1);
  }
};
```

---

## 🐳 Local Development Setup

### Docker Compose Configuration

**Core Services** (always included):

```yaml
# docker-compose.local.yml
version: "3.8"

services:
  # Primary Database
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app_development
      POSTGRES_USER: developer
      POSTGRES_PASSWORD: development
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U developer"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Cache Layer
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

**Development Scripts**:

```json
// package.json
{
  "scripts": {
    "dev:setup": "docker-compose -f docker-compose.local.yml up -d && npm run dev:wait && npm run db:migrate && npm run db:seed",
    "dev:wait": "wait-on tcp:localhost:5432 tcp:localhost:6379",
    "dev:teardown": "docker-compose -f docker-compose.local.yml down -v",
    "dev:logs": "docker-compose -f docker-compose.local.yml logs -f"
  }
}
```

### Service Discovery and Integration

**Environment-based Service Resolution**:

```typescript
// src/config/services.ts
type ServiceConfig = {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
  };
  external: {
    [serviceName: string]: {
      baseUrl: string;
      apiKey?: string;
      mock: boolean;
    };
  };
};

const createServiceConfig = (environment: string): ServiceConfig => {
  switch (environment) {
    case "local":
      return {
        database: {
          host: "localhost",
          port: 5432,
          database: "app_development",
          username: "developer",
          password: "development",
        },
        redis: {
          host: "localhost",
          port: 6379,
        },
        external: {
          // All external services mocked in local environment
          paymentService: {
            baseUrl: "http://localhost:3001/mock/payment",
            mock: true,
          },
          emailService: {
            baseUrl: "http://localhost:3002/mock/email",
            mock: true,
          },
        },
      };
    case "development":
      return {
        database: {
          host: process.env.DB_HOST!,
          port: parseInt(process.env.DB_PORT!),
          database: process.env.DB_NAME!,
          username: process.env.DB_USER!,
          password: process.env.DB_PASSWORD!,
        },
        redis: {
          host: process.env.REDIS_HOST!,
          port: parseInt(process.env.REDIS_PORT!),
        },
        external: {
          // Real external services in development
          paymentService: {
            baseUrl: process.env.PAYMENT_SERVICE_URL!,
            apiKey: process.env.PAYMENT_API_KEY!,
            mock: false,
          },
          emailService: {
            baseUrl: process.env.EMAIL_SERVICE_URL!,
            apiKey: process.env.EMAIL_API_KEY!,
            mock: false,
          },
        },
      };
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
};
```

---

## 🔧 Technology Integration Process

### Infrastructure Extension Workflow

**Architectural Decision Requirement**: New infrastructure components and external services must follow the ADR process defined in [Architectural Guidelines](./01-architectural-guidelines.md#architecture-decision-records-adrs).

**Bounded Context Infrastructure**: When adding infrastructure for new bounded contexts (apps/services), also follow the [Bounded Context Decision Checklist](./01-architectural-guidelines.md#bounded-context-decision-checklist) for architectural consistency.

**Process**:

1. **Technology Evaluation**: When a new infrastructure component or external service is needed
2. **ADR Creation**: Follow the ADR process and template defined in [Architectural Guidelines](./01-architectural-guidelines.md#architecture-decision-records-adrs)
3. **Implementation Planning**: Add infrastructure extension tasks to product backlog
4. **Prioritization**: Schedule implementation based on business priority and technical dependencies

### Service Addition Workflow

**Backlog Integration**: Infrastructure extension follows standard product development workflow.

**Implementation Steps**:

1. **User Story Creation**: Infrastructure extension as user story in product backlog
2. **Task Breakdown**: Decompose into specific implementation tasks
3. **Sprint Planning**: Schedule based on business priority and technical dependencies
4. **Implementation**: Develop infrastructure extension following ADR specifications
5. **Documentation Update**: Update relevant infrastructure and technical documentation

**Service Extension Checklist**:

- [ ] **Local Development**: Add service to Docker Compose configuration
- [ ] **Service Mocking**: Implement mock service for local development
- [ ] **Environment Configuration**: Add service configuration for all environments
- [ ] **Integration Testing**: Validate service integration across environments
- [ ] **Documentation**: Update infrastructure and technical documentation
- [ ] **Team Training**: Share knowledge about new service integration

**Example Implementation Process**:

```markdown
# User Story: Add Email Service Integration

## Acceptance Criteria

- [ ] Local development includes email service mock
- [ ] Development environment connects to real email service
- [ ] Email service configuration managed through environment variables
- [ ] Email sending functionality available across all applications

## Technical Tasks

- [ ] Create email service mock for local development
- [ ] Add email service to Docker Compose configuration
- [ ] Implement email service factory with environment switching
- [ ] Add email service configuration to all environments
- [ ] Update infrastructure documentation
- [ ] Create integration tests for email functionality
```

---

## ☁️ Cloud & Production Platforms

### Platform Selection Strategy

**Bounded Context Flexibility**: Each bounded context (app/service) can select the most appropriate platform based on requirements and constraints.

**Platform Decision Requirements**: All platform selections must be documented through ADR process following [Architectural Guidelines](./01-architectural-guidelines.md#architecture-decision-records-adrs).

**Supported Platforms**:

- **Vercel**: Cost-effective for Next.js applications and serverless functions
- **AWS**: Comprehensive cloud services (Lambda, ECS, EKS, RDS, etc.)
- **GCP**: Google Cloud Platform services (Cloud Run, GKE, Cloud SQL, etc.)

**Platform Selection Criteria**:

1. **Cost Optimization**: Budget constraints and cost efficiency
2. **Technical Requirements**: Performance, scalability, and feature needs
3. **Team Expertise**: Platform familiarity and operational capabilities
4. **Integration Needs**: External service dependencies and ecosystem

### Vercel Deployment

**Use Cases**: Next.js applications, serverless functions, static sites, prototypes, cost-sensitive projects.

**Infrastructure as Code**:

```typescript
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "DATABASE_URL": "@database-url",
    "REDIS_URL": "@redis-url"
  },
  "functions": {
    "apps/web/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

**Environment Management**:

- **Development**: Vercel Preview deployments
- **Staging**: Vercel Production with staging environment variables
- **Production**: Vercel Production with production environment variables

**Deployment Strategy**:

- **Git Integration**: Automatic deployments from Git branches
- **Preview Deployments**: Every pull request gets a preview URL
- **Environment Variables**: Managed through Vercel dashboard or CLI
- **Custom Domains**: Production domains with SSL certificates

### AWS Deployment

**Use Cases**: High-performance applications, complex microservices, enterprise workloads, specific AWS service requirements.

**Deployment Options**:

**1. AWS Lambda + API Gateway** (Serverless):

```yaml
# serverless.yml
service: app-service

provider:
  name: aws
  runtime: nodejs18.x
  environment:
    DATABASE_URL: ${ssm:/app/database-url}
    REDIS_URL: ${ssm:/app/redis-url}

functions:
  api:
    handler: dist/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
```

**2. Amazon ECS** (Containerized):

```yaml
# docker-compose.aws.yml
version: "3.8"
services:
  app:
    image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/app:latest
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    deploy:
      replicas: 2
```

**3. Amazon EKS** (Kubernetes):

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/app:latest
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
```

**Managed Services**:

- **RDS**: PostgreSQL, MySQL managed databases
- **ElastiCache**: Redis managed cache
- **Parameter Store**: Configuration management
- **Secrets Manager**: Sensitive data management
- **CloudWatch**: Monitoring and logging

### GCP Deployment

**Use Cases**: Google ecosystem integration, specific GCP services, multi-cloud strategy.

**Deployment Options**:

**1. Cloud Run** (Serverless Containers):

```yaml
# cloudbuild.yaml
steps:
  - name: "gcr.io/cloud-builders/docker"
    args: ["build", "-t", "gcr.io/$PROJECT_ID/app:latest", "."]
  - name: "gcr.io/cloud-builders/docker"
    args: ["push", "gcr.io/$PROJECT_ID/app:latest"]
  - name: "gcr.io/cloud-builders/gcloud"
    args:
      - "run"
      - "deploy"
      - "app"
      - "--image=gcr.io/$PROJECT_ID/app:latest"
      - "--platform=managed"
      - "--region=us-central1"
```

**2. Google Kubernetes Engine (GKE)**:

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          image: gcr.io/${PROJECT_ID}/app:latest
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
```

**Managed Services**:

- **Cloud SQL**: PostgreSQL, MySQL managed databases
- **Cloud Memorystore**: Redis managed cache
- **Secret Manager**: Configuration and secrets management
- **Cloud Monitoring**: Observability and alerting

**Platform Integration Checklist**:

- [ ] **ADR Documentation**: Platform selection rationale and trade-offs
- [ ] **Environment Variables**: Platform-specific configuration management
- [ ] **Secrets Management**: Secure handling of sensitive configuration
- [ ] **Monitoring Integration**: Platform-specific observability setup
- [ ] **Cost Monitoring**: Budget alerts and cost optimization
- [ ] **Backup Strategy**: Data protection and disaster recovery
- [ ] **Security Configuration**: Platform-specific security hardening

---

## 🏗️ Infrastructure as Code

### IaC Tool Selection

**ADR Requirement**: Infrastructure as Code tool selection must be documented through ADR process following [Architectural Guidelines](./01-architectural-guidelines.md#architecture-decision-records-adrs).

**Platform-Specific Recommendations**:

- **Vercel**: Native `vercel.json` configuration files
- **AWS**: Terraform (multi-cloud) or AWS CDK (AWS-native)
- **GCP**: Terraform (multi-cloud) or Google Cloud Deployment Manager
- **Multi-Platform**: Terraform for consistency across platforms

**Tool Selection Criteria**:

1. **Platform Coverage**: Support for target cloud platforms
2. **Team Expertise**: Familiarity with tool and programming languages
3. **Ecosystem Integration**: CI/CD and tooling compatibility
4. **State Management**: Remote state storage and locking capabilities
5. **Community Support**: Documentation, modules, and community resources

### Terraform Implementation

**Use Cases**: Multi-cloud deployments, team familiarity with HCL, extensive provider ecosystem.

**Project Structure**:

```
infrastructure/
├── environments/
│   ├── local/
│   ├── development/
│   ├── staging/
│   └── production/
├── modules/
│   ├── networking/
│   ├── database/
│   ├── compute/
│   └── monitoring/
├── shared/
│   ├── variables.tf
│   ├── outputs.tf
│   └── providers.tf
└── README.md
```

**Environment Configuration**:

```hcl
# environments/staging/main.tf
terraform {
  required_version = ">= 1.0"

  backend "s3" {
    bucket = "myapp-terraform-state"
    key    = "staging/terraform.tfstate"
    region = "us-east-1"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "staging"
      Project     = "myapp"
      ManagedBy   = "terraform"
    }
  }
}

module "networking" {
  source = "../../modules/networking"

  environment = "staging"
  vpc_cidr    = "10.1.0.0/16"
}

module "database" {
  source = "../../modules/database"

  environment = "staging"
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.private_subnet_ids

  instance_class = "db.t3.micro"
  allocated_storage = 20
}
```

**Reusable Modules**:

```hcl
# modules/database/main.tf
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for database"
  type        = list(string)
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.environment}-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.environment}-db-subnet-group"
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.environment}-postgres"

  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2

  db_name  = "appdb"
  username = "dbadmin"
  password = random_password.db_password.result

  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = var.environment != "production"

  tags = {
    Name = "${var.environment}-postgres"
  }
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "database_url" {
  value = "postgresql://${aws_db_instance.main.username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive = true
}
```

### AWS CDK Implementation

**Use Cases**: AWS-native deployments, TypeScript familiarity, programmatic infrastructure definition.

**Project Structure**:

```
infrastructure/
├── bin/
│   └── app.ts
├── lib/
│   ├── stacks/
│   │   ├── networking-stack.ts
│   │   ├── database-stack.ts
│   │   └── compute-stack.ts
│   └── constructs/
│       ├── postgres-database.ts
│       └── fastify-service.ts
├── environments/
│   ├── development.ts
│   ├── staging.ts
│   └── production.ts
├── cdk.json
└── package.json
```

**Environment Configuration**:

```typescript
// bin/app.ts
import * as cdk from "aws-cdk-lib";
import { NetworkingStack } from "../lib/stacks/networking-stack";
import { DatabaseStack } from "../lib/stacks/database-stack";
import { ComputeStack } from "../lib/stacks/compute-stack";

const app = new cdk.App();

const environment = app.node.tryGetContext("environment") || "development";
const config = require(`../environments/${environment}.ts`).default;

const networkingStack = new NetworkingStack(
  app,
  `${config.prefix}-networking`,
  {
    env: config.env,
    config,
  }
);

const databaseStack = new DatabaseStack(app, `${config.prefix}-database`, {
  env: config.env,
  config,
  vpc: networkingStack.vpc,
});

const computeStack = new ComputeStack(app, `${config.prefix}-compute`, {
  env: config.env,
  config,
  vpc: networkingStack.vpc,
  database: databaseStack.database,
});
```

**Reusable Constructs**:

```typescript
// lib/constructs/postgres-database.ts
import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface PostgresDatabaseProps {
  vpc: ec2.Vpc;
  instanceType?: ec2.InstanceType;
  allocatedStorage?: number;
  environment: string;
}

export class PostgresDatabase extends Construct {
  public readonly instance: rds.DatabaseInstance;
  public readonly secret: rds.DatabaseSecret;

  constructor(scope: Construct, id: string, props: PostgresDatabaseProps) {
    super(scope, id);

    this.secret = new rds.DatabaseSecret(this, "Secret", {
      username: "dbadmin",
      description: `Database credentials for ${props.environment}`,
    });

    this.instance = new rds.DatabaseInstance(this, "Instance", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType:
        props.instanceType ||
        ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      credentials: rds.Credentials.fromSecret(this.secret),
      allocatedStorage: props.allocatedStorage || 20,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: props.environment === "production",
      removalPolicy:
        props.environment === "production"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    cdk.Tags.of(this).add("Environment", props.environment);
  }
}
```

**Environment-Specific Configuration**:

```typescript
// environments/staging.ts
export default {
  prefix: "myapp-staging",
  environment: "staging",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
  database: {
    instanceType: "t3.micro",
    allocatedStorage: 20,
  },
  compute: {
    desiredCount: 2,
    cpu: 256,
    memory: 512,
  },
};
```

### IaC Best Practices

**State Management**:

- **Remote State**: Store Terraform state or CDK outputs in secure, shared storage
- **State Locking**: Implement state locking to prevent concurrent modifications
- **Backup Strategy**: Regular backups of infrastructure state

**Security Practices**:

- **Secrets Management**: Never store secrets in IaC code
- **Access Controls**: Implement least-privilege access for IaC execution
- **Code Review**: All infrastructure changes require peer review

**Deployment Workflow**:

```yaml
# .github/workflows/infrastructure.yml
name: Infrastructure

on:
  pull_request:
    paths: ["infrastructure/**"]
  push:
    branches: [main]
    paths: ["infrastructure/**"]

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0

      - name: Terraform Plan
        run: |
          cd infrastructure/environments/staging
          terraform init
          terraform plan -out=tfplan

      - name: Comment Plan
        uses: actions/github-script@v7
        with:
          script: |
            // Post plan output as PR comment

  apply:
    if: github.ref == 'refs/heads/main'
    needs: plan
    runs-on: ubuntu-latest
    steps:
      - name: Terraform Apply
        run: |
          cd infrastructure/environments/staging
          terraform apply tfplan
```

**IaC Implementation Checklist**:

- [ ] **ADR Creation**: Document IaC tool selection rationale
- [ ] **Environment Separation**: Separate configurations for each environment
- [ ] **Module Development**: Reusable infrastructure components
- [ ] **State Management**: Secure remote state storage and locking
- [ ] **CI/CD Integration**: Automated plan/apply workflows
- [ ] **Documentation**: Infrastructure setup and deployment procedures
- [ ] **Security Review**: Secrets management and access controls
- [ ] **Backup Strategy**: Infrastructure state backup and recovery

---

## 🔄 CI/CD Pipeline

### CI/CD Platform Selection

**ADR Requirement**: CI/CD platform selection must be documented through ADR process following [Architectural Guidelines](./01-architectural-guidelines.md#architecture-decision-records-adrs).

**Recommended Platform**: **GitHub Actions** for seamless integration with GitHub repositories.

**Alternative Platforms**: GitLab CI, Jenkins, Azure DevOps, CircleCI (all require ADR documentation).

**Selection Criteria**:

1. **Repository Integration**: Native integration with version control system
2. **Ecosystem Compatibility**: Support for required tools and services
3. **Cost Efficiency**: Budget considerations and pricing model
4. **Team Expertise**: Familiarity with platform and configuration languages
5. **Security Features**: Secrets management and access controls

### GitHub Actions Implementation

**Use Cases**: GitHub repositories, integrated workflows, extensive marketplace ecosystem.

**Workflow Structure**:

```
.github/
├── workflows/
│   ├── ci.yml                    # Continuous Integration
│   ├── cd-staging.yml           # Staging Deployment
│   ├── cd-production.yml        # Production Deployment
│   ├── infrastructure.yml       # Infrastructure Changes
│   └── security.yml             # Security Scanning
└── dependabot.yml               # Dependency Updates
```

**Multi-Environment CI/CD Strategy**:

```yaml
# .github/workflows/ci.yml
name: Continuous Integration

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test

      - name: Run linting
        run: pnpm lint

      - name: Type checking
        run: pnpm type-check

      - name: Build applications
        run: pnpm build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: pnpm audit

      - name: Dependency vulnerability scan
        uses: github/dependency-review-action@v4
```

**Environment-Specific Deployment**:

```yaml
# .github/workflows/cd-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]
  workflow_run:
    workflows: ["Continuous Integration"]
    types: [completed]
    branches: [develop]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build for staging
        run: pnpm build
        env:
          NODE_ENV: staging
          DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
          REDIS_URL: ${{ secrets.STAGING_REDIS_URL }}

      - name: Deploy to Vercel
        if: contains(github.repository, 'vercel-app')
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"

      - name: Deploy to AWS
        if: contains(github.repository, 'aws-app')
        run: |
          # AWS deployment steps
          aws configure set aws_access_key_id ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws configure set aws_secret_access_key ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws configure set default.region ${{ secrets.AWS_REGION }}
          # Add specific deployment commands
```

**Production Deployment with Approval**:

```yaml
# .github/workflows/cd-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://myapp.com

    steps:
      - uses: actions/checkout@v4

      - name: Manual approval checkpoint
        uses: trstringer/manual-approval@v1
        with:
          secret: ${{ github.TOKEN }}
          approvers: team-leads,devops-team
          minimum-approvals: 2

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run production tests
        run: pnpm test:production

      - name: Build for production
        run: pnpm build
        env:
          NODE_ENV: production
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
          REDIS_URL: ${{ secrets.PROD_REDIS_URL }}

      - name: Deploy to production
        run: |
          # Platform-specific deployment
          echo "Deploying to production..."

      - name: Notify team
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

**Infrastructure Automation**:

```yaml
# .github/workflows/infrastructure.yml
name: Infrastructure

on:
  pull_request:
    paths: ["infrastructure/**"]
  push:
    branches: [main]
    paths: ["infrastructure/**"]

jobs:
  terraform-plan:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0
          cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}

      - name: Terraform Plan
        id: plan
        run: |
          cd infrastructure/environments/staging
          terraform init
          terraform plan -out=tfplan -no-color

      - name: Comment Plan
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('infrastructure/environments/staging/tfplan.txt', 'utf8');
            const output = `#### Terraform Plan 📖
            <details><summary>Show Plan</summary>

            \`\`\`
            ${plan}
            \`\`\`

            </details>`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            });

  terraform-apply:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: infrastructure

    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0
          cli_config_credentials_token: ${{ secrets.TF_API_TOKEN }}

      - name: Terraform Apply
        run: |
          cd infrastructure/environments/staging
          terraform init
          terraform plan -out=tfplan
          terraform apply tfplan
```

### Build Pipeline

- **Automated Builds**: Triggered on code changes with proper validation
- **Parallel Execution**: Optimize build times through parallel processing and matrix strategies
- **Artifact Management**: GitHub Packages or external artifact storage with versioning
- **Build Caching**: Intelligent caching using GitHub Actions cache and pnpm/npm cache
- **Multi-Node Testing**: Test across multiple Node.js versions for compatibility

### Deployment Pipeline

- **Environment Promotion**: Automated promotion through environments (develop → staging → main → production)
- **Approval Gates**: Manual approval requirements for production deployments using GitHub Environments
- **Rollback Strategy**: Quick rollback capabilities through Git revert and re-deployment
- **Deployment Notifications**: Team notifications via Slack, Teams, or email integrations
- **Blue-Green Deployments**: Platform-specific deployment strategies with zero downtime

### Quality Gates

- **Security Scanning**: Container and dependency vulnerability scanning with Dependabot and security actions
- **Performance Testing**: Automated performance validation in staging environment
- **Integration Testing**: End-to-end testing in staging environments
- **Compliance Checks**: Automated compliance and policy validation
- **Code Quality**: ESLint, Prettier, and TypeScript checks as required gates

### Secrets Management

**GitHub Secrets Hierarchy**:

- **Repository Secrets**: For repository-specific credentials
- **Environment Secrets**: For environment-specific configurations
- **Organization Secrets**: For shared organizational credentials

**Best Practices**:

```yaml
# Example secrets organization
secrets:
  # Database
  STAGING_DATABASE_URL: "postgresql://..."
  PROD_DATABASE_URL: "postgresql://..."

  # Platform credentials
  VERCEL_TOKEN: "..."
  AWS_ACCESS_KEY_ID: "..."
  AWS_SECRET_ACCESS_KEY: "..."

  # External services
  PAYMENT_API_KEY_STAGING: "..."
  PAYMENT_API_KEY_PROD: "..."

  # Notifications
  SLACK_WEBHOOK: "..."
```

**Alternative CI/CD Platforms**:

If ADR documents selection of alternative platforms, ensure similar capabilities:

- **GitLab CI**: Native GitLab integration with similar pipeline structure
- **Jenkins**: Self-hosted solution with extensive plugin ecosystem
- **Azure DevOps**: Microsoft ecosystem integration with Azure services
- **CircleCI**: Cloud-based CI/CD with Docker-first approach

**CI/CD Implementation Checklist**:

- [ ] **ADR Creation**: Document CI/CD platform selection rationale
- [ ] **Workflow Configuration**: Set up multi-environment deployment workflows
- [ ] **Secrets Management**: Configure secure credential storage
- [ ] **Quality Gates**: Implement required testing and validation steps
- [ ] **Approval Process**: Set up manual approval for production deployments
- [ ] **Notification Setup**: Configure team notifications for deployment status
- [ ] **Rollback Procedures**: Define and test rollback strategies
- [ ] **Documentation**: Document deployment procedures and troubleshooting

---

---

## 📋 Compliance

This document supports the **Definition of Done** requirements:

- ✅ Infrastructure standards documented and followed
- ✅ Local development environment self-contained and reproducible
- ✅ Environment-specific configurations managed consistently
- ✅ Environment variables secured and validated
- ✅ Production platform selections documented through ADR process
- ✅ Platform-specific deployment strategies defined
- ✅ Infrastructure as Code tool selections documented through ADR
- ✅ IaC implementations follow security and best practices
- ✅ CI/CD platform selections documented through ADR process
- ✅ GitHub Actions workflows configured for multi-environment deployment
- ✅ Repository strategy aligned with GitHub recommendations
- ✅ Technology decisions documented through ADR process
- ✅ Service integration follows structured workflow

## 🔗 Related Documents

This document should be read in conjunction with:

- **[Architectural Guidelines](./01-architectural-guidelines.md)** - System design patterns and architectural decisions, including ADR processes
- **[Technical Guidelines](./03-technical-guidelines.md)** - Technical standards and development workflow integration
- **[Security Guidelines](./10-security-guidelines_TBR.md)** - Security implementation and practices for infrastructure
- **[Observability Guidelines](./11-observability-guidelines_TBR.md)** - Monitoring and logging strategies for infrastructure
- **[Performance Guidelines](./09-performance-guidelines_TBR.md)** - Performance optimization and requirements for infrastructure
