# Cloud DevOps Services

## Overview

Strategic guide for implementing DevOps practices using cloud-native services, covering CI/CD pipelines, automation, monitoring, and operational excellence across cloud providers.

## DevOps Service Categories

### Continuous Integration/Continuous Deployment

- **AWS CodePipeline/CodeBuild**: Native AWS integration, extensive service support
- **Google Cloud Build**: Container-native, fast builds, GitHub integration
- **Azure DevOps**: Comprehensive ALM, hybrid support, Microsoft integration
- **GitHub Actions**: Git-native, marketplace ecosystem, cost-effective

### Infrastructure as Code

- **AWS CloudFormation**: Native AWS service, drift detection, rollback support
- **Google Deployment Manager**: GCP-native, Python/Jinja2 templates
- **Azure Resource Manager**: ARM templates, bicep language, policy integration
- **Terraform**: Multi-cloud, large ecosystem, state management

### Monitoring and Observability

- **AWS CloudWatch**: Comprehensive metrics, logs, alarms, dashboards
- **Google Cloud Operations**: Integrated monitoring, APM, error reporting
- **Azure Monitor**: Unified monitoring, Application Insights, log analytics
- **Third-party**: Datadog, New Relic, Prometheus + Grafana

## Decision Matrix: DevOps Tools

| Tool Category          | AWS Native      | GCP Native         | Azure Native  | Multi-Cloud     | Complexity |
| ---------------------- | --------------- | ------------------ | ------------- | --------------- | ---------- |
| **CI/CD**              | CodePipeline    | Cloud Build        | Azure DevOps  | GitHub Actions  | Medium     |
| **IaC**                | CloudFormation  | Deployment Manager | ARM Templates | Terraform       | High       |
| **Monitoring**         | CloudWatch      | Cloud Operations   | Azure Monitor | Datadog         | Medium     |
| **Secrets**            | Secrets Manager | Secret Manager     | Key Vault     | HashiCorp Vault | Low        |
| **Container Registry** | ECR             | Container Registry | ACR           | Docker Hub      | Low        |

## CI/CD Pipeline Implementation

### GitHub Actions Workflow

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'
  TERRAFORM_VERSION: '1.5.0'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run security audit
        run: npm audit --audit-level=moderate

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  infrastructure:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: ${{ env.TERRAFORM_VERSION }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Terraform Init
        run: terraform init
        working-directory: ./infrastructure

      - name: Terraform Plan
        run: terraform plan -out=tfplan
        working-directory: ./infrastructure

      - name: Terraform Apply
        run: terraform apply tfplan
        working-directory: ./infrastructure

  deploy:
    needs: [infrastructure]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Build application
        run: |
          npm ci
          npm run build

      - name: Deploy to AWS
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          # Deploy to S3 and invalidate CloudFront
          aws s3 sync ./dist s3://${{ secrets.S3_BUCKET }} --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_ID }} --paths "/*"

      - name: Notify deployment
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployments'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### AWS CodePipeline Configuration

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'CI/CD Pipeline for application deployment'

Parameters:
  GitHubRepo:
    Type: String
    Default: 'myorg/myapp'
  GitHubBranch:
    Type: String
    Default: 'main'
  GitHubToken:
    Type: String
    NoEcho: true

Resources:
  # S3 bucket for artifacts
  ArtifactStore:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub '${AWS::StackName}-artifacts'
      VersioningConfiguration:
        Status: Enabled
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  # CodeBuild project for testing
  TestProject:
    Type: AWS::CodeBuild::Project
    Properties:
      Name: !Sub '${AWS::StackName}-test'
      ServiceRole: !GetAtt CodeBuildRole.Arn
      Artifacts:
        Type: CODEPIPELINE
      Environment:
        Type: LINUX_CONTAINER
        ComputeType: BUILD_GENERAL1_MEDIUM
        Image: aws/codebuild/amazonlinux2-x86_64-standard:3.0
        EnvironmentVariables:
          - Name: NODE_ENV
            Value: test
      Source:
        Type: CODEPIPELINE
        BuildSpec: |
          version: 0.2
          phases:
            pre_build:
              commands:
                - echo Logging in to Amazon ECR...
                - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
            build:
              commands:
                - echo Installing dependencies...
                - npm ci
                - echo Running tests...
                - npm run test:coverage
                - echo Running security audit...
                - npm audit --audit-level=moderate
            post_build:
              commands:
                - echo Build completed on `date`
          artifacts:
            files:
              - '**/*'

  # CodePipeline
  Pipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      Name: !Sub '${AWS::StackName}-pipeline'
      RoleArn: !GetAtt CodePipelineRole.Arn
      ArtifactStore:
        Type: S3
        Location: !Ref ArtifactStore
      Stages:
        - Name: Source
          Actions:
            - Name: SourceAction
              ActionTypeId:
                Category: Source
                Owner: ThirdParty
                Provider: GitHub
                Version: '1'
              Configuration:
                Owner: !Select [0, !Split ['/', !Ref GitHubRepo]]
                Repo: !Select [1, !Split ['/', !Ref GitHubRepo]]
                Branch: !Ref GitHubBranch
                OAuthToken: !Ref GitHubToken
              OutputArtifacts:
                - Name: SourceOutput

        - Name: Test
          Actions:
            - Name: TestAction
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: '1'
              Configuration:
                ProjectName: !Ref TestProject
              InputArtifacts:
                - Name: SourceOutput
              OutputArtifacts:
                - Name: TestOutput

        - Name: Deploy
          Actions:
            - Name: DeployAction
              ActionTypeId:
                Category: Deploy
                Owner: AWS
                Provider: CloudFormation
                Version: '1'
              Configuration:
                ActionMode: CREATE_UPDATE
                StackName: !Sub '${AWS::StackName}-app'
                TemplatePath: TestOutput::infrastructure/template.yaml
                Capabilities: CAPABILITY_IAM
                RoleArn: !GetAtt CloudFormationRole.Arn
              InputArtifacts:
                - Name: TestOutput
```

## Infrastructure as Code

### Terraform Multi-Environment Setup

```hcl
# terraform/environments/production/main.tf
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "myorg-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "production"
      Project     = var.project_name
      ManagedBy   = "terraform"
    }
  }
}

# Local values for environment-specific configuration
locals {
  environment = "production"

  # Environment-specific settings
  instance_count = 3
  instance_type  = "t3.large"
  db_instance_class = "db.r5.xlarge"

  # Common tags
  common_tags = {
    Environment = local.environment
    Project     = var.project_name
  }
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  environment = local.environment
  cidr_block  = "10.0.0.0/16"

  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

  tags = local.common_tags
}

# Application Module
module "application" {
  source = "../../modules/application"

  environment    = local.environment
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  instance_count = local.instance_count
  instance_type  = local.instance_type

  tags = local.common_tags
}

# Database Module
module "database" {
  source = "../../modules/database"

  environment       = local.environment
  vpc_id           = module.vpc.vpc_id
  subnet_ids       = module.vpc.database_subnet_ids
  instance_class   = local.db_instance_class

  tags = local.common_tags
}
```

### Application Module

```hcl
# terraform/modules/application/main.tf
resource "aws_launch_template" "app" {
  name_prefix   = "${var.environment}-app-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type

  vpc_security_group_ids = [aws_security_group.app.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.app.name
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    environment = var.environment
    app_version = var.app_version
  }))

  tag_specifications {
    resource_type = "instance"
    tags = merge(var.tags, {
      Name = "${var.environment}-app"
    })
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "${var.environment}-app-asg"
  vpc_zone_identifier = var.subnet_ids
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"

  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.instance_count

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # Instance refresh for zero-downtime deployments
  instance_refresh {
    strategy = "Rolling"
    preferences {
      instance_warmup        = 300
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-app-asg"
    propagate_at_launch = false
  }
}

# Auto-scaling policies
resource "aws_autoscaling_policy" "scale_up" {
  name                   = "${var.environment}-app-scale-up"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown              = 300
  autoscaling_group_name = aws_autoscaling_group.app.name
}

resource "aws_autoscaling_policy" "scale_down" {
  name                   = "${var.environment}-app-scale-down"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown              = 300
  autoscaling_group_name = aws_autoscaling_group.app.name
}
```

## Monitoring and Alerting

### CloudWatch Dashboard

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch'

const cloudWatch = new CloudWatch({ region: 'us-east-1' })

export async function createApplicationDashboard() {
  const dashboardBody = {
    widgets: [
      {
        type: 'metric',
        x: 0,
        y: 0,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            [
              'AWS/ApplicationELB',
              'TargetResponseTime',
              'LoadBalancer',
              'app/production-alb/1234567890123456',
            ],
            ['...', 'RequestCount', '...', '.'],
            ['...', 'HTTPCode_Target_2XX_Count', '...', '.'],
            ['...', 'HTTPCode_Target_4XX_Count', '...', '.'],
            ['...', 'HTTPCode_Target_5XX_Count', '...', '.'],
          ],
          view: 'timeSeries',
          stacked: false,
          region: 'us-east-1',
          period: 300,
          title: 'Application Load Balancer Metrics',
        },
      },
      {
        type: 'metric',
        x: 0,
        y: 6,
        width: 12,
        height: 6,
        properties: {
          metrics: [
            ['AWS/EC2', 'CPUUtilization', 'AutoScalingGroupName', 'production-app-asg'],
            ['...', 'NetworkIn', '...', '.'],
            ['...', 'NetworkOut', '...', '.'],
          ],
          view: 'timeSeries',
          stacked: false,
          region: 'us-east-1',
          period: 300,
          title: 'EC2 Instance Metrics',
        },
      },
    ],
  }

  await cloudWatch.putDashboard({
    DashboardName: 'ApplicationDashboard',
    DashboardBody: JSON.stringify(dashboardBody),
  })
}
```

### Custom Metrics and Alarms

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch'

const cloudWatch = new CloudWatch({ region: 'us-east-1' })

// Custom application metrics
export async function publishCustomMetrics(metricData: {
  metricName: string
  value: number
  unit?: string
  dimensions?: Array<{ Name: string; Value: string }>
}) {
  await cloudWatch.putMetricData({
    Namespace: 'MyApp/Custom',
    MetricData: [
      {
        MetricName: metricData.metricName,
        Value: metricData.value,
        Unit: metricData.unit || 'Count',
        Timestamp: new Date(),
        Dimensions: metricData.dimensions || [],
      },
    ],
  })
}

// Application performance tracking
export class PerformanceTracker {
  private metrics: Map<string, number> = new Map()

  startTimer(operation: string): void {
    this.metrics.set(operation, Date.now())
  }

  async endTimer(operation: string): Promise<void> {
    const startTime = this.metrics.get(operation)
    if (startTime) {
      const duration = Date.now() - startTime
      await publishCustomMetrics({
        metricName: 'OperationDuration',
        value: duration,
        unit: 'Milliseconds',
        dimensions: [
          { Name: 'Operation', Value: operation },
          { Name: 'Environment', Value: process.env.NODE_ENV || 'development' },
        ],
      })
      this.metrics.delete(operation)
    }
  }
}

// Usage in application
const tracker = new PerformanceTracker()

export async function processOrder(orderData: any) {
  tracker.startTimer('processOrder')

  try {
    const result = await orderProcessingLogic(orderData)

    await publishCustomMetrics({
      metricName: 'OrderProcessed',
      value: 1,
      dimensions: [
        { Name: 'Status', Value: 'Success' },
        { Name: 'Environment', Value: process.env.NODE_ENV || 'development' },
      ],
    })

    return result
  } catch (error) {
    await publishCustomMetrics({
      metricName: 'OrderProcessed',
      value: 1,
      dimensions: [
        { Name: 'Status', Value: 'Error' },
        { Name: 'Environment', Value: process.env.NODE_ENV || 'development' },
      ],
    })

    throw error
  } finally {
    await tracker.endTimer('processOrder')
  }
}
```

## Secrets Management

### AWS Secrets Manager Integration

```typescript
import { SecretsManager } from '@aws-sdk/client-secrets-manager'

const secretsManager = new SecretsManager({ region: 'us-east-1' })

interface DatabaseCredentials {
  username: string
  password: string
  host: string
  port: number
  database: string
}

export async function getSecret<T = any>(secretId: string): Promise<T> {
  try {
    const result = await secretsManager.getSecretValue({
      SecretId: secretId,
    })

    if (result.SecretString) {
      return JSON.parse(result.SecretString)
    } else if (result.SecretBinary) {
      return JSON.parse(Buffer.from(result.SecretBinary).toString())
    }

    throw new Error('Secret value not found')
  } catch (error) {
    console.error(`Failed to retrieve secret ${secretId}:`, error)
    throw error
  }
}

// Database connection with secrets
export async function createDatabaseConnection() {
  const credentials = await getSecret<DatabaseCredentials>('production/database/credentials')

  return new Pool({
    user: credentials.username,
    password: credentials.password,
    host: credentials.host,
    port: credentials.port,
    database: credentials.database,
    ssl: {
      rejectUnauthorized: false,
    },
  })
}

// Secret rotation function
export async function rotateSecret(secretId: string) {
  await secretsManager.rotateSecret({
    SecretId: secretId,
    ForceRotateSecrets: false,
  })
}
```

### Environment-Specific Configuration

```typescript
// config/index.ts
interface Config {
  database: {
    host: string
    port: number
    name: string
    ssl: boolean
  }
  redis: {
    url: string
  }
  aws: {
    region: string
    s3Bucket: string
  }
  app: {
    port: number
    logLevel: string
    corsOrigins: string[]
  }
}

class ConfigManager {
  private config: Config | null = null

  async initialize(): Promise<void> {
    const environment = process.env.NODE_ENV || 'development'

    if (environment === 'production') {
      // Load from Secrets Manager in production
      const secrets = await getSecret('production/app/config')
      this.config = this.parseConfig(secrets)
    } else {
      // Load from environment variables in development
      this.config = this.parseConfig(process.env)
    }
  }

  private parseConfig(source: any): Config {
    return {
      database: {
        host: source.DB_HOST || 'localhost',
        port: parseInt(source.DB_PORT || '5432'),
        name: source.DB_NAME || 'myapp',
        ssl: source.DB_SSL === 'true',
      },
      redis: {
        url: source.REDIS_URL || 'redis://localhost:6379',
      },
      aws: {
        region: source.AWS_REGION || 'us-east-1',
        s3Bucket: source.S3_BUCKET || 'default-bucket',
      },
      app: {
        port: parseInt(source.PORT || '3000'),
        logLevel: source.LOG_LEVEL || 'info',
        corsOrigins: source.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      },
    }
  }

  get(): Config {
    if (!this.config) {
      throw new Error('Config not initialized. Call initialize() first.')
    }
    return this.config
  }
}

export const configManager = new ConfigManager()
```

## Cost Optimization

### Resource Tagging Strategy

```terraform
# Standard tagging for cost allocation
locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Owner       = var.team_name
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
    CreatedDate = formatdate("YYYY-MM-DD", timestamp())
  }
}

# Tag all resources consistently
resource "aws_instance" "app" {
  # ... other configuration

  tags = merge(local.common_tags, {
    Name = "${var.environment}-app-server"
    Type = "application"
  })
}
```

### Cost Monitoring and Budgets

```typescript
import { Budgets } from '@aws-sdk/client-budgets'

const budgets = new Budgets({ region: 'us-east-1' })

export async function createCostBudget(accountId: string) {
  await budgets.createBudget({
    AccountId: accountId,
    Budget: {
      BudgetName: 'Monthly-Cost-Budget',
      BudgetType: 'COST',
      TimeUnit: 'MONTHLY',
      TimePeriod: {
        Start: new Date('2023-01-01'),
        End: new Date('2024-12-31'),
      },
      BudgetLimit: {
        Amount: '1000',
        Unit: 'USD',
      },
      CostFilters: {
        Service: ['Amazon Elastic Compute Cloud - Compute'],
      },
    },
    NotificationsWithSubscribers: [
      {
        Notification: {
          NotificationType: 'ACTUAL',
          ComparisonOperator: 'GREATER_THAN',
          Threshold: 80,
          ThresholdType: 'PERCENTAGE',
        },
        Subscribers: [
          {
            SubscriptionType: 'EMAIL',
            Address: 'devops@company.com',
          },
        ],
      },
    ],
  })
}
```

## Implementation Checklist

### Planning Phase

- [ ] Define CI/CD pipeline requirements and stages
- [ ] Choose appropriate DevOps tools and platforms
- [ ] Plan infrastructure as code strategy
- [ ] Design monitoring and alerting approach
- [ ] Establish security and compliance requirements

### Implementation Phase

- [ ] Set up source control and branching strategy
- [ ] Implement CI/CD pipelines with proper testing
- [ ] Configure infrastructure as code with state management
- [ ] Set up monitoring, logging, and alerting
- [ ] Implement secrets management and security controls

### Optimization Phase

- [ ] Monitor pipeline performance and costs
- [ ] Optimize build times and resource usage
- [ ] Implement automated testing and quality gates
- [ ] Review and improve operational procedures
- [ ] Plan for scaling and operational excellence
