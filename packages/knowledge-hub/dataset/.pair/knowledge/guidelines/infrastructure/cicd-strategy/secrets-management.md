# Secrets Management

## Scope

Enterprise-grade secrets management strategy covering secure storage, rotation, access control, and compliance for CI/CD pipelines and application deployments across multiple environments.

## Content Summary

- **Secret Storage**: Centralized secret management with encryption and access control
- **Rotation Strategies**: Automated secret rotation and lifecycle management
- **Integration Patterns**: Secure secret injection into applications and pipelines
- **Compliance**: Audit trails, compliance frameworks, and security best practices

---

## Secrets Management Architecture

### Secret Classification Framework

```yaml
# Secret Classification System
secret-types:
  critical:
    examples: [database-passwords, api-keys, encryption-keys]
    rotation: 'weekly'
    access: 'principle-of-least-privilege'
    audit: 'real-time'

  sensitive:
    examples: [service-tokens, certificates, oauth-secrets]
    rotation: 'monthly'
    access: 'role-based'
    audit: 'daily'

  internal:
    examples: [feature-flags, config-values, internal-urls]
    rotation: 'quarterly'
    access: 'team-based'
    audit: 'weekly'

  public:
    examples: [api-endpoints, documentation-urls]
    rotation: 'as-needed'
    access: 'open'
    audit: 'monthly'
```

### Secret Store Decision Matrix

| Criterion                | HashiCorp Vault  | AWS Secrets Manager | Azure Key Vault | GitHub Secrets | Multi-Provider    |
| ------------------------ | ---------------- | ------------------- | --------------- | -------------- | ----------------- |
| **Enterprise Features**  | ✅ Full           | ✅ Full              | ✅ Full          | ⚠️ Limited     | ✅ Best-of-breed   |
| **Cloud Integration**    | ✅ Multi-cloud    | ✅ AWS Native        | ✅ Azure Native  | ❌ GitHub Only  | ✅ Native Each     |
| **Cost Efficiency**      | ⚠️ License Cost  | ✅ Pay-per-use       | ✅ Pay-per-use   | ✅ Free         | ⚠️ Variable       |
| **Scalability**          | ✅ Unlimited      | ✅ High              | ✅ High          | ⚠️ Limited     | ✅ Unlimited       |
| **Compliance**           | ✅ Full SOC2/FIPS | ✅ SOC2/FIPS         | ✅ SOC2/FIPS     | ✅ SOC2         | ✅ Comprehensive   |
| **Developer Experience** | ⚠️ Complex       | ✅ Simple            | ✅ Simple        | ✅ Integrated   | ⚠️ Multiple Tools |
| **Audit Capabilities**   | ✅ Comprehensive  | ✅ CloudTrail        | ✅ Monitor       | ⚠️ Basic       | ✅ Centralized     |
| **Secret Rotation**      | ✅ Automated      | ✅ Automated         | ✅ Automated     | ❌ Manual       | ✅ Automated       |

**Recommendation: Multi-Provider Strategy** - Use specialized solutions per environment with centralized governance and unified access patterns.

---

## Storage Solutions

### HashiCorp Vault Configuration

```hcl
# Vault Configuration
storage "consul" {
  address = "127.0.0.1:8500"
  path    = "vault/"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/opt/vault/tls/tls.crt"
  tls_key_file  = "/opt/vault/tls/tls.key"
}

seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "12345678-1234-1234-1234-123456789012"
}

api_addr = "https://vault.company.com:8200"
cluster_addr = "https://vault.company.com:8201"
ui = true
```

```bash
# Vault Secrets Engine Setup
# Enable KV secrets engine
vault secrets enable -path=secret kv-v2

# Enable database secrets engine
vault secrets enable database

# Configure database connection
vault write database/config/postgresql \
    plugin_name=postgresql-database-plugin \
    connection_url="postgresql://{{username}}:{{password}}@postgres:5432/mydb?sslmode=disable" \
    allowed_roles="readonly,readwrite" \
    username="vault" \
    password="secret"

# Create database role
vault write database/roles/readonly \
    db_name=postgresql \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"
```

### AWS Secrets Manager Integration

```yaml
# AWS Secrets Manager Configuration
secrets-manager:
  regions: ['us-east-1', 'eu-west-1']
  kms-encryption: true
  automatic-rotation: true

  secrets:
    database-credentials:
      name: 'prod/db/postgresql'
      rotation-schedule: 'rate(7 days)'
      lambda-function: 'rotate-postgresql-secret'

    api-keys:
      name: 'prod/api/external-services'
      rotation-schedule: 'rate(30 days)'

    certificates:
      name: 'prod/tls/certificates'
      rotation-schedule: 'rate(60 days)'
      acm-integration: true
```

```python
# Python AWS Secrets Integration
import boto3
import json
from botocore.exceptions import ClientError

class SecretsManager:
    def __init__(self, region_name='us-east-1'):
        self.client = boto3.client('secretsmanager', region_name=region_name)

    def get_secret(self, secret_name):
        try:
            response = self.client.get_secret_value(SecretId=secret_name)
            return json.loads(response['SecretString'])
        except ClientError as e:
            raise Exception(f"Failed to retrieve secret {secret_name}: {e}")

    def create_secret(self, name, secret_value, description=""):
        try:
            self.client.create_secret(
                Name=name,
                SecretString=json.dumps(secret_value),
                Description=description
            )
        except ClientError as e:
            raise Exception(f"Failed to create secret {name}: {e}")

    def rotate_secret(self, secret_name, lambda_function_arn):
        try:
            self.client.rotate_secret(
                SecretId=secret_name,
                RotationLambdaARN=lambda_function_arn,
                RotationRules={'AutomaticallyAfterDays': 30}
            )
        except ClientError as e:
            raise Exception(f"Failed to rotate secret {secret_name}: {e}")

# Usage Example
secrets = SecretsManager()
db_credentials = secrets.get_secret("prod/db/postgresql")
```

---

## Access Control and Authentication

### Role-Based Access Control (RBAC)

```hcl
# Vault RBAC Policies
# Developer Policy
path "secret/data/dev/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/dev/*" {
  capabilities = ["list"]
}

# Production Read-Only Policy
path "secret/data/prod/*" {
  capabilities = ["read"]
}

path "database/creds/readonly" {
  capabilities = ["read"]
}

# DevOps Policy
path "secret/data/prod/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "database/creds/*" {
  capabilities = ["read"]
}

path "auth/token/create" {
  capabilities = ["create", "update"]
}
```

### Identity and Access Management

```yaml
# IAM Roles for Secrets Access
iam-roles:
  ci-cd-pipeline:
    assume-role-policy: |
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
              "StringEquals": {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": "repo:company/repository:ref:refs/heads/main"
              }
            }
          }
        ]
      }

    policies:
      - name: 'SecretsManagerReadOnly'
        policy: |
          {
            "Version": "2012-10-17",
            "Statement": [
              {
                "Effect": "Allow",
                "Action": [
                  "secretsmanager:GetSecretValue",
                  "secretsmanager:DescribeSecret"
                ],
                "Resource": [
                  "arn:aws:secretsmanager:*:*:secret:prod/*",
                  "arn:aws:secretsmanager:*:*:secret:staging/*"
                ]
              }
            ]
          }

  application-runtime:
    assume-role-policy: |
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "ecs-tasks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }

    policies:
      - name: 'ApplicationSecretsAccess'
        policy: |
          {
            "Version": "2012-10-17",
            "Statement": [
              {
                "Effect": "Allow",
                "Action": [
                  "secretsmanager:GetSecretValue"
                ],
                "Resource": [
                  "arn:aws:secretsmanager:*:*:secret:app/database/*",
                  "arn:aws:secretsmanager:*:*:secret:app/api-keys/*"
                ]
              }
            ]
          }
```

---

## Secret Rotation Strategies

### Automated Rotation Framework

```python
# Lambda Function for Database Secret Rotation
import boto3
import psycopg2
import json
import random
import string

def lambda_handler(event, context):
    service = event['Step']
    secret_arn = event['SecretId']
    token = event['ClientRequestToken']

    secrets_client = boto3.client('secretsmanager')

    if service == "createSecret":
        create_secret(secrets_client, secret_arn, token)
    elif service == "setSecret":
        set_secret(secrets_client, secret_arn, token)
    elif service == "testSecret":
        test_secret(secrets_client, secret_arn, token)
    elif service == "finishSecret":
        finish_secret(secrets_client, secret_arn, token)

def create_secret(secrets_client, secret_arn, token):
    # Generate new password
    new_password = generate_password(32)

    # Get current secret
    current_secret = get_secret_dict(secrets_client, secret_arn, "AWSCURRENT")

    # Create new secret version
    new_secret = current_secret.copy()
    new_secret['password'] = new_password

    secrets_client.put_secret_value(
        SecretId=secret_arn,
        SecretString=json.dumps(new_secret),
        VersionStage="AWSPENDING",
        ClientRequestToken=token
    )

def set_secret(secrets_client, secret_arn, token):
    pending_secret = get_secret_dict(secrets_client, secret_arn, "AWSPENDING", token)

    # Connect to database and update password
    conn = psycopg2.connect(
        host=pending_secret['host'],
        port=pending_secret['port'],
        user=pending_secret['username'],
        password=get_secret_dict(secrets_client, secret_arn, "AWSCURRENT")['password'],
        database=pending_secret['dbname']
    )

    with conn.cursor() as cur:
        cur.execute(f"ALTER USER {pending_secret['username']} PASSWORD %s", (pending_secret['password'],))

    conn.commit()
    conn.close()

def generate_password(length):
    characters = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(random.choice(characters) for _ in range(length))
```

### Rotation Scheduling

```yaml
# Rotation Schedule Configuration
rotation-schedules:
  critical-secrets:
    frequency: 'weekly'
    window: '02:00-04:00 UTC'
    rollback-time: '30m'

  sensitive-secrets:
    frequency: 'monthly'
    window: '02:00-04:00 UTC'
    rollback-time: '1h'

  certificates:
    frequency: 'quarterly'
    window: 'weekend'
    notification: '2-weeks-advance'

  api-keys:
    frequency: 'bi-annually'
    coordination: 'manual'
    dependencies: ['partner-notification']
```

---

## Integration Patterns

### CI/CD Pipeline Integration

```yaml
# GitHub Actions Secrets Integration
name: Deploy with Secrets

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Retrieve secrets from AWS Secrets Manager
        uses: aws-actions/aws-secretsmanager-get-secrets@v2
        with:
          secret-ids: |
            DATABASE_URL,prod/db/postgresql
            API_KEY,prod/api/external-service
            REDIS_URL,prod/cache/redis
          parse-json-secrets: true

      - name: Deploy application
        run: |
          docker run -d \
            -e DATABASE_URL="${{ env.DATABASE_URL }}" \
            -e API_KEY="${{ env.API_KEY }}" \
            -e REDIS_URL="${{ env.REDIS_URL }}" \
            myapp:latest
```

### Application Runtime Integration

```typescript
// Node.js Application Secrets Integration
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

class ConfigManager {
  private secretsClient: SecretsManagerClient
  private cache: Map<string, { value: any; expiry: number }> = new Map()
  private cacheTimeout = 5 * 60 * 1000 // 5 minutes

  constructor() {
    this.secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION })
  }

  async getSecret(secretName: string): Promise<any> {
    const cached = this.cache.get(secretName)
    if (cached && cached.expiry > Date.now()) {
      return cached.value
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: secretName })
      const response = await this.secretsClient.send(command)
      const value = JSON.parse(response.SecretString || '{}')

      this.cache.set(secretName, {
        value,
        expiry: Date.now() + this.cacheTimeout,
      })

      return value
    } catch (error) {
      console.error(`Failed to retrieve secret ${secretName}:`, error)
      throw error
    }
  }

  async getDatabaseConfig(): Promise<DatabaseConfig> {
    const secret = await this.getSecret('prod/db/postgresql')
    return {
      host: secret.host,
      port: secret.port,
      username: secret.username,
      password: secret.password,
      database: secret.dbname,
    }
  }

  async getApiKeys(): Promise<ApiKeyConfig> {
    const secret = await this.getSecret('prod/api/external-services')
    return {
      stripeKey: secret.stripe_key,
      sendgridKey: secret.sendgrid_key,
      twilioKey: secret.twilio_key,
    }
  }
}

// Usage in application
const configManager = new ConfigManager()

export const createDatabaseConnection = async () => {
  const dbConfig = await configManager.getDatabaseConfig()
  return new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: { rejectUnauthorized: false },
  })
}
```

### Kubernetes Integration

```yaml
# Kubernetes External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        serviceAccount:
          name: external-secrets-sa

---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
  namespace: production
spec:
  refreshInterval: 15s
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: app-secrets
    creationPolicy: Owner
  data:
    - secretKey: database-url
      remoteRef:
        key: prod/db/postgresql
        property: connection_string
    - secretKey: api-key
      remoteRef:
        key: prod/api/external-service
        property: api_key

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      serviceAccountName: external-secrets-sa
      containers:
        - name: myapp
          image: myapp:latest
          envFrom:
            - secretRef:
                name: app-secrets
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
```

---

## Monitoring and Auditing

### Audit Logging Configuration

```yaml
# Vault Audit Configuration
audit-devices:
  file:
    enabled: true
    options:
      file_path: '/vault/logs/audit.log'
      log_raw: false
      format: 'json'

  syslog:
    enabled: true
    options:
      facility: 'local0'
      tag: 'vault'
      format: 'json'

  socket:
    enabled: true
    options:
      address: '127.0.0.1:9090'
      socket_type: 'tcp'
      format: 'json'
```

### Monitoring Dashboard

```yaml
# Grafana Dashboard Configuration
dashboards:
  secrets-overview:
    metrics:
      - vault_secret_requests_total
      - vault_secret_lease_duration
      - aws_secretsmanager_api_calls
      - secret_rotation_success_rate

    alerts:
      - name: 'Secret Access Failure Rate'
        condition: 'rate > 5%'
        severity: 'warning'

      - name: 'Failed Secret Rotation'
        condition: 'rotation_failed == 1'
        severity: 'critical'

      - name: 'Expired Secrets'
        condition: 'secrets_expired > 0'
        severity: 'high'

  compliance-dashboard:
    metrics:
      - secrets_without_rotation
      - access_violations
      - audit_log_completeness
      - compliance_score

    reports:
      - name: 'SOC2 Compliance'
        frequency: 'monthly'
        format: 'pdf'

      - name: 'Access Review'
        frequency: 'quarterly'
        format: 'csv'
```

### Alerting Strategy

```yaml
# Alert Configuration
alerts:
  secret-access-anomaly:
    conditions:
      - unusual_access_pattern
      - access_from_new_location
      - bulk_secret_retrieval
    actions:
      - notify: security-team
      - create: incident-ticket
      - trigger: access-review

  rotation-failure:
    conditions:
      - rotation_timeout
      - rotation_error
      - dependency_failure
    actions:
      - notify: devops-team
      - escalate: security-team
      - rollback: previous-version

  compliance-violation:
    conditions:
      - expired_secrets
      - unencrypted_storage
      - unauthorized_access
    actions:
      - notify: compliance-team
      - create: audit-log
      - enforce: immediate-remediation
```

---

## Compliance and Security

### Security Standards Compliance

```yaml
# Security Framework Compliance
compliance-frameworks:
  soc2:
    requirements:
      - encrypted-storage
      - access-controls
      - audit-logging
      - change-management
    evidence:
      - vault-audit-logs
      - access-control-matrix
      - encryption-certificates

  iso27001:
    requirements:
      - information-classification
      - access-management
      - incident-response
      - risk-assessment
    evidence:
      - security-policies
      - access-reviews
      - incident-reports

  pci-dss:
    requirements:
      - data-encryption
      - access-restrictions
      - monitoring
      - testing
    evidence:
      - encryption-validation
      - penetration-tests
      - vulnerability-scans
```

### Data Protection

```yaml
# Data Protection Strategy
data-protection:
  encryption:
    at-rest: 'AES-256'
    in-transit: 'TLS-1.3'
    key-management: 'FIPS-140-2-Level-3'

  classification:
    public: 'no-encryption-required'
    internal: 'standard-encryption'
    confidential: 'enhanced-encryption'
    restricted: 'military-grade-encryption'

  retention:
    active-secrets: 'as-required'
    audit-logs: '7-years'
    rotation-logs: '1-year'
    access-logs: '3-years'

  geographic:
    data-residency: 'enforced'
    cross-border: 'restricted'
    sovereignty: 'compliant'
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

- [ ] Deploy HashiCorp Vault cluster
- [ ] Configure AWS Secrets Manager
- [ ] Implement basic RBAC policies
- [ ] Set up audit logging
- [ ] Create initial secret migration plan

### Phase 2: Integration (Weeks 5-8)

- [ ] Integrate CI/CD pipelines
- [ ] Implement application runtime integration
- [ ] Configure Kubernetes external secrets
- [ ] Set up monitoring and alerting
- [ ] Create rotation automation

### Phase 3: Advanced Features (Weeks 9-12)

- [ ] Implement advanced RBAC
- [ ] Configure compliance reporting
- [ ] Set up disaster recovery
- [ ] Create self-service portal
- [ ] Implement secret scanning

### Phase 4: Optimization (Weeks 13-16)

- [ ] Performance optimization
- [ ] Advanced monitoring
- [ ] Compliance automation
- [ ] Security hardening
- [ ] Knowledge transfer and training

---

This comprehensive secrets management guide provides enterprise-grade security with automated rotation, compliance monitoring, and seamless integration across your entire infrastructure stack.
