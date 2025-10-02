# 🏗️ Service Abstraction

**Focus**: Service layer design, dependency injection, and interface patterns

Guidelines for designing clean service layers with proper abstraction, dependency injection, and interface-based architecture patterns.

## 🎯 Service Layer Principles

### Service Interface Design

```typescript
// ✅ Clear service interfaces with single responsibility
interface UserService {
  findById(id: UserId): Promise<Result<User>>
  findByEmail(email: Email): Promise<Result<User>>
  createUser(data: CreateUserData): Promise<Result<User>>
  updateUser(id: UserId, updates: UpdateUserData): Promise<Result<User>>
  deactivateUser(id: UserId): Promise<Result<void>>
  validateUser(data: unknown): Result<CreateUserData>
}

interface EmailService {
  sendWelcomeEmail(recipient: Email, name: string): Promise<Result<void>>
  sendPasswordResetEmail(recipient: Email, resetToken: string): Promise<Result<void>>
  sendNotificationEmail(recipient: Email, notification: Notification): Promise<Result<void>>
  validateEmailTemplate(templateId: string): Result<boolean>
}

interface PaymentService {
  processPayment(payment: PaymentRequest): Promise<Result<PaymentResult>>
  refundPayment(paymentId: PaymentId): Promise<Result<RefundResult>>
  getPaymentStatus(paymentId: PaymentId): Promise<Result<PaymentStatus>>
  validatePaymentData(data: unknown): Result<PaymentRequest>
}

// ❌ Overly broad service interfaces
interface UserManagementService {
  // User CRUD
  createUser(data: any): Promise<any>
  updateUser(id: string, data: any): Promise<any>
  deleteUser(id: string): Promise<any>

  // Authentication
  login(email: string, password: string): Promise<any>
  logout(token: string): Promise<any>

  // Email operations
  sendEmail(to: string, subject: string, body: string): Promise<any>

  // Payment operations
  processPayment(data: any): Promise<any>

  // File operations
  uploadAvatar(userId: string, file: any): Promise<any>
}
```

### Service Implementation Patterns

```typescript
// ✅ Service implementation with dependency injection
class UserServiceImpl implements UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    private readonly logger: Logger,
    private readonly validator: DataValidator,
  ) {}

  async findById(id: UserId): Promise<Result<User>> {
    this.logger.debug('Finding user by ID', { userId: id })

    try {
      const user = await this.userRepository.findById(id)

      if (!user) {
        return err(new UserNotFoundError(id))
      }

      return ok(user)
    } catch (error) {
      this.logger.error('Failed to find user by ID', { userId: id, error })
      return err(error as Error)
    }
  }

  async createUser(data: CreateUserData): Promise<Result<User>> {
    this.logger.info('Creating new user', { email: data.email })

    // Validate input data
    const validationResult = this.validateUser(data)
    if (!validationResult.success) {
      return err(validationResult.error)
    }

    // Check if user already exists
    const existingUserResult = await this.findByEmail(data.email)
    if (existingUserResult.success) {
      return err(new UserAlreadyExistsError(data.email))
    }

    try {
      // Create user entity
      const user = this.createUserEntity(validationResult.data)

      // Save to repository
      const savedUser = await this.userRepository.save(user)

      // Send welcome email (async, don't block)
      this.sendWelcomeEmailAsync(savedUser)

      this.logger.info('User created successfully', { userId: savedUser.id })

      return ok(savedUser)
    } catch (error) {
      this.logger.error('Failed to create user', { email: data.email, error })
      return err(error as Error)
    }
  }

  validateUser(data: unknown): Result<CreateUserData> {
    return this.validator.validate(CreateUserSchema, data)
  }

  // Private helper methods
  private createUserEntity(data: CreateUserData): User {
    return {
      id: crypto.randomUUID() as UserId,
      email: data.email,
      name: data.name,
      role: data.role || 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  private async sendWelcomeEmailAsync(user: User): Promise<void> {
    try {
      const result = await this.emailService.sendWelcomeEmail(user.email, user.name)
      if (!result.success) {
        this.logger.warn('Failed to send welcome email', {
          userId: user.id,
          error: result.error,
        })
      }
    } catch (error) {
      this.logger.error('Unexpected error sending welcome email', {
        userId: user.id,
        error,
      })
    }
  }
}

// ✅ Service with business logic encapsulation
class OrderServiceImpl implements OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly userService: UserService,
    private readonly paymentService: PaymentService,
    private readonly inventoryService: InventoryService,
    private readonly logger: Logger,
  ) {}

  async createOrder(
    customerId: UserId,
    items: OrderItem[],
    shippingAddress: Address,
  ): Promise<Result<Order>> {
    this.logger.info('Creating order', { customerId, itemCount: items.length })

    // Validate customer exists
    const customerResult = await this.userService.findById(customerId)
    if (!customerResult.success) {
      return err(new Error('Customer not found'))
    }

    // Validate inventory availability
    const inventoryCheck = await this.validateInventory(items)
    if (!inventoryCheck.success) {
      return err(inventoryCheck.error)
    }

    // Calculate order totals
    const orderCalculation = this.calculateOrderTotals(items)

    try {
      // Create order entity
      const order = this.createOrderEntity(customerId, items, shippingAddress, orderCalculation)

      // Reserve inventory
      const reservationResult = await this.reserveInventory(items)
      if (!reservationResult.success) {
        return err(reservationResult.error)
      }

      // Save order
      const savedOrder = await this.orderRepository.save(order)

      this.logger.info('Order created successfully', { orderId: savedOrder.id })

      return ok(savedOrder)
    } catch (error) {
      this.logger.error('Failed to create order', { customerId, error })
      return err(error as Error)
    }
  }

  async processPayment(orderId: OrderId, paymentData: PaymentData): Promise<Result<Order>> {
    this.logger.info('Processing payment for order', { orderId })

    // Find order
    const orderResult = await this.orderRepository.findById(orderId)
    if (!orderResult.success) {
      return err(new Error('Order not found'))
    }

    const order = orderResult.data

    // Validate order can be paid
    if (order.status !== 'pending') {
      return err(new Error('Order cannot be paid in current status'))
    }

    // Process payment
    const paymentRequest: PaymentRequest = {
      amount: order.total,
      currency: 'USD',
      orderId: order.id,
      paymentMethod: paymentData.paymentMethod,
    }

    const paymentResult = await this.paymentService.processPayment(paymentRequest)
    if (!paymentResult.success) {
      return err(paymentResult.error)
    }

    // Update order status
    const updatedOrder = {
      ...order,
      status: 'paid' as const,
      paymentId: paymentResult.data.paymentId,
      paidAt: new Date(),
      updatedAt: new Date(),
    }

    const saveResult = await this.orderRepository.save(updatedOrder)
    if (!saveResult.success) {
      // TODO: Handle payment success but order save failure
      this.logger.error('Payment succeeded but order update failed', {
        orderId,
        paymentId: paymentResult.data.paymentId,
        error: saveResult.error,
      })
      return err(saveResult.error)
    }

    return ok(saveResult.data)
  }

  // Private business logic methods
  private async validateInventory(items: OrderItem[]): Promise<Result<void>> {
    for (const item of items) {
      const availabilityResult = await this.inventoryService.checkAvailability(
        item.productId,
        item.quantity,
      )

      if (!availabilityResult.success) {
        return err(availabilityResult.error)
      }

      if (!availabilityResult.data.available) {
        return err(new Error(`Insufficient inventory for product ${item.productId}`))
      }
    }

    return ok(undefined)
  }

  private calculateOrderTotals(items: OrderItem[]): OrderCalculation {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const tax = subtotal * 0.08 // 8% tax
    const shipping = subtotal > 100 ? 0 : 10 // Free shipping over $100
    const total = subtotal + tax + shipping

    return {
      subtotal,
      tax,
      shipping,
      total,
    }
  }

  private createOrderEntity(
    customerId: UserId,
    items: OrderItem[],
    shippingAddress: Address,
    calculation: OrderCalculation,
  ): Order {
    return {
      id: crypto.randomUUID() as OrderId,
      customerId,
      items,
      shippingAddress,
      subtotal: calculation.subtotal,
      tax: calculation.tax,
      shipping: calculation.shipping,
      total: calculation.total,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  private async reserveInventory(items: OrderItem[]): Promise<Result<void>> {
    // Implementation would reserve inventory items
    return ok(undefined)
  }
}
```

## 🔌 Dependency Injection Patterns

### Constructor Injection

```typescript
// ✅ Constructor-based dependency injection
class EmailServiceImpl implements EmailService {
  constructor(
    private readonly emailProvider: EmailProvider,
    private readonly templateEngine: TemplateEngine,
    private readonly logger: Logger,
    private readonly config: EmailConfig,
  ) {}

  async sendWelcomeEmail(recipient: Email, name: string): Promise<Result<void>> {
    try {
      const template = await this.templateEngine.render('welcome', { name })

      const emailRequest: EmailRequest = {
        to: recipient,
        subject: 'Welcome to our platform!',
        html: template,
        from: this.config.fromAddress,
      }

      const result = await this.emailProvider.send(emailRequest)

      if (result.success) {
        this.logger.info('Welcome email sent successfully', { recipient })
        return ok(undefined)
      } else {
        this.logger.error('Failed to send welcome email', { recipient, error: result.error })
        return err(result.error)
      }
    } catch (error) {
      this.logger.error('Unexpected error sending welcome email', { recipient, error })
      return err(error as Error)
    }
  }
}

// ✅ Service factory for dependency creation
class ServiceFactory {
  private logger: Logger
  private config: AppConfig

  constructor(config: AppConfig) {
    this.config = config
    this.logger = new WinstonLogger(config.logging)
  }

  createUserService(): UserService {
    const userRepository = this.createUserRepository()
    const emailService = this.createEmailService()
    const validator = this.createDataValidator()

    return new UserServiceImpl(userRepository, emailService, this.logger, validator)
  }

  createOrderService(): OrderService {
    const orderRepository = this.createOrderRepository()
    const userService = this.createUserService()
    const paymentService = this.createPaymentService()
    const inventoryService = this.createInventoryService()

    return new OrderServiceImpl(
      orderRepository,
      userService,
      paymentService,
      inventoryService,
      this.logger,
    )
  }

  private createUserRepository(): UserRepository {
    const database = new PrismaClient(this.config.database)
    return new PrismaUserRepository(database)
  }

  private createEmailService(): EmailService {
    const emailProvider = this.createEmailProvider()
    const templateEngine = new HandlebarsTemplateEngine()

    return new EmailServiceImpl(emailProvider, templateEngine, this.logger, this.config.email)
  }

  private createEmailProvider(): EmailProvider {
    switch (this.config.email.provider) {
      case 'sendgrid':
        return new SendGridProvider(this.config.email.sendgrid)
      case 'ses':
        return new SESProvider(this.config.email.ses)
      default:
        return new MockEmailProvider()
    }
  }

  private createPaymentService(): PaymentService {
    const paymentProvider = this.createPaymentProvider()
    return new PaymentServiceImpl(paymentProvider, this.logger)
  }

  private createPaymentProvider(): PaymentProvider {
    switch (this.config.payment.provider) {
      case 'stripe':
        return new StripeProvider(this.config.payment.stripe)
      case 'paypal':
        return new PayPalProvider(this.config.payment.paypal)
      default:
        return new MockPaymentProvider()
    }
  }
}
```

### Interface Segregation

```typescript
// ✅ Segregated interfaces for specific use cases
interface UserReader {
  findById(id: UserId): Promise<Result<User>>
  findByEmail(email: Email): Promise<Result<User>>
  findActiveUsers(): Promise<Result<User[]>>
}

interface UserWriter {
  createUser(data: CreateUserData): Promise<Result<User>>
  updateUser(id: UserId, updates: UpdateUserData): Promise<Result<User>>
  deactivateUser(id: UserId): Promise<Result<void>>
}

interface UserValidator {
  validateCreateData(data: unknown): Result<CreateUserData>
  validateUpdateData(data: unknown): Result<UpdateUserData>
  validateEmail(email: string): Result<Email>
}

// ✅ Services depend only on what they need
class UserQueryService implements UserReader {
  constructor(private readonly userRepository: UserRepository) {}

  async findById(id: UserId): Promise<Result<User>> {
    return this.userRepository.findById(id)
  }

  async findByEmail(email: Email): Promise<Result<User>> {
    return this.userRepository.findByEmail(email)
  }

  async findActiveUsers(): Promise<Result<User[]>> {
    return this.userRepository.findByStatus('active')
  }
}

class UserCommandService implements UserWriter {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly validator: UserValidator,
    private readonly emailService: EmailService,
    private readonly logger: Logger,
  ) {}

  async createUser(data: CreateUserData): Promise<Result<User>> {
    // Implementation using only UserValidator and UserRepository
  }

  async updateUser(id: UserId, updates: UpdateUserData): Promise<Result<User>> {
    // Implementation
  }

  async deactivateUser(id: UserId): Promise<Result<void>> {
    // Implementation
  }
}

// ✅ Read-only services for queries
class UserReportService {
  constructor(private readonly userReader: UserReader) {}

  async generateUserReport(): Promise<Result<UserReport>> {
    const usersResult = await this.userReader.findActiveUsers()
    if (!usersResult.success) {
      return err(usersResult.error)
    }

    const users = usersResult.data

    return ok({
      totalUsers: users.length,
      usersByRole: this.groupUsersByRole(users),
      averageAge: this.calculateAverageAge(users),
      generatedAt: new Date(),
    })
  }

  private groupUsersByRole(users: User[]): Record<string, number> {
    return users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  private calculateAverageAge(users: User[]): number {
    const usersWithAge = users.filter(user => user.age !== undefined)
    if (usersWithAge.length === 0) return 0

    const totalAge = usersWithAge.reduce((sum, user) => sum + user.age!, 0)
    return totalAge / usersWithAge.length
  }
}
```

## 🧩 Service Composition Patterns

### Service Orchestration

```typescript
// ✅ Service orchestrator for complex workflows
class UserOnboardingOrchestrator {
  constructor(
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly profileService: ProfileService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async onboardNewUser(registrationData: UserRegistrationData): Promise<Result<OnboardingResult>> {
    this.logger.info('Starting user onboarding', { email: registrationData.email })

    try {
      // Step 1: Create user account
      const userResult = await this.userService.createUser({
        email: registrationData.email,
        name: registrationData.name,
        role: 'user',
      })

      if (!userResult.success) {
        return err(userResult.error)
      }

      const user = userResult.data

      // Step 2: Create user profile
      const profileResult = await this.profileService.createProfile(user.id, {
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        preferences: registrationData.preferences,
      })

      // Step 3: Send welcome email (don't fail onboarding if this fails)
      const emailResult = await this.emailService.sendWelcomeEmail(user.email, user.name)
      if (!emailResult.success) {
        this.logger.warn('Welcome email failed during onboarding', {
          userId: user.id,
          error: emailResult.error,
        })
      }

      // Step 4: Create initial notifications
      await this.createInitialNotifications(user.id)

      // Step 5: Audit log
      await this.auditService.logUserRegistration(user.id, {
        source: registrationData.source,
        timestamp: new Date(),
      })

      this.logger.info('User onboarding completed', { userId: user.id })

      return ok({
        user,
        profile: profileResult.success ? profileResult.data : null,
        emailSent: emailResult.success,
        completedAt: new Date(),
      })
    } catch (error) {
      this.logger.error('User onboarding failed', {
        email: registrationData.email,
        error,
      })
      return err(error as Error)
    }
  }

  private async createInitialNotifications(userId: UserId): Promise<void> {
    const notifications = [
      {
        type: 'welcome' as const,
        title: 'Welcome to our platform!',
        message: 'Get started by completing your profile.',
      },
      {
        type: 'tip' as const,
        title: 'Pro tip',
        message: 'Enable two-factor authentication for better security.',
      },
    ]

    for (const notification of notifications) {
      await this.notificationService.createNotification(userId, notification)
    }
  }
}

// ✅ Service aggregator for data collection
class UserDashboardService {
  constructor(
    private readonly userService: UserService,
    private readonly orderService: OrderService,
    private readonly notificationService: NotificationService,
    private readonly activityService: ActivityService,
  ) {}

  async getUserDashboard(userId: UserId): Promise<Result<UserDashboard>> {
    // Execute multiple service calls in parallel
    const [userResult, ordersResult, notificationsResult, activityResult] =
      await Promise.allSettled([
        this.userService.findById(userId),
        this.orderService.findRecentOrdersByUser(userId, 5),
        this.notificationService.getUnreadNotifications(userId),
        this.activityService.getRecentActivity(userId, 10),
      ])

    // Handle user data (required)
    if (userResult.status === 'rejected' || !userResult.value.success) {
      return err(new Error('Failed to load user data'))
    }

    const user = userResult.value.data

    // Handle optional data (graceful degradation)
    const orders =
      ordersResult.status === 'fulfilled' && ordersResult.value.success
        ? ordersResult.value.data
        : []

    const notifications =
      notificationsResult.status === 'fulfilled' && notificationsResult.value.success
        ? notificationsResult.value.data
        : []

    const activities =
      activityResult.status === 'fulfilled' && activityResult.value.success
        ? activityResult.value.data
        : []

    return ok({
      user,
      recentOrders: orders,
      unreadNotifications: notifications,
      recentActivity: activities,
      loadedAt: new Date(),
      hasPartialData: [ordersResult, notificationsResult, activityResult].some(
        result => result.status === 'rejected',
      ),
    })
  }
}
```

### Service Decoration

```typescript
// ✅ Service decorators for cross-cutting concerns
class LoggingServiceDecorator<T> {
  constructor(
    private readonly service: T,
    private readonly logger: Logger,
    private readonly serviceName: string,
  ) {
    return new Proxy(this, {
      get(target, prop) {
        const value = (target.service as any)[prop]

        if (typeof value === 'function') {
          return async (...args: any[]) => {
            const methodName = String(prop)
            const startTime = Date.now()

            target.logger.debug(`[${target.serviceName}] ${methodName} called`, { args })

            try {
              const result = await value.apply(target.service, args)
              const duration = Date.now() - startTime

              target.logger.debug(`[${target.serviceName}] ${methodName} completed`, {
                duration,
                success: result?.success !== false,
              })

              return result
            } catch (error) {
              const duration = Date.now() - startTime

              target.logger.error(`[${target.serviceName}] ${methodName} failed`, {
                duration,
                error,
              })

              throw error
            }
          }
        }

        return value
      },
    })
  }
}

class CachingServiceDecorator<T> {
  private cache = new Map<string, { data: any; timestamp: number }>()

  constructor(
    private readonly service: T,
    private readonly cacheTtlMs: number = 300000, // 5 minutes
  ) {
    return new Proxy(this, {
      get(target, prop) {
        const value = (target.service as any)[prop]

        if (typeof value === 'function' && target.shouldCache(String(prop))) {
          return async (...args: any[]) => {
            const cacheKey = `${String(prop)}:${JSON.stringify(args)}`
            const cached = target.cache.get(cacheKey)

            if (cached && Date.now() - cached.timestamp < target.cacheTtlMs) {
              return cached.data
            }

            const result = await value.apply(target.service, args)

            if (result?.success !== false) {
              target.cache.set(cacheKey, { data: result, timestamp: Date.now() })
            }

            return result
          }
        }

        return value
      },
    })
  }

  private shouldCache(methodName: string): boolean {
    // Only cache read operations
    return (
      methodName.startsWith('find') ||
      methodName.startsWith('get') ||
      methodName.startsWith('search')
    )
  }
}

class RetryServiceDecorator<T> {
  constructor(
    private readonly service: T,
    private readonly maxAttempts: number = 3,
    private readonly delayMs: number = 1000,
  ) {
    return new Proxy(this, {
      get(target, prop) {
        const value = (target.service as any)[prop]

        if (typeof value === 'function') {
          return async (...args: any[]) => {
            let lastError: Error

            for (let attempt = 1; attempt <= target.maxAttempts; attempt++) {
              try {
                return await value.apply(target.service, args)
              } catch (error) {
                lastError = error as Error

                if (attempt === target.maxAttempts) {
                  break
                }

                // Exponential backoff
                const delay = target.delayMs * Math.pow(2, attempt - 1)
                await new Promise(resolve => setTimeout(resolve, delay))
              }
            }

            throw lastError!
          }
        }

        return value
      },
    })
  }
}

// ✅ Usage with multiple decorators
const createEnhancedUserService = (baseService: UserService, logger: Logger): UserService => {
  return new LoggingServiceDecorator(
    new CachingServiceDecorator(
      new RetryServiceDecorator(baseService, 3, 1000),
      300000, // 5 minutes cache
    ),
    logger,
    'UserService',
  ) as UserService
}
```

## 🧪 Service Testing Patterns

### Mock Services

```typescript
// ✅ Mock service implementations for testing
class MockUserService implements UserService {
  private users: User[] = []

  async findById(id: UserId): Promise<Result<User>> {
    const user = this.users.find(u => u.id === id)
    return user ? ok(user) : err(new UserNotFoundError(id))
  }

  async findByEmail(email: Email): Promise<Result<User>> {
    const user = this.users.find(u => u.email === email)
    return user ? ok(user) : err(new UserNotFoundError(email as unknown as UserId))
  }

  async createUser(data: CreateUserData): Promise<Result<User>> {
    const existingUser = this.users.find(u => u.email === data.email)
    if (existingUser) {
      return err(new UserAlreadyExistsError(data.email))
    }

    const user: User = {
      id: crypto.randomUUID() as UserId,
      email: data.email,
      name: data.name,
      role: data.role || 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    this.users.push(user)
    return ok(user)
  }

  async updateUser(id: UserId, updates: UpdateUserData): Promise<Result<User>> {
    const userIndex = this.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      return err(new UserNotFoundError(id))
    }

    const updatedUser = {
      ...this.users[userIndex],
      ...updates,
      updatedAt: new Date(),
    }

    this.users[userIndex] = updatedUser
    return ok(updatedUser)
  }

  async deactivateUser(id: UserId): Promise<Result<void>> {
    const userIndex = this.users.findIndex(u => u.id === id)
    if (userIndex === -1) {
      return err(new UserNotFoundError(id))
    }

    this.users[userIndex] = {
      ...this.users[userIndex],
      status: 'inactive',
      updatedAt: new Date(),
    }

    return ok(undefined)
  }

  validateUser(data: unknown): Result<CreateUserData> {
    // Mock validation logic
    if (!data || typeof data !== 'object') {
      return err(new Error('Invalid data'))
    }

    const { email, name } = data as any
    if (!email || !name) {
      return err(new Error('Email and name are required'))
    }

    return ok({ email, name, role: 'user' })
  }

  // Test helper methods
  setUsers(users: User[]): void {
    this.users = [...users]
  }

  getUsers(): User[] {
    return [...this.users]
  }

  reset(): void {
    this.users = []
  }
}

// ✅ Service test utilities
class ServiceTestHelper {
  static createMockLogger(): Logger {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
  }

  static createMockEmailService(): EmailService {
    return {
      sendWelcomeEmail: vi.fn().mockResolvedValue(ok(undefined)),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(ok(undefined)),
      sendNotificationEmail: vi.fn().mockResolvedValue(ok(undefined)),
      validateEmailTemplate: vi.fn().mockReturnValue(ok(true)),
    }
  }

  static createTestUser(overrides: Partial<User> = {}): User {
    return {
      id: crypto.randomUUID() as UserId,
      email: 'test@example.com' as Email,
      name: 'Test User',
      role: 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }
}

// ✅ Integration test setup
class ServiceIntegrationTestSetup {
  private serviceFactory: ServiceFactory

  constructor() {
    const testConfig = this.createTestConfig()
    this.serviceFactory = new ServiceFactory(testConfig)
  }

  createUserService(): UserService {
    return this.serviceFactory.createUserService()
  }

  createOrderService(): OrderService {
    return this.serviceFactory.createOrderService()
  }

  private createTestConfig(): AppConfig {
    return {
      database: {
        url: 'postgresql://test:test@localhost:5433/test_db',
      },
      email: {
        provider: 'mock',
        fromAddress: 'test@example.com',
      },
      payment: {
        provider: 'mock',
      },
      logging: {
        level: 'error', // Reduce noise in tests
      },
    }
  }
}
```

## 🔗 Related Concepts

- **[Dependency Management](.pair/knowledge/guidelines/code-design/organization-patterns/dependency-management.md)** - Managing service dependencies
- **[Function Design](function-design.md)** - Function-level design patterns
- **[Clean Architecture](.pair/knowledge/guidelines/code-design/organization-patterns/README.md)** - Architectural service organization
- **[SOLID Principles](.pair/knowledge/guidelines/code-design/design-principles/solid-principles.md)** - Service design principles

## 🎯 Implementation Guidelines

1. **Single Responsibility**: Each service should have a clear, focused purpose
2. **Interface-Based Design**: Define clear contracts through interfaces
3. **Dependency Injection**: Use constructor injection for clean dependencies
4. **Error Handling**: Return Result types instead of throwing exceptions
5. **Interface Segregation**: Create focused interfaces for specific use cases
6. **Composition Over Inheritance**: Build complex services through composition
7. **Testability**: Design services to be easily mocked and tested

## 📏 Benefits

- **Maintainability**: Clear service boundaries make code easier to understand and modify
- **Testability**: Interface-based design enables easy mocking and unit testing
- **Flexibility**: Dependency injection allows for easy substitution and configuration
- **Reusability**: Well-designed services can be reused across different contexts
- **Scalability**: Service composition patterns support complex business workflows
- **Team Collaboration**: Clear service contracts help teams work independently

---

_Well-designed service abstractions create maintainable, testable, and flexible application architectures._
