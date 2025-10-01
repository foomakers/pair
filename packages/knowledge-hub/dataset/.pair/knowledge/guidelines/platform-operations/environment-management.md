# Environment Management Practice (Level 2)

Environment configuration, secrets management, and consistency practices for reliable and secure application deployment.

## Purpose

Define environment management standards that ensure consistent configuration, secure secrets handling, and reliable environment parity across all deployment environments.

## Scope

**In Scope:**

- Environment configuration standards
- Secrets management and security
- Environment parity and consistency
- Configuration drift prevention
- Environment-specific deployment patterns

**Out of Scope:**

- Infrastructure provisioning (see [Infrastructure](infrastructure.md))
- Deployment strategies and CI/CD (see [Deployment](deployment.md))
- Application monitoring configuration (see [Observability](observability.md))
- Application code configuration (see [Technical Standards](../technical-standards/README.md))

## Topics Covered

### Environment Configuration Standards

Standardized configuration management across environments

- Environment hierarchy and inheritance
- Configuration validation and typing
- Environment-specific overrides
- Configuration documentation and discovery

### Secrets Management

Secure handling of sensitive configuration and credentials

- Secrets storage and encryption
- Secrets rotation and lifecycle management
- Access control and audit logging
- Integration with deployment pipelines

### Environment Parity

Consistency and isolation across development, staging, and production

- Environment consistency patterns
- Isolation and security boundaries
- Progressive configuration promotion
- Configuration testing and validation

### Configuration Drift Prevention

Monitoring and prevention of configuration inconsistencies

- Configuration monitoring and alerting
- Automated configuration validation
- Drift detection and remediation
- Change tracking and audit trails

## 🛠️ Level 3: Tool-Specific Implementations

### Secrets Management Tools

- **[Vault](../vault/)** - Enterprise secrets management
- **[AWS Secrets Manager](../aws-secrets/)** - AWS-native secrets management
- **[External Secrets](../external-secrets/)** - Kubernetes External Secrets Operator

### Configuration Management

- **[Kubernetes](kubernetes.md)** - ConfigMaps and Secrets
- **[Terraform](terraform.md)** - Infrastructure configuration

## 🔧 Environment Configuration Standards

### Environment Hierarchy

**Environment Types**:

- **Local**: Developer workstation with containerized services
- **Development**: Shared development environment with external services
- **Staging**: Production-like environment for validation
- **Production**: Live production environment with full security

**Configuration Hierarchy**:

```typescript
// Environment configuration schema
interface EnvironmentConfig {
  // Environment identification
  environment: 'local' | 'development' | 'staging' | 'production'
  version: string

  // Application configuration
  app: {
    name: string
    port: number
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    cors: {
      origin: string | string[]
      credentials: boolean
    }
  }

  // Database configuration
  database: {
    url: string
    poolSize: number
    ssl: boolean
    migrations: {
      autoRun: boolean
      directory: string
    }
  }

  // Cache configuration
  cache: {
    redis: {
      url: string
      ttl: number
      keyPrefix: string
    }
  }

  // External services
  services: Record<
    string,
    {
      url: string
      timeout: number
      retries: number
      apiKey?: string
    }
  >

  // Feature flags
  features: Record<string, boolean>

  // Monitoring and observability
  monitoring: {
    enabled: boolean
    metricsEndpoint: string
    tracingEndpoint?: string
    logLevel: string
  }
}
```

### Configuration Validation

**Runtime Validation**:

```typescript
import { z } from 'zod'

const environmentSchema = z.object({
  environment: z.enum(['local', 'development', 'staging', 'production']),
  app: z.object({
    name: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  }),
  database: z.object({
    url: z.string().url(),
    poolSize: z.number().int().min(1).max(100),
    ssl: z.boolean(),
  }),
  // Add validation for all configuration sections
})

export const validateConfiguration = (config: unknown): EnvironmentConfig => {
  try {
    return environmentSchema.parse(config)
  } catch (error) {
    console.error('Configuration validation failed:', error)
    process.exit(1)
  }
}
```

**Configuration Loading**:

```typescript
// Configuration loader with environment-specific overrides
export const loadConfiguration = (): EnvironmentConfig => {
  const environment = process.env.NODE_ENV as EnvironmentConfig['environment']

  // Load base configuration
  const baseConfig = require('./config/base.json')

  // Load environment-specific overrides
  const envConfig = require(`./config/${environment}.json`)

  // Merge configurations with environment variables
  const finalConfig = {
    ...baseConfig,
    ...envConfig,
    // Override with environment variables
    app: {
      ...baseConfig.app,
      ...envConfig.app,
      port: process.env.PORT ? parseInt(process.env.PORT) : envConfig.app.port,
    },
    database: {
      ...baseConfig.database,
      ...envConfig.database,
      url: process.env.DATABASE_URL || envConfig.database.url,
    },
  }

  return validateConfiguration(finalConfig)
}
```

## 🔐 Secrets Management

### Secrets Storage Strategy

**Local Development**:

```bash
# .env.local (not committed to version control)
DATABASE_URL=postgresql://developer:development@localhost:5432/app_development
REDIS_URL=redis://localhost:6379
JWT_SECRET=local-development-secret-key
STRIPE_SECRET_KEY=sk_test_local_development_key
```

**Development Environment**:

```bash
# Environment variables set in CI/CD platform
DATABASE_URL=${DEV_DATABASE_URL}
REDIS_URL=${DEV_REDIS_URL}
JWT_SECRET=${DEV_JWT_SECRET}
STRIPE_SECRET_KEY=${DEV_STRIPE_SECRET_KEY}
```

**Production Environment**:

- Use platform-specific secrets management
- Implement secrets rotation policies
- Enable audit logging and monitoring
- Apply least-privilege access principles

### Kubernetes Secrets Management

**External Secrets Operator**:

```yaml
# External secret configuration
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
  namespace: production
spec:
  refreshInterval: 1m
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: app-secrets
    creationPolicy: Owner
  data:
    - secretKey: database-url
      remoteRef:
        key: /app/production/database
        property: url
    - secretKey: jwt-secret
      remoteRef:
        key: /app/production/auth
        property: jwt-secret
```

**Secret Usage in Deployments**:

```yaml
# Deployment with secrets
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment
spec:
  template:
    spec:
      containers:
        - name: app
          image: myapp:latest
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: jwt-secret
          envFrom:
            - configMapRef:
                name: app-config
```

### Secrets Rotation

**Automated Rotation**:

```yaml
# Secret rotation policy
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  annotations:
    external-secrets.io/rotation-policy: 'daily'
    external-secrets.io/rotation-time: '02:00'
type: Opaque
data:
  # Secrets data managed by External Secrets Operator
```

**Application Secret Handling**:

```typescript
// Graceful secret rotation handling
class SecretManager {
  private secrets: Map<string, string> = new Map()
  private watchers: Map<string, (() => void)[]> = new Map()

  constructor() {
    // Watch for secret updates in Kubernetes
    this.watchSecrets()
  }

  private watchSecrets() {
    // Implementation for watching secret changes
    // Reload application configuration on secret updates
  }

  public getSecret(key: string): string {
    return this.secrets.get(key) || ''
  }

  public onSecretUpdate(key: string, callback: () => void) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, [])
    }
    this.watchers.get(key)!.push(callback)
  }
}
```

## 🏗️ Environment Parity

### Environment Consistency Patterns

**Configuration Structure**:

```
config/
├── base.json                 # Common configuration
├── local.json               # Local development overrides
├── development.json         # Development environment
├── staging.json             # Staging environment
└── production.json          # Production environment
```

**Base Configuration**:

```json
{
  "app": {
    "name": "myapp",
    "logLevel": "info",
    "cors": {
      "credentials": true
    }
  },
  "database": {
    "poolSize": 10,
    "ssl": false,
    "migrations": {
      "autoRun": false,
      "directory": "./migrations"
    }
  },
  "features": {
    "newFeature": false,
    "betaFeature": false
  }
}
```

**Environment-Specific Overrides**:

```json
// production.json
{
  "app": {
    "logLevel": "warn",
    "cors": {
      "origin": ["https://myapp.com", "https://www.myapp.com"]
    }
  },
  "database": {
    "poolSize": 50,
    "ssl": true,
    "migrations": {
      "autoRun": false
    }
  },
  "features": {
    "newFeature": true
  }
}
```

### Environment Isolation

**Resource Isolation**:

- Separate namespaces for each environment
- Independent database instances
- Isolated storage and cache systems
- Network-level isolation and security

**Access Control**:

```yaml
# Environment-specific RBAC
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developers
  namespace: development
subjects:
  - kind: User
    name: developer@company.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: developer
  apiGroup: rbac.authorization.k8s.io
```

## 📊 Configuration Drift Prevention

### Configuration Monitoring

**Drift Detection**:

```typescript
// Configuration drift monitoring
class ConfigurationMonitor {
  private expectedConfig: EnvironmentConfig
  private currentConfig: EnvironmentConfig

  constructor(expectedConfig: EnvironmentConfig) {
    this.expectedConfig = expectedConfig
    this.currentConfig = loadConfiguration()
  }

  public detectDrift(): ConfigurationDrift[] {
    const drifts: ConfigurationDrift[] = []

    // Deep comparison of expected vs current configuration
    const differences = this.deepCompare(this.expectedConfig, this.currentConfig)

    differences.forEach(diff => {
      drifts.push({
        path: diff.path,
        expected: diff.expected,
        actual: diff.actual,
        severity: this.calculateSeverity(diff),
        timestamp: new Date().toISOString(),
      })
    })

    return drifts
  }

  private calculateSeverity(diff: ConfigurationDifference): 'low' | 'medium' | 'high' {
    // Implement severity calculation based on configuration change impact
    if (diff.path.includes('database') || diff.path.includes('security')) {
      return 'high'
    }
    if (diff.path.includes('features') || diff.path.includes('monitoring')) {
      return 'medium'
    }
    return 'low'
  }
}
```

**Automated Validation**:

```yaml
# Configuration validation job
apiVersion: batch/v1
kind: CronJob
metadata:
  name: config-validation
spec:
  schedule: '0 */6 * * *' # Every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: validator
              image: config-validator:latest
              command:
                - /bin/sh
                - -c
                - |
                  echo "Validating configuration..."
                  kubectl get configmap app-config -o yaml | config-validator validate
                  kubectl get secret app-secrets -o yaml | secret-validator validate
                  echo "Configuration validation completed"
          restartPolicy: OnFailure
```

### Change Tracking

**Configuration Audit Trail**:

```typescript
// Configuration change tracking
interface ConfigurationChange {
  timestamp: string
  environment: string
  component: string
  changeType: 'create' | 'update' | 'delete'
  changes: {
    path: string
    oldValue: any
    newValue: any
  }[]
  author: string
  reason: string
}

class ConfigurationAuditor {
  public trackChange(change: ConfigurationChange): void {
    // Log configuration change
    console.log(
      JSON.stringify({
        event: 'configuration_change',
        timestamp: change.timestamp,
        environment: change.environment,
        component: change.component,
        changeType: change.changeType,
        changes: change.changes,
        author: change.author,
        reason: change.reason,
      }),
    )

    // Send to monitoring system
    this.sendToMonitoring(change)

    // Store in audit database
    this.storeAuditRecord(change)
  }
}
```

## 🔗 Related Practices

- **[Infrastructure](infrastructure.md)** - Infrastructure provisioning and container orchestration
- **[Deployment](deployment.md)** - Deployment automation and pipeline configuration
- **[Observability](observability.md)** - Configuration monitoring and alerting
- **[Technical Standards](../technical-standards/README.md)** - Application configuration standards

---

_Focus on secure configuration management, environment consistency, and configuration reliability._
