# 🔄 Environment Switching

**Focus**: Configuration management and environment-specific behavior patterns

Guidelines for managing different environments (development, testing, staging, production) with clean configuration and environment-aware code patterns.

## 🎯 Environment Configuration Principles

### Environment Types and Hierarchy

```typescript
// ✅ Environment type definitions
type Environment = 'development' | 'testing' | 'staging' | 'production'

type EnvironmentTier = 'local' | 'cloud' | 'production'

interface EnvironmentInfo {
  readonly name: Environment
  readonly tier: EnvironmentTier
  readonly isProduction: boolean
  readonly isDevelopment: boolean
  readonly isTesting: boolean
  readonly isLocal: boolean
  readonly debugEnabled: boolean
  readonly metricsEnabled: boolean
}

// ✅ Environment detection
class EnvironmentDetector {
  static detect(): EnvironmentInfo {
    const nodeEnv = (process.env.NODE_ENV as Environment) || 'development'
    const tier = this.detectTier(nodeEnv)

    return {
      name: nodeEnv,
      tier,
      isProduction: nodeEnv === 'production',
      isDevelopment: nodeEnv === 'development',
      isTesting: nodeEnv === 'testing',
      isLocal: tier === 'local',
      debugEnabled: nodeEnv !== 'production',
      metricsEnabled: tier !== 'local',
    }
  }

  private static detectTier(env: Environment): EnvironmentTier {
    if (env === 'production') return 'production'
    if (process.env.CI === 'true' || process.env.RAILWAY_ENVIRONMENT) return 'cloud'
    return 'local'
  }
}

// ✅ Environment-aware utilities
class EnvironmentUtils {
  static readonly current = EnvironmentDetector.detect()

  static isProduction(): boolean {
    return this.current.isProduction
  }

  static isDevelopment(): boolean {
    return this.current.isDevelopment
  }

  static isTesting(): boolean {
    return this.current.isTesting
  }

  static requireProduction(): void {
    if (!this.isProduction()) {
      throw new Error('This operation is only allowed in production')
    }
  }

  static requireNonProduction(): void {
    if (this.isProduction()) {
      throw new Error('This operation is not allowed in production')
    }
  }

  static when<T>(conditions: Partial<Record<Environment, T>>, fallback?: T): T | undefined {
    const value = conditions[this.current.name]
    return value !== undefined ? value : fallback
  }
}
```

### Configuration Management

```typescript
// ✅ Type-safe configuration schema
interface DatabaseConfig {
  readonly url: string
  readonly poolSize: number
  readonly ssl: boolean
  readonly queryTimeout: number
  readonly migrationPath: string
}

interface RedisConfig {
  readonly url: string
  readonly keyPrefix: string
  readonly ttl: number
  readonly maxRetries: number
}

interface EmailConfig {
  readonly provider: 'sendgrid' | 'ses' | 'mock'
  readonly fromAddress: string
  readonly replyToAddress: string
  readonly templatePath: string
  readonly sendgrid?: {
    apiKey: string
  }
  readonly ses?: {
    region: string
    accessKeyId: string
    secretAccessKey: string
  }
}

interface LoggingConfig {
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly format: 'json' | 'pretty'
  readonly destination: 'console' | 'file' | 'cloud'
  readonly filePath?: string
  readonly cloudConfig?: {
    service: 'cloudwatch' | 'datadog'
    apiKey: string
  }
}

interface SecurityConfig {
  readonly jwtSecret: string
  readonly bcryptRounds: number
  readonly sessionTimeout: number
  readonly corsOrigins: string[]
  readonly rateLimitEnabled: boolean
  readonly rateLimitMax: number
  readonly rateLimitWindowMs: number
}

interface AppConfig {
  readonly environment: EnvironmentInfo
  readonly server: {
    readonly port: number
    readonly host: string
    readonly trustProxy: boolean
  }
  readonly database: DatabaseConfig
  readonly redis: RedisConfig
  readonly email: EmailConfig
  readonly logging: LoggingConfig
  readonly security: SecurityConfig
  readonly features: {
    readonly enableNewFeature: boolean
    readonly enableBetaFeatures: boolean
    readonly enableAnalytics: boolean
    readonly enableProfiling: boolean
  }
}

// ✅ Configuration builder with environment-specific defaults
class ConfigBuilder {
  private config: Partial<AppConfig> = {}

  static create(): ConfigBuilder {
    return new ConfigBuilder()
  }

  withEnvironment(env: EnvironmentInfo): this {
    this.config.environment = env
    return this
  }

  withDatabase(config: DatabaseConfig): this {
    this.config.database = config
    return this
  }

  withDefaults(): this {
    const env = this.config.environment || EnvironmentDetector.detect()

    // Server defaults
    this.config.server = {
      port: this.getEnvNumber('PORT', 3000),
      host: this.getEnvString('HOST', '0.0.0.0'),
      trustProxy: env.tier === 'cloud',
    }

    // Database defaults
    this.config.database = {
      url: this.requireEnvString('DATABASE_URL'),
      poolSize: this.getEnvNumber('DB_POOL_SIZE', env.isProduction ? 20 : 5),
      ssl: env.tier === 'cloud',
      queryTimeout: this.getEnvNumber('DB_QUERY_TIMEOUT', 30000),
      migrationPath: './migrations',
    }

    // Redis defaults
    this.config.redis = {
      url: this.getEnvString('REDIS_URL', 'redis://localhost:6379'),
      keyPrefix: `app:${env.name}:`,
      ttl: this.getEnvNumber('REDIS_TTL', 3600),
      maxRetries: 3,
    }

    // Email defaults
    this.config.email = this.buildEmailConfig(env)

    // Logging defaults
    this.config.logging = {
      level: this.getEnvString('LOG_LEVEL', env.isProduction ? 'info' : 'debug') as any,
      format: env.isProduction ? 'json' : 'pretty',
      destination: env.tier === 'cloud' ? 'cloud' : 'console',
      filePath: env.isDevelopment ? './logs/app.log' : undefined,
      cloudConfig:
        env.tier === 'cloud'
          ? {
              service: 'cloudwatch',
              apiKey: this.requireEnvString('CLOUDWATCH_API_KEY'),
            }
          : undefined,
    }

    // Security defaults
    this.config.security = {
      jwtSecret: this.requireEnvString('JWT_SECRET'),
      bcryptRounds: this.getEnvNumber('BCRYPT_ROUNDS', env.isProduction ? 12 : 8),
      sessionTimeout: this.getEnvNumber('SESSION_TIMEOUT', 24 * 60 * 60 * 1000), // 24h
      corsOrigins: this.getEnvStringArray(
        'CORS_ORIGINS',
        env.isDevelopment ? ['http://localhost:3000'] : [],
      ),
      rateLimitEnabled: env.isProduction,
      rateLimitMax: this.getEnvNumber('RATE_LIMIT_MAX', 100),
      rateLimitWindowMs: this.getEnvNumber('RATE_LIMIT_WINDOW', 15 * 60 * 1000), // 15min
    }

    // Feature flags
    this.config.features = {
      enableNewFeature: this.getEnvBoolean('ENABLE_NEW_FEATURE', !env.isProduction),
      enableBetaFeatures: this.getEnvBoolean('ENABLE_BETA_FEATURES', env.isDevelopment),
      enableAnalytics: this.getEnvBoolean('ENABLE_ANALYTICS', env.isProduction),
      enableProfiling: this.getEnvBoolean('ENABLE_PROFILING', env.isDevelopment),
    }

    return this
  }

  build(): AppConfig {
    if (!this.config.environment) {
      this.config.environment = EnvironmentDetector.detect()
    }

    return this.config as AppConfig
  }

  private buildEmailConfig(env: EnvironmentInfo): EmailConfig {
    const provider = this.getEnvString(
      'EMAIL_PROVIDER',
      env.isProduction ? 'sendgrid' : 'mock',
    ) as any

    const baseConfig = {
      provider,
      fromAddress: this.getEnvString('EMAIL_FROM', 'noreply@example.com'),
      replyToAddress: this.getEnvString('EMAIL_REPLY_TO', 'support@example.com'),
      templatePath: './templates/email',
    }

    switch (provider) {
      case 'sendgrid':
        return {
          ...baseConfig,
          sendgrid: {
            apiKey: this.requireEnvString('SENDGRID_API_KEY'),
          },
        }
      case 'ses':
        return {
          ...baseConfig,
          ses: {
            region: this.getEnvString('AWS_REGION', 'us-east-1'),
            accessKeyId: this.requireEnvString('AWS_ACCESS_KEY_ID'),
            secretAccessKey: this.requireEnvString('AWS_SECRET_ACCESS_KEY'),
          },
        }
      default:
        return baseConfig
    }
  }

  private getEnvString(key: string, defaultValue?: string): string {
    const value = process.env[key]
    if (value !== undefined) return value
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Environment variable ${key} is required but not set`)
  }

  private requireEnvString(key: string): string {
    const value = process.env[key]
    if (!value) {
      throw new Error(`Environment variable ${key} is required but not set`)
    }
    return value
  }

  private getEnvNumber(key: string, defaultValue?: number): number {
    const value = process.env[key]
    if (value !== undefined) {
      const parsed = parseInt(value, 10)
      if (isNaN(parsed)) {
        throw new Error(`Environment variable ${key} must be a valid number`)
      }
      return parsed
    }
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Environment variable ${key} is required but not set`)
  }

  private getEnvBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key]
    if (value !== undefined) {
      return value.toLowerCase() === 'true'
    }
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Environment variable ${key} is required but not set`)
  }

  private getEnvStringArray(key: string, defaultValue?: string[]): string[] {
    const value = process.env[key]
    if (value !== undefined) {
      return value
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
    }
    if (defaultValue !== undefined) return defaultValue
    throw new Error(`Environment variable ${key} is required but not set`)
  }
}

// ✅ Configuration loader with validation
class ConfigLoader {
  static load(): AppConfig {
    try {
      const config = ConfigBuilder.create().withDefaults().build()

      this.validateConfig(config)
      return config
    } catch (error) {
      console.error('Failed to load configuration:', error)
      process.exit(1)
    }
  }

  private static validateConfig(config: AppConfig): void {
    // Validate database URL format
    if (!config.database.url.startsWith('postgresql://')) {
      throw new Error('DATABASE_URL must be a PostgreSQL connection string')
    }

    // Validate JWT secret length
    if (config.security.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long')
    }

    // Validate email configuration
    if (config.email.provider === 'sendgrid' && !config.email.sendgrid?.apiKey) {
      throw new Error('SENDGRID_API_KEY is required when using SendGrid provider')
    }

    if (config.email.provider === 'ses' && !config.email.ses?.accessKeyId) {
      throw new Error('AWS credentials are required when using SES provider')
    }

    // Validate production-specific requirements
    if (config.environment.isProduction) {
      if (config.logging.level === 'debug') {
        console.warn('Warning: Debug logging is enabled in production')
      }

      if (!config.security.rateLimitEnabled) {
        console.warn('Warning: Rate limiting is disabled in production')
      }
    }
  }
}
```

## 🔧 Environment-Aware Services

### Service Factory with Environment Switching

```typescript
// ✅ Environment-aware service implementations
interface EmailProvider {
  sendEmail(request: EmailRequest): Promise<Result<void>>
}

class SendGridEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string) {}

  async sendEmail(request: EmailRequest): Promise<Result<void>> {
    try {
      // SendGrid implementation
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: request.to }] }],
          from: { email: request.from },
          subject: request.subject,
          content: [{ type: 'text/html', value: request.html }],
        }),
      })

      if (!response.ok) {
        return err(new Error(`SendGrid error: ${response.statusText}`))
      }

      return ok(undefined)
    } catch (error) {
      return err(error as Error)
    }
  }
}

class MockEmailProvider implements EmailProvider {
  private sentEmails: EmailRequest[] = []

  async sendEmail(request: EmailRequest): Promise<Result<void>> {
    console.log('Mock email sent:', {
      to: request.to,
      subject: request.subject,
      from: request.from,
    })

    this.sentEmails.push(request)
    return ok(undefined)
  }

  getSentEmails(): EmailRequest[] {
    return [...this.sentEmails]
  }

  reset(): void {
    this.sentEmails = []
  }
}

class LoggingEmailProvider implements EmailProvider {
  async sendEmail(request: EmailRequest): Promise<Result<void>> {
    console.log('Email would be sent:', {
      to: request.to,
      subject: request.subject,
      html: request.html.substring(0, 100) + '...',
    })
    return ok(undefined)
  }
}

// ✅ Environment-aware service factory
class ServiceFactory {
  constructor(private readonly config: AppConfig) {}

  createEmailProvider(): EmailProvider {
    const env = this.config.environment

    switch (this.config.email.provider) {
      case 'sendgrid':
        if (!this.config.email.sendgrid?.apiKey) {
          throw new Error('SendGrid API key not configured')
        }
        return new SendGridEmailProvider(this.config.email.sendgrid.apiKey)

      case 'ses':
        if (!this.config.email.ses) {
          throw new Error('SES configuration not provided')
        }
        return new SESEmailProvider(this.config.email.ses)

      case 'mock':
        return env.isTesting ? new MockEmailProvider() : new LoggingEmailProvider()

      default:
        throw new Error(`Unsupported email provider: ${this.config.email.provider}`)
    }
  }

  createDatabase(): Database {
    const env = this.config.environment

    if (env.isTesting) {
      return new InMemoryDatabase()
    }

    return new PostgreSQLDatabase(this.config.database)
  }

  createLogger(): Logger {
    const config = this.config.logging
    const env = this.config.environment

    switch (config.destination) {
      case 'console':
        return new ConsoleLogger({
          level: config.level,
          format: config.format,
          colors: env.isDevelopment,
        })

      case 'file':
        if (!config.filePath) {
          throw new Error('File path required for file logging')
        }
        return new FileLogger({
          level: config.level,
          format: config.format,
          filePath: config.filePath,
          maxSize: '10MB',
          maxFiles: 5,
        })

      case 'cloud':
        if (!config.cloudConfig) {
          throw new Error('Cloud configuration required for cloud logging')
        }
        return new CloudLogger({
          level: config.level,
          service: config.cloudConfig.service,
          apiKey: config.cloudConfig.apiKey,
          environment: env.name,
        })

      default:
        throw new Error(`Unsupported logging destination: ${config.destination}`)
    }
  }

  createCache(): Cache {
    const env = this.config.environment

    if (env.isTesting) {
      return new InMemoryCache()
    }

    return new RedisCache(this.config.redis)
  }

  createMetricsCollector(): MetricsCollector {
    const env = this.config.environment

    if (!env.metricsEnabled) {
      return new NoOpMetricsCollector()
    }

    return new PrometheusMetricsCollector({
      prefix: `app_${env.name}_`,
      port: 9090,
    })
  }
}
```

### Feature Flags and Environment-Specific Behavior

```typescript
// ✅ Feature flag management
class FeatureFlags {
  constructor(private readonly config: AppConfig) {}

  isEnabled(feature: keyof AppConfig['features']): boolean {
    return this.config.features[feature]
  }

  requiresFeature(feature: keyof AppConfig['features']): void {
    if (!this.isEnabled(feature)) {
      throw new Error(`Feature ${feature} is not enabled in this environment`)
    }
  }

  whenEnabled<T>(
    feature: keyof AppConfig['features'],
    enabledFn: () => T,
    disabledFn?: () => T,
  ): T | undefined {
    if (this.isEnabled(feature)) {
      return enabledFn()
    }
    return disabledFn ? disabledFn() : undefined
  }
}

// ✅ Environment-specific middleware
class EnvironmentMiddleware {
  static development() {
    return [
      morgan('dev'), // Request logging
      cors({ origin: true }), // Permissive CORS
      helmet({
        contentSecurityPolicy: false, // Disable CSP for development
        crossOriginEmbedderPolicy: false,
      }),
    ]
  }

  static production() {
    return [
      morgan('combined'), // Production logging
      cors({
        origin: process.env.CORS_ORIGINS?.split(',') || [],
        credentials: true,
      }),
      helmet(), // Full security headers
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: 'Too many requests from this IP',
      }),
    ]
  }

  static testing() {
    return [
      // Minimal middleware for testing
      express.json(),
      express.urlencoded({ extended: true }),
    ]
  }

  static forEnvironment(env: Environment) {
    switch (env) {
      case 'development':
        return this.development()
      case 'production':
        return this.production()
      case 'staging':
        return this.production() // Use production-like setup
      case 'testing':
        return this.testing()
      default:
        return this.development()
    }
  }
}

// ✅ Environment-specific error handling
class ErrorHandler {
  constructor(private readonly logger: Logger, private readonly env: EnvironmentInfo) {}

  handleError = (error: Error, req: Request, res: Response, next: NextFunction) => {
    this.logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    })

    if (this.env.isDevelopment) {
      // Detailed error response for development
      res.status(500).json({
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        path: req.path,
      })
    } else {
      // Generic error response for production
      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        id: crypto.randomUUID(), // For error tracking
      })
    }
  }
}
```

## 🧪 Environment-Specific Testing

### Test Environment Setup

```typescript
// ✅ Test environment configuration
class TestEnvironment {
  private static instance: TestEnvironment
  private config: AppConfig
  private services: ServiceFactory

  private constructor() {
    this.config = this.createTestConfig()
    this.services = new ServiceFactory(this.config)
  }

  static getInstance(): TestEnvironment {
    if (!this.instance) {
      this.instance = new TestEnvironment()
    }
    return this.instance
  }

  getConfig(): AppConfig {
    return this.config
  }

  getServices(): ServiceFactory {
    return this.services
  }

  async setup(): Promise<void> {
    // Setup test database
    await this.setupTestDatabase()

    // Clear caches
    await this.clearCaches()

    // Reset mock services
    this.resetMockServices()
  }

  async teardown(): Promise<void> {
    // Cleanup test data
    await this.cleanupTestDatabase()

    // Clear caches
    await this.clearCaches()
  }

  private createTestConfig(): AppConfig {
    return ConfigBuilder.create()
      .withEnvironment({
        name: 'testing',
        tier: 'local',
        isProduction: false,
        isDevelopment: false,
        isTesting: true,
        isLocal: true,
        debugEnabled: true,
        metricsEnabled: false,
      })
      .withDefaults()
      .build()
  }

  private async setupTestDatabase(): Promise<void> {
    const db = this.services.createDatabase()
    await db.migrate()
  }

  private async cleanupTestDatabase(): Promise<void> {
    const db = this.services.createDatabase()
    await db.truncateAll()
  }

  private async clearCaches(): Promise<void> {
    const cache = this.services.createCache()
    await cache.clear()
  }

  private resetMockServices(): void {
    const emailProvider = this.services.createEmailProvider()
    if (emailProvider instanceof MockEmailProvider) {
      emailProvider.reset()
    }
  }
}

// ✅ Environment-aware test utilities
class TestUtils {
  static withTestEnvironment<T>(testFn: (env: TestEnvironment) => Promise<T>): Promise<T> {
    return async () => {
      const testEnv = TestEnvironment.getInstance()

      await testEnv.setup()

      try {
        return await testFn(testEnv)
      } finally {
        await testEnv.teardown()
      }
    }
  }

  static createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    const baseConfig = TestEnvironment.getInstance().getConfig()
    return { ...baseConfig, ...overrides }
  }

  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
  ): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`)
  }
}

// ✅ Environment-specific test cases
describe('UserService', () => {
  it(
    'should send welcome email in production',
    TestUtils.withTestEnvironment(async env => {
      // Setup production-like config
      const config = TestUtils.createTestConfig({
        environment: {
          ...env.getConfig().environment,
          name: 'production',
          isProduction: true,
          isTesting: false,
        },
        email: {
          ...env.getConfig().email,
          provider: 'sendgrid',
        },
      })

      const services = new ServiceFactory(config)
      const userService = services.createUserService()

      const result = await userService.createUser({
        email: 'test@example.com' as Email,
        name: 'Test User',
      })

      expect(result.success).toBe(true)

      // Verify email was sent through real provider
      const emailProvider = services.createEmailProvider()
      expect(emailProvider).toBeInstanceOf(SendGridEmailProvider)
    }),
  )

  it(
    'should mock email in test environment',
    TestUtils.withTestEnvironment(async env => {
      const services = env.getServices()
      const userService = services.createUserService()

      const result = await userService.createUser({
        email: 'test@example.com' as Email,
        name: 'Test User',
      })

      expect(result.success).toBe(true)

      // Verify email was mocked
      const emailProvider = services.createEmailProvider()
      expect(emailProvider).toBeInstanceOf(MockEmailProvider)

      const sentEmails = (emailProvider as MockEmailProvider).getSentEmails()
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toBe('test@example.com')
    }),
  )
})
```

## 🚀 Deployment and Environment Setup

### Docker Environment Configuration

```dockerfile
# ✅ Multi-stage Docker build with environment support
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS testing
RUN npm ci
COPY . .
ENV NODE_ENV=testing
CMD ["npm", "test"]

FROM base AS production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["npm", "start"]
```

```yaml
# ✅ Docker Compose with environment-specific services
version: '3.8'

services:
  app-dev:
    build:
      context: .
      target: development
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://dev:dev@postgres-dev:5432/app_dev
      - REDIS_URL=redis://redis-dev:6379
      - LOG_LEVEL=debug
    ports:
      - '3000:3000'
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - postgres-dev
      - redis-dev

  app-prod:
    build:
      context: .
      target: production
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - SENDGRID_API_KEY=${SENDGRID_API_KEY}
    ports:
      - '80:3000'
    depends_on:
      - postgres-prod
      - redis-prod

  postgres-dev:
    image: postgres:15
    environment:
      - POSTGRES_USER=dev
      - POSTGRES_PASSWORD=dev
      - POSTGRES_DB=app_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  postgres-prod:
    image: postgres:15
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data

  redis-dev:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  redis-prod:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}

volumes:
  postgres_dev_data:
  postgres_prod_data:
```

### Environment Deployment Scripts

```bash
#!/bin/bash
# ✅ Environment-specific deployment script

set -e

ENVIRONMENT=${1:-development}
echo "Deploying to environment: $ENVIRONMENT"

case $ENVIRONMENT in
  "development")
    echo "Deploying to development environment..."
    docker-compose -f docker-compose.yml up -d app-dev
    ;;

  "staging")
    echo "Deploying to staging environment..."
    docker-compose -f docker-compose.staging.yml up -d
    ;;

  "production")
    echo "Deploying to production environment..."

    # Validate required environment variables
    required_vars=("DATABASE_URL" "JWT_SECRET" "SENDGRID_API_KEY")
    for var in "${required_vars[@]}"; do
      if [ -z "${!var}" ]; then
        echo "Error: $var is not set"
        exit 1
      fi
    done

    # Run database migrations
    npm run migrate:prod

    # Deploy with zero downtime
    docker-compose -f docker-compose.prod.yml up -d --no-deps app-prod
    ;;

  *)
    echo "Unknown environment: $ENVIRONMENT"
    echo "Usage: $0 [development|staging|production]"
    exit 1
    ;;
esac

echo "Deployment completed successfully!"
```

## 🔗 Related Concepts

- **[Development Environment](development-environment.md)** - Local development setup
- **[Configuration Management](.pair/knowledge/guidelines/code-design/organization-patterns/workspace-structure.md)** - Configuration patterns
- **[Security Guidelines](.pair/knowledge/guidelines/quality/security.md)** - Environment security
- **[Infrastructure as Code](.pair/knowledge/guidelines/operations/infrastructure.md)** - Infrastructure management

## 🎯 Implementation Guidelines

1. **Environment Detection**: Implement robust environment detection and validation
2. **Configuration Management**: Use type-safe configuration with validation
3. **Service Factories**: Create environment-aware service implementations
4. **Feature Flags**: Use feature flags for environment-specific behavior
5. **Testing Isolation**: Ensure tests run in isolated environments
6. **Security**: Never expose production secrets in non-production environments
7. **Documentation**: Document environment-specific requirements and setup

## 📏 Benefits

- **Consistency**: Standardized configuration across environments
- **Security**: Environment-appropriate security configurations
- **Testing**: Reliable test environments with proper isolation
- **Deployment**: Smooth deployments with environment-specific optimizations
- **Development**: Efficient local development with proper tooling
- **Monitoring**: Environment-aware logging and metrics collection

---

_Proper environment management ensures reliable, secure, and maintainable applications across all deployment stages._
