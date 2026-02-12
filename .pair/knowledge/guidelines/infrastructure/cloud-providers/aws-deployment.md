# AWS Deployment Patterns

## Overview

Comprehensive guide for deploying applications on Amazon Web Services, covering best practices, architectural patterns, and operational excellence.

## Core AWS Services for Deployment

### Compute Services

- **EC2**: Virtual machines for general-purpose computing
- **ECS**: Container orchestration service
- **EKS**: Managed Kubernetes service
- **Lambda**: Serverless compute for event-driven architectures
- **App Runner**: Fully managed container deployment service

### Storage and Database

- **S3**: Object storage for static assets and backups
- **EBS**: Block storage for EC2 instances
- **RDS**: Managed relational databases
- **DynamoDB**: NoSQL database for scalable applications
- **ElastiCache**: In-memory caching service

### Networking and Security

- **VPC**: Virtual private cloud for network isolation
- **ALB/NLB**: Application and network load balancers
- **CloudFront**: Content delivery network
- **Route 53**: DNS and domain management
- **IAM**: Identity and access management

## Deployment Architectures

### 1. Traditional Three-Tier Architecture

```text
Internet Gateway
    ↓
Application Load Balancer (Public Subnet)
    ↓
EC2 Instances (Private Subnet)
    ↓
RDS Database (Private Subnet)
```

**Use Cases:** Traditional web applications, existing monoliths
**Benefits:** Familiar pattern, easy to understand and manage
**Considerations:** Scaling limitations, single points of failure

### 2. Containerized Microservices

```text
CloudFront CDN
    ↓
Application Load Balancer
    ↓
ECS/EKS Cluster (Multiple AZs)
    ↓
RDS/DynamoDB (Multi-AZ)
```

**Use Cases:** Modern applications, microservices architectures
**Benefits:** Scalability, fault tolerance, technology diversity
**Considerations:** Increased complexity, distributed system challenges

### 3. Serverless Architecture

```text
CloudFront CDN
    ↓
API Gateway
    ↓
Lambda Functions
    ↓
DynamoDB/RDS Proxy
```

**Use Cases:** Event-driven applications, variable workloads
**Benefits:** Auto-scaling, pay-per-use, reduced operational overhead
**Considerations:** Vendor lock-in, cold start latency, debugging complexity

## Infrastructure as Code Patterns

### CloudFormation Templates

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Web application infrastructure'

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsHostnames: true
      EnableDnsSupport: true
      Tags:
        - Key: Name
          Value: !Sub '${Environment}-vpc'
```

### CDK (TypeScript) Example

```typescript
import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'

export class WebAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 1,
    })

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    })
  }
}
```

## Deployment Strategies

### Blue-Green Deployment

**Pattern:** Maintain two identical production environments
**AWS Services:** CodeDeploy, ALB, Route 53
**Benefits:** Zero-downtime deployments, instant rollback
**Use Cases:** Critical applications, production deployments

```yaml
# CodeDeploy configuration
Resources:
  BlueGreenDeployment:
    Type: AWS::CodeDeploy::DeploymentGroup
    Properties:
      BlueGreenDeploymentConfiguration:
        TerminateBlueInstancesOnDeploymentSuccess:
          Action: TERMINATE
          TerminationWaitTimeInMinutes: 5
        DeploymentReadyOption:
          ActionOnTimeout: CONTINUE_DEPLOYMENT
```

### Canary Deployment

**Pattern:** Gradual traffic shifting to new version
**AWS Services:** ALB with weighted routing, CloudWatch
**Benefits:** Risk mitigation, performance validation
**Use Cases:** New features, performance-sensitive applications

### Rolling Deployment

**Pattern:** Sequential update of instances/containers
**AWS Services:** ECS, Auto Scaling Groups, CodeDeploy
**Benefits:** Resource efficiency, continuous availability
**Use Cases:** Stateless applications, gradual rollouts

## Security Best Practices

### Network Security

```typescript
// VPC with private subnets
const vpc = new ec2.Vpc(this, 'SecureVPC', {
  cidr: '10.0.0.0/16',
  maxAzs: 3,
  subnetConfiguration: [
    {
      cidrMask: 24,
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC,
    },
    {
      cidrMask: 24,
      name: 'Private',
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    },
    {
      cidrMask: 24,
      name: 'Isolated',
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    },
  ],
})
```

### IAM Policies

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-app-bucket/*",
      "Condition": {
        "StringEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    }
  ]
}
```

### Secrets Management

```typescript
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'

const dbSecret = new secretsmanager.Secret(this, 'DBSecret', {
  description: 'Database credentials',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: 'admin' }),
    generateStringKey: 'password',
    excludeCharacters: '"@/\\',
  },
})
```

## Monitoring and Observability

### CloudWatch Configuration

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'

const cpuAlarm = new cloudwatch.Alarm(this, 'CPUAlarm', {
  metric: service.metricCpuUtilization(),
  threshold: 80,
  evaluationPeriods: 2,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
})

const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
  widgets: [
    [
      new cloudwatch.GraphWidget({
        title: 'CPU Utilization',
        left: [service.metricCpuUtilization()],
      }),
    ],
  ],
})
```

### X-Ray Tracing

```typescript
import * as ecs from 'aws-cdk-lib/aws-ecs'

const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef')
taskDefinition.addContainer('app', {
  image: ecs.ContainerImage.fromRegistry('my-app:latest'),
  environment: {
    _X_AMZN_TRACE_ID: 'true',
  },
})
```

## Cost Optimization Strategies

### Right-Sizing Instances

- **Compute Optimizer**: Automated right-sizing recommendations
- **CloudWatch Metrics**: Monitor actual usage patterns
- **Spot Instances**: Use for fault-tolerant workloads
- **Reserved Instances**: Commit to long-term usage for discounts

### Storage Optimization

```typescript
// S3 Lifecycle policies
const bucket = new s3.Bucket(this, 'DataBucket', {
  lifecycleRules: [
    {
      id: 'ArchiveOldData',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: cdk.Duration.days(30),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(90),
        },
      ],
    },
  ],
})
```

### Auto-Scaling Configuration

```typescript
const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
  vpc,
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  machineImage: ec2.MachineImage.latestAmazonLinux(),
  minCapacity: 1,
  maxCapacity: 10,
  desiredCapacity: 2,
})

autoScalingGroup.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
  scaleInCooldown: cdk.Duration.minutes(5),
  scaleOutCooldown: cdk.Duration.minutes(5),
})
```

## Disaster Recovery Patterns

### Multi-AZ Deployment

```typescript
const database = new rds.DatabaseInstance(this, 'Database', {
  engine: rds.DatabaseInstanceEngine.postgres(),
  multiAz: true,
  backupRetention: cdk.Duration.days(7),
  deleteAutomatedBackups: false,
})
```

### Cross-Region Backup

```typescript
const replicationRule = new backup.BackupPlan(this, 'BackupPlan', {
  backupPlanRules: [
    new backup.BackupPlanRule({
      ruleName: 'DailyBackups',
      targets: [backup.BackupResource.fromRdsDatabase(database)],
      scheduleExpression: events.Schedule.cron({
        hour: '5',
        minute: '0',
      }),
      copyActions: [
        {
          destinationBackupVault: crossRegionVault,
          deleteAfter: cdk.Duration.days(30),
        },
      ],
    }),
  ],
})
```

## Implementation Checklist

### Pre-Deployment

- [ ] Define infrastructure requirements
- [ ] Design network architecture
- [ ] Plan security and compliance requirements
- [ ] Estimate costs and set budgets
- [ ] Design disaster recovery strategy

### Deployment Phase

- [ ] Implement infrastructure as code
- [ ] Set up monitoring and alerting
- [ ] Configure security policies
- [ ] Implement backup strategies
- [ ] Test deployment pipeline

### Post-Deployment

- [ ] Monitor performance and costs
- [ ] Optimize resource utilization
- [ ] Review security configurations
- [ ] Test disaster recovery procedures
- [ ] Plan for scaling and growth

## Troubleshooting Common Issues

### Performance Issues

- **EC2**: Check instance metrics, network throughput
- **RDS**: Monitor connection counts, query performance
- **Lambda**: Analyze cold starts, memory allocation
- **ELB**: Review load balancer metrics, target health

### Security Issues

- **IAM**: Review permissions, access patterns
- **VPC**: Check security groups, NACLs
- **CloudTrail**: Audit API calls and access patterns
- **GuardDuty**: Monitor for security threats

### Cost Optimization

- **Cost Explorer**: Analyze spending patterns
- **Trusted Advisor**: Review optimization recommendations
- **CloudWatch**: Monitor resource utilization
- **Billing Alerts**: Set up cost threshold notifications
