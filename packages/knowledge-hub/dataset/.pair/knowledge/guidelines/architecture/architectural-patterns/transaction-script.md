# Transaction Script Pattern

Simple procedural architecture pattern where each business transaction is handled by a single script or procedure containing all the logic for that transaction.

## When to Use

**Ideal for:**

- Simple business logic
- Few business rules
- Linear, procedural workflows
- Small to medium applications
- Domain logic that's mostly data processing
- Applications with minimal shared behavior

**Avoid when:**

- Complex business rules
- Significant object interactions
- Domain logic needs to be reused across contexts
- Business logic changes frequently
- Need for rich domain models

## Pattern Structure

```
Transaction Scripts
├── UserRegistrationScript
├── OrderProcessingScript
├── PaymentProcessingScript
└── ReportGenerationScript
```

## Core Components

### 1. Transaction Script

- **Purpose**: Contains all logic for a specific business transaction
- **Responsibilities**: Data validation, business rules, data access
- **Implementation**: Single method or class per transaction

### 2. Data Access Layer

- **Purpose**: Handles database operations
- **Pattern**: Gateway or Repository
- **Isolation**: Keeps transaction scripts focused on business logic

### 3. Data Transfer Objects

- **Purpose**: Carry data between layers
- **Structure**: Simple data containers
- **Usage**: Input/output for transaction scripts

## Implementation Example

### TypeScript Implementation

```typescript
// User Registration Transaction Script
export class UserRegistrationScript {
  constructor(
    private userGateway: UserGateway,
    private emailService: EmailService,
    private validator: UserValidator,
  ) {}

  async registerUser(userData: RegisterUserRequest): Promise<RegisterUserResponse> {
    // 1. Validate input
    const validationResult = this.validator.validate(userData)
    if (!validationResult.isValid) {
      throw new ValidationError(validationResult.errors)
    }

    // 2. Check business rules
    const existingUser = await this.userGateway.findByEmail(userData.email)
    if (existingUser) {
      throw new BusinessError('User already exists')
    }

    // 3. Create user
    const hashedPassword = await this.hashPassword(userData.password)
    const newUser = await this.userGateway.create({
      ...userData,
      password: hashedPassword,
      createdAt: new Date(),
      isVerified: false,
    })

    // 4. Send verification email
    await this.emailService.sendVerificationEmail(newUser.email, newUser.verificationToken)

    // 5. Return result
    return {
      userId: newUser.id,
      email: newUser.email,
      status: 'pending_verification',
    }
  }

  private async hashPassword(password: string): Promise<string> {
    // Password hashing logic
    return bcrypt.hash(password, 10)
  }
}
```

### Order Processing Example

```typescript
export class OrderProcessingScript {
  constructor(
    private orderGateway: OrderGateway,
    private inventoryGateway: InventoryGateway,
    private paymentGateway: PaymentGateway,
    private notificationService: NotificationService,
  ) {}

  async processOrder(orderData: ProcessOrderRequest): Promise<ProcessOrderResponse> {
    // Start transaction
    const transaction = await this.orderGateway.beginTransaction()

    try {
      // 1. Validate order
      this.validateOrder(orderData)

      // 2. Check inventory
      const inventoryCheck = await this.inventoryGateway.checkAvailability(orderData.items)
      if (!inventoryCheck.available) {
        throw new BusinessError('Insufficient inventory')
      }

      // 3. Calculate total
      const total = this.calculateOrderTotal(orderData.items)

      // 4. Process payment
      const payment = await this.paymentGateway.processPayment({
        amount: total,
        paymentMethod: orderData.paymentMethod,
      })

      // 5. Reserve inventory
      await this.inventoryGateway.reserveItems(orderData.items)

      // 6. Create order
      const order = await this.orderGateway.create({
        ...orderData,
        total,
        paymentId: payment.id,
        status: 'confirmed',
        createdAt: new Date(),
      })

      // 7. Send confirmation
      await this.notificationService.sendOrderConfirmation(order)

      await transaction.commit()

      return {
        orderId: order.id,
        total,
        status: 'confirmed',
        estimatedDelivery: this.calculateDeliveryDate(),
      }
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
```

## Pattern Benefits

### ✅ Advantages

- **Simplicity**: Easy to understand and implement
- **Fast Development**: Quick to build and modify
- **Direct**: No abstraction overhead
- **Testable**: Each script can be tested independently
- **Clear Boundaries**: One script per business transaction

### ⚠️ Disadvantages

- **Code Duplication**: Similar logic repeated across scripts
- **Procedural**: Not object-oriented approach
- **Scalability Limits**: Becomes unwieldy with complex domains
- **Maintenance**: Hard to maintain with growing complexity

## Decision Matrix

| Factor                    | Transaction Script | Domain Model | Service Layer |
| ------------------------- | ------------------ | ------------ | ------------- |
| Complexity                | Simple             | Complex      | Medium        |
| Development Speed         | Fast               | Slow         | Medium        |
| Code Reusability          | Low                | High         | Medium        |
| Business Logic Complexity | Low                | High         | Medium        |
| Team Size                 | Small              | Large        | Medium        |
| Maintenance               | Easy               | Complex      | Medium        |

## When to Evolve

### Migration to Domain Model

**Trigger signals:**

- Business logic becomes complex
- Significant code duplication appears
- Need for rich object interactions
- Domain concepts become important

**Migration approach:**

1. Identify common behavior across scripts
2. Extract domain objects
3. Move behavior into domain objects
4. Refactor scripts to use domain objects

### Migration to Service Layer

**Trigger signals:**

- Multiple presentation layers needed
- Need for transaction boundaries
- Business logic needs orchestration
- Complex workflow requirements

## Testing Strategy

### Unit Testing

```typescript
describe('UserRegistrationScript', () => {
  let script: UserRegistrationScript
  let mockUserGateway: jest.Mocked<UserGateway>
  let mockEmailService: jest.Mocked<EmailService>

  beforeEach(() => {
    mockUserGateway = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    }
    mockEmailService = {
      sendVerificationEmail: jest.fn(),
    }

    script = new UserRegistrationScript(mockUserGateway, mockEmailService, new UserValidator())
  })

  it('should register new user successfully', async () => {
    mockUserGateway.findByEmail.mockResolvedValue(null)
    mockUserGateway.create.mockResolvedValue({
      id: '123',
      email: 'test@example.com',
      verificationToken: 'token123',
    })

    const result = await script.registerUser({
      email: 'test@example.com',
      password: 'password123',
    })

    expect(result.userId).toBe('123')
    expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled()
  })
})
```

## Related Patterns

- **Table Module**: Alternative procedural approach
- **Domain Model**: Evolution path for complex logic
- **Service Layer**: Coordination layer option
- **Gateway Pattern**: Data access companion

## References

- Martin Fowler: Patterns of Enterprise Application Architecture
- Eric Evans: Domain-Driven Design
- Robert Martin: Clean Architecture
