# Terraform Infrastructure as Code

Comprehensive guide for implementing Infrastructure as Code using Terraform, including best practices, advanced patterns, and enterprise-scale deployment strategies.

## When to Use

**Essential for:**

- Infrastructure automation and repeatability
- Multi-environment deployments
- Infrastructure version control and auditing
- Complex infrastructure orchestration
- Compliance and governance requirements
- Infrastructure cost management and optimization

**Consider alternatives for:**

- Simple, single-resource deployments
- Prototype and experimental environments
- Scenarios requiring immediate manual intervention
- Teams without infrastructure automation skills

## Terraform Architecture Overview

### 1. Core Terraform Concepts and Structure

```typescript
interface TerraformProject {
  structure: ProjectStructure
  state_management: StateManagement
  modules: ModuleLibrary
  environments: EnvironmentStrategy
  automation: AutomationFramework
}

interface ProjectStructure {
  organization: OrganizationPattern
  naming_conventions: NamingConventions
  file_organization: FileOrganization
  documentation: DocumentationStandards
}

interface StateManagement {
  backend: StateBackend
  state_locking: StateLocking
  encryption: StateEncryption
  versioning: StateVersioning
}

// Example: Enterprise Terraform Project Structure
const enterpriseTerraformStructure: TerraformProject = {
  structure: {
    organization: 'monorepo_with_workspaces',
    naming_conventions: {
      resources: 'kebab_case_with_prefix',
      variables: 'snake_case',
      outputs: 'snake_case',
      modules: 'kebab_case',
      files: 'snake_case',
    },
    file_organization: {
      pattern: 'environment_based_separation',
      structure: {
        'environments/': {
          'dev/': ['main.tf', 'variables.tf', 'outputs.tf', 'terraform.tfvars'],
          'staging/': ['main.tf', 'variables.tf', 'outputs.tf', 'terraform.tfvars'],
          'prod/': ['main.tf', 'variables.tf', 'outputs.tf', 'terraform.tfvars'],
        },
        'modules/': {
          'compute/': ['main.tf', 'variables.tf', 'outputs.tf', 'README.md'],
          'networking/': ['main.tf', 'variables.tf', 'outputs.tf', 'README.md'],
          'database/': ['main.tf', 'variables.tf', 'outputs.tf', 'README.md'],
          'security/': ['main.tf', 'variables.tf', 'outputs.tf', 'README.md'],
        },
        'shared/': {
          'global/': ['backend.tf', 'provider.tf', 'versions.tf'],
          'policies/': ['opa_policies/', 'sentinel_policies/'],
          'scripts/': ['deploy.sh', 'validate.sh', 'cleanup.sh'],
        },
      },
    },
    documentation: {
      module_documentation: 'terraform_docs_automated',
      architecture_diagrams: 'mermaid_embedded',
      runbooks: 'markdown_format',
      change_logs: 'automated_generation',
    },
  },
  state_management: {
    backend: {
      type: 's3_with_dynamodb_locking',
      configuration: {
        bucket: 'terraform-state-${environment}-${region}',
        key: '${workspace}/${component}/terraform.tfstate',
        region: 'us-east-1',
        dynamodb_table: 'terraform-lock-table',
        encrypt: true,
        versioning: true,
      },
    },
    state_locking: {
      enabled: true,
      timeout: '10m',
      force_unlock: 'admin_only',
    },
    encryption: {
      at_rest: 'aws_kms',
      in_transit: 'tls_1_3',
      key_rotation: 'annual',
    },
    versioning: {
      retention_policy: '90_days',
      backup_strategy: 'cross_region_replication',
    },
  },
  modules: {
    organization: 'private_registry',
    versioning: 'semantic_versioning',
    testing: 'terratest_integration',
    documentation: 'auto_generated',
  },
  environments: {
    strategy: 'workspace_based',
    promotion_pipeline: 'gitops_workflow',
    configuration_management: 'tfvars_hierarchy',
  },
  automation: {
    ci_cd: 'github_actions',
    policy_as_code: 'opa_sentinel',
    cost_estimation: 'infracost',
    security_scanning: 'checkov_tfsec',
  },
}
```

### 2. Advanced Module Design Patterns

```typescript
interface TerraformModule {
  design_patterns: ModulePattern[]
  composition: ModuleComposition
  testing_strategy: ModuleTestingStrategy
  versioning: ModuleVersioning
}

interface ModulePattern {
  pattern_name: string
  use_cases: string[]
  implementation: ModuleImplementation
  benefits: string[]
  trade_offs: string[]
}

// Example: Comprehensive VPC Module Implementation
const vpcModuleExample = `
# modules/networking/vpc/main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Data sources for availability zones and caller identity
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local values for computed configurations
locals {
  # Calculate subnet CIDR blocks automatically
  vpc_cidr_block = var.vpc_cidr
  
  # Split VPC CIDR into subnets
  newbits = var.subnet_newbits
  
  # Calculate subnet CIDRs
  private_subnet_cidrs = [
    for i, az in slice(data.aws_availability_zones.available.names, 0, var.max_azs) :
    cidrsubnet(local.vpc_cidr_block, local.newbits, i)
  ]
  
  public_subnet_cidrs = [
    for i, az in slice(data.aws_availability_zones.available.names, 0, var.max_azs) :
    cidrsubnet(local.vpc_cidr_block, local.newbits, i + var.max_azs)
  ]
  
  database_subnet_cidrs = [
    for i, az in slice(data.aws_availability_zones.available.names, 0, var.max_azs) :
    cidrsubnet(local.vpc_cidr_block, local.newbits, i + (var.max_azs * 2))
  ]
  
  # Common tags
  common_tags = merge(
    var.tags,
    {
      Module      = "networking/vpc"
      Environment = var.environment
      ManagedBy   = "terraform"
      CreatedBy   = data.aws_caller_identity.current.user_id
    }
  )
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = local.vpc_cidr_block
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = var.enable_dns_support
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-vpc"
    }
  )
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  count = var.create_igw ? 1 : 0
  
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-igw"
    }
  )
}

# Public Subnets
resource "aws_subnet" "public" {
  count = var.create_public_subnets ? length(local.public_subnet_cidrs) : 0
  
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = var.map_public_ip_on_launch
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-public-\${data.aws_availability_zones.available.names[count.index]}"
      Type = "public"
    }
  )
}

# Private Subnets
resource "aws_subnet" "private" {
  count = var.create_private_subnets ? length(local.private_subnet_cidrs) : 0
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-private-\${data.aws_availability_zones.available.names[count.index]}"
      Type = "private"
    }
  )
}

# Database Subnets
resource "aws_subnet" "database" {
  count = var.create_database_subnets ? length(local.database_subnet_cidrs) : 0
  
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.database_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-database-\${data.aws_availability_zones.available.names[count.index]}"
      Type = "database"
    }
  )
}

# NAT Gateways
resource "aws_eip" "nat" {
  count = var.create_nat_gateway ? var.single_nat_gateway ? 1 : length(aws_subnet.public) : 0
  
  domain = "vpc"
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-nat-eip-\${count.index + 1}"
    }
  )
  
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count = var.create_nat_gateway ? var.single_nat_gateway ? 1 : length(aws_subnet.public) : 0
  
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-nat-\${count.index + 1}"
    }
  )
  
  depends_on = [aws_internet_gateway.main]
}

# Route Tables
resource "aws_route_table" "public" {
  count = var.create_public_subnets ? 1 : 0
  
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-public-rt"
    }
  )
}

resource "aws_route_table" "private" {
  count = var.create_private_subnets ? var.single_nat_gateway ? 1 : length(aws_subnet.private) : 0
  
  vpc_id = aws_vpc.main.id
  
  tags = merge(
    local.common_tags,
    {
      Name = "\${var.name}-private-rt-\${count.index + 1}"
    }
  )
}

# Routes
resource "aws_route" "public_internet_gateway" {
  count = var.create_public_subnets && var.create_igw ? 1 : 0
  
  route_table_id         = aws_route_table.public[0].id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main[0].id
  
  timeouts {
    create = "5m"
  }
}

resource "aws_route" "private_nat_gateway" {
  count = var.create_private_subnets && var.create_nat_gateway ? length(aws_route_table.private) : 0
  
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[var.single_nat_gateway ? 0 : count.index].id
  
  timeouts {
    create = "5m"
  }
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count = var.create_public_subnets ? length(aws_subnet.public) : 0
  
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_route_table_association" "private" {
  count = var.create_private_subnets ? length(aws_subnet.private) : 0
  
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[var.single_nat_gateway ? 0 : count.index].id
}
`

// Module variables file
const vpcModuleVariables = `
# modules/networking/vpc/variables.tf
variable "name" {
  description = "Name to be used on all the resources as identifier"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
  
  validation {
    condition = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "max_azs" {
  description = "Maximum number of Availability Zones to use"
  type        = number
  default     = 3
  
  validation {
    condition = var.max_azs > 0 && var.max_azs <= 6
    error_message = "Maximum AZs must be between 1 and 6."
  }
}

variable "subnet_newbits" {
  description = "Number of additional bits with which to extend the VPC CIDR"
  type        = number
  default     = 8
  
  validation {
    condition = var.subnet_newbits >= 4 && var.subnet_newbits <= 16
    error_message = "Subnet newbits must be between 4 and 16."
  }
}

variable "create_igw" {
  description = "Controls if an Internet Gateway is created for public subnets"
  type        = bool
  default     = true
}

variable "create_public_subnets" {
  description = "Controls if public subnets should be created"
  type        = bool
  default     = true
}

variable "create_private_subnets" {
  description = "Controls if private subnets should be created"
  type        = bool
  default     = true
}

variable "create_database_subnets" {
  description = "Controls if database subnets should be created"
  type        = bool
  default     = false
}

variable "create_nat_gateway" {
  description = "Controls if NAT Gateways should be created for private subnets"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Should be true to provision a single shared NAT Gateway across all private networks"
  type        = bool
  default     = false
}

variable "map_public_ip_on_launch" {
  description = "Should be false if you do not want to auto-assign public IP on launch"
  type        = bool
  default     = true
}

variable "enable_dns_hostnames" {
  description = "Should be true to enable DNS hostnames in the VPC"
  type        = bool
  default     = true
}

variable "enable_dns_support" {
  description = "Should be true to enable DNS support in the VPC"
  type        = bool
  default     = true
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
`

// Module outputs file
const vpcModuleOutputs = `
# modules/networking/vpc/outputs.tf
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_arn" {
  description = "The ARN of the VPC"
  value       = aws_vpc.main.arn
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "List of IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "List of IDs of database subnets"
  value       = aws_subnet.database[*].id
}

output "public_subnet_arns" {
  description = "List of ARNs of public subnets"
  value       = aws_subnet.public[*].arn
}

output "private_subnet_arns" {
  description = "List of ARNs of private subnets"
  value       = aws_subnet.private[*].arn
}

output "database_subnet_arns" {
  description = "List of ARNs of database subnets"
  value       = aws_subnet.database[*].arn
}

output "public_subnet_cidrs" {
  description = "List of CIDR blocks of public subnets"
  value       = aws_subnet.public[*].cidr_block
}

output "private_subnet_cidrs" {
  description = "List of CIDR blocks of private subnets"
  value       = aws_subnet.private[*].cidr_block
}

output "database_subnet_cidrs" {
  description = "List of CIDR blocks of database subnets"
  value       = aws_subnet.database[*].cidr_block
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = try(aws_internet_gateway.main[0].id, null)
}

output "nat_gateway_ids" {
  description = "List of IDs of NAT Gateways"
  value       = aws_nat_gateway.main[*].id
}

output "nat_public_ips" {
  description = "List of public Elastic IPs created for AWS NAT Gateway"
  value       = aws_eip.nat[*].public_ip
}

output "public_route_table_id" {
  description = "ID of the public route table"
  value       = try(aws_route_table.public[0].id, null)
}

output "private_route_table_ids" {
  description = "List of IDs of private route tables"
  value       = aws_route_table.private[*].id
}

output "availability_zones" {
  description = "List of availability zones used"
  value       = slice(data.aws_availability_zones.available.names, 0, var.max_azs)
}
`
```

### 3. State Management and Backend Configuration

```typescript
interface StateManagementStrategy {
  backend_configuration: BackendConfig
  state_organization: StateOrganization
  locking_strategy: LockingStrategy
  security_configuration: SecurityConfig
}

interface BackendConfig {
  backend_type: 's3' | 'azurerm' | 'gcs' | 'remote'
  configuration: BackendConfiguration
  encryption: EncryptionConfig
  versioning: VersioningConfig
}

// Example: S3 Backend Configuration with Best Practices
const s3BackendConfiguration = `
# shared/global/backend.tf
terraform {
  backend "s3" {
    # State file location
    bucket = "terraform-state-\${var.organization}-\${var.environment}"
    key    = "\${var.workspace}/\${var.component}/terraform.tfstate"
    region = "us-east-1"
    
    # State locking
    dynamodb_table = "terraform-lock-table"
    
    # Security
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"
    
    # Versioning and backup
    versioning     = true
    
    # Access control
    assume_role {
      role_arn = "arn:aws:iam::\${var.account_id}:role/TerraformRole"
    }
    
    # Additional security
    skip_credentials_validation = false
    skip_metadata_api_check    = false
    skip_region_validation     = false
    force_path_style          = false
  }
}

# Backend bucket and DynamoDB table setup
resource "aws_s3_bucket" "terraform_state" {
  bucket = "terraform-state-\${var.organization}-\${var.environment}"
  
  tags = {
    Name        = "Terraform State"
    Environment = var.environment
    Purpose     = "terraform-state-storage"
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = aws_kms_key.terraform_state.arn
        sse_algorithm     = "aws:kms"
      }
      bucket_key_enabled = true
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  
  rule {
    id     = "terraform_state_lifecycle"
    status = "Enabled"
    
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_dynamodb_table" "terraform_lock" {
  name           = "terraform-lock-table"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"
  
  attribute {
    name = "LockID"
    type = "S"
  }
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name        = "Terraform Lock Table"
    Environment = var.environment
    Purpose     = "terraform-state-locking"
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::\${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Terraform Role"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::\${data.aws_caller_identity.current.account_id}:role/TerraformRole"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
  
  tags = {
    Name        = "Terraform State KMS Key"
    Environment = var.environment
    Purpose     = "terraform-state-encryption"
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state-key"
  target_key_id = aws_kms_key.terraform_state.key_id
}
`
```

### 4. CI/CD Integration and Automation

```typescript
interface TerraformAutomation {
  ci_cd_pipeline: CICDPipeline
  policy_as_code: PolicyAsCode
  security_scanning: SecurityScanning
  cost_estimation: CostEstimation
}

interface CICDPipeline {
  platform: 'github_actions' | 'gitlab_ci' | 'jenkins' | 'azure_devops'
  workflow_stages: WorkflowStage[]
  approval_gates: ApprovalGate[]
  rollback_strategy: RollbackStrategy
}

// Example: GitHub Actions Terraform Workflow
const githubActionsWorkflow = `
# .github/workflows/terraform.yml
name: Terraform Infrastructure

on:
  push:
    branches: [main, develop]
    paths: ['infrastructure/**']
  pull_request:
    branches: [main]
    paths: ['infrastructure/**']
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        default: 'dev'
        type: choice
        options:
          - dev
          - staging
          - prod

env:
  TF_VERSION: "1.6.0"
  AWS_REGION: "us-east-1"
  
jobs:
  # Static Analysis and Validation
  validate:
    name: Validate and Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: \${{ env.TF_VERSION }}
          
      - name: Terraform Format Check
        run: terraform fmt -check -recursive
        
      - name: Terraform Init
        run: terraform init -backend=false
        working-directory: ./infrastructure
        
      - name: Terraform Validate
        run: terraform validate
        working-directory: ./infrastructure
        
      - name: Run TFLint
        uses: terraform-linters/setup-tflint@v4
        with:
          tflint_version: latest
          
      - name: Run TFLint Analysis
        run: |
          tflint --init
          tflint --format=compact
        working-directory: ./infrastructure
        
      - name: Run Checkov Security Scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: ./infrastructure
          framework: terraform
          output_format: sarif
          output_file_path: reports/checkov.sarif
          
      - name: Upload Checkov Results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: reports/checkov.sarif

  # Cost Estimation
  cost:
    name: Cost Estimation
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Setup Infracost
        uses: infracost/actions/setup@v2
        with:
          api-key: \${{ secrets.INFRACOST_API_KEY }}
          
      - name: Generate Cost Estimate
        run: |
          infracost breakdown --path=./infrastructure \\
                            --format=json \\
                            --out-file=/tmp/infracost.json
                            
      - name: Post Cost Comment
        run: |
          infracost comment github --path=/tmp/infracost.json \\
                                 --repo=\$GITHUB_REPOSITORY \\
                                 --github-token=\${{ secrets.GITHUB_TOKEN }} \\
                                 --pull-request=\${{ github.event.pull_request.number }} \\
                                 --behavior=update

  # Plan Phase
  plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    needs: [validate]
    strategy:
      matrix:
        environment: [dev, staging, prod]
    environment: 
      name: \${{ matrix.environment }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}
          
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: \${{ env.TF_VERSION }}
          
      - name: Terraform Init
        run: |
          terraform init \\
            -backend-config="bucket=terraform-state-\${{ matrix.environment }}" \\
            -backend-config="key=\${{ matrix.environment }}/infrastructure/terraform.tfstate" \\
            -backend-config="region=\${{ env.AWS_REGION }}"
        working-directory: ./infrastructure/environments/\${{ matrix.environment }}
        
      - name: Terraform Plan
        id: plan
        run: |
          terraform plan \\
            -var-file="terraform.tfvars" \\
            -out=tfplan \\
            -detailed-exitcode
        working-directory: ./infrastructure/environments/\${{ matrix.environment }}
        continue-on-error: true
        
      - name: Generate Plan Summary
        if: steps.plan.outputs.exitcode == 2
        run: |
          terraform show -no-color tfplan > plan_output.txt
          echo "## Terraform Plan for \${{ matrix.environment }}" >> \$GITHUB_STEP_SUMMARY
          echo "\`\`\`" >> \$GITHUB_STEP_SUMMARY
          cat plan_output.txt >> \$GITHUB_STEP_SUMMARY
          echo "\`\`\`" >> \$GITHUB_STEP_SUMMARY
        working-directory: ./infrastructure/environments/\${{ matrix.environment }}
        
      - name: Upload Plan Artifact
        uses: actions/upload-artifact@v3
        if: steps.plan.outputs.exitcode == 2
        with:
          name: tfplan-\${{ matrix.environment }}
          path: ./infrastructure/environments/\${{ matrix.environment }}/tfplan
          retention-days: 7

  # Apply Phase (only on main branch and manual triggers)
  apply:
    name: Terraform Apply
    runs-on: ubuntu-latest
    needs: [plan]
    if: github.ref == 'refs/heads/main' || github.event_name == 'workflow_dispatch'
    environment:
      name: \${{ github.event.inputs.environment || 'dev' }}
      url: \${{ steps.apply.outputs.environment_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}
          
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: \${{ env.TF_VERSION }}
          
      - name: Download Plan Artifact
        uses: actions/download-artifact@v3
        with:
          name: tfplan-\${{ github.event.inputs.environment || 'dev' }}
          path: ./infrastructure/environments/\${{ github.event.inputs.environment || 'dev' }}
          
      - name: Terraform Init
        run: |
          terraform init \\
            -backend-config="bucket=terraform-state-\${{ github.event.inputs.environment || 'dev' }}" \\
            -backend-config="key=\${{ github.event.inputs.environment || 'dev' }}/infrastructure/terraform.tfstate" \\
            -backend-config="region=\${{ env.AWS_REGION }}"
        working-directory: ./infrastructure/environments/\${{ github.event.inputs.environment || 'dev' }}
        
      - name: Terraform Apply
        id: apply
        run: terraform apply -auto-approve tfplan
        working-directory: ./infrastructure/environments/\${{ github.event.inputs.environment || 'dev' }}
        
      - name: Generate Apply Summary
        run: |
          echo "## Terraform Apply Completed for \${{ github.event.inputs.environment || 'dev' }}" >> \$GITHUB_STEP_SUMMARY
          echo "✅ Infrastructure successfully deployed" >> \$GITHUB_STEP_SUMMARY
          terraform output -json > outputs.json
          echo "### Outputs:" >> \$GITHUB_STEP_SUMMARY
          echo "\`\`\`json" >> \$GITHUB_STEP_SUMMARY
          cat outputs.json >> \$GITHUB_STEP_SUMMARY
          echo "\`\`\`" >> \$GITHUB_STEP_SUMMARY
        working-directory: ./infrastructure/environments/\${{ github.event.inputs.environment || 'dev' }}

  # Drift Detection
  drift-detection:
    name: Drift Detection
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'
    strategy:
      matrix:
        environment: [dev, staging, prod]
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}
          
      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: \${{ env.TF_VERSION }}
          
      - name: Terraform Init
        run: |
          terraform init \\
            -backend-config="bucket=terraform-state-\${{ matrix.environment }}" \\
            -backend-config="key=\${{ matrix.environment }}/infrastructure/terraform.tfstate" \\
            -backend-config="region=\${{ env.AWS_REGION }}"
        working-directory: ./infrastructure/environments/\${{ matrix.environment }}
        
      - name: Terraform Plan (Drift Check)
        id: drift
        run: |
          terraform plan \\
            -var-file="terraform.tfvars" \\
            -detailed-exitcode \\
            -out=drift-plan
        working-directory: ./infrastructure/environments/\${{ matrix.environment }}
        continue-on-error: true
        
      - name: Notify Drift Detected
        if: steps.drift.outputs.exitcode == 2
        uses: 8398a7/action-slack@v3
        with:
          status: custom
          custom_payload: |
            {
              "text": "🚨 Infrastructure Drift Detected in \${{ matrix.environment }}",
              "attachments": [{
                "color": "warning",
                "fields": [{
                  "title": "Environment",
                  "value": "\${{ matrix.environment }}",
                  "short": true
                }, {
                  "title": "Repository",
                  "value": "\${{ github.repository }}",
                  "short": true
                }]
              }]
            }
        env:
          SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK_URL }}
`
```

### 5. Testing Strategies for Terraform

```typescript
interface TerraformTestingStrategy {
  unit_testing: UnitTesting
  integration_testing: IntegrationTesting
  compliance_testing: ComplianceTesting
  performance_testing: PerformanceTesting
}

interface UnitTesting {
  framework: 'terratest' | 'terraform_test' | 'kitchen_terraform'
  test_patterns: TestPattern[]
  mocking_strategy: MockingStrategy
  coverage_requirements: CoverageRequirements
}

// Example: Terratest Integration Testing
const terratestExample = `
// test/vpc_test.go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/gruntwork-io/terratest/modules/aws"
    "github.com/stretchr/testify/assert"
)

func TestVPCModule(t *testing.T) {
    t.Parallel()
    
    // Configure Terraform options
    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../modules/networking/vpc",
        Vars: map[string]interface{}{
            "name":                    "test-vpc",
            "environment":             "test",
            "vpc_cidr":               "10.0.0.0/16",
            "max_azs":                2,
            "create_public_subnets":   true,
            "create_private_subnets":  true,
            "create_database_subnets": false,
            "create_nat_gateway":      true,
            "single_nat_gateway":      true,
        },
        EnvVars: map[string]string{
            "AWS_DEFAULT_REGION": "us-east-1",
        },
    })
    
    // Clean up resources after test
    defer terraform.Destroy(t, terraformOptions)
    
    // Deploy infrastructure
    terraform.InitAndApply(t, terraformOptions)
    
    // Get outputs
    vpcId := terraform.Output(t, terraformOptions, "vpc_id")
    publicSubnetIds := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
    privateSubnetIds := terraform.OutputList(t, terraformOptions, "private_subnet_ids")
    
    // Validate VPC exists
    vpc := aws.GetVpcById(t, vpcId, "us-east-1")
    assert.Equal(t, "10.0.0.0/16", vpc.CidrBlock)
    
    // Validate subnets
    assert.Equal(t, 2, len(publicSubnetIds))
    assert.Equal(t, 2, len(privateSubnetIds))
    
    // Validate public subnets have internet gateway route
    for _, subnetId := range publicSubnetIds {
        subnet := aws.GetSubnetById(t, subnetId, "us-east-1")
        routeTable := aws.GetRouteTableForSubnet(t, subnetId, "us-east-1")
        
        // Check for internet gateway route
        hasIgwRoute := false
        for _, route := range routeTable.Routes {
            if route.DestinationCidrBlock == "0.0.0.0/0" && route.GatewayId != "" {
                hasIgwRoute = true
                break
            }
        }
        assert.True(t, hasIgwRoute, "Public subnet should have internet gateway route")
    }
    
    // Validate private subnets have NAT gateway route
    for _, subnetId := range privateSubnetIds {
        routeTable := aws.GetRouteTableForSubnet(t, subnetId, "us-east-1")
        
        // Check for NAT gateway route
        hasNatRoute := false
        for _, route := range routeTable.Routes {
            if route.DestinationCidrBlock == "0.0.0.0/0" && route.NatGatewayId != "" {
                hasNatRoute = true
                break
            }
        }
        assert.True(t, hasNatRoute, "Private subnet should have NAT gateway route")
    }
}

func TestVPCModuleValidation(t *testing.T) {
    t.Parallel()
    
    testCases := []struct {
        name          string
        vars          map[string]interface{}
        expectError   bool
        errorContains string
    }{
        {
            name: "invalid_vpc_cidr",
            vars: map[string]interface{}{
                "name":     "test-vpc",
                "vpc_cidr": "invalid-cidr",
            },
            expectError:   true,
            errorContains: "VPC CIDR must be a valid IPv4 CIDR block",
        },
        {
            name: "invalid_max_azs",
            vars: map[string]interface{}{
                "name":   "test-vpc",
                "max_azs": 0,
            },
            expectError:   true,
            errorContains: "Maximum AZs must be between 1 and 6",
        },
        {
            name: "valid_configuration",
            vars: map[string]interface{}{
                "name":     "test-vpc",
                "vpc_cidr": "172.16.0.0/16",
                "max_azs":  3,
            },
            expectError: false,
        },
    }
    
    for _, tc := range testCases {
        t.Run(tc.name, func(t *testing.T) {
            terraformOptions := &terraform.Options{
                TerraformDir: "../modules/networking/vpc",
                Vars:         tc.vars,
                PlanFilePath: "/tmp/plan-" + tc.name,
            }
            
            if tc.expectError {
                _, err := terraform.InitAndPlanE(t, terraformOptions)
                assert.Error(t, err)
                if tc.errorContains != "" {
                    assert.Contains(t, err.Error(), tc.errorContains)
                }
            } else {
                terraform.InitAndPlan(t, terraformOptions)
            }
        })
    }
}
`
```

## Implementation Best Practices

### 1. Code Organization and Structure

- **Consistent Structure**: Use consistent project structure across all environments
- **Module Reusability**: Design modules for maximum reusability and composability
- **Clear Naming**: Use descriptive and consistent naming conventions
- **Documentation**: Maintain comprehensive documentation and examples
- **Version Control**: Use semantic versioning for modules and careful branching strategies

### 2. Security and Compliance

- **State Security**: Encrypt state files and implement proper access controls
- **Secret Management**: Never commit secrets; use external secret management
- **Policy as Code**: Implement policy as code with OPA/Sentinel
- **Regular Scanning**: Perform regular security scans with tools like Checkov/tfsec
- **Least Privilege**: Follow principle of least privilege for IAM roles and permissions

### 3. State Management

- **Remote State**: Always use remote state backends for team collaboration
- **State Locking**: Implement state locking to prevent concurrent modifications
- **State Backup**: Implement backup and versioning strategies for state files
- **State Organization**: Organize state files logically (by environment, component, etc.)
- **State Isolation**: Isolate state files to limit blast radius of changes

### 4. Automation and CI/CD

- **Pipeline Integration**: Integrate Terraform with CI/CD pipelines
- **Automated Testing**: Implement comprehensive testing strategies
- **Cost Estimation**: Include cost estimation in pipeline reviews
- **Drift Detection**: Implement automated drift detection and alerts
- **Rollback Strategy**: Plan and test rollback procedures

## Implementation Checklist

### Setup Phase

- [ ] Design project structure and organization
- [ ] Set up remote state backend with encryption
- [ ] Configure state locking mechanism
- [ ] Establish naming conventions and standards
- [ ] Create initial module library structure

### Development Phase

- [ ] Implement core infrastructure modules
- [ ] Set up validation and testing frameworks
- [ ] Configure policy as code implementation
- [ ] Implement security scanning integration
- [ ] Create comprehensive documentation

### Automation Phase

- [ ] Set up CI/CD pipeline integration
- [ ] Configure automated testing and validation
- [ ] Implement cost estimation and monitoring
- [ ] Set up drift detection and alerting
- [ ] Configure approval workflows and gates

### Operations Phase

- [ ] Monitor infrastructure deployments and changes
- [ ] Conduct regular security and compliance reviews
- [ ] Optimize costs and performance continuously
- [ ] Maintain and update module library
- [ ] Train team on best practices and new features

## Related Patterns

- **[Infrastructure as Code Best Practices](iac-best-practices.md)**: General IaC implementation guidance
- **[State Management](state-management.md)**: Advanced state management strategies
- **[AWS CDK Implementation](aws-cdk-implementation.md)**: Alternative IaC approach with CDK

## References

- Terraform Official Documentation
- Terraform Best Practices Guide
- Terratest Testing Framework
- HashiCorp Vault Integration
- Cloud Provider Terraform Modules
