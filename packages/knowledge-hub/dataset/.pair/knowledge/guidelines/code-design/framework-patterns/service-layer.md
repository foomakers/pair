# Service Layer

## Overview

The service layer encapsulates business logic, coordinates operations across multiple domain objects, and provides a well-defined interface for application operations. This pattern creates a boundary between presentation and domain logic while managing transactions and orchestrating complex workflows.

## Service Layer Philosophy

### Business Logic Encapsulation

The service layer serves as the primary location for business rules and workflows:

**Domain Coordination**: Orchestrate operations across multiple domain entities
**Transaction Management**: Control transaction boundaries and ensure data consistency
**Business Rules**: Implement and enforce business constraints and policies
**External Integration**: Coordinate with external services and systems

### Abstraction Strategy

Services provide stable interfaces that abstract implementation complexity:

**Interface Stability**: Provide consistent APIs regardless of underlying implementation changes
**Dependency Management**: Isolate domain logic from infrastructure concerns
**Testability**: Enable easy testing through interface abstraction
**Composition**: Allow complex operations through service composition

## Service Design Patterns

### Domain Service Architecture

Design services around business capabilities rather than technical concerns:

```typescript
interface UserService {
  registerUser(userData: RegisterUserRequest): Promise<User>
  authenticateUser(credentials: LoginCredentials): Promise<AuthenticationResult>
  updateProfile(userId: string, updates: ProfileUpdates): Promise<User>
  deactivateUser(userId: string, reason: string): Promise<void>
  reactivateUser(userId: string): Promise<User>
}

class UserServiceImpl implements UserService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService,
    private auditLogger: AuditLogger,
    private passwordService: PasswordService,
  ) {}

  async registerUser(userData: RegisterUserRequest): Promise<User> {
    // Business logic: validate registration rules
    await this.validateRegistrationRules(userData)

    // Create user entity
    const hashedPassword = await this.passwordService.hash(userData.password)
    const user = User.create({
      ...userData,
      password: hashedPassword,
      status: 'pending-verification',
    })

    // Persist user
    const savedUser = await this.userRepository.save(user)

    // Coordinate side effects
    await this.emailService.sendVerificationEmail(savedUser)
    await this.auditLogger.log('user-registered', { userId: savedUser.id })

    return savedUser
  }

  private async validateRegistrationRules(userData: RegisterUserRequest): Promise<void> {
    // Business rule: email must be unique
    const existingUser = await this.userRepository.findByEmail(userData.email)
    if (existingUser) {
      throw new BusinessError('Email already registered')
    }

    // Business rule: password complexity
    if (!this.passwordService.meetsComplexityRequirements(userData.password)) {
      throw new BusinessError('Password does not meet security requirements')
    }
  }
}
```

**Benefits**: Clear business focus, coordinated operations, enforced business rules
**Use Cases**: Complex business workflows, multi-entity operations, transaction coordination

### Application Service Pattern

Create higher-level services that orchestrate multiple domain services:

```typescript
interface OrderProcessingService {
  processOrder(orderData: CreateOrderRequest): Promise<OrderResult>
  cancelOrder(orderId: string, reason: string): Promise<void>
  refundOrder(orderId: string, amount?: number): Promise<RefundResult>
}

class OrderProcessingServiceImpl implements OrderProcessingService {
  constructor(
    private orderService: OrderService,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
    private shippingService: ShippingService,
    private notificationService: NotificationService,
  ) {}

  async processOrder(orderData: CreateOrderRequest): Promise<OrderResult> {
    // Create order workflow
    const order = await this.orderService.createOrder(orderData)

    try {
      // Reserve inventory
      await this.inventoryService.reserveItems(order.items)

      // Process payment
      const paymentResult = await this.paymentService.processPayment({
        amount: order.total,
        paymentMethod: orderData.paymentMethod,
      })

      // Update order with payment info
      await this.orderService.confirmPayment(order.id, paymentResult.transactionId)

      // Schedule shipping
      const shippingInfo = await this.shippingService.scheduleShipment(order)

      // Send confirmation
      await this.notificationService.sendOrderConfirmation(order, shippingInfo)

      return {
        order,
        paymentResult,
        shippingInfo,
        status: 'confirmed',
      }
    } catch (error) {
      // Compensating actions on failure
      await this.handleOrderProcessingFailure(order, error)
      throw error
    }
  }

  private async handleOrderProcessingFailure(order: Order, error: Error): Promise<void> {
    // Release reserved inventory
    await this.inventoryService.releaseReservation(order.items)

    // Update order status
    await this.orderService.markAsFailed(order.id, error.message)

    // Log for investigation
    console.error(`Order processing failed for order ${order.id}:`, error)
  }
}
```

**Benefits**: Workflow orchestration, error handling, compensating transactions
**Use Cases**: Complex business processes, multi-service coordination, workflow management

## Transaction Management

### Transaction Boundary Strategy

Define clear transaction boundaries that align with business operations:

```typescript
interface TransactionManager {
  execute<T>(operation: (tx: Transaction) => Promise<T>): Promise<T>
  executeInExisting<T>(tx: Transaction, operation: (tx: Transaction) => Promise<T>): Promise<T>
}

class UserManagementService {
  constructor(
    private userRepository: UserRepository,
    private profileRepository: ProfileRepository,
    private auditRepository: AuditRepository,
    private transactionManager: TransactionManager,
  ) {}

  async createUserWithProfile(
    userData: CreateUserRequest,
    profileData: CreateProfileRequest,
  ): Promise<UserWithProfile> {
    // Single transaction for atomicity
    return this.transactionManager.execute(async tx => {
      // Create user
      const user = await this.userRepository.save(userData, tx)

      // Create profile
      const profile = await this.profileRepository.save(
        {
          ...profileData,
          userId: user.id,
        },
        tx,
      )

      // Log creation
      await this.auditRepository.save(
        {
          action: 'user-created',
          entityId: user.id,
          timestamp: new Date(),
        },
        tx,
      )

      return { user, profile }
    })
  }

  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
    // Simple operation, implicit transaction
    await this.userRepository.updatePreferences(userId, preferences)
  }
}
```

### Saga Pattern for Distributed Transactions

Handle transactions across service boundaries:

```typescript
interface SagaStep {
  execute(): Promise<void>
  compensate(): Promise<void>
}

class OrderFulfillmentSaga {
  private steps: SagaStep[] = []
  private completedSteps: SagaStep[] = []

  constructor(
    private orderService: OrderService,
    private paymentService: PaymentService,
    private inventoryService: InventoryService,
    private shippingService: ShippingService,
  ) {}

  async executeOrderFulfillment(orderData: CreateOrderRequest): Promise<void> {
    // Define saga steps
    this.steps = [
      new CreateOrderStep(this.orderService, orderData),
      new ReserveInventoryStep(this.inventoryService, orderData.items),
      new ProcessPaymentStep(this.paymentService, orderData.payment),
      new ScheduleShippingStep(this.shippingService, orderData),
    ]

    try {
      // Execute steps sequentially
      for (const step of this.steps) {
        await step.execute()
        this.completedSteps.push(step)
      }
    } catch (error) {
      // Compensate in reverse order
      await this.compensate()
      throw error
    }
  }

  private async compensate(): Promise<void> {
    const reversedSteps = [...this.completedSteps].reverse()

    for (const step of reversedSteps) {
      try {
        await step.compensate()
      } catch (compensationError) {
        console.error('Compensation failed:', compensationError)
      }
    }
  }
}

class CreateOrderStep implements SagaStep {
  private orderId?: string

  constructor(private orderService: OrderService, private orderData: CreateOrderRequest) {}

  async execute(): Promise<void> {
    const order = await this.orderService.createOrder(this.orderData)
    this.orderId = order.id
  }

  async compensate(): Promise<void> {
    if (this.orderId) {
      await this.orderService.cancelOrder(this.orderId)
    }
  }
}
```

## Service Testing Strategies

### Unit Testing Services

Test business logic in isolation with mocked dependencies:

```typescript
describe('UserService', () => {
  let userService: UserService
  let mockUserRepository: jest.Mocked<UserRepository>
  let mockEmailService: jest.Mocked<EmailService>
  let mockPasswordService: jest.Mocked<PasswordService>

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
    }

    mockEmailService = {
      sendVerificationEmail: jest.fn(),
    }

    mockPasswordService = {
      hash: jest.fn(),
      meetsComplexityRequirements: jest.fn(),
    }

    userService = new UserServiceImpl(
      mockUserRepository,
      mockEmailService,
      mockAuditLogger,
      mockPasswordService,
    )
  })

  describe('registerUser', () => {
    it('successfully registers a new user', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123',
        firstName: 'John',
        lastName: 'Doe',
      }

      mockUserRepository.findByEmail.mockResolvedValue(null)
      mockPasswordService.meetsComplexityRequirements.mockReturnValue(true)
      mockPasswordService.hash.mockResolvedValue('hashedPassword')
      mockUserRepository.save.mockResolvedValue(createMockUser())

      // Act
      const result = await userService.registerUser(userData)

      // Assert
      expect(result).toBeDefined()
      expect(mockUserRepository.save).toHaveBeenCalled()
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled()
    })

    it('throws error when email already exists', async () => {
      // Arrange
      const userData = { email: 'existing@example.com', password: 'password' }
      mockUserRepository.findByEmail.mockResolvedValue(createMockUser())

      // Act & Assert
      await expect(userService.registerUser(userData)).rejects.toThrow('Email already registered')
    })
  })
})
```

### Integration Testing

Test service interactions with real dependencies:

```typescript
describe('OrderProcessingService Integration', () => {
  let orderProcessingService: OrderProcessingService
  let testDatabase: TestDatabase

  beforeAll(async () => {
    testDatabase = await setupTestDatabase()

    // Use real services with test database
    const orderService = new OrderService(new DatabaseOrderRepository(testDatabase))
    const inventoryService = new InventoryService(new DatabaseInventoryRepository(testDatabase))

    // Mock external services
    const mockPaymentService = createMockPaymentService()
    const mockShippingService = createMockShippingService()
    const mockNotificationService = createMockNotificationService()

    orderProcessingService = new OrderProcessingServiceImpl(
      orderService,
      inventoryService,
      mockPaymentService,
      mockShippingService,
      mockNotificationService,
    )
  })

  afterAll(async () => {
    await testDatabase.cleanup()
  })

  beforeEach(async () => {
    await testDatabase.clearAll()
  })

  it('processes order end-to-end', async () => {
    // Arrange
    await testDatabase.seedInventory([{ itemId: 'item-1', quantity: 10 }])

    const orderData = {
      items: [{ itemId: 'item-1', quantity: 2 }],
      paymentMethod: 'credit-card',
      shippingAddress: createTestAddress(),
    }

    // Act
    const result = await orderProcessingService.processOrder(orderData)

    // Assert
    expect(result.status).toBe('confirmed')

    // Verify database state
    const inventory = await testDatabase.getInventory('item-1')
    expect(inventory.available).toBe(8) // 10 - 2 reserved
  })
})
```

## Service Performance Patterns

### Caching Service Layer

Implement caching strategies at the service level:

```typescript
interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  invalidate(pattern: string): Promise<void>
}

class CachedUserService implements UserService {
  constructor(private baseUserService: UserService, private cacheService: CacheService) {}

  async getUserById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`

    // Try cache first
    const cachedUser = await this.cacheService.get<User>(cacheKey)
    if (cachedUser) {
      return cachedUser
    }

    // Fetch from base service
    const user = await this.baseUserService.getUserById(id)
    if (user) {
      // Cache for 5 minutes
      await this.cacheService.set(cacheKey, user, 300)
    }

    return user
  }

  async updateProfile(userId: string, updates: ProfileUpdates): Promise<User> {
    const user = await this.baseUserService.updateProfile(userId, updates)

    // Invalidate related cache entries
    await this.cacheService.invalidate(`user:${userId}*`)

    return user
  }
}
```

### Async Processing

Handle heavy operations asynchronously:

```typescript
interface JobQueue {
  enqueue<T>(jobType: string, payload: T, options?: JobOptions): Promise<JobId>
  process<T>(jobType: string, handler: JobHandler<T>): void
}

class EmailNotificationService {
  constructor(private emailProvider: EmailProvider, private jobQueue: JobQueue) {
    // Register async job handlers
    this.jobQueue.process('send-welcome-email', this.handleWelcomeEmail.bind(this))
    this.jobQueue.process('send-bulk-newsletter', this.handleBulkNewsletter.bind(this))
  }

  async scheduleWelcomeEmail(userId: string): Promise<JobId> {
    return this.jobQueue.enqueue('send-welcome-email', { userId })
  }

  async scheduleBulkNewsletter(recipientIds: string[], content: NewsletterContent): Promise<JobId> {
    return this.jobQueue.enqueue(
      'send-bulk-newsletter',
      { recipientIds, content },
      { priority: 'low', retries: 3 },
    )
  }

  private async handleWelcomeEmail(payload: { userId: string }): Promise<void> {
    const user = await this.userService.getUserById(payload.userId)
    if (user) {
      await this.emailProvider.sendWelcomeEmail(user)
    }
  }

  private async handleBulkNewsletter(payload: {
    recipientIds: string[]
    content: NewsletterContent
  }): Promise<void> {
    const { recipientIds, content } = payload

    // Process in batches to avoid overwhelming the email service
    const batchSize = 50
    for (let i = 0; i < recipientIds.length; i += batchSize) {
      const batch = recipientIds.slice(i, i + batchSize)
      await this.processBatch(batch, content)

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}
```

## Best Practices Summary

### Service Design

- **Single Responsibility**: Each service should focus on one business capability
- **Interface Design**: Create stable, well-defined interfaces for service contracts
- **Dependency Management**: Inject dependencies rather than creating them internally

### Transaction Management

- **Boundary Definition**: Align transaction boundaries with business operations
- **Compensation Logic**: Implement compensating actions for distributed transactions
- **Error Handling**: Handle failures gracefully with proper rollback mechanisms

### Testing Strategy

- **Unit Testing**: Test business logic in isolation with mocked dependencies
- **Integration Testing**: Verify service interactions with real dependencies
- **Contract Testing**: Ensure service interfaces remain consistent

### Performance Optimization

- **Strategic Caching**: Cache at the service level for frequently accessed data
- **Async Processing**: Use background jobs for non-critical operations
- **Resource Management**: Manage database connections and external service calls efficiently

The service layer provides a clean separation between presentation and domain logic while orchestrating complex business operations and managing system consistency.
