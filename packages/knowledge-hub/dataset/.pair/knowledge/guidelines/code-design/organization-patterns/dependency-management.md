# 🔗 Dependency Management

**Focus**: Managing package dependencies, imports, and architectural boundaries

Guidelines for managing dependencies in TypeScript projects, including dependency injection, import organization, and architectural layer separation.

## 📦 Package Dependency Principles

### Dependency Categories

```json
// package.json - Clear dependency categorization
{
  "dependencies": {
    // Production runtime dependencies
    "fastify": "^4.0.0",
    "prisma": "^5.0.0",
    "zod": "^3.22.0",
    "react": "^18.0.0",
    "next": "^14.0.0"
  },
  "devDependencies": {
    // Development and build tools
    "typescript": "^5.0.0",
    "vitest": "^0.34.0",
    "@types/node": "^20.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  },
  "peerDependencies": {
    // Dependencies that consumers must provide
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "optionalDependencies": {
    // Optional enhancements
    "sharp": "^0.32.0"
  }
}
```

### Version Management Strategy

```typescript
// ✅ Semantic versioning principles
{
  "dependencies": {
    // Pin exact versions for critical dependencies
    "prisma": "5.4.2",

    // Use caret ranges for stable libraries
    "fastify": "^4.0.0",      // >=4.0.0 <5.0.0
    "zod": "^3.22.0",         // >=3.22.0 <4.0.0

    // Use tilde ranges for patch updates only
    "sharp": "~0.32.0",       // >=0.32.0 <0.33.0

    // Pin specific versions for tools
    "typescript": "5.2.2",
    "prettier": "3.0.3"
  }
}

// ✅ Package lock strategy
// Always commit package-lock.json or pnpm-lock.yaml
// Use 'npm ci' or 'pnpm install --frozen-lockfile' in CI

// ✅ Dependency update strategy
{
  "scripts": {
    "deps:check": "npm outdated",
    "deps:update:patch": "npm update",
    "deps:update:minor": "npx npm-check-updates -u -t minor",
    "deps:update:major": "npx npm-check-updates -u"
  }
}
```

## 🏗️ Architectural Dependency Rules

### Layer Dependency Direction

```typescript
// ✅ Clean Architecture dependency flow
// Higher layers depend on lower layers, never the reverse

// Domain Layer (Core) - No external dependencies
// domain/entities/user.entity.ts
export class User {
  constructor(
    private readonly id: string,
    private readonly email: string,
    private readonly name: string,
  ) {}

  // Pure business logic - no framework dependencies
  validateEmail(): boolean {
    return this.email.includes('@') && this.email.length > 5
  }
}

// Application Layer - Depends on Domain
// application/services/user.service.ts
import { User } from '../domain/entities/user.entity'
import { UserRepository } from '../domain/repositories/user.repository'

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async createUser(email: string, name: string): Promise<User> {
    const user = new User(crypto.randomUUID(), email, name)

    if (!user.validateEmail()) {
      throw new Error('Invalid email')
    }

    return this.userRepository.save(user)
  }
}

// Infrastructure Layer - Depends on Application & Domain
// infrastructure/repositories/user.repository.impl.ts
import { User } from '../../domain/entities/user.entity'
import { UserRepository } from '../../domain/repositories/user.repository'
import { PrismaClient } from '@prisma/client'

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: User): Promise<User> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })

    return user
  }
}

// Presentation Layer - Depends on Application
// presentation/controllers/user.controller.ts
import { UserService } from '../../application/services/user.service'
import { FastifyRequest, FastifyReply } from 'fastify'

export class UserController {
  constructor(private readonly userService: UserService) {}

  async createUser(request: FastifyRequest, reply: FastifyReply) {
    const { email, name } = request.body as { email: string; name: string }

    try {
      const user = await this.userService.createUser(email, name)
      reply.status(201).send(user)
    } catch (error) {
      reply.status(400).send({ error: error.message })
    }
  }
}
```

### Dependency Boundaries

```typescript
// ✅ Define clear module boundaries
// core/types/boundaries.ts
export type CoreDependencies = {
  // Core has no external dependencies
}

export type ApplicationDependencies = {
  // Application layer dependencies
  logger: Logger
  eventBus: EventBus
}

export type InfrastructureDependencies = {
  // Infrastructure dependencies
  database: Database
  httpClient: HttpClient
  emailService: EmailService
}

// ✅ Prevent circular dependencies
// utils/dependency-checker.ts
export function checkCircularDependencies() {
  // Use tools like 'madge' or 'dpdm' to detect circular dependencies
  // This can be part of your CI pipeline
}

// ❌ Avoid circular dependencies
// services/user.service.ts
import { OrderService } from './order.service' // ❌

// services/order.service.ts
import { UserService } from './user.service' // ❌ Creates circular dependency

// ✅ Extract shared logic to prevent circular dependencies
// services/shared/user-order.utils.ts
export const calculateUserOrderStats = (user: User, orders: Order[]) => {
  // Shared logic
}

// services/user.service.ts
import { calculateUserOrderStats } from './shared/user-order.utils'

// services/order.service.ts
import { calculateUserOrderStats } from './shared/user-order.utils'
```

## 🔧 Dependency Injection Patterns

### Constructor Injection

```typescript
// ✅ Constructor-based dependency injection
interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

interface UserRepository {
  save(user: User): Promise<User>
  findById(id: string): Promise<User | null>
}

interface EmailService {
  sendWelcomeEmail(user: User): Promise<void>
}

class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly logger: Logger,
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    this.logger.info('Creating user', { email: userData.email })

    try {
      const user = new User(userData)
      const savedUser = await this.userRepository.save(user)

      // Send welcome email asynchronously
      this.emailService.sendWelcomeEmail(savedUser).catch(error => {
        this.logger.error('Failed to send welcome email', { error, userId: savedUser.id })
      })

      this.logger.info('User created successfully', { userId: savedUser.id })
      return savedUser
    } catch (error) {
      this.logger.error('Failed to create user', { error, email: userData.email })
      throw error
    }
  }
}

// ✅ Factory pattern for dependency creation
class ServiceFactory {
  private logger: Logger
  private database: Database

  constructor(config: AppConfig) {
    this.logger = new WinstonLogger(config.logging)
    this.database = new PrismaDatabase(config.database)
  }

  createUserService(): UserService {
    const userRepository = new PrismaUserRepository(this.database)
    const emailService = new SendGridEmailService(this.logger)

    return new UserService(userRepository, emailService, this.logger)
  }

  createOrderService(): OrderService {
    const orderRepository = new PrismaOrderRepository(this.database)
    const paymentService = new StripePaymentService(this.logger)

    return new OrderService(orderRepository, paymentService, this.logger)
  }
}

// ✅ Usage
const serviceFactory = new ServiceFactory(appConfig)
const userService = serviceFactory.createUserService()
```

### IoC Container Pattern

```typescript
// ✅ Simple IoC container implementation
type Constructor<T = {}> = new (...args: any[]) => T
type ServiceFactory<T> = () => T

class DIContainer {
  private services = new Map<string, any>()
  private singletons = new Map<string, any>()

  // Register a service by constructor
  register<T>(name: string, constructor: Constructor<T>, dependencies: string[] = []): this {
    this.services.set(name, { type: 'constructor', constructor, dependencies })
    return this
  }

  // Register a service by factory function
  registerFactory<T>(name: string, factory: ServiceFactory<T>): this {
    this.services.set(name, { type: 'factory', factory })
    return this
  }

  // Register a singleton instance
  registerSingleton<T>(name: string, instance: T): this {
    this.singletons.set(name, instance)
    return this
  }

  // Resolve a service
  resolve<T>(name: string): T {
    // Check if already instantiated as singleton
    if (this.singletons.has(name)) {
      return this.singletons.get(name)
    }

    const service = this.services.get(name)
    if (!service) {
      throw new Error(`Service ${name} not registered`)
    }

    if (service.type === 'factory') {
      return service.factory()
    }

    if (service.type === 'constructor') {
      const dependencies = service.dependencies.map(dep => this.resolve(dep))
      const instance = new service.constructor(...dependencies)

      // Cache singleton if needed
      this.singletons.set(name, instance)
      return instance
    }

    throw new Error(`Unknown service type for ${name}`)
  }
}

// ✅ Container setup
const container = new DIContainer()

// Register core services
container.registerSingleton('config', appConfig)
container.registerSingleton('logger', new WinstonLogger(appConfig.logging))
container.registerSingleton('database', new PrismaClient(appConfig.database))

// Register repositories
container.register('userRepository', PrismaUserRepository, ['database'])
container.register('orderRepository', PrismaOrderRepository, ['database'])

// Register services
container.register('emailService', SendGridEmailService, ['logger'])
container.register('userService', UserService, ['userRepository', 'emailService', 'logger'])
container.register('orderService', OrderService, ['orderRepository', 'userService', 'logger'])

// Register controllers
container.register('userController', UserController, ['userService'])
container.register('orderController', OrderController, ['orderService'])

// ✅ Usage
const userController = container.resolve<UserController>('userController')
```

### React Dependency Injection

```typescript
// ✅ React context-based dependency injection
interface AppServices {
  userService: UserService
  orderService: OrderService
  logger: Logger
}

const ServiceContext = React.createContext<AppServices | null>(null)

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const services = useMemo(() => {
    const logger = new BrowserLogger()
    const apiClient = new ApiClient(apiConfig)

    const userService = new UserService(apiClient, logger)
    const orderService = new OrderService(apiClient, logger)

    return {
      userService,
      orderService,
      logger,
    }
  }, [])

  return <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>
}

export const useServices = (): AppServices => {
  const services = useContext(ServiceContext)
  if (!services) {
    throw new Error('useServices must be used within ServiceProvider')
  }
  return services
}

// ✅ Hook for specific service
export const useUserService = (): UserService => {
  const { userService } = useServices()
  return userService
}

// ✅ Usage in components
const UserProfile: React.FC<{ userId: string }> = ({ userId }) => {
  const userService = useUserService()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    userService.getUserById(userId).then(setUser).catch(console.error)
  }, [userId, userService])

  if (!user) return <LoadingSpinner />

  return <div>{user.name}</div>
}
```

## 📥 Import Organization

### Import Grouping and Ordering

```typescript
// ✅ Consistent import organization
// 1. Node.js built-in modules
import { readFileSync } from 'fs'
import { join } from 'path'

// 2. External library imports (alphabetically)
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

// 3. Internal imports from other domains/packages (alphabetically)
import { Logger } from '@/shared/logger'
import { ValidationError } from '@/shared/errors'

// 4. Local imports within the same domain (alphabetically)
import { User } from '../entities/user.entity'
import { UserRepository } from '../repositories/user.repository'
import { CreateUserSchema } from '../schemas/user.schema'

// 5. Type-only imports (grouped separately)
import type { AppConfig } from '@/config/app.config'
import type { CreateUserRequest, UserResponse } from '../types/user.types'

// ✅ Barrel exports for clean imports
// src/domains/user/index.ts
export { UserService } from './services/user.service'
export { UserController } from './controllers/user.controller'
export { UserRepository } from './repositories/user.repository'
export { User } from './entities/user.entity'
export type { CreateUserRequest, UpdateUserRequest, UserResponse } from './types/user.types'

// ✅ Usage with clean imports
import { UserService, UserController, User } from '@/domains/user'
import type { CreateUserRequest } from '@/domains/user'

// ❌ Avoid deep imports
import { UserService } from '@/domains/user/services/user.service'
import { UserController } from '@/domains/user/controllers/user.controller'
```

### Path Aliases and Resolution

```json
// tsconfig.json - Path mapping for clean imports
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@/domains/*": ["domains/*"],
      "@/shared/*": ["shared/*"],
      "@/config/*": ["config/*"],
      "@/utils/*": ["utils/*"],
      "@/types/*": ["types/*"]
    }
  }
}

// package.json - Module resolution for runtime
{
  "imports": {
    "#domains/*": "./src/domains/*",
    "#shared/*": "./src/shared/*",
    "#config/*": "./src/config/*"
  }
}
```

### Dynamic Imports and Code Splitting

```typescript
// ✅ Dynamic imports for code splitting
class FeatureLoader {
  private loadedFeatures = new Map<string, any>()

  async loadUserManagement() {
    if (!this.loadedFeatures.has('userManagement')) {
      const module = await import('@/domains/user')
      this.loadedFeatures.set('userManagement', module)
    }
    return this.loadedFeatures.get('userManagement')
  }

  async loadPaymentProcessing() {
    if (!this.loadedFeatures.has('paymentProcessing')) {
      const module = await import('@/domains/payment')
      this.loadedFeatures.set('paymentProcessing', module)
    }
    return this.loadedFeatures.get('paymentProcessing')
  }
}

// ✅ Conditional imports based on environment
class ServiceLocator {
  async getEmailService(): Promise<EmailService> {
    if (process.env.NODE_ENV === 'development') {
      const { MockEmailService } = await import('@/services/mock-email.service')
      return new MockEmailService()
    } else {
      const { SendGridEmailService } = await import('@/services/sendgrid-email.service')
      return new SendGridEmailService()
    }
  }

  async getPaymentService(): Promise<PaymentService> {
    if (process.env.PAYMENT_PROVIDER === 'stripe') {
      const { StripePaymentService } = await import('@/services/stripe-payment.service')
      return new StripePaymentService()
    } else {
      const { PayPalPaymentService } = await import('@/services/paypal-payment.service')
      return new PayPalPaymentService()
    }
  }
}

// ✅ React lazy loading with suspense
const UserManagement = React.lazy(() => import('@/features/user-management'))
const PaymentDashboard = React.lazy(() => import('@/features/payment-dashboard'))

const App: React.FC = () => {
  return (
    <Router>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path='/users/*' element={<UserManagement />} />
          <Route path='/payments/*' element={<PaymentDashboard />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
```

## 🔒 Dependency Security

### Dependency Auditing

```json
// package.json - Security scripts
{
  "scripts": {
    "audit": "npm audit",
    "audit:fix": "npm audit fix",
    "deps:check": "npx audit-ci --config audit-ci.json",
    "deps:license": "npx license-checker --summary"
  }
}

// audit-ci.json - Audit configuration
{
  "moderate": true,
  "allowlist": [
    "GHSA-xyz-example"
  ],
  "report-type": "summary",
  "skip-dev": true
}
```

### Secure Dependency Practices

```typescript
// ✅ Validate external dependencies
import { z } from 'zod'

// Define strict schemas for external API responses
const ExternalUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  created_at: z.string().datetime(),
})

class ExternalApiService {
  async fetchUser(id: string): Promise<User> {
    const response = await fetch(`/api/users/${id}`)
    const data = await response.json()

    // Validate external data before using
    const validatedData = ExternalUserSchema.parse(data)

    return {
      id: validatedData.id,
      email: validatedData.email,
      name: validatedData.name,
      createdAt: new Date(validatedData.created_at),
    }
  }
}

// ✅ Sanitize data from external sources
import DOMPurify from 'dompurify'

class ContentService {
  sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'b', 'i', 'u', 'strong', 'em'],
      ALLOWED_ATTR: [],
    })
  }

  validateAndSanitizeInput(input: unknown): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string')
    }

    return this.sanitizeHtml(input)
  }
}
```

## 🔗 Related Concepts

- **[File Structure](file-structure.md)** - Organizing dependencies within project structure
- **[Clean Architecture](README.md)** - Architectural dependency principles
- **[Monorepo Organization](monorepo-organization.md)** - Managing dependencies in monorepos
- **[Service Abstraction](.pair/knowledge/guidelines/code-design/implementation-standards/service-abstraction.md)** - Service layer dependencies

## 🎯 Implementation Guidelines

1. **Clear Boundaries**: Define explicit dependency boundaries between layers
2. **Dependency Direction**: Higher-level modules should depend on lower-level modules
3. **Interface Segregation**: Depend on abstractions, not concrete implementations
4. **Minimize Dependencies**: Keep dependencies minimal and well-justified
5. **Version Management**: Use semantic versioning and lock files consistently
6. **Security First**: Regularly audit and update dependencies
7. **Documentation**: Document dependency decisions and architectural constraints

## 📏 Benefits

- **Maintainability**: Clear dependency structure makes code easier to understand and modify
- **Testability**: Dependency injection enables easy mocking and testing
- **Flexibility**: Interface-based dependencies allow for easy substitution
- **Security**: Regular dependency auditing reduces security vulnerabilities
- **Performance**: Dynamic imports enable code splitting and lazy loading
- **Team Collaboration**: Clear dependency rules help teams work together effectively

---

_Well-managed dependencies create a solid foundation for scalable, maintainable, and secure applications._
