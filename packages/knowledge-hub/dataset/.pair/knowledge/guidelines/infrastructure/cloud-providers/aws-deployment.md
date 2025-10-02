# AWS Deployment Strategy

## 🎯 Overview

**Purpose**: AWS-specific deployment patterns, infrastructure setup, and service integration for production-ready applications.

**Scope**: AWS service selection, deployment automation, cost optimization, and operational excellence within the AWS ecosystem.

**Prerequisites**: AWS account setup, IAM roles configuration, and basic familiarity with AWS services.

---

## 🚀 Quick Start Decision Tree

```
Do you need AWS deployment?
├─ Yes → What type of application?
│  ├─ Serverless → Consider [Lambda + API Gateway](#serverless-deployment)
│  ├─ Containerized → Choose [ECS](#container-deployment) or [EKS](#kubernetes-deployment)
│  └─ Traditional → Use [EC2](#traditional-deployment)
├─ No → Consider [other cloud providers](README.md)
└─ Unsure → Review [AWS Service Selection](#service-selection)
```

---

## 📋 Service Selection Matrix

| Use Case          | Compute Service      | Database     | Storage | Deployment Method  |
| ----------------- | -------------------- | ------------ | ------- | ------------------ |
| **Web App**       | Lambda/ECS           | RDS          | S3      | CloudFormation/CDK |
| **API Service**   | API Gateway + Lambda | DynamoDB     | S3      | SAM/Serverless     |
| **Enterprise**    | EKS                  | RDS Multi-AZ | EFS/S3  | Terraform/CDK      |
| **Microservices** | ECS/EKS              | Multiple RDS | S3      | Service Mesh       |

---

## 🔧 Deployment Patterns

### Serverless Deployment

**Best for**: Event-driven applications, APIs, moderate traffic, cost optimization.

**Core Services**:

- **AWS Lambda**: Serverless compute
- **API Gateway**: REST/GraphQL APIs
- **DynamoDB**: NoSQL database
- **S3**: Static assets and file storage

**Infrastructure as Code Example**:

```typescript
// cdk/serverless-stack.ts
import * as cdk from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'

export class ServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Lambda function
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('dist'),
      environment: {
        DATABASE_URL: process.env.DATABASE_URL!,
        NODE_ENV: 'production',
      },
    })

    // API Gateway
    const api = new apigateway.LambdaRestApi(this, 'Api', {
      handler: apiFunction,
      proxy: true,
    })
  }
}
```

### Container Deployment

**Best for**: Consistent environments, microservices, scalable applications.

**ECS (Managed Containers)**:

```yaml
# ecs-task-definition.json
{
  'family': 'app-task',
  'networkMode': 'awsvpc',
  'requiresCompatibilities': ['FARGATE'],
  'cpu': '256',
  'memory': '512',
  'containerDefinitions':
    [
      {
        'name': 'app',
        'image': '123456789012.dkr.ecr.us-east-1.amazonaws.com/app:latest',
        'portMappings': [{ 'containerPort': 3000 }],
        'environment': [{ 'name': 'NODE_ENV', 'value': 'production' }],
        'secrets':
          [
            {
              'name': 'DATABASE_URL',
              'valueFrom': 'arn:aws:ssm:us-east-1:123456789012:parameter/app/database-url',
            },
          ],
      },
    ],
}
```

### Kubernetes Deployment

**Best for**: Complex orchestration, enterprise workloads, multi-service applications.

**EKS Implementation**:

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
      containers:
        - name: app
          image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/app:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
```

---

## 🛠️ Infrastructure Setup

### Core AWS Services Configuration

**VPC and Networking**:

```typescript
// cdk/network-stack.ts
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    })
  }
}
```

**RDS Database**:

```typescript
// cdk/database-stack.ts
export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props)

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      multiAz: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
    })
  }
}
```

### Security Configuration

**IAM Roles and Policies**:

```typescript
// cdk/security-stack.ts
export class SecurityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Application execution role
    const appRole = new iam.Role(this, 'AppRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    })

    // Application-specific permissions
    appRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'secretsmanager:GetSecretValue'],
        resources: ['arn:aws:ssm:*:*:parameter/app/*'],
      }),
    )
  }
}
```

---

## 🔄 CI/CD Integration

### GitHub Actions with AWS

```yaml
# .github/workflows/deploy-aws.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Build and push to ECR
        run: |
          aws ecr get-login-password --region us-east-1 | \
            docker login --username AWS --password-stdin \
            123456789012.dkr.ecr.us-east-1.amazonaws.com

          docker build -t app .
          docker tag app:latest \
            123456789012.dkr.ecr.us-east-1.amazonaws.com/app:latest
          docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/app:latest

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster production \
            --service app \
            --force-new-deployment
```

---

## 💰 Cost Optimization

### Cost Management Strategies

**Right-sizing Resources**:

- Use AWS Compute Optimizer recommendations
- Monitor CloudWatch metrics for utilization
- Implement auto-scaling based on demand

**Reserved Instances and Savings Plans**:

- Commit to 1-3 year terms for predictable workloads
- Use Spot Instances for fault-tolerant workloads
- Leverage AWS Cost Explorer for optimization insights

**Service Selection**:

- Choose managed services to reduce operational overhead
- Use serverless options for variable workloads
- Implement lifecycle policies for S3 storage

---

## 📊 Monitoring and Observability

### CloudWatch Integration

```typescript
// cdk/monitoring-stack.ts
export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // Application dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'AppDashboard', {
      dashboardName: 'Application-Metrics',
    })

    // Alarms
    const errorAlarm = new cloudwatch.Alarm(this, 'HighErrorRate', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_Target_5XX_Count',
        statistic: 'Sum',
      }),
      threshold: 10,
      evaluationPeriods: 2,
    })
  }
}
```

---

## 🔐 Security Best Practices

### Security Implementation Checklist

- [ ] **IAM Least Privilege**: Grant minimum required permissions
- [ ] **VPC Security Groups**: Restrict network access to necessary ports
- [ ] **Encryption**: Enable at-rest and in-transit encryption
- [ ] **Secrets Management**: Use AWS Secrets Manager or Parameter Store
- [ ] **Compliance**: Implement AWS Config rules for compliance
- [ ] **Backup Strategy**: Automate backups for critical data
- [ ] **Incident Response**: Set up CloudTrail for audit logging

---

## 🚀 Next Steps

1. **Choose Deployment Pattern**: Select based on application requirements
2. **Set Up Infrastructure**: Use CDK or Terraform for infrastructure as code
3. **Configure CI/CD**: Implement automated deployment pipeline
4. **Enable Monitoring**: Set up CloudWatch dashboards and alarms
5. **Optimize Costs**: Implement cost monitoring and optimization strategies

---

## 🔗 Related Resources

- **[Infrastructure as Code](../infrastructure-as-code/README.md)**: IaC implementation patterns
- **[Container Orchestration](../container-orchestration/README.md)**: Kubernetes and Docker strategies
- **[Deployment Patterns](../deployment-patterns/README.md)**: General deployment strategies
- **[Cost Optimization](cost-optimization.md)**: Multi-cloud cost management

---

**Next**: [GCP Deployment](gcp-deployment.md) | **Previous**: [Cloud Providers Strategy](README.md)
