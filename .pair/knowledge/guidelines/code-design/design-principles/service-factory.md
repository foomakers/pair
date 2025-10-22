# Service Factory

## Overview

Service factories provide a centralized way to create, configure, and manage service instances with their dependencies. This pattern enables loose coupling, testability, and flexible configuration while maintaining clean separation of concerns.

## Factory Pattern Philosophy

### Dependency Resolution Strategy

Service factories solve the problem of complex object creation and dependency management:

**Centralized Configuration**: Single place to configure service dependencies
**Environment Adaptation**: Different configurations for development, testing, and production
**Lifecycle Management**: Control how and when services are created and destroyed
**Testing Support**: Easy substitution of dependencies for testing

### Abstraction Benefits

Factories abstract the complexity of service creation from consumers:

**Interface Consistency**: Consumers work with interfaces, not implementations
**Configuration Flexibility**: Change implementations without affecting consumers
**Lazy Initialization**: Create services only when needed
**Singleton Management**: Ensure single instances where appropriate

## Factory Implementation Patterns

### Simple Service Factory

Create basic factories for straightforward dependency injection:

```typescript
interface ServiceFactory {
  createUserService(): UserService
  createPaymentService(): PaymentService
  createNotificationService(): NotificationService
}

class ProductionServiceFactory implements ServiceFactory {
  private config: AppConfig

  constructor(config: AppConfig) {
    this.config = config
  }

  createUserService(): UserService {
    const repository = new DatabaseUserRepository(this.config.database)
    const validator = new UserValidator()
    return new UserService(repository, validator)
  }

  createPaymentService(): PaymentService {
    const gateway = new StripePaymentGateway(this.config.stripe)
    const logger = new PaymentLogger()
    return new PaymentService(gateway, logger)
  }

  createNotificationService(): NotificationService {
    const emailProvider = new SendGridEmailProvider(this.config.sendgrid)
    const smsProvider = new TwilioSMSProvider(this.config.twilio)
    return new NotificationService(emailProvider, smsProvider)
  }
}
```

**Benefits**: Clear separation of concerns, easy to understand, simple to test
**Use Cases**: Small to medium applications, straightforward dependency trees

### Container-Based Factory

Implement more sophisticated dependency injection containers:

```typescript
class ServiceContainer {
  private instances = new Map<string, any>()
  private factories = new Map<string, () => any>()

  // Register factory functions
  register<T>(key: string, factory: () => T): void {
    this.factories.set(key, factory)
  }

  // Register singleton instances
  registerSingleton<T>(key: string, factory: () => T): void {
    this.register(key, () => {
      if (!this.instances.has(key)) {
        this.instances.set(key, factory())
      }
      return this.instances.get(key)
    })
  }

  // Resolve dependencies
  resolve<T>(key: string): T {
    const factory = this.factories.get(key)
    if (!factory) {
      throw new Error(`Service '${key}' not registered`)
    }
    return factory()
  }

  // Clear all instances (useful for testing)
  clear(): void {
    this.instances.clear()
  }
}

// Configuration
function configureServices(container: ServiceContainer, config: AppConfig) {
  // Register repositories
  container.registerSingleton('userRepository', () => new DatabaseUserRepository(config.database))

  // Register services
  container.register(
    'userService',
    () => new UserService(container.resolve('userRepository'), new UserValidator()),
  )

  container.register(
    'orderService',
    () =>
      new OrderService(
        container.resolve('userService'),
        container.resolve('paymentService'),
        container.resolve('inventoryService'),
      ),
  )
}
```

**Benefits**: Automatic dependency resolution, lifecycle management, extensibility
**Use Cases**: Large applications, complex dependency graphs, modular architectures

### Environment-Specific Factories

Create different factory implementations for different environments:

```typescript
abstract class BaseServiceFactory {
  protected config: AppConfig

  constructor(config: AppConfig) {
    this.config = config
  }

  abstract createUserService(): UserService
  abstract createEmailService(): EmailService
  abstract createStorageService(): StorageService
}

class DevelopmentServiceFactory extends BaseServiceFactory {
  createUserService(): UserService {
    const repository = new InMemoryUserRepository()
    return new UserService(repository, new UserValidator())
  }

  createEmailService(): EmailService {
    return new ConsoleEmailService() // Logs emails to console
  }

  createStorageService(): StorageService {
    return new FileSystemStorageService('./dev-uploads')
  }
}

class ProductionServiceFactory extends BaseServiceFactory {
  createUserService(): UserService {
    const repository = new DatabaseUserRepository(this.config.database)
    return new UserService(repository, new UserValidator())
  }

  createEmailService(): EmailService {
    return new SendGridEmailService(this.config.sendgrid)
  }

  createStorageService(): StorageService {
    return new S3StorageService(this.config.aws)
  }
}

class TestServiceFactory extends BaseServiceFactory {
  createUserService(): UserService {
    const repository = new MockUserRepository()
    return new UserService(repository, new UserValidator())
  }

  createEmailService(): EmailService {
    return new MockEmailService()
  }

  createStorageService(): StorageService {
    return new MockStorageService()
  }
}
```

**Benefits**: Environment-specific behavior, easy testing, configuration isolation
**Use Cases**: Multi-environment deployments, testing strategies, development workflows

## Configuration Management

### Type-Safe Configuration

Define configuration interfaces for compile-time safety:

```typescript
interface DatabaseConfig {
  host: string
  port: number
  username: string
  password: string
  database: string
}

interface AppConfig {
  environment: 'development' | 'production' | 'test'
  database: DatabaseConfig
  api: {
    port: number
    cors: {
      origins: string[]
    }
  }
  services: {
    stripe: {
      secretKey: string
      publicKey: string
    }
    sendgrid: {
      apiKey: string
      fromEmail: string
    }
  }
}

function createFactory(config: AppConfig): ServiceFactory {
  switch (config.environment) {
    case 'development':
      return new DevelopmentServiceFactory(config)
    case 'production':
      return new ProductionServiceFactory(config)
    case 'test':
      return new TestServiceFactory(config)
    default:
      throw new Error(`Unknown environment: ${config.environment}`)
  }
}
```

### Configuration Validation

Validate configuration at startup to catch errors early:

```typescript
function validateConfig(config: any): asserts config is AppConfig {
  if (!config.environment) {
    throw new Error('Environment must be specified')
  }

  if (!config.database?.host) {
    throw new Error('Database host must be specified')
  }

  if (config.environment === 'production' && !config.services?.stripe?.secretKey) {
    throw new Error('Stripe secret key required in production')
  }

  // Additional validation logic...
}

function initializeApplication() {
  const rawConfig = loadConfigFromEnvironment()
  validateConfig(rawConfig)

  const factory = createFactory(rawConfig)
  const app = new Application(factory)

  return app
}
```

## Testing with Factories

### Test Factory Implementation

Create specialized factories for testing scenarios:

```typescript
class TestServiceFactory extends BaseServiceFactory {
  private mocks = new Map<string, any>()

  // Override specific services with mocks
  withMockUserService(mock: UserService): TestServiceFactory {
    this.mocks.set('userService', mock)
    return this
  }

  withMockPaymentService(mock: PaymentService): TestServiceFactory {
    this.mocks.set('paymentService', mock)
    return this
  }

  createUserService(): UserService {
    return this.mocks.get('userService') || super.createUserService()
  }

  createPaymentService(): PaymentService {
    return this.mocks.get('paymentService') || super.createPaymentService()
  }

  // Helper method to reset mocks
  clearMocks(): void {
    this.mocks.clear()
  }
}

// Usage in tests
describe('OrderController', () => {
  let factory: TestServiceFactory
  let controller: OrderController

  beforeEach(() => {
    factory = new TestServiceFactory(testConfig)
    controller = new OrderController(factory)
  })

  it('processes orders successfully', async () => {
    const mockPaymentService = createMockPaymentService()
    factory.withMockPaymentService(mockPaymentService)

    await controller.processOrder(orderData)

    expect(mockPaymentService.processPayment).toHaveBeenCalled()
  })
})
```

### Integration Testing

Use real factories in integration tests to verify service interactions:

```typescript
describe('User Registration Integration', () => {
  let factory: ServiceFactory
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
    const config = createTestConfig(database.connectionString)
    factory = new ProductionServiceFactory(config)
  })

  afterAll(async () => {
    await database.cleanup()
  })

  beforeEach(async () => {
    await database.clear()
  })

  it('creates user and sends welcome email', async () => {
    const userService = factory.createUserService()
    const emailService = factory.createEmailService()

    const user = await userService.createUser({
      email: 'test@example.com',
      password: 'securePassword',
    })

    // Verify the user was created
    expect(user.id).toBeDefined()
    expect(user.email).toBe('test@example.com')

    // In a real integration test, you might verify
    // that the email was actually sent
  })
})
```

## Advanced Factory Patterns

### Decorator Pattern Integration

Enhance services with cross-cutting concerns:

```typescript
function withLogging<T>(service: T, logger: Logger): T {
  return new Proxy(service, {
    get(target, prop) {
      const value = target[prop]
      if (typeof value === 'function') {
        return function (...args: any[]) {
          logger.info(`Calling ${String(prop)} with args:`, args)
          const result = value.apply(target, args)
          logger.info(`Result:`, result)
          return result
        }
      }
      return value
    },
  })
}

class LoggingServiceFactory extends BaseServiceFactory {
  private logger: Logger

  constructor(config: AppConfig, logger: Logger) {
    super(config)
    this.logger = logger
  }

  createUserService(): UserService {
    const service = super.createUserService()
    return withLogging(service, this.logger)
  }
}
```

### Plugin Architecture

Support extensible service creation through plugins:

```typescript
interface ServicePlugin {
  name: string
  configure(container: ServiceContainer): void
}

class UserServicePlugin implements ServicePlugin {
  name = 'user'

  configure(container: ServiceContainer): void {
    container.register(
      'userRepository',
      () => new DatabaseUserRepository(container.resolve('database')),
    )

    container.register(
      'userService',
      () => new UserService(container.resolve('userRepository'), container.resolve('validator')),
    )
  }
}

class PluginServiceFactory {
  private container = new ServiceContainer()
  private plugins: ServicePlugin[] = []

  use(plugin: ServicePlugin): this {
    this.plugins.push(plugin)
    return this
  }

  build(): ServiceContainer {
    this.plugins.forEach(plugin => plugin.configure(this.container))
    return this.container
  }
}

// Usage
const container = new PluginServiceFactory()
  .use(new UserServicePlugin())
  .use(new PaymentServicePlugin())
  .use(new NotificationServicePlugin())
  .build()
```

## Best Practices Summary

### Factory Design

- **Single Responsibility**: Each factory should focus on one domain or environment
- **Interface Segregation**: Provide focused factory interfaces for specific needs
- **Configuration Validation**: Validate configuration early and fail fast

### Dependency Management

- **Loose Coupling**: Depend on interfaces, not concrete implementations
- **Lifecycle Awareness**: Understand singleton vs. transient service lifecycles
- **Circular Dependencies**: Design to avoid circular dependency issues

### Testing Strategy

- **Test Factories**: Create specialized factories for different testing scenarios
- **Mock Integration**: Seamlessly integrate mocks into factory-created services
- **Environment Isolation**: Ensure test environments don't affect other environments

### Performance Considerations

- **Lazy Loading**: Create services only when needed
- **Singleton Management**: Use singletons appropriately to avoid unnecessary instances
- **Memory Management**: Clean up resources when services are no longer needed

Service factories enable clean architecture by centralizing dependency management while maintaining flexibility for different environments and testing scenarios.
