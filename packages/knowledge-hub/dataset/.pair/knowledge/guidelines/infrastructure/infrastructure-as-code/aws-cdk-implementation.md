# AWS CDK Implementation Guide

Comprehensive guide for implementing Infrastructure as Code using AWS CDK (Cloud Development Kit), including advanced patterns, testing strategies, and enterprise deployment practices.

## When to Use

**Essential for:**

- Type-safe infrastructure definitions with familiar programming languages
- Complex infrastructure logic and dynamic resource creation
- Integration with existing application codebases
- Developer-centric infrastructure workflows
- Advanced testing and mocking requirements
- Custom resource implementations

**Consider alternatives for:**

- Simple, declarative infrastructure requirements
- Teams without strong programming backgrounds
- Multi-cloud deployments (CDK is AWS-specific)
- Scenarios requiring visual infrastructure representation
- Legacy infrastructure migration without refactoring

## CDK Architecture Overview

### 1. CDK Project Structure and Organization

```typescript
interface CDKProject {
  organization: ProjectOrganization
  stack_strategy: StackStrategy
  construct_library: ConstructLibrary
  deployment_pipeline: DeploymentPipeline
  testing_framework: TestingFramework
}

interface ProjectOrganization {
  monorepo_structure: MonorepoStructure
  package_management: PackageManagement
  code_sharing: CodeSharing
  documentation: DocumentationStrategy
}

interface StackStrategy {
  stack_decomposition: StackDecomposition
  cross_stack_references: CrossStackReferences
  environment_promotion: EnvironmentPromotion
  rollback_strategy: RollbackStrategy
}

// Example: Enterprise CDK Project Structure
const enterpriseCDKStructure: CDKProject = {
  organization: {
    monorepo_structure: {
      structure: {
        'infrastructure/': {
          'stacks/': {
            'core-infrastructure/': ['vpc-stack.ts', 'security-stack.ts', 'monitoring-stack.ts'],
            'application-stacks/': ['api-stack.ts', 'frontend-stack.ts', 'database-stack.ts'],
            'pipeline-stacks/': ['ci-cd-stack.ts', 'deployment-stack.ts'],
          },
          'constructs/': {
            'networking/': ['vpc-construct.ts', 'load-balancer-construct.ts'],
            'compute/': ['ecs-service-construct.ts', 'lambda-construct.ts'],
            'storage/': ['s3-construct.ts', 'rds-construct.ts'],
            'security/': ['iam-construct.ts', 'kms-construct.ts'],
          },
          'lib/': {
            'config/': ['environment-config.ts', 'shared-config.ts'],
            'utils/': ['naming-utils.ts', 'tag-utils.ts', 'validation-utils.ts'],
            'types/': ['infrastructure-types.ts', 'config-types.ts'],
          },
          'test/': {
            'unit/': ['constructs/', 'stacks/', 'utils/'],
            'integration/': ['stack-integration/', 'cross-stack/'],
            'e2e/': ['deployment-tests/', 'application-tests/'],
          },
        },
      },
    },
    package_management: {
      package_manager: 'npm',
      workspace_configuration: 'npm_workspaces',
      dependency_management: 'centralized_versions',
      private_registry: 'aws_codeartifact',
    },
    code_sharing: {
      shared_constructs: 'npm_packages',
      configuration_sharing: 'environment_configs',
      utility_sharing: 'shared_libraries',
    },
    documentation: {
      api_documentation: 'typedoc_generated',
      architecture_diagrams: 'cdk_dia_embedded',
      deployment_guides: 'markdown_format',
      construct_examples: 'inline_documentation',
    },
  },
  stack_strategy: {
    stack_decomposition: {
      strategy: 'domain_driven_decomposition',
      patterns: [
        'core_infrastructure_stacks',
        'application_domain_stacks',
        'shared_service_stacks',
        'environment_specific_stacks',
      ],
    },
    cross_stack_references: {
      method: 'ssm_parameters_and_exports',
      naming_convention: 'hierarchical_parameter_store',
      security: 'encrypted_parameters',
    },
    environment_promotion: {
      strategy: 'gitops_with_cdk_pipelines',
      approval_gates: 'manual_approval_stages',
      testing_strategy: 'progressive_deployment',
    },
    rollback_strategy: {
      automated_rollback: 'cloudformation_rollback_triggers',
      backup_strategy: 'stack_snapshots',
      recovery_procedures: 'documented_playbooks',
    },
  },
  construct_library: {
    organization: 'layered_constructs',
    levels: ['l1_cfn_resources', 'l2_cdk_constructs', 'l3_patterns', 'l4_domain_constructs'],
    versioning: 'semantic_versioning',
    testing: 'comprehensive_unit_tests',
  },
  deployment_pipeline: {
    platform: 'cdk_pipelines',
    stages: ['validate', 'test', 'deploy', 'verify'],
    security_scanning: 'cdk_nag_integration',
    cost_monitoring: 'cost_estimation_integration',
  },
  testing_framework: {
    unit_testing: 'jest_with_cdk_assertions',
    integration_testing: 'cdk_integration_tests',
    snapshot_testing: 'cdk_snapshot_tests',
    property_testing: 'property_based_testing',
  },
}
```

### 2. Advanced Construct Patterns

```typescript
import { Construct } from 'constructs'
import { Stack, StackProps, CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib'
import {
  Vpc,
  SubnetType,
  SecurityGroup,
  Port,
  Peer,
  InterfaceVpcEndpoint,
  InterfaceVpcEndpointAwsService,
} from 'aws-cdk-lib/aws-ec2'
import {
  Cluster,
  FargateService,
  FargateTaskDefinition,
  ContainerImage,
  Protocol,
  LogDriver,
} from 'aws-cdk-lib/aws-ecs'
import {
  ApplicationLoadBalancer,
  ApplicationTargetGroup,
  TargetType,
  HealthCheck,
  ApplicationProtocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { Repository } from 'aws-cdk-lib/aws-ecr'

// High-level Construct Interface
interface ECSServiceConstructProps {
  // Networking Configuration
  vpc: Vpc
  subnets?: SubnetType
  securityGroups?: SecurityGroup[]

  // Service Configuration
  serviceName: string
  containerImage: ContainerImage
  containerPort: number
  desiredCount: number
  cpu?: number
  memory?: number

  // Load Balancer Configuration
  enableLoadBalancer: boolean
  loadBalancerPort?: number
  healthCheckPath?: string

  // Monitoring and Logging
  enableLogging: boolean
  logRetention?: RetentionDays
  enableMetrics: boolean

  // Security Configuration
  taskRole?: Role
  executionRole?: Role
  enableVpcEndpoints: boolean

  // Environment Configuration
  environment?: { [key: string]: string }
  secrets?: { [key: string]: string }

  // Scaling Configuration
  minCapacity?: number
  maxCapacity?: number
  targetCpuUtilization?: number
  targetMemoryUtilization?: number
}

// Advanced ECS Service Construct
export class ECSServiceConstruct extends Construct {
  public readonly service: FargateService
  public readonly loadBalancer?: ApplicationLoadBalancer
  public readonly taskDefinition: FargateTaskDefinition
  public readonly securityGroup: SecurityGroup
  public readonly logGroup: LogGroup

  constructor(scope: Construct, id: string, props: ECSServiceConstructProps) {
    super(scope, id)

    // Create log group for container logs
    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/ecs/${props.serviceName}`,
      retention: props.logRetention || RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    // Create security group for ECS service
    this.securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      description: `Security group for ${props.serviceName} ECS service`,
      allowAllOutbound: true,
    })

    // Create task definition
    this.taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: props.cpu || 256,
      memoryLimitMiB: props.memory || 512,
      taskRole: props.taskRole || this.createTaskRole(props.serviceName),
      executionRole: props.executionRole || this.createExecutionRole(props.serviceName),
    })

    // Add container to task definition
    const container = this.taskDefinition.addContainer('Container', {
      image: props.containerImage,
      environment: props.environment,
      secrets: this.convertSecretsToEcsSecrets(props.secrets),
      logging: props.enableLogging
        ? LogDriver.awsLogs({
            logGroup: this.logGroup,
            streamPrefix: 'ecs',
          })
        : undefined,
      healthCheck: {
        command: [
          'CMD-SHELL',
          `curl -f http://localhost:${props.containerPort}${
            props.healthCheckPath || '/health'
          } || exit 1`,
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    })

    // Add port mapping
    container.addPortMappings({
      containerPort: props.containerPort,
      protocol: Protocol.TCP,
    })

    // Create ECS cluster
    const cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: `${props.serviceName}-cluster`,
    })

    // Create ECS service
    this.service = new FargateService(this, 'Service', {
      cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: props.desiredCount,
      serviceName: props.serviceName,
      securityGroups: props.securityGroups || [this.securityGroup],
      vpcSubnets: {
        subnetType: props.subnets || SubnetType.PRIVATE_WITH_EGRESS,
      },
      enableLogging: props.enableLogging,
      enableExecuteCommand: true,
    })

    // Create load balancer if enabled
    if (props.enableLoadBalancer) {
      this.loadBalancer = this.createLoadBalancer(props)
      this.configureLoadBalancerTargeting(props)
    }

    // Create VPC endpoints if enabled
    if (props.enableVpcEndpoints) {
      this.createVpcEndpoints(props.vpc)
    }

    // Configure auto scaling if specified
    if (props.minCapacity && props.maxCapacity) {
      this.configureAutoScaling(props)
    }

    // Add CloudWatch metrics if enabled
    if (props.enableMetrics) {
      this.addMetrics(props.serviceName)
    }

    // Output important values
    new CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: `ARN of the ${props.serviceName} ECS service`,
    })

    if (this.loadBalancer) {
      new CfnOutput(this, 'LoadBalancerDNS', {
        value: this.loadBalancer.loadBalancerDnsName,
        description: `DNS name of the ${props.serviceName} load balancer`,
      })
    }
  }

  private createTaskRole(serviceName: string): Role {
    return new Role(this, 'TaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `${serviceName}-task-role`,
      managedPolicies: [
        // Add necessary managed policies
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
      inlinePolicies: {
        TaskPolicy: new PolicyStatement({
          actions: [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
            'secretsmanager:GetSecretValue',
          ],
          resources: ['*'], // Restrict this in production
        }).toDocument(),
      },
    })
  }

  private createExecutionRole(serviceName: string): Role {
    return new Role(this, 'ExecutionRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `${serviceName}-execution-role`,
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
      inlinePolicies: {
        ExecutionPolicy: new PolicyStatement({
          actions: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'secretsmanager:GetSecretValue',
            'ssm:GetParameter',
            'ssm:GetParameters',
          ],
          resources: ['*'], // Restrict this in production
        }).toDocument(),
      },
    })
  }

  private convertSecretsToEcsSecrets(secrets?: {
    [key: string]: string
  }): { [key: string]: any } | undefined {
    if (!secrets) return undefined

    const ecsSecrets: { [key: string]: any } = {}
    Object.entries(secrets).forEach(([key, value]) => {
      // Assuming secrets are stored in SSM Parameter Store or Secrets Manager
      ecsSecrets[key] = value.startsWith('arn:')
        ? { valueFrom: value } // Secrets Manager ARN
        : {
            valueFrom: `arn:aws:ssm:${Stack.of(this).region}:${
              Stack.of(this).account
            }:parameter${value}`,
          } // SSM Parameter
    })

    return ecsSecrets
  }

  private createLoadBalancer(props: ECSServiceConstructProps): ApplicationLoadBalancer {
    const alb = new ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: `${props.serviceName}-alb`,
    })

    // Allow HTTP traffic to load balancer
    alb.connections.allowFromAnyIpv4(Port.tcp(props.loadBalancerPort || 80))

    return alb
  }

  private configureLoadBalancerTargeting(props: ECSServiceConstructProps): void {
    if (!this.loadBalancer) return

    // Create target group
    const targetGroup = new ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: props.containerPort,
      targetType: TargetType.IP,
      protocol: ApplicationProtocol.HTTP,
      healthCheck: {
        enabled: true,
        path: props.healthCheckPath || '/health',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      } as HealthCheck,
    })

    // Add listener
    this.loadBalancer.addListener('Listener', {
      port: props.loadBalancerPort || 80,
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    })

    // Attach service to target group
    this.service.attachToApplicationTargetGroup(targetGroup)

    // Allow load balancer to communicate with service
    this.service.connections.allowFrom(
      this.loadBalancer,
      Port.tcp(props.containerPort),
      'Allow load balancer to reach service',
    )
  }

  private createVpcEndpoints(vpc: Vpc): void {
    // ECR endpoints for container image pulls
    new InterfaceVpcEndpoint(this, 'EcrDockerEndpoint', {
      vpc,
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
    })

    new InterfaceVpcEndpoint(this, 'EcrApiEndpoint', {
      vpc,
      service: InterfaceVpcEndpointAwsService.ECR,
    })

    // CloudWatch Logs endpoint
    new InterfaceVpcEndpoint(this, 'CloudWatchLogsEndpoint', {
      vpc,
      service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    })

    // SSM endpoints for parameter store access
    new InterfaceVpcEndpoint(this, 'SsmEndpoint', {
      vpc,
      service: InterfaceVpcEndpointAwsService.SSM,
    })

    // Secrets Manager endpoint
    new InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc,
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    })
  }

  private configureAutoScaling(props: ECSServiceConstructProps): void {
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.minCapacity!,
      maxCapacity: props.maxCapacity!,
    })

    // CPU-based scaling
    if (props.targetCpuUtilization) {
      scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: props.targetCpuUtilization,
        scaleInCooldown: Duration.minutes(5),
        scaleOutCooldown: Duration.minutes(5),
      })
    }

    // Memory-based scaling
    if (props.targetMemoryUtilization) {
      scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: props.targetMemoryUtilization,
        scaleInCooldown: Duration.minutes(5),
        scaleOutCooldown: Duration.minutes(5),
      })
    }
  }

  private addMetrics(serviceName: string): void {
    // Custom metrics can be added here
    // For example, custom CloudWatch dashboards, alarms, etc.
  }
}

// Usage Example
export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // Create VPC
    const vpc = new Vpc(this, 'Vpc', {
      cidr: '10.0.0.0/16',
      maxAzs: 3,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    })

    // Create ECR repository
    const repository = new Repository(this, 'Repository', {
      repositoryName: 'my-app',
    })

    // Create ECS service using our construct
    new ECSServiceConstruct(this, 'MyAppService', {
      vpc,
      serviceName: 'my-app',
      containerImage: ContainerImage.fromEcrRepository(repository, 'latest'),
      containerPort: 3000,
      desiredCount: 2,
      cpu: 512,
      memory: 1024,
      enableLoadBalancer: true,
      loadBalancerPort: 80,
      healthCheckPath: '/health',
      enableLogging: true,
      logRetention: RetentionDays.TWO_WEEKS,
      enableMetrics: true,
      enableVpcEndpoints: true,
      environment: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
      secrets: {
        DATABASE_URL: '/myapp/database/url',
        API_KEY: '/myapp/api/key',
      },
      minCapacity: 1,
      maxCapacity: 10,
      targetCpuUtilization: 70,
      targetMemoryUtilization: 80,
    })
  }
}
```

### 3. CDK Pipelines Implementation

```typescript
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines'
import { ManualApprovalStep } from 'aws-cdk-lib/pipelines'
import { Stack, StackProps, Stage, StageProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'

interface EnvironmentConfig {
  account: string
  region: string
  environmentName: string
  domainName?: string
  certificateArn?: string
}

interface CDKPipelineProps extends StackProps {
  repositoryName: string
  branchName: string
  environments: {
    dev: EnvironmentConfig
    staging: EnvironmentConfig
    prod: EnvironmentConfig
  }
}

// Application Stage for each environment
class ApplicationStage extends Stage {
  constructor(scope: Construct, id: string, props: StageProps & { config: EnvironmentConfig }) {
    super(scope, id, props)

    // Add your application stacks here
    new ApplicationStack(this, 'ApplicationStack', {
      env: { account: props.config.account, region: props.config.region },
      environmentName: props.config.environmentName,
      domainName: props.config.domainName,
      certificateArn: props.config.certificateArn,
    })
  }
}

export class CDKPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: CDKPipelineProps) {
    super(scope, id, props)

    // Create the pipeline
    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: `${props.repositoryName}-pipeline`,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.gitHub(`myorg/${props.repositoryName}`, props.branchName),
        commands: ['npm ci', 'npm run build', 'npm run test', 'npm run lint', 'npx cdk synth'],
        primaryOutputDirectory: 'cdk.out',
        env: {
          CDK_DEFAULT_ACCOUNT: this.account,
          CDK_DEFAULT_REGION: this.region,
        },
      }),
      crossAccountKeys: true,
      enableKeyRotation: true,
    })

    // Add security and compliance checks
    const securityScanStep = new ShellStep('SecurityScan', {
      commands: [
        'npm install -g @aws-cdk/cdk-nag',
        'npx cdk-nag --app "cdk.out"',
        'npm install -g checkov',
        'checkov -d cdk.out --framework cloudformation --quiet',
      ],
    })

    // Add cost estimation
    const costEstimationStep = new ShellStep('CostEstimation', {
      commands: [
        'npm install -g @aws-cdk/aws-cdk',
        'cdk diff --app cdk.out > cost-estimation.txt',
        'echo "Cost estimation completed"',
      ],
    })

    // Development environment - automatic deployment
    const devStage = new ApplicationStage(this, 'DevStage', {
      env: { account: props.environments.dev.account, region: props.environments.dev.region },
      config: props.environments.dev,
    })

    pipeline.addStage(devStage, {
      pre: [securityScanStep, costEstimationStep],
      post: [
        new ShellStep('DevIntegrationTests', {
          commands: ['npm run test:integration:dev'],
        }),
      ],
    })

    // Staging environment - with manual approval
    const stagingStage = new ApplicationStage(this, 'StagingStage', {
      env: {
        account: props.environments.staging.account,
        region: props.environments.staging.region,
      },
      config: props.environments.staging,
    })

    pipeline.addStage(stagingStage, {
      pre: [
        new ManualApprovalStep('PromoteToStaging', {
          comment: 'Approve deployment to staging environment',
        }),
      ],
      post: [
        new ShellStep('StagingIntegrationTests', {
          commands: ['npm run test:integration:staging', 'npm run test:e2e:staging'],
        }),
        new ShellStep('LoadTest', {
          commands: ['npm run test:load:staging'],
        }),
      ],
    })

    // Production environment - with comprehensive checks and approvals
    const prodStage = new ApplicationStage(this, 'ProdStage', {
      env: { account: props.environments.prod.account, region: props.environments.prod.region },
      config: props.environments.prod,
    })

    pipeline.addStage(prodStage, {
      pre: [
        new ShellStep('ProductionSecurityScan', {
          commands: [
            'npm run security:scan:comprehensive',
            'npm run compliance:check',
            'npm run vulnerability:scan',
          ],
        }),
        new ManualApprovalStep('PromoteToProduction', {
          comment: 'Approve deployment to production environment',
        }),
      ],
      post: [
        new ShellStep('ProductionSmokeTests', {
          commands: ['npm run test:smoke:prod'],
        }),
        new ShellStep('ProductionMonitoring', {
          commands: ['npm run monitoring:setup:prod', 'npm run alerts:configure:prod'],
        }),
      ],
    })

    // Build the pipeline
    pipeline.buildPipeline()
  }
}
```

### 4. Comprehensive Testing Strategies

```typescript
// test/constructs/ecs-service.test.ts
import { App, Stack } from 'aws-cdk-lib'
import { Template, Match } from 'aws-cdk-lib/assertions'
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2'
import { ContainerImage } from 'aws-cdk-lib/aws-ecs'
import { ECSServiceConstruct } from '../../lib/constructs/ecs-service-construct'

describe('ECSServiceConstruct', () => {
  let app: App
  let stack: Stack
  let vpc: Vpc

  beforeEach(() => {
    app = new App()
    stack = new Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    })

    vpc = new Vpc(stack, 'TestVpc', {
      cidr: '10.0.0.0/16',
      maxAzs: 2,
    })
  })

  test('creates ECS service with default configuration', () => {
    // Arrange & Act
    new ECSServiceConstruct(stack, 'TestECSService', {
      vpc,
      serviceName: 'test-service',
      containerImage: ContainerImage.fromRegistry('nginx'),
      containerPort: 80,
      desiredCount: 1,
      enableLoadBalancer: false,
      enableLogging: true,
      enableMetrics: false,
      enableVpcEndpoints: false,
    })

    // Assert
    const template = Template.fromStack(stack)

    // Check ECS Cluster
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'test-service-cluster',
    })

    // Check ECS Service
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'test-service',
      DesiredCount: 1,
      LaunchType: 'FARGATE',
    })

    // Check Task Definition
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '256',
      Memory: '512',
    })

    // Check Security Group
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Security group for test-service ECS service',
    })

    // Check Log Group
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/ecs/test-service',
      RetentionInDays: 7,
    })
  })

  test('creates load balancer when enabled', () => {
    // Arrange & Act
    new ECSServiceConstruct(stack, 'TestECSService', {
      vpc,
      serviceName: 'test-service',
      containerImage: ContainerImage.fromRegistry('nginx'),
      containerPort: 80,
      desiredCount: 1,
      enableLoadBalancer: true,
      loadBalancerPort: 80,
      healthCheckPath: '/health',
      enableLogging: true,
      enableMetrics: false,
      enableVpcEndpoints: false,
    })

    // Assert
    const template = Template.fromStack(stack)

    // Check Application Load Balancer
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Name: 'test-service-alb',
      Scheme: 'internet-facing',
      Type: 'application',
    })

    // Check Target Group
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Port: 80,
      Protocol: 'HTTP',
      TargetType: 'ip',
      HealthCheckPath: '/health',
      HealthCheckIntervalSeconds: 30,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 5,
    })

    // Check Listener
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
    })
  })

  test('creates VPC endpoints when enabled', () => {
    // Arrange & Act
    new ECSServiceConstruct(stack, 'TestECSService', {
      vpc,
      serviceName: 'test-service',
      containerImage: ContainerImage.fromRegistry('nginx'),
      containerPort: 80,
      desiredCount: 1,
      enableLoadBalancer: false,
      enableLogging: true,
      enableMetrics: false,
      enableVpcEndpoints: true,
    })

    // Assert
    const template = Template.fromStack(stack)

    // Check VPC Endpoints
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 5) // ECR Docker, ECR API, CloudWatch Logs, SSM, Secrets Manager

    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('.*ecr\\.dkr.*'),
    })

    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('.*ecr\\.api.*'),
    })

    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.stringLikeRegexp('.*logs.*'),
    })
  })

  test('configures auto scaling when specified', () => {
    // Arrange & Act
    new ECSServiceConstruct(stack, 'TestECSService', {
      vpc,
      serviceName: 'test-service',
      containerImage: ContainerImage.fromRegistry('nginx'),
      containerPort: 80,
      desiredCount: 2,
      enableLoadBalancer: false,
      enableLogging: true,
      enableMetrics: false,
      enableVpcEndpoints: false,
      minCapacity: 1,
      maxCapacity: 10,
      targetCpuUtilization: 70,
      targetMemoryUtilization: 80,
    })

    // Assert
    const template = Template.fromStack(stack)

    // Check Application Auto Scaling Target
    template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
      ServiceNamespace: 'ecs',
      ResourceId: Match.anyValue(),
      ScalableDimension: 'ecs:service:DesiredCount',
      MinCapacity: 1,
      MaxCapacity: 10,
    })

    // Check Auto Scaling Policies
    template.resourceCountIs('AWS::ApplicationAutoScaling::ScalingPolicy', 2) // CPU and Memory policies
  })

  test('snapshot test for complete configuration', () => {
    // Arrange & Act
    new ECSServiceConstruct(stack, 'TestECSService', {
      vpc,
      serviceName: 'test-service',
      containerImage: ContainerImage.fromRegistry('nginx'),
      containerPort: 80,
      desiredCount: 2,
      cpu: 512,
      memory: 1024,
      enableLoadBalancer: true,
      loadBalancerPort: 80,
      healthCheckPath: '/health',
      enableLogging: true,
      enableMetrics: true,
      enableVpcEndpoints: true,
      environment: {
        NODE_ENV: 'production',
      },
      secrets: {
        DATABASE_URL: '/myapp/database/url',
      },
      minCapacity: 1,
      maxCapacity: 10,
      targetCpuUtilization: 70,
    })

    // Assert
    const template = Template.fromStack(stack)
    expect(template.toJSON()).toMatchSnapshot()
  })
})

// Integration Test Example
// test/integration/application-stack.integration.test.ts
import { App } from 'aws-cdk-lib'
import { ApplicationStack } from '../../lib/application-stack'
import * as AWS from 'aws-sdk'

describe('ApplicationStack Integration Tests', () => {
  let cloudFormation: AWS.CloudFormation
  let stackName: string

  beforeAll(async () => {
    cloudFormation = new AWS.CloudFormation({ region: 'us-east-1' })
    stackName = `integration-test-${Date.now()}`

    // Deploy the stack
    const app = new App()
    const stack = new ApplicationStack(app, 'IntegrationTestStack', {
      env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
      environmentName: 'integration-test',
    })

    // This would typically be done through CDK CLI or AWS SDK
    // For demonstration purposes only
  })

  afterAll(async () => {
    // Clean up the stack
    await cloudFormation.deleteStack({ StackName: stackName }).promise()
  })

  test('stack deploys successfully', async () => {
    const stackInfo = await cloudFormation
      .describeStacks({
        StackName: stackName,
      })
      .promise()

    expect(stackInfo.Stacks![0].StackStatus).toBe('CREATE_COMPLETE')
  })

  test('application is accessible through load balancer', async () => {
    const stackOutputs = await cloudFormation
      .describeStacks({
        StackName: stackName,
      })
      .promise()

    const loadBalancerDns = stackOutputs.Stacks![0].Outputs!.find(
      output => output.OutputKey === 'LoadBalancerDNS',
    )?.OutputValue

    expect(loadBalancerDns).toBeDefined()

    // Test HTTP request to the load balancer
    const response = await fetch(`http://${loadBalancerDns}/health`)
    expect(response.status).toBe(200)
  })
})
```

## Implementation Best Practices

### 1. Project Organization and Structure

- **Monorepo Structure**: Use monorepo for multiple related CDK apps and shared constructs
- **Layered Architecture**: Organize constructs in layers (L1, L2, L3, L4) with clear responsibilities
- **Shared Libraries**: Create reusable construct libraries for common patterns
- **Configuration Management**: Use environment-specific configuration files and parameter hierarchies
- **Documentation**: Maintain comprehensive TypeDoc documentation for all constructs

### 2. Security and Compliance

- **Least Privilege**: Apply principle of least privilege for all IAM roles and policies
- **Secret Management**: Use AWS Secrets Manager or Parameter Store for sensitive data
- **Resource Encryption**: Enable encryption at rest and in transit for all resources
- **Security Scanning**: Integrate CDK-nag and other security scanning tools in pipelines
- **Compliance Validation**: Implement automated compliance checks for regulatory requirements

### 3. Testing and Quality Assurance

- **Comprehensive Testing**: Implement unit, integration, and end-to-end tests
- **Snapshot Testing**: Use snapshot tests for detecting unintended infrastructure changes
- **Property-based Testing**: Use property-based testing for complex infrastructure logic
- **Mock Services**: Use AWS CDK's built-in mocking capabilities for isolated testing
- **Test Environments**: Maintain dedicated test environments for integration testing

### 4. Deployment and Operations

- **GitOps Workflows**: Use CDK Pipelines with GitOps principles for deployments
- **Environment Promotion**: Implement progressive deployment across environments
- **Rollback Strategies**: Plan and implement comprehensive rollback procedures
- **Monitoring Integration**: Build monitoring and alerting into infrastructure code
- **Cost Optimization**: Implement cost tracking and optimization patterns

## Implementation Checklist

### Setup Phase

- [ ] Design CDK project structure and organization
- [ ] Set up TypeScript configuration and build pipeline
- [ ] Create shared construct library structure
- [ ] Establish coding standards and conventions
- [ ] Configure development environment and tooling

### Development Phase

- [ ] Implement core infrastructure constructs
- [ ] Create comprehensive unit test suite
- [ ] Set up integration testing framework
- [ ] Implement security and compliance scanning
- [ ] Create documentation and examples

### Deployment Phase

- [ ] Set up CDK Pipelines for automated deployment
- [ ] Configure environment-specific parameters
- [ ] Implement approval workflows and gates
- [ ] Set up monitoring and alerting
- [ ] Test rollback and disaster recovery procedures

### Operations Phase

- [ ] Monitor deployments and infrastructure health
- [ ] Conduct regular security and compliance reviews
- [ ] Optimize costs and performance continuously
- [ ] Maintain and update construct libraries
- [ ] Train team on CDK best practices and new features

## Related Patterns

- **[Terraform Infrastructure](terraform.md)**: Alternative IaC approach with Terraform
- **[Infrastructure as Code Best Practices](iac-best-practices.md)**: General IaC implementation guidance
- **[Cloud Provider Evaluation](../cloud-providers/provider-evaluation.md)**: Framework for selecting appropriate cloud providers

## References

- AWS CDK Developer Guide
- AWS CDK API Reference
- CDK Patterns Repository
- AWS Well-Architected Framework
- TypeScript Best Practices Guide
