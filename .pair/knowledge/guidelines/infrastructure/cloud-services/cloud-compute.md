# Cloud Compute Services

## Overview

Strategic guide for selecting and implementing cloud compute services, from virtual machines to serverless functions, optimizing for performance, cost, and operational efficiency.

## Compute Service Categories

### Virtual Machines (IaaS)

- **EC2 (AWS)**: Broadest instance type selection, spot instances, dedicated hosts
- **Compute Engine (GCP)**: Custom machine types, preemptible instances, live migration
- **Virtual Machines (Azure)**: Hybrid connectivity, Windows integration, B-series burstable

### Container Services (CaaS)

- **ECS/EKS (AWS)**: Managed Kubernetes, Fargate serverless containers
- **GKE (GCP)**: Autopilot mode, advanced scheduling, Workload Identity
- **AKS (Azure)**: Azure Arc integration, virtual nodes, policy management

### Serverless Compute (FaaS)

- **Lambda (AWS)**: Largest ecosystem, 15-minute timeout, extensive triggers
- **Cloud Functions (GCP)**: HTTP functions, background functions, multi-language support
- **Azure Functions (Azure)**: Premium plan, Durable Functions, hybrid deployments

### Platform as a Service (PaaS)

- **App Engine (GCP)**: Auto-scaling, traffic splitting, version management
- **Elastic Beanstalk (AWS)**: Application deployment, environment management
- **App Service (Azure)**: Windows/Linux support, deployment slots, custom domains

## Decision Matrix: Compute Selection

| Use Case                  | Virtual Machines | Containers | Serverless | PaaS      |
| ------------------------- | ---------------- | ---------- | ---------- | --------- |
| **Legacy Applications**   | Excellent        | Good       | Poor       | Good      |
| **Microservices**         | Good             | Excellent  | Good       | Fair      |
| **Event-Driven**          | Poor             | Good       | Excellent  | Fair      |
| **Batch Processing**      | Good             | Good       | Excellent  | Poor      |
| **Web Applications**      | Good             | Good       | Good       | Excellent |
| **Long-Running Services** | Excellent        | Excellent  | Poor       | Excellent |

## Implementation Patterns

### Auto-Scaling Configuration

```yaml
# AWS ECS Auto Scaling
Resources:
  ECSService:
    Type: AWS::ECS::Service
    Properties:
      ServiceName: web-service
      Cluster: !Ref ECSCluster
      TaskDefinition: !Ref TaskDefinition
      DesiredCount: 2
      LaunchType: FARGATE

  ServiceScalingTarget:
    Type: AWS::ApplicationAutoScaling::ScalableTarget
    Properties:
      MaxCapacity: 10
      MinCapacity: 2
      ResourceId: !Sub service/${ECSCluster}/${ECSService.Name}
      RoleARN: !GetAtt ApplicationAutoScalingECSRole.Arn
      ScalableDimension: ecs:service:DesiredCount
      ServiceNamespace: ecs

  ServiceScalingPolicy:
    Type: AWS::ApplicationAutoScaling::ScalingPolicy
    Properties:
      PolicyName: cpu-scaling
      PolicyType: TargetTrackingScaling
      ScalingTargetId: !Ref ServiceScalingTarget
      TargetTrackingScalingPolicyConfiguration:
        PredefinedMetricSpecification:
          PredefinedMetricType: ECSServiceAverageCPUUtilization
        TargetValue: 70.0
```

### Serverless Function Optimization

```typescript
// AWS Lambda with optimal configuration
export const handler = async (event: any, context: any) => {
  // Connection reuse for better performance
  const dbConnection = await getOrCreateConnection()

  try {
    // Process event
    const result = await processEvent(event, dbConnection)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
      },
      body: JSON.stringify(result),
    }
  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

// Optimized configuration
export const config = {
  runtime: 'nodejs18.x',
  memorySize: 512, // Start small, monitor and adjust
  timeout: 30, // Set based on actual needs
  environment: {
    NODE_OPTIONS: '--enable-source-maps',
  },
  // Reserved concurrency to control costs
  reservedConcurrency: 100,
}
```

## Cost Optimization Strategies

### Instance Right-Sizing

```bash
# AWS CLI commands for optimization
# Get CPU utilization metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --start-time 2023-01-01T00:00:00Z \
  --end-time 2023-01-31T23:59:59Z \
  --period 3600 \
  --statistics Average

# Get memory utilization (requires CloudWatch agent)
aws cloudwatch get-metric-statistics \
  --namespace CWAgent \
  --metric-name mem_used_percent \
  --dimensions Name=InstanceId,Value=i-1234567890abcdef0 \
  --start-time 2023-01-01T00:00:00Z \
  --end-time 2023-01-31T23:59:59Z \
  --period 3600 \
  --statistics Average
```

### Spot Instance Implementation

```terraform
# Terraform configuration for spot instances
resource "aws_launch_template" "web_server" {
  name_prefix   = "web-server-"
  image_id      = "ami-0c02fb55956c7d316"
  instance_type = "t3.medium"

  vpc_security_group_ids = [aws_security_group.web.id]

  # Spot instance configuration
  instance_market_options {
    market_type = "spot"
    spot_options {
      max_price = "0.05"  # Maximum price per hour
    }
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    app_version = var.app_version
  }))
}

resource "aws_autoscaling_group" "web_asg" {
  name                = "web-asg"
  vpc_zone_identifier = var.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.web.arn]
  health_check_type   = "ELB"

  min_size         = 2
  max_size         = 10
  desired_capacity = 3

  # Mixed instances policy for cost optimization
  mixed_instances_policy {
    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.web_server.id
        version           = "$Latest"
      }

      override {
        instance_type = "t3.medium"
      }
      override {
        instance_type = "t3.large"
      }
    }

    instances_distribution {
      on_demand_base_capacity                  = 1
      on_demand_percentage_above_base_capacity = 25
      spot_allocation_strategy                 = "diversified"
    }
  }
}
```

## Performance Optimization

### Container Resource Management

```yaml
# Kubernetes resource management
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
        - name: web-app
          image: web-app:latest
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: web-app-service
spec:
  selector:
    app: web-app
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-app
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

## Security Best Practices

### IAM and Security Groups

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::my-app-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": ["rds:DescribeDBInstances"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/db/credentials-*"
    }
  ]
}
```

### Network Security

```terraform
# Security group for web tier
resource "aws_security_group" "web_tier" {
  name_prefix = "web-tier-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "web-tier-sg"
  }
}

# Security group for database tier
resource "aws_security_group" "db_tier" {
  name_prefix = "db-tier-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.web_tier.id]
  }

  tags = {
    Name = "db-tier-sg"
  }
}
```

## Monitoring and Alerting

### CloudWatch Integration

```typescript
import { CloudWatch } from '@aws-sdk/client-cloudwatch'

const cloudWatch = new CloudWatch({ region: 'us-east-1' })

export async function publishCustomMetrics(
  metricName: string,
  value: number,
  unit: string = 'Count',
) {
  await cloudWatch.putMetricData({
    Namespace: 'MyApp/Custom',
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: [
          {
            Name: 'Environment',
            Value: process.env.NODE_ENV || 'development',
          },
        ],
      },
    ],
  })
}

// Usage in application
export async function processOrder(order: any) {
  const startTime = Date.now()

  try {
    const result = await processOrderLogic(order)

    // Track successful processing
    await publishCustomMetrics('OrderProcessed', 1)
    await publishCustomMetrics('OrderProcessingTime', Date.now() - startTime, 'Milliseconds')

    return result
  } catch (error) {
    // Track errors
    await publishCustomMetrics('OrderProcessingError', 1)
    throw error
  }
}
```

## Implementation Checklist

### Planning Phase

- [ ] Analyze workload characteristics and requirements
- [ ] Estimate resource needs and growth projections
- [ ] Evaluate cost implications of different compute options
- [ ] Plan for high availability and disaster recovery
- [ ] Design security and compliance controls

### Implementation Phase

- [ ] Configure compute resources with appropriate sizing
- [ ] Implement auto-scaling policies
- [ ] Set up monitoring and alerting
- [ ] Configure security groups and access controls
- [ ] Implement backup and recovery procedures

### Optimization Phase

- [ ] Monitor resource utilization and costs
- [ ] Optimize instance types and configurations
- [ ] Implement cost optimization strategies
- [ ] Review and adjust scaling policies
- [ ] Plan for capacity management and growth
