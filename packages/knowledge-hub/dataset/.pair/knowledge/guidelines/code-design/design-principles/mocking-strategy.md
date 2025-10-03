# Mocking Strategy

## Overview

Effective mocking strategies enable reliable, fast, and maintainable tests by isolating units of code from their dependencies. This guide covers when and how to use mocks, stubs, and test doubles to create robust test suites.

## Mocking Philosophy

### Test Isolation Principles

Mocking serves to isolate the system under test from external dependencies, enabling:

**Predictable Behavior**: Tests run consistently regardless of external system state
**Fast Execution**: Eliminate network calls, database queries, and file system operations
**Focused Testing**: Test one component's logic without dependencies
**Error Simulation**: Easily test error conditions and edge cases

### Strategic Mocking Approach

Not everything should be mocked. Apply mocking strategically:

**Mock External Services**: APIs, databases, file systems, third-party libraries
**Mock Complex Dependencies**: Heavy computational modules, stateful services
**Don't Mock Value Objects**: Simple data structures and pure functions
**Don't Mock What You Own**: Internal modules that are simple and reliable

## Mocking Patterns

### Service Layer Mocking

Mock at service boundaries to maintain realistic interfaces:

```typescript
interface UserService {
  getUserById(id: string): Promise<User>
  createUser(userData: CreateUserRequest): Promise<User>
  updateUser(id: string, updates: Partial<User>): Promise<User>
}

// Test implementation
const mockUserService: UserService = {
  getUserById: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
}

// Usage in tests
describe('UserController', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns user data for valid ID', async () => {
    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' }
    mockUserService.getUserById.mockResolvedValue(mockUser)

    const controller = new UserController(mockUserService)
    const result = await controller.getUser('1')

    expect(result).toEqual(mockUser)
    expect(mockUserService.getUserById).toHaveBeenCalledWith('1')
  })
})
```

**Benefits**: Clean interfaces, type safety, realistic method signatures
**Use Cases**: Testing controllers, business logic, service orchestration

### HTTP Client Mocking

Mock HTTP requests to test API interactions without network calls:

```typescript
// Using MSW (Mock Service Worker)
import { rest } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  rest.get('/api/users/:id', (req, res, ctx) => {
    const { id } = req.params

    if (id === 'not-found') {
      return res(ctx.status(404), ctx.json({ error: 'User not found' }))
    }

    return res(ctx.status(200), ctx.json({ id, name: 'Test User', email: 'test@example.com' }))
  }),
)

// Test setup
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

**Benefits**: Realistic HTTP behavior, network error simulation, interceptor patterns
**Use Cases**: API client testing, integration tests, error handling verification

### Database Mocking

Mock database operations for fast, predictable tests:

```typescript
// Repository pattern mocking
interface UserRepository {
  findById(id: string): Promise<User | null>
  save(user: User): Promise<User>
  delete(id: string): Promise<void>
}

class MockUserRepository implements UserRepository {
  private users = new Map<string, User>()

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }

  async save(user: User): Promise<User> {
    this.users.set(user.id, user)
    return user
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id)
  }

  // Test helper methods
  clear(): void {
    this.users.clear()
  }

  seedUser(user: User): void {
    this.users.set(user.id, user)
  }
}
```

**Benefits**: Fast execution, predictable state, easy data setup
**Use Cases**: Service layer testing, business logic validation, data flow verification

## Mock Data Management

### Factory Pattern for Test Data

Create consistent, maintainable test data:

```typescript
class UserFactory {
  static create(overrides: Partial<User> = {}): User {
    return {
      id: randomUUID(),
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      roles: ['user'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }
  }

  static createMany(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, () => this.create(overrides))
  }

  static admin(overrides: Partial<User> = {}): User {
    return this.create({ roles: ['admin'], ...overrides })
  }
}

// Usage in tests
const regularUser = UserFactory.create()
const adminUser = UserFactory.admin({ email: 'admin@example.com' })
const users = UserFactory.createMany(5)
```

**Benefits**: Consistent data, reduce duplication, easy customization
**Use Cases**: Complex object creation, bulk data generation, variant testing

### Builder Pattern for Complex Objects

Build complex test objects incrementally:

```typescript
class UserBuilder {
  private user: Partial<User> = {}

  withId(id: string): UserBuilder {
    this.user.id = id
    return this
  }

  withEmail(email: string): UserBuilder {
    this.user.email = email
    return this
  }

  withRole(role: UserRole): UserBuilder {
    this.user.roles = [...(this.user.roles || []), role]
    return this
  }

  active(): UserBuilder {
    this.user.isActive = true
    return this
  }

  build(): User {
    return {
      id: randomUUID(),
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      roles: ['user'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...this.user,
    }
  }
}

// Usage
const user = new UserBuilder().withEmail('admin@company.com').withRole('admin').active().build()
```

**Benefits**: Readable test setup, incremental building, expressive APIs
**Use Cases**: Complex domain objects, multi-step construction, scenario testing

## Testing Strategies

### Unit Test Mocking

Mock external dependencies while testing individual units:

```typescript
describe('OrderService', () => {
  let orderService: OrderService
  let mockPaymentGateway: jest.Mocked<PaymentGateway>
  let mockInventoryService: jest.Mocked<InventoryService>

  beforeEach(() => {
    mockPaymentGateway = {
      processPayment: jest.fn(),
      refundPayment: jest.fn(),
    }

    mockInventoryService = {
      reserveItems: jest.fn(),
      releaseItems: jest.fn(),
      checkAvailability: jest.fn(),
    }

    orderService = new OrderService(mockPaymentGateway, mockInventoryService)
  })

  it('processes order successfully', async () => {
    // Arrange
    const orderData = OrderFactory.create()
    mockInventoryService.checkAvailability.mockResolvedValue(true)
    mockInventoryService.reserveItems.mockResolvedValue(undefined)
    mockPaymentGateway.processPayment.mockResolvedValue({ success: true })

    // Act
    const result = await orderService.processOrder(orderData)

    // Assert
    expect(result.status).toBe('confirmed')
    expect(mockInventoryService.reserveItems).toHaveBeenCalledWith(orderData.items)
    expect(mockPaymentGateway.processPayment).toHaveBeenCalledWith(orderData.payment)
  })
})
```

### Integration Test Mocking

Use selective mocking in integration tests:

```typescript
describe('User Registration Flow', () => {
  // Real database for integration testing
  let database: Database
  // Mock external services
  let mockEmailService: jest.Mocked<EmailService>

  beforeAll(async () => {
    database = await setupTestDatabase()
  })

  beforeEach(async () => {
    await database.clear()

    mockEmailService = {
      sendWelcomeEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
    }
  })

  it('creates user and sends welcome email', async () => {
    const userController = new UserController(
      new UserService(new UserRepository(database)),
      mockEmailService,
    )

    await userController.registerUser({
      email: 'newuser@example.com',
      password: 'securePassword',
    })

    // Verify database state
    const user = await database.users.findByEmail('newuser@example.com')
    expect(user).toBeDefined()

    // Verify external service call
    expect(mockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(user)
  })
})
```

## Mock Verification Patterns

### Behavior Verification

Verify that mocks are called correctly:

```typescript
it('retries failed payments', async () => {
  // Setup mock to fail first call, succeed on second
  mockPaymentGateway.processPayment
    .mockRejectedValueOnce(new PaymentError('Temporary failure'))
    .mockResolvedValueOnce({ success: true })

  await orderService.processOrder(orderData)

  // Verify retry behavior
  expect(mockPaymentGateway.processPayment).toHaveBeenCalledTimes(2)
  expect(mockPaymentGateway.processPayment).toHaveBeenNthCalledWith(1, orderData.payment)
  expect(mockPaymentGateway.processPayment).toHaveBeenNthCalledWith(2, orderData.payment)
})
```

### State Verification

Verify the correct state changes occur:

```typescript
it('updates inventory after successful order', async () => {
  const inventory = new MockInventoryService()
  inventory.setStock('item-1', 10)

  const orderService = new OrderService(mockPaymentGateway, inventory)
  await orderService.processOrder({ items: [{ id: 'item-1', quantity: 2 }] })

  expect(inventory.getStock('item-1')).toBe(8)
})
```

## Best Practices Summary

### Mocking Strategy

- **Mock at Boundaries**: Mock external services and complex dependencies
- **Keep It Simple**: Don't over-mock; focus on the essential dependencies
- **Maintain Realism**: Mock behavior should reflect real system behavior

### Test Data Management

- **Use Factories**: Create consistent test data with factory patterns
- **Minimize Setup**: Keep test setup simple and focused
- **Isolate Changes**: Each test should start with a clean state

### Verification Patterns

- **Test Behavior**: Verify the right methods are called with correct parameters
- **Test State**: Verify that the system state changes as expected
- **Test Interactions**: Verify the sequence and timing of operations

### Maintainability

- **Clear Naming**: Use descriptive names for mocks and test data
- **Shared Utilities**: Create reusable mock objects and factory methods
- **Documentation**: Document complex mocking scenarios and their reasoning

Effective mocking enables reliable, fast tests while maintaining confidence that the system works correctly when integrated with real dependencies.
