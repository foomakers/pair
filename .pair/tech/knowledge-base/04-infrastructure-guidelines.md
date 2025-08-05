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
- Testing infrastructure and environment setup
- Test database provisioning and management
- CI/CD testing phase integration

**Out of Scope:**

- Application code and business logic
- Security policies and compliance frameworks
- Performance monitoring and observability
- Database design and data modeling
- Third-party service integrations
- Testing methodologies and test implementation (see [Testing Strategy](07-testing-strategy.md))
- Performance testing strategies and tools (see [Performance Guidelines](09-performance-guidelines_TBR.md))

**📝 Note**: This document must comprehensively cover:

- **Local Development Deployment**: Docker Compose setup for complete local environment
- **Environment Management**: Clear strategies for dev/staging/production environments
- **Containerization Standards**: Docker standards for Next.js BFF and Fastify APIs
- **Cross-Reference**: Integration with [Technical Guidelines](03-technical-guidelines.md) deployment requirements

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
   - [Testing Infrastructure Integration](#testing-infrastructure-integration)
   - [Secrets Management](#secrets-management)

9. [🧪 Testing Infrastructure](#-testing-infrastructure)

   - [Testing Environment Setup](#testing-environment-setup)
   - [Test Database Management](#test-database-management)
   - [Performance Testing Infrastructure](#performance-testing-infrastructure)
   - [Test Service Dependencies](#test-service-dependencies)

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
- **Feature Flags**: Environment-specific feature toggle configuration (see [Technical Guidelines](03-technical-guidelines.md#feature-flag-management))
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

  # Test Database (isolated for testing)
  postgres_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"
    volumes:
      - postgres_test_data:/var/lib/postgresql/data
      - ./scripts/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user"]
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

  # Test Cache (isolated for testing)
  redis_test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    volumes:
      - redis_test_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  postgres_test_data:
  redis_data:
  redis_test_data:
```

**Development Scripts**:

```json
// package.json
{
  "scripts": {
    "dev:setup": "docker-compose -f docker-compose.local.yml up -d && npm run dev:wait && npm run db:migrate && npm run db:seed",
    "dev:wait": "wait-on tcp:localhost:5432 tcp:localhost:6379 tcp:localhost:5433 tcp:localhost:6380",
    "dev:teardown": "docker-compose -f docker-compose.local.yml down -v",
    "dev:logs": "docker-compose -f docker-compose.local.yml logs -f",
    "test:setup": "npm run test:db:reset && npm run test:db:migrate && npm run test:db:seed",
    "test:db:reset": "docker-compose -f docker-compose.local.yml restart postgres_test redis_test",
    "test:db:migrate": "DATABASE_URL=postgresql://test_user:test_password@localhost:5433/app_test npm run db:migrate",
    "test:db:seed": "DATABASE_URL=postgresql://test_user:test_password@localhost:5433/app_test npm run db:seed:test"
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

**Architectural Decision Requirement**: New infrastructure components and external services must follow the ADR process defined in [Architectural Guidelines](01-architectural-guidelines.md#architecture-decision-records-adrs).

**Bounded Context Infrastructure**: When adding infrastructure for new bounded contexts (apps/services), also follow the [Bounded Context Decision Checklist](01-architectural-guidelines.md#bounded-context-decision-checklist) for architectural consistency.

**Process**:

1. **Technology Evaluation**: When a new infrastructure component or external service is needed
2. **ADR Creation**: Follow the ADR process and template defined in [Architectural Guidelines](01-architectural-guidelines.md#architecture-decision-records-adrs)
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

**Platform Decision Requirements**: All platform selections must be documented through ADR process following [Architectural Guidelines](01-architectural-guidelines.md#architecture-decision-records-adrs).

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

**ADR Requirement**: Infrastructure as Code tool selection must be documented through ADR process following [Architectural Guidelines](01-architectural-guidelines.md#architecture-decision-records-adrs).

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

**ADR Requirement**: CI/CD platform selection must be documented through ADR process following [Architectural Guidelines](01-architectural-guidelines.md#architecture-decision-records-adrs).

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
│   ├── ci.yml                    # Continuous Integration (All Branches)
│   ├── build-and-publish.yml    # Build Artifacts (Main Branch Only)
│   ├── deploy.yml                # Environment Deployment (Manual/Triggered)
│   ├── infrastructure.yml       # Infrastructure Changes
│   └── security.yml             # Security Scanning
└── dependabot.yml               # Dependency Updates
```

**Optimized CI/CD Strategy**: Single artifact, multiple environment deployments

```yaml
# .github/workflows/ci.yml - Build and Test on Every Push
name: Continuous Integration

on:
  push:
    branches: ["**"] # Trigger on all branches
  pull_request:
    branches: [main, develop]

jobs:
  test:
    name: Build and Test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type checking
        run: pnpm type-check

      - name: Run linting
        run: pnpm lint

      - name: Setup test database
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -d test_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
          pnpm test:db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Run unit tests
        run: pnpm test:unit
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

      - name: Build applications
        run: pnpm build
        env:
          NODE_ENV: production

      - name: Upload build artifacts (for main branch)
        if: github.ref == 'refs/heads/main' && matrix.node-version == '20'
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts-${{ github.sha }}
          path: |
            apps/*/dist/
            apps/*/.next/
            apps/*/build/
            packages/*/dist/
          retention-days: 30

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run security audit
        run: pnpm audit

      - name: Dependency vulnerability scan
        uses: github/dependency-review-action@v4
        if: github.event_name == 'pull_request'
```

**Artifact Creation and Publishing**:

```yaml
# .github/workflows/build-and-publish.yml - Create Single Artifact After Main Merge
name: Build and Publish Artifacts

on:
  push:
    branches: [main]
  workflow_run:
    workflows: ["Continuous Integration"]
    types: [completed]
    branches: [main]

jobs:
  build-and-publish:
    name: Build and Publish Release Artifacts
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'push' }}
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    outputs:
      version: ${{ steps.version.outputs.version }}
      docker-image: ${{ steps.docker.outputs.image }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate version
        id: version
        run: |
          VERSION=$(date +%Y%m%d%H%M%S)-${GITHUB_SHA:0:8}
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "VERSION=$VERSION" >> $GITHUB_ENV

      - name: Run final tests
        run: |
          pnpm test:db:migrate
          pnpm test:unit
          pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

      - name: Build production artifacts
        run: pnpm build
        env:
          NODE_ENV: production
          VERSION: ${{ env.VERSION }}

      - name: Build Docker images
        id: docker
        run: |
          # Build Docker images for each app
          docker build -t myapp-web:${{ env.VERSION }} -f apps/web/Dockerfile .
          docker build -t myapp-api:${{ env.VERSION }} -f apps/api/Dockerfile .

          # Tag as latest
          docker tag myapp-web:${{ env.VERSION }} myapp-web:latest
          docker tag myapp-api:${{ env.VERSION }} myapp-api:latest

          echo "image=myapp:${{ env.VERSION }}" >> $GITHUB_OUTPUT

      - name: Save Docker images
        run: |
          docker save myapp-web:${{ env.VERSION }} myapp-api:${{ env.VERSION }} | gzip > docker-images-${{ env.VERSION }}.tar.gz

      - name: Upload Docker artifacts
        uses: actions/upload-artifact@v4
        with:
          name: docker-images-${{ env.VERSION }}
          path: docker-images-${{ env.VERSION }}.tar.gz
          retention-days: 90

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-artifacts-${{ env.VERSION }}
          path: |
            apps/*/dist/
            apps/*/.next/
            apps/*/build/
            packages/*/dist/
          retention-days: 90

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ env.VERSION }}
          release_name: Release v${{ env.VERSION }}
          body: |
            Automated release created from main branch
            - Commit: ${{ github.sha }}
            - Version: ${{ env.VERSION }}
          draft: false
          prerelease: false
```

**Environment Deployment**:

````yaml
# .github/workflows/deploy.yml - Deploy Single Artifact to Multiple Environments
name: Deploy to Environment

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy to'
        required: true
        type: choice
        options:
          - staging
          - production
      version:
        description: 'Version to deploy (leave empty for latest)'
        required: false
        type: string

jobs:
  deploy:
    name: Deploy to ${{ github.event.inputs.environment }}
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.event.inputs.environment }}
      url: ${{ steps.deploy.outputs.url }}

    steps:
      - uses: actions/checkout@v4

      - name: Determine version to deploy
        id: version
        run: |
          if [ -n "${{ github.event.inputs.version }}" ]; then
            VERSION="${{ github.event.inputs.version }}"
          else
            # Get latest version from releases
            VERSION=$(gh release list --limit 1 --json tagName --jq '.[0].tagName' | sed 's/^v//')
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "VERSION=$VERSION" >> $GITHUB_ENV
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: docker-images-${{ env.VERSION }}
          path: ./artifacts

      - name: Load Docker images
        run: |
          gunzip -c ./artifacts/docker-images-${{ env.VERSION }}.tar.gz | docker load

      - name: Setup environment configuration
        run: |
          case "${{ github.event.inputs.environment }}" in
            staging)
              echo "DEPLOY_URL=https://staging.myapp.com" >> $GITHUB_ENV
              echo "DATABASE_URL=${{ secrets.STAGING_DATABASE_URL }}" >> $GITHUB_ENV
              echo "REDIS_URL=${{ secrets.STAGING_REDIS_URL }}" >> $GITHUB_ENV
              ;;
            production)
              echo "DEPLOY_URL=https://myapp.com" >> $GITHUB_ENV
              echo "DATABASE_URL=${{ secrets.PROD_DATABASE_URL }}" >> $GITHUB_ENV
              echo "REDIS_URL=${{ secrets.PROD_REDIS_URL }}" >> $GITHUB_ENV
              ;;
          esac

      - name: Deploy to Vercel
        if: contains(github.repository, 'vercel-app')
        id: deploy-vercel
        run: |
          # Retag with environment-specific config
          docker tag myapp-web:${{ env.VERSION }} myapp-web:${{ github.event.inputs.environment }}

          # Deploy to Vercel (example)
          npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
          echo "url=${{ env.DEPLOY_URL }}" >> $GITHUB_OUTPUT

      - name: Deploy to AWS
        if: contains(github.repository, 'aws-app')
        id: deploy-aws
        run: |
          # Configure AWS CLI
          aws configure set aws_access_key_id ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws configure set aws_secret_access_key ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws configure set default.region ${{ secrets.AWS_REGION }}

          # Deploy using ECS/EKS/Lambda depending on setup
          case "${{ github.event.inputs.environment }}" in
            staging)
              # Deploy to staging cluster
              aws ecs update-service --cluster staging-cluster --service myapp-service --force-new-deployment
              ;;
            production)
              # Deploy to production cluster with approval
              aws ecs update-service --cluster production-cluster --service myapp-service --force-new-deployment
              ;;
          esac
          echo "url=${{ env.DEPLOY_URL }}" >> $GITHUB_OUTPUT

      - name: Deploy to GCP
        if: contains(github.repository, 'gcp-app')
        id: deploy-gcp
        run: |
          # Authenticate with GCP
          echo '${{ secrets.GCP_SA_KEY }}' | base64 -d > gcp-key.json
          gcloud auth activate-service-account --key-file gcp-key.json
          gcloud config set project ${{ secrets.GCP_PROJECT_ID }}

          # Deploy to Cloud Run
          gcloud run deploy myapp-${{ github.event.inputs.environment }} \
            --image myapp-web:${{ env.VERSION }} \
            --region us-central1 \
            --set-env-vars "DATABASE_URL=${{ env.DATABASE_URL }},REDIS_URL=${{ env.REDIS_URL }}" \
            --allow-unauthenticated
          echo "url=${{ env.DEPLOY_URL }}" >> $GITHUB_OUTPUT

      - name: Run deployment tests
        run: |
          # Wait for deployment to be ready
          timeout 300 bash -c 'until curl -f ${{ env.DEPLOY_URL }}/health; do sleep 10; done'

          # Run smoke tests
          curl -f ${{ env.DEPLOY_URL }}/api/health

          # Run environment-specific tests if needed
          if [ "${{ github.event.inputs.environment }}" = "staging" ]; then
            # Run more comprehensive tests on staging
            pnpm test:e2e:staging
          fi

      - name: Notify deployment
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          fields: repo,message,commit,author,action,eventName,ref,workflow
          text: |
            Deployment to ${{ github.event.inputs.environment }} ${{ job.status }}
            Version: ${{ env.VERSION }}
            URL: ${{ env.DEPLOY_URL }}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
**Schema CI/CD Complessivo**:

```mermaid
graph TD
    A[Push to any branch] --> B[CI: ci.yml]
    B --> C{Branch is main?}
    C -->|No| D[Only build & test]
    C -->|Yes| E[Build & Publish: build-and-publish.yml]

    E --> F[Create single artifact]
    F --> G[Store Docker images]
    F --> H[Create GitHub Release]

    I[Manual Deploy Trigger] --> J[Deploy: deploy.yml]
    J --> K[Download artifacts]
    K --> L{Environment?}

    L -->|staging| M[Configure staging env]
    L -->|production| N[Configure production env]

    M --> O[Deploy with staging config]
    N --> P[Deploy with production config]

    O --> Q[Run smoke tests]
    P --> Q
    Q --> R[Send notifications]
````

**Vantaggi di questa strategia**:

1. **Artifact Unico**: Un solo build per tutti gli ambienti, configurato runtime
2. **Velocità**: Build solo su main, deployment istantaneo da artifacts
3. **Consistenza**: Stesso codice testato su tutti gli ambienti
4. **Tracciabilità**: Versioning chiaro e release GitHub
5. **Flessibilità**: Deploy manuale con scelta di versione
6. **Sicurezza**: Configurazione ambiente-specifica separata

**Best Practice per Repository Secrets**:

```yaml
# Repository Secrets per ambiente
Staging:
  STAGING_DATABASE_URL: "..."
  STAGING_REDIS_URL: "..."

Production:
  PROD_DATABASE_URL: "..."
  PROD_REDIS_URL: "..."

Deployment:
  VERCEL_TOKEN: "..."
  AWS_ACCESS_KEY_ID: "..."
  AWS_SECRET_ACCESS_KEY: "..."
  GCP_SA_KEY: "..."

Notifications:
  SLACK_WEBHOOK: "..."
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

### 7.3 Monitoring e Osservabilità

Le strategie CI/CD implementate richiedono monitoraggio per garantire performance e affidabilità.
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Wait for services
        run: |
          timeout 60 bash -c 'until pg_isready -h localhost -p 5432; do sleep 1; done'
          timeout 60 bash -c 'until redis-cli -h localhost -p 6379 ping; do sleep 1; done'

      - name: Setup test database
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -d test_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
          npm run test:db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Run unit tests
        run: pnpm test:unit
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379
          E2E_BASE_URL: http://localhost:3000
```

**Test Database Management in CI/CD**:

- **Isolated Test Databases**: Each CI/CD run uses a fresh, isolated database instance
- **Automated Migrations**: Test database schema automatically applied before test execution
- **Test Data Seeding**: Consistent test data setup for reliable test execution
- **Cleanup Strategy**: Test databases cleaned up after test completion

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

## 🧪 Testing Infrastructure

### Testing Environment Setup

**Automated Test Environment Provisioning**: Consistent and reproducible test environments across local development and CI/CD pipelines.

**Environment Isolation Strategy**:

- **Local Testing**: Dedicated test database and cache instances via Docker Compose
- **CI/CD Testing**: Ephemeral test services provisioned per pipeline run
- **Staging Testing**: Persistent staging environment for integration and E2E testing
- **Performance Testing**: Dedicated load testing infrastructure for performance validation

**Test Environment Configuration**:

```yaml
# docker-compose.test.yml
version: "3.8"

services:
  app-test:
    build:
      context: .
      dockerfile: Dockerfile.test
    environment:
      NODE_ENV: test
      DATABASE_URL: postgresql://test_user:test_password@postgres_test:5432/app_test
      REDIS_URL: redis://redis_test:6379
    depends_on:
      postgres_test:
        condition: service_healthy
      redis_test:
        condition: service_healthy
    ports:
      - "3001:3000"

  postgres_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    volumes:
      - ./scripts/test-db-init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis_test:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### Test Database Management

**Database Isolation and Management**: Separate test databases to ensure test isolation and data consistency.

**Test Database Strategy**:

```bash
# Test database management scripts
#!/bin/bash

# Setup test database
setup_test_db() {
  echo "Setting up test database..."
  docker-compose -f docker-compose.test.yml up -d postgres_test
  wait-on tcp:localhost:5433

  # Apply migrations
  DATABASE_URL="postgresql://test_user:test_password@localhost:5433/app_test" \
    npm run db:migrate

  # Seed test data
  DATABASE_URL="postgresql://test_user:test_password@localhost:5433/app_test" \
    npm run db:seed:test
}

# Reset test database
reset_test_db() {
  echo "Resetting test database..."
  docker-compose -f docker-compose.test.yml restart postgres_test
  setup_test_db
}

# Cleanup test database
cleanup_test_db() {
  echo "Cleaning up test database..."
  docker-compose -f docker-compose.test.yml down -v
}
```

**Test Data Management**:

```typescript
// src/test/database.ts
import { PrismaClient } from "@prisma/client";

export class TestDatabase {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL,
        },
      },
    });
  }

  async setup(): Promise<void> {
    await this.prisma.$connect();
    await this.clearDatabase();
    await this.seedTestData();
  }

  async teardown(): Promise<void> {
    await this.clearDatabase();
    await this.prisma.$disconnect();
  }

  private async clearDatabase(): Promise<void> {
    const tablenames = await this.prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    for (const { tablename } of tablenames) {
      if (tablename !== "_prisma_migrations") {
        await this.prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "public"."${tablename}" CASCADE;`
        );
      }
    }
  }

  private async seedTestData(): Promise<void> {
    // Seed consistent test data
    await this.prisma.user.createMany({
      data: [
        { id: "test-user-1", email: "test1@example.com", name: "Test User 1" },
        { id: "test-user-2", email: "test2@example.com", name: "Test User 2" },
      ],
    });
  }
}
```

### Performance Testing Infrastructure

**Load Testing Environment Setup**: Dedicated infrastructure for performance testing and validation.

**Performance Testing Strategy**:

```yaml
# docker-compose.perf.yml - Performance Testing Infrastructure
version: "3.8"

services:
  app-perf:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://perf_user:perf_password@postgres_perf:5432/app_perf
      REDIS_URL: redis://redis_perf:6379
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: "1.0"
          memory: 1G
    depends_on:
      postgres_perf:
        condition: service_healthy
      redis_perf:
        condition: service_healthy

  postgres_perf:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app_perf
      POSTGRES_USER: perf_user
      POSTGRES_PASSWORD: perf_password
    volumes:
      - postgres_perf_data:/var/lib/postgresql/data
      - ./scripts/perf-db-init.sql:/docker-entrypoint-initdb.d/init.sql
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U perf_user"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis_perf:
    image: redis:7-alpine
    volumes:
      - redis_perf_data:/data
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  k6:
    image: grafana/k6:latest
    volumes:
      - ./performance-tests:/scripts
    command: run /scripts/load-test.js
    depends_on:
      - app-perf

volumes:
  postgres_perf_data:
  redis_perf_data:
```

**Load Testing Integration in CI/CD**:

```yaml
# .github/workflows/performance.yml
name: Performance Testing

on:
  push:
    branches: [main]
  schedule:
    - cron: "0 2 * * *" # Daily at 2 AM

jobs:
  performance-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup performance testing environment
        run: |
          docker-compose -f docker-compose.perf.yml up -d app-perf postgres_perf redis_perf
          # Wait for services to be ready
          timeout 300 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'

      - name: Run performance tests
        run: |
          docker-compose -f docker-compose.perf.yml run --rm k6

      - name: Upload performance results
        uses: actions/upload-artifact@v3
        with:
          name: performance-results
          path: performance-results/

      - name: Cleanup
        if: always()
        run: docker-compose -f docker-compose.perf.yml down -v
```

### Test Service Dependencies

**Service Integration Testing**: Docker Compose setup for testing service interactions and dependencies.

**Test Service Architecture**:

```yaml
# docker-compose.integration.yml
version: "3.8"

services:
  # Main application services
  web-app:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.test
    environment:
      NODE_ENV: test
      DATABASE_URL: postgresql://test_user:test_password@postgres:5432/web_test
      API_BASE_URL: http://api-service:3001
    depends_on:
      postgres:
        condition: service_healthy
      api-service:
        condition: service_started
    ports:
      - "3000:3000"

  api-service:
    build:
      context: ./apps/api
      dockerfile: Dockerfile.test
    environment:
      NODE_ENV: test
      DATABASE_URL: postgresql://test_user:test_password@postgres:5432/api_test
      REDIS_URL: redis://redis:6379
      PAYMENT_SERVICE_URL: http://payment-mock:3002
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      payment-mock:
        condition: service_started
    ports:
      - "3001:3001"

  # Mock external services
  payment-mock:
    build:
      context: ./test/mocks/payment-service
    environment:
      NODE_ENV: test
    ports:
      - "3002:3002"

  email-mock:
    build:
      context: ./test/mocks/email-service
    environment:
      NODE_ENV: test
    ports:
      - "3003:3003"

  # Shared test infrastructure
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: test_db
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    volumes:
      - ./scripts/test-db-setup.sql:/docker-entrypoint-initdb.d/setup.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

**Integration Test Execution**:

```bash
# scripts/run-integration-tests.sh
#!/bin/bash

set -e

echo "Starting integration test environment..."
docker-compose -f docker-compose.integration.yml up -d

echo "Waiting for services to be ready..."
wait-on http://localhost:3000/health http://localhost:3001/health

echo "Running integration tests..."
npm run test:integration

echo "Cleaning up test environment..."
docker-compose -f docker-compose.integration.yml down -v

echo "Integration tests completed!"
```

**Test Infrastructure Checklist**:

- [ ] **Test Environment Isolation**: Separate test databases and services
- [ ] **Automated Test Setup**: Scripts for consistent test environment provisioning
- [ ] **CI/CD Integration**: Test infrastructure integrated into deployment pipeline
- [ ] **Performance Testing**: Dedicated performance testing infrastructure
- [ ] **Service Mocking**: Mock external services for integration testing
- [ ] **Test Data Management**: Consistent test data seeding and cleanup
- [ ] **Environment Cleanup**: Proper cleanup of test resources after execution

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
- ✅ Testing environment setup automated and documented
- ✅ Test database management integrated into infrastructure
- ✅ CI/CD testing phases properly configured
- ✅ Performance testing infrastructure established
- ✅ Test service dependencies managed through Docker Compose

---

## 🔗 Related Documents

Core references for infrastructure implementation:

- **[Architectural Guidelines](01-architectural-guidelines.md)** - _Architecture determines deployment patterns_
- **[Technical Guidelines](03-technical-guidelines.md)** - _Tech stack requires specific infrastructure_
- **[Testing Strategy](07-testing-strategy.md)** - _Testing requires infrastructure setup_

Supporting documents:

- **[Code Design Guidelines](02-code-design-guidelines.md)** - _Code organization influences containerization_
