# Infrastructure as Code Best Practices

Comprehensive guide for implementing Infrastructure as Code (IaC) best practices across different tools and platforms, including principles, patterns, and operational excellence frameworks.

## When to Use

**Essential for:**

- Infrastructure automation and repeatability
- Version control and audit trails for infrastructure changes
- Multi-environment deployments with consistency
- Compliance and governance requirements
- Team collaboration on infrastructure management
- Disaster recovery and business continuity planning

**Consider alternatives for:**

- One-off prototype environments
- Emergency hotfixes requiring immediate manual intervention
- Legacy systems with complex dependencies
- Environments requiring specialized manual configurations

## IaC Principles and Foundations

### 1. Core IaC Principles

```typescript
interface IaCPrinciples {
  version_control: VersionControlPrinciples
  idempotency: IdempotencyPrinciples
  immutability: ImmutabilityPrinciples
  declarative_approach: DeclarativeApproach
  automation: AutomationPrinciples
}

interface VersionControlPrinciples {
  git_workflow: GitWorkflowStrategy
  branching_strategy: BranchingStrategy
  code_review: CodeReviewProcess
  change_tracking: ChangeTrackingStrategy
}

interface IdempotencyPrinciples {
  design_patterns: IdempotentPattern[]
  state_management: StateManagementStrategy
  drift_detection: DriftDetectionStrategy
  reconciliation: ReconciliationStrategy
}

// Example: Comprehensive IaC Implementation Strategy
const iacImplementationStrategy: IaCPrinciples = {
  version_control: {
    git_workflow: {
      workflow_type: 'gitflow',
      main_branches: ['main', 'develop'],
      feature_branches: 'feature/description',
      release_branches: 'release/version',
      hotfix_branches: 'hotfix/issue',
      tagging_strategy: 'semantic_versioning',
    },
    branching_strategy: {
      protection_rules: {
        main: {
          require_pull_request: true,
          required_reviewers: 2,
          dismiss_stale_reviews: true,
          require_code_owner_reviews: true,
          require_status_checks: true,
          required_status_checks: [
            'continuous-integration',
            'security-scan',
            'cost-estimation',
            'compliance-check',
          ],
        },
        develop: {
          require_pull_request: true,
          required_reviewers: 1,
          require_status_checks: true,
        },
      },
      merge_strategies: {
        feature_to_develop: 'squash_and_merge',
        develop_to_main: 'merge_commit',
        hotfix_to_main: 'merge_commit',
      },
    },
    code_review: {
      checklist: [
        'security_review',
        'cost_impact_analysis',
        'compliance_verification',
        'documentation_updated',
        'tests_added_or_updated',
        'rollback_plan_documented',
      ],
      automation: {
        lint_checks: true,
        security_scans: true,
        cost_estimation: true,
        policy_validation: true,
      },
    },
    change_tracking: {
      commit_conventions: 'conventional_commits',
      changelog_generation: 'automated',
      release_notes: 'automated_with_manual_review',
      documentation_updates: 'required_for_breaking_changes',
    },
  },
  idempotency: {
    design_patterns: [
      {
        pattern_name: 'declarative_resource_specification',
        description: 'Define desired state rather than imperative steps',
        implementation: 'use_declarative_syntax',
        validation: 'automated_drift_detection',
      },
      {
        pattern_name: 'conditional_resource_creation',
        description: 'Use conditions to handle resource existence',
        implementation: 'count_and_for_each_patterns',
        validation: 'state_file_validation',
      },
      {
        pattern_name: 'immutable_infrastructure',
        description: 'Replace rather than modify infrastructure',
        implementation: 'blue_green_deployments',
        validation: 'deployment_verification',
      },
    ],
    state_management: {
      state_isolation: 'environment_and_component_separation',
      state_locking: 'distributed_locking_mechanism',
      state_backup: 'automated_versioned_backups',
      state_encryption: 'end_to_end_encryption',
    },
    drift_detection: {
      frequency: 'daily_automated_scans',
      tools: ['terraform_plan', 'aws_config', 'cloud_custodian'],
      alerting: 'immediate_notification',
      remediation: 'automated_where_safe',
    },
    reconciliation: {
      strategy: 'plan_based_reconciliation',
      approval_process: 'manual_review_for_significant_changes',
      rollback_triggers: 'health_check_failures',
      documentation: 'automated_change_logs',
    },
  },
  immutability: {
    infrastructure_patterns: {
      server_management: 'immutable_server_images',
      application_deployment: 'blue_green_deployments',
      database_changes: 'migration_based_updates',
      network_changes: 'replacement_strategies',
    },
    deployment_strategies: {
      rolling_updates: 'for_stateless_components',
      blue_green: 'for_critical_services',
      canary: 'for_high_risk_changes',
      feature_flags: 'for_application_features',
    },
    backup_and_recovery: {
      snapshot_strategy: 'automated_before_changes',
      recovery_procedures: 'documented_and_tested',
      rpo_rto_targets: 'environment_specific',
      disaster_recovery: 'cross_region_capabilities',
    },
  },
  declarative_approach: {
    configuration_style: 'desired_state_specification',
    abstraction_levels: [
      'infrastructure_primitives',
      'service_compositions',
      'application_platforms',
      'business_capabilities',
    ],
    validation_approach: 'policy_as_code',
    documentation_strategy: 'self_documenting_code',
  },
  automation: {
    ci_cd_integration: 'full_pipeline_automation',
    testing_automation: 'multi_layer_testing',
    deployment_automation: 'progressive_delivery',
    monitoring_automation: 'infrastructure_observability',
    compliance_automation: 'continuous_compliance_checking',
  },
}
```

### 2. Configuration Management and Organization

```typescript
interface ConfigurationManagement {
  structure: ProjectStructure
  environment_strategy: EnvironmentStrategy
  secret_management: SecretManagementStrategy
  parameter_management: ParameterManagementStrategy
}

interface ProjectStructure {
  organization_pattern: OrganizationPattern
  file_organization: FileOrganization
  module_strategy: ModuleStrategy
  naming_conventions: NamingConventions
}

// Example: Multi-Tool IaC Project Structure
const projectStructureExample = `
# Recommended IaC Project Structure
infrastructure/
├── README.md                          # Project overview and setup instructions
├── .gitignore                         # VCS ignore patterns
├── .editorconfig                      # Code formatting rules
├── docs/                              # Architecture and runbook documentation
│   ├── architecture/                  # System architecture diagrams
│   ├── runbooks/                      # Operational procedures
│   └── decisions/                     # Architecture Decision Records (ADRs)
├── environments/                      # Environment-specific configurations
│   ├── dev/
│   │   ├── terraform.tfvars          # Terraform variables
│   │   ├── config.yaml               # CDK/Pulumi configuration
│   │   └── secrets.yaml              # Encrypted secrets (if using SOPS)
│   ├── staging/
│   └── prod/
├── modules/                           # Reusable infrastructure modules
│   ├── compute/
│   │   ├── ec2-instance/
│   │   │   ├── main.tf               # Terraform module
│   │   │   ├── variables.tf
│   │   │   ├── outputs.tf
│   │   │   └── README.md
│   │   └── ecs-service/
│   ├── networking/
│   │   ├── vpc/
│   │   └── load-balancer/
│   ├── storage/
│   │   ├── s3-bucket/
│   │   └── rds-instance/
│   └── security/
│       ├── iam-role/
│       └── security-group/
├── stacks/                            # Stack definitions (CDK) or root modules (Terraform)
│   ├── core-infrastructure/
│   │   ├── main.ts                   # CDK stack
│   │   ├── main.tf                   # Terraform root module
│   │   └── config/
│   ├── application-infrastructure/
│   └── shared-services/
├── shared/                            # Shared utilities and configurations
│   ├── policies/                      # Policy as Code definitions
│   │   ├── opa/                      # Open Policy Agent policies
│   │   └── sentinel/                 # HashiCorp Sentinel policies
│   ├── scripts/                       # Automation and utility scripts
│   │   ├── deploy.sh
│   │   ├── validate.sh
│   │   └── rollback.sh
│   ├── configs/                       # Shared configuration files
│   │   ├── backend.tf                # Terraform backend configuration
│   │   ├── providers.tf              # Provider configurations
│   │   └── versions.tf               # Version constraints
│   └── utils/                         # Shared utility code
│       ├── naming.ts                 # Naming convention utilities
│       ├── tagging.ts                # Resource tagging utilities
│       └── validation.ts             # Validation utilities
├── tests/                             # Test suites
│   ├── unit/                         # Unit tests for modules/constructs
│   ├── integration/                  # Integration tests
│   ├── e2e/                          # End-to-end tests
│   └── fixtures/                     # Test data and fixtures
├── .github/                          # CI/CD workflows (GitHub Actions)
│   └── workflows/
│       ├── terraform.yml
│       ├── cdk.yml
│       └── security-scan.yml
├── package.json                      # Node.js dependencies (for CDK/Pulumi)
├── requirements.txt                  # Python dependencies (for CDK Python/Pulumi)
├── Pipfile                           # Python dependency management
├── go.mod                            # Go dependencies (for CDK Go/Pulumi)
└── .terraform-version                # Terraform version specification
`

// Configuration Management Implementation
class ConfigurationManager {
  private environmentConfigs: Map<string, EnvironmentConfig>
  private secretManager: SecretManager
  private parameterStore: ParameterStore

  constructor(
    environmentConfigs: Map<string, EnvironmentConfig>,
    secretManager: SecretManager,
    parameterStore: ParameterStore,
  ) {
    this.environmentConfigs = environmentConfigs
    this.secretManager = secretManager
    this.parameterStore = parameterStore
  }

  // Environment-specific configuration loading
  public async loadEnvironmentConfig(environment: string): Promise<EnvironmentConfig> {
    const baseConfig = this.environmentConfigs.get(environment)
    if (!baseConfig) {
      throw new Error(`Configuration not found for environment: ${environment}`)
    }

    // Merge with shared configuration
    const sharedConfig = await this.loadSharedConfig()
    const environmentConfig = this.mergeConfigs(sharedConfig, baseConfig)

    // Load secrets and parameters
    const secrets = await this.secretManager.loadSecrets(environment)
    const parameters = await this.parameterStore.loadParameters(environment)

    return {
      ...environmentConfig,
      secrets,
      parameters,
    }
  }

  // Hierarchical parameter resolution
  private async loadSharedConfig(): Promise<SharedConfig> {
    return {
      defaultTags: {
        ManagedBy: 'terraform',
        Environment: 'unknown',
        Project: process.env.PROJECT_NAME || 'default',
        Owner: process.env.TEAM_NAME || 'platform',
        CostCenter: process.env.COST_CENTER || '1000',
        CreatedBy: process.env.USER || 'automation',
      },
      namingConventions: {
        resourcePrefix: process.env.RESOURCE_PREFIX || 'app',
        separator: '-',
        includeEnvironment: true,
        includeRegion: false,
        maxLength: 64,
      },
      securityDefaults: {
        encryptionAtRest: true,
        encryptionInTransit: true,
        publicAccessBlocked: true,
        versioningEnabled: true,
      },
    }
  }

  // Configuration validation
  public validateConfiguration(config: EnvironmentConfig): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Validate required fields
    if (!config.account) errors.push('Account ID is required')
    if (!config.region) errors.push('Region is required')
    if (!config.environment) errors.push('Environment name is required')

    // Validate naming conventions
    if (config.resourcePrefix && config.resourcePrefix.length > 20) {
      warnings.push('Resource prefix should be less than 20 characters')
    }

    // Validate security settings
    if (!config.securityDefaults?.encryptionAtRest) {
      warnings.push('Encryption at rest should be enabled')
    }

    // Validate cost controls
    if (!config.costControls?.budgetAlerts) {
      warnings.push('Budget alerts should be configured')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }
}

// Example environment configuration
const environmentConfigExample = `
// environments/prod/config.ts
export const prodConfig: EnvironmentConfig = {
  // Basic environment information
  account: '123456789012',
  region: 'us-east-1',
  environment: 'prod',
  
  // Networking configuration
  networking: {
    vpcCidr: '10.0.0.0/16',
    availabilityZones: 3,
    natGateways: 3, // One per AZ for high availability
    enableVpcFlowLogs: true,
    enableDnsHostnames: true,
    enableDnsSupport: true
  },
  
  // Compute configuration
  compute: {
    instanceTypes: ['t3.medium', 't3.large'],
    autoScaling: {
      minSize: 3,
      maxSize: 20,
      desiredCapacity: 6
    },
    enableDetailedMonitoring: true
  },
  
  // Database configuration
  database: {
    engine: 'postgres',
    version: '13.7',
    instanceClass: 'db.r5.xlarge',
    multiAz: true,
    backupRetentionPeriod: 30,
    enablePerformanceInsights: true,
    encryptionAtRest: true
  },
  
  // Security configuration
  security: {
    enableCloudTrail: true,
    enableGuardDuty: true,
    enableSecurityHub: true,
    enableConfig: true,
    kmsKeyRotation: true,
    sslCertificateValidation: 'DNS'
  },
  
  // Monitoring and logging
  monitoring: {
    logRetentionDays: 90,
    enableXRayTracing: true,
    enableCustomMetrics: true,
    alertingThresholds: {
      cpuUtilization: 80,
      memoryUtilization: 85,
      diskUtilization: 90,
      errorRate: 5
    }
  },
  
  // Cost controls
  costControls: {
    budgetAlerts: {
      monthly: 10000,
      alertThresholds: [50, 75, 90, 100]
    },
    rightsizingEnabled: true,
    spotInstancesEnabled: false, // Disabled for production
    scheduleBasedScaling: true
  },
  
  // Compliance and governance
  compliance: {
    dataClassification: 'confidential',
    retentionPolicy: '7_years',
    encryptionRequired: true,
    auditLoggingEnabled: true,
    accessLoggingEnabled: true
  },
  
  // Backup and disaster recovery
  backupAndDr: {
    backupFrequency: 'daily',
    crossRegionBackup: true,
    pointInTimeRecovery: true,
    rpoTargetHours: 1,
    rtoTargetHours: 4
  },
  
  // Feature flags
  featureFlags: {
    enableNewLoadBalancer: false,
    enableAdvancedSecurity: true,
    enableCostOptimization: true,
    enableAutomatedScaling: true
  }
};
`
```

### 3. Security and Compliance Framework

```typescript
interface SecurityFramework {
  secret_management: SecretManagementStrategy
  access_control: AccessControlStrategy
  compliance_automation: ComplianceAutomation
  security_scanning: SecurityScanningStrategy
}

interface SecretManagementStrategy {
  secret_storage: SecretStorageMethod
  rotation_policy: RotationPolicy
  access_patterns: AccessPattern[]
  encryption_strategy: EncryptionStrategy
}

// Example: Comprehensive Security Implementation
class IaCSecurityFramework {
  // Secret management implementation
  public implementSecretManagement(): SecretManagementImplementation {
    return {
      storage_backends: {
        aws: {
          secrets_manager: {
            use_cases: ['database_passwords', 'api_keys', 'certificates'],
            rotation: 'automatic_90_days',
            encryption: 'kms_customer_managed_keys',
            access_control: 'least_privilege_iam',
          },
          parameter_store: {
            use_cases: ['configuration_values', 'feature_flags', 'non_sensitive_data'],
            encryption: 'kms_for_secure_strings',
            hierarchical_organization: true,
            version_tracking: true,
          },
        },
        azure: {
          key_vault: {
            use_cases: ['secrets', 'keys', 'certificates'],
            access_policies: 'rbac_based',
            soft_delete: 'enabled',
            purge_protection: 'enabled',
          },
        },
        gcp: {
          secret_manager: {
            use_cases: ['application_secrets', 'service_account_keys'],
            automatic_replication: true,
            iam_integration: true,
          },
        },
        external: {
          hashicorp_vault: {
            use_cases: ['dynamic_secrets', 'encryption_as_service'],
            secret_engines: ['kv', 'database', 'pki'],
            authentication: ['kubernetes', 'aws_iam', 'azure_ad'],
          },
          mozilla_sops: {
            use_cases: ['configuration_files', 'kubernetes_secrets'],
            encryption_backends: ['kms', 'pgp', 'age'],
            git_integration: true,
          },
        },
      },

      access_patterns: {
        application_runtime: {
          method: 'service_identity_based',
          implementation: 'iam_roles_for_service_accounts',
          rotation: 'automatic',
          caching: 'short_term_memory_only',
        },
        infrastructure_deployment: {
          method: 'deployment_role_assumption',
          implementation: 'cross_account_iam_roles',
          temporary_access: true,
          audit_trail: 'comprehensive',
        },
        human_operators: {
          method: 'break_glass_procedures',
          implementation: 'emergency_access_roles',
          approval_required: true,
          session_recording: true,
        },
      },

      rotation_strategies: {
        database_credentials: {
          frequency: 'every_90_days',
          method: 'blue_green_rotation',
          validation: 'connectivity_tests',
          rollback: 'automatic_on_failure',
        },
        api_keys: {
          frequency: 'every_180_days',
          method: 'overlapping_validity_periods',
          notification: 'advance_warning',
          automation: 'ci_cd_integration',
        },
        certificates: {
          frequency: 'before_expiration',
          method: 'acme_protocol_automation',
          monitoring: 'expiration_alerts',
          deployment: 'zero_downtime',
        },
      },
    }
  }

  // Policy as Code implementation
  public implementPolicyAsCode(): PolicyAsCodeFramework {
    return {
      opa_policies: {
        organization: 'hierarchical_policy_structure',
        policies: {
          security: {
            encryption_required: `
              package security.encryption
              
              # Deny resources without encryption
              deny[msg] {
                input.resource_type == "aws_s3_bucket"
                not input.server_side_encryption_configuration
                msg := "S3 bucket must have server-side encryption enabled"
              }
              
              deny[msg] {
                input.resource_type == "aws_rds_instance"
                not input.storage_encrypted
                msg := "RDS instance must have storage encryption enabled"
              }
              
              deny[msg] {
                input.resource_type == "aws_ebs_volume"
                not input.encrypted
                msg := "EBS volume must be encrypted"
              }
            `,
            network_security: `
              package security.network
              
              # Deny overly permissive security groups
              deny[msg] {
                input.resource_type == "aws_security_group_rule"
                input.from_port == 0
                input.to_port == 65535
                input.cidr_blocks[_] == "0.0.0.0/0"
                msg := "Security group rule cannot allow all traffic from anywhere"
              }
              
              # Require HTTPS for load balancers
              deny[msg] {
                input.resource_type == "aws_lb_listener"
                input.protocol == "HTTP"
                input.port == 80
                not has_redirect_to_https
                msg := "HTTP listeners must redirect to HTTPS"
              }
            `,
            access_control: `
              package security.iam
              
              # Deny overly broad IAM policies
              deny[msg] {
                input.resource_type == "aws_iam_policy"
                input.policy.Statement[_].Effect == "Allow"
                input.policy.Statement[_].Action[_] == "*"
                input.policy.Statement[_].Resource[_] == "*"
                msg := "IAM policy cannot allow all actions on all resources"
              }
              
              # Require MFA for privileged access
              deny[msg] {
                input.resource_type == "aws_iam_role"
                contains_admin_permissions
                not requires_mfa
                msg := "Privileged roles must require MFA"
              }
            `,
          },
          compliance: {
            tagging_requirements: `
              package compliance.tagging
              
              required_tags := {
                "Environment",
                "Owner",
                "Project",
                "CostCenter",
                "ManagedBy"
              }
              
              deny[msg] {
                input.resource_type in taggable_resources
                missing := required_tags - set(object.get(input, "tags", {}))
                count(missing) > 0
                msg := sprintf("Resource missing required tags: %v", [missing])
              }
            `,
            data_classification: `
              package compliance.data
              
              # Require encryption for confidential data
              deny[msg] {
                input.tags.DataClassification == "confidential"
                input.resource_type in storage_resources
                not is_encrypted(input)
                msg := "Confidential data must be encrypted"
              }
              
              # Require audit logging for sensitive resources
              deny[msg] {
                input.tags.DataClassification in ["confidential", "restricted"]
                input.resource_type in audit_required_resources
                not has_audit_logging(input)
                msg := "Sensitive resources must have audit logging enabled"
              }
            `,
          },
          cost_optimization: {
            resource_sizing: `
              package cost.optimization
              
              # Warn about oversized instances
              warn[msg] {
                input.resource_type == "aws_instance"
                input.instance_type in oversized_instances
                msg := sprintf("Consider smaller instance type for %s", [input.instance_type])
              }
              
              # Require spot instances for non-production
              deny[msg] {
                input.resource_type == "aws_instance"
                input.tags.Environment != "prod"
                not input.spot_price
                msg := "Non-production instances should use spot pricing"
              }
            `,
          },
        },
      },

      sentinel_policies: {
        organization: 'policy_sets_by_environment',
        enforcement_levels: {
          hard_mandatory: 'production_security_policies',
          soft_mandatory: 'cost_optimization_guidelines',
          advisory: 'best_practice_recommendations',
        },
      },

      custom_validators: {
        terraform_validators: {
          implementation: 'go_based_plugins',
          integration: 'terraform_plan_validation',
          custom_rules: [
            'organization_specific_naming',
            'network_topology_validation',
            'cost_threshold_checking',
          ],
        },
        cdk_aspects: {
          implementation: 'typescript_aspects',
          integration: 'construct_tree_validation',
          custom_rules: [
            'security_group_validation',
            'resource_tagging_enforcement',
            'cost_optimization_checks',
          ],
        },
      },
    }
  }

  // Compliance automation implementation
  public implementComplianceAutomation(): ComplianceAutomationFramework {
    return {
      continuous_compliance: {
        tools: {
          aws_config: {
            rules: [
              'encrypted-volumes',
              'rds-storage-encrypted',
              's3-bucket-ssl-requests-only',
              'iam-password-policy',
              'cloudtrail-enabled',
            ],
            remediation: 'automated_where_safe',
            notifications: 'real_time_alerts',
          },
          azure_policy: {
            initiatives: ['security_center_standard', 'nist_sp_800_53_r4', 'iso_27001_2013'],
            enforcement: 'deny_non_compliant',
            reporting: 'compliance_dashboard',
          },
          gcp_security_command_center: {
            findings: 'automated_discovery',
            assets: 'continuous_inventory',
            recommendations: 'security_insights',
          },
        },

        reporting: {
          compliance_dashboards: {
            tools: ['grafana', 'datadog', 'splunk'],
            metrics: [
              'compliance_percentage',
              'policy_violations',
              'remediation_time',
              'security_findings',
            ],
            alerting: 'threshold_based',
          },
          audit_reports: {
            frequency: 'monthly_automated',
            format: 'standardized_templates',
            distribution: 'stakeholder_specific',
            retention: 'compliance_required_period',
          },
        },

        remediation: {
          automated_remediation: {
            scope: 'low_risk_violations',
            approval: 'pre_approved_playbooks',
            testing: 'sandbox_validation',
            rollback: 'automatic_on_failure',
          },
          manual_remediation: {
            scope: 'high_risk_violations',
            workflow: 'ticket_based_process',
            approval: 'change_advisory_board',
            documentation: 'detailed_procedures',
          },
        },
      },

      audit_trails: {
        infrastructure_changes: {
          source: 'version_control_systems',
          tracking: 'commit_based_changes',
          approval: 'pull_request_reviews',
          deployment: 'ci_cd_pipeline_logs',
        },
        access_logs: {
          source: 'cloud_provider_apis',
          tracking: 'api_call_logging',
          analysis: 'anomaly_detection',
          retention: 'compliance_requirements',
        },
        configuration_drift: {
          detection: 'daily_scans',
          reporting: 'deviation_alerts',
          remediation: 'drift_correction_plans',
          prevention: 'policy_enforcement',
        },
      },
    }
  }
}
```

### 4. Testing and Quality Assurance

```typescript
interface TestingStrategy {
  unit_testing: UnitTestingApproach
  integration_testing: IntegrationTestingApproach
  end_to_end_testing: E2ETestingApproach
  compliance_testing: ComplianceTestingApproach
}

// Example: Comprehensive Testing Implementation
class IaCTestingFramework {
  public implementUnitTesting(): UnitTestingImplementation {
    return {
      terraform_testing: {
        framework: 'terratest',
        test_structure: {
          module_tests: {
            location: 'test/unit/',
            naming: 'module_name_test.go',
            coverage: 'all_input_combinations',
            isolation: 'separate_test_accounts',
          },
          validation_tests: {
            location: 'test/validation/',
            naming: 'validation_test.go',
            coverage: 'input_validation_logic',
            mocking: 'aws_sdk_mocking',
          },
        },
        example_test: `
          // test/unit/vpc_test.go
          package test
          
          import (
            "testing"
            "github.com/gruntwork-io/terratest/modules/terraform"
            "github.com/gruntwork-io/terratest/modules/aws"
            "github.com/stretchr/testify/assert"
          )
          
          func TestVPCModule(t *testing.T) {
            t.Parallel()
            
            // Test cases for different configurations
            testCases := []struct {
              name     string
              vars     map[string]interface{}
              expected VPCExpectations
            }{
              {
                name: "basic_vpc",
                vars: map[string]interface{}{
                  "cidr_block": "10.0.0.0/16",
                  "enable_dns_hostnames": true,
                  "enable_dns_support": true,
                },
                expected: VPCExpectations{
                  SubnetCount: 6, // 2 AZs x 3 subnet types
                  HasInternetGateway: true,
                  HasNATGateways: true,
                },
              },
              {
                name: "private_vpc",
                vars: map[string]interface{}{
                  "cidr_block": "172.16.0.0/16",
                  "create_internet_gateway": false,
                  "create_nat_gateways": false,
                },
                expected: VPCExpectations{
                  SubnetCount: 4, // Private subnets only
                  HasInternetGateway: false,
                  HasNATGateways: false,
                },
              },
            }
            
            for _, tc := range testCases {
              t.Run(tc.name, func(t *testing.T) {
                terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
                  TerraformDir: "../modules/vpc",
                  Vars:         tc.vars,
                  NoColor:      true,
                })
                
                defer terraform.Destroy(t, terraformOptions)
                terraform.InitAndApply(t, terraformOptions)
                
                // Validate outputs
                vpcId := terraform.Output(t, terraformOptions, "vpc_id")
                assert.NotEmpty(t, vpcId)
                
                // Validate AWS resources
                vpc := aws.GetVpcById(t, vpcId, "us-east-1")
                assert.Equal(t, tc.vars["cidr_block"], vpc.CidrBlock)
                
                // Validate subnet count
                subnets := aws.GetSubnetsForVpc(t, vpcId, "us-east-1")
                assert.Equal(t, tc.expected.SubnetCount, len(subnets))
              })
            }
          }
        `,
      },

      cdk_testing: {
        framework: 'jest_with_cdk_assertions',
        test_structure: {
          construct_tests: {
            location: 'test/unit/constructs/',
            naming: 'construct-name.test.ts',
            coverage: 'all_construct_properties',
            assertions: 'fine_grained_assertions',
          },
          stack_tests: {
            location: 'test/unit/stacks/',
            naming: 'stack-name.test.ts',
            coverage: 'stack_resource_composition',
            snapshots: 'cloudformation_templates',
          },
        },
        example_test: `
          // test/unit/constructs/vpc-construct.test.ts
          import { App, Stack } from 'aws-cdk-lib';
          import { Template, Match } from 'aws-cdk-lib/assertions';
          import { VpcConstruct } from '../../lib/constructs/vpc-construct';
          
          describe('VpcConstruct', () => {
            let app: App;
            let stack: Stack;
            
            beforeEach(() => {
              app = new App();
              stack = new Stack(app, 'TestStack');
            });
            
            test('creates VPC with correct configuration', () => {
              // Arrange
              const vpcConstruct = new VpcConstruct(stack, 'TestVpc', {
                cidr: '10.0.0.0/16',
                maxAzs: 2,
                enableNatGateway: true,
                enableVpnGateway: false
              });
              
              // Act
              const template = Template.fromStack(stack);
              
              // Assert VPC properties
              template.hasResourceProperties('AWS::EC2::VPC', {
                CidrBlock: '10.0.0.0/16',
                EnableDnsHostnames: true,
                EnableDnsSupport: true
              });
              
              // Assert subnet count (2 AZs x 2 subnet types = 4 subnets)
              template.resourceCountIs('AWS::EC2::Subnet', 4);
              
              // Assert NAT Gateway presence
              template.resourceCountIs('AWS::EC2::NatGateway', 2);
              
              // Assert Internet Gateway
              template.hasResourceProperties('AWS::EC2::InternetGateway', {});
            });
            
            test('creates private VPC without internet access', () => {
              // Arrange
              const vpcConstruct = new VpcConstruct(stack, 'TestVpc', {
                cidr: '172.16.0.0/16',
                maxAzs: 2,
                enableNatGateway: false,
                enableInternetGateway: false
              });
              
              // Act
              const template = Template.fromStack(stack);
              
              // Assert no internet gateway
              template.resourceCountIs('AWS::EC2::InternetGateway', 0);
              
              // Assert no NAT gateways
              template.resourceCountIs('AWS::EC2::NatGateway', 0);
              
              // Assert only private subnets
              template.hasResourceProperties('AWS::EC2::Subnet', {
                MapPublicIpOnLaunch: false
              });
            });
            
            test('snapshot test for complete VPC configuration', () => {
              // Arrange
              const vpcConstruct = new VpcConstruct(stack, 'TestVpc', {
                cidr: '10.0.0.0/16',
                maxAzs: 3,
                enableNatGateway: true,
                enableVpnGateway: true,
                enableFlowLogs: true
              });
              
              // Act
              const template = Template.fromStack(stack);
              
              // Assert
              expect(template.toJSON()).toMatchSnapshot();
            });
          });
        `,
      },
    }
  }

  public implementIntegrationTesting(): IntegrationTestingImplementation {
    return {
      strategy: 'environment_based_testing',
      test_environments: {
        dedicated_test_accounts: {
          isolation: 'complete_account_separation',
          cleanup: 'automated_resource_cleanup',
          cost_control: 'automatic_shutdown_schedules',
        },
        shared_test_environments: {
          isolation: 'namespace_based_separation',
          resource_tagging: 'test_identification',
          conflict_prevention: 'resource_naming_conventions',
        },
      },

      test_scenarios: {
        deployment_scenarios: [
          'fresh_deployment',
          'upgrade_deployment',
          'rollback_deployment',
          'disaster_recovery_deployment',
        ],
        configuration_scenarios: [
          'minimal_configuration',
          'full_feature_configuration',
          'edge_case_configurations',
        ],
        failure_scenarios: [
          'partial_deployment_failures',
          'network_connectivity_issues',
          'permission_errors',
          'resource_limit_exceeded',
        ],
      },

      automation: {
        test_orchestration: {
          tool: 'github_actions_or_jenkins',
          trigger: 'pull_request_and_scheduled',
          parallelization: 'test_scenario_based',
          reporting: 'integrated_test_reports',
        },
        environment_management: {
          provisioning: 'on_demand_test_environments',
          configuration: 'infrastructure_as_code',
          teardown: 'automatic_after_tests',
          monitoring: 'test_execution_metrics',
        },
      },
    }
  }
}
```

## Implementation Best Practices

### 1. Development Workflow

- **GitOps Principles**: Use Git as the single source of truth for infrastructure definitions
- **Branching Strategy**: Implement feature branches with pull request reviews
- **Code Reviews**: Require peer reviews for all infrastructure changes
- **Automated Testing**: Run comprehensive tests before merging changes
- **Documentation**: Maintain up-to-date documentation alongside code

### 2. Security and Compliance

- **Least Privilege Access**: Apply minimal required permissions for all operations
- **Secret Management**: Never store secrets in code; use dedicated secret management services
- **Encryption**: Enable encryption at rest and in transit for all data
- **Audit Trails**: Maintain comprehensive logs of all infrastructure changes
- **Compliance Automation**: Implement policy as code for continuous compliance

### 3. Operational Excellence

- **Monitoring and Alerting**: Implement comprehensive infrastructure monitoring
- **Disaster Recovery**: Plan and test disaster recovery procedures
- **Cost Optimization**: Continuously monitor and optimize infrastructure costs
- **Performance Monitoring**: Track infrastructure performance metrics
- **Capacity Planning**: Plan for growth and scaling requirements

### 4. Quality Assurance

- **Multi-Layer Testing**: Implement unit, integration, and end-to-end tests
- **Automated Validation**: Use policy as code for automated validation
- **Configuration Drift Detection**: Monitor and alert on configuration drift
- **Performance Testing**: Test infrastructure under various load conditions
- **Security Testing**: Regularly scan for security vulnerabilities

## Implementation Checklist

### Foundation Phase

- [ ] Design project structure and organization
- [ ] Set up version control with appropriate branching strategy
- [ ] Establish coding standards and conventions
- [ ] Configure development environment and tooling
- [ ] Create initial module library structure

### Security Phase

- [ ] Implement secret management strategy
- [ ] Set up access control and permissions
- [ ] Configure policy as code framework
- [ ] Establish security scanning pipeline
- [ ] Create compliance monitoring system

### Testing Phase

- [ ] Set up unit testing framework
- [ ] Configure integration testing environment
- [ ] Implement end-to-end testing suite
- [ ] Create performance testing scenarios
- [ ] Establish compliance testing procedures

### Operations Phase

- [ ] Deploy monitoring and alerting systems
- [ ] Configure cost optimization tools
- [ ] Set up disaster recovery procedures
- [ ] Implement capacity planning processes
- [ ] Create operational runbooks and documentation

## Related Patterns

- **[Terraform Infrastructure](terraform.md)**: Terraform-specific implementation guidance
- **[AWS CDK Implementation](aws-cdk-implementation.md)**: CDK-specific patterns and practices
- **[Cloud Provider Evaluation](../cloud-providers/provider-evaluation.md)**: Framework for selecting appropriate providers

## References

- Infrastructure as Code Principles and Practices
- Cloud Provider Best Practices Documentation
- Security and Compliance Frameworks
- DevOps and GitOps Methodologies
- Testing Strategies for Infrastructure Code
