# Hexagonal Architecture (Ports and Adapters)

Architecture pattern that isolates the core business logic from external concerns through ports and adapters, enabling high testability and flexibility.

## When to Use

**Ideal for:**

- High testability requirements
- Multiple external integrations
- Complex external dependencies
- Need for technology independence
- Long-term maintainability focus

**Avoid when:**

- Simple CRUD applications
- Team unfamiliar with dependency inversion
- Rapid prototyping requirements
- Very small applications

## Core Concepts

### Ports (Interfaces)

```typescript
// Primary Ports (inbound - driving the application)
export interface OrderService {
  createOrder(command: CreateOrderCommand): Promise<Order>
  getOrder(orderId: string): Promise<Order>
  cancelOrder(orderId: string): Promise<void>
}

// Secondary Ports (outbound - driven by the application)
export interface OrderRepository {
  save(order: Order): Promise<void>
  findById(id: string): Promise<Order | null>
}

export interface PaymentGateway {
  processPayment(request: PaymentRequest): Promise<PaymentResult>
}

export interface NotificationService {
  sendOrderConfirmation(order: Order): Promise<void>
}
```

### Domain Core

```typescript
// Core business logic independent of external concerns
export class OrderService implements OrderServicePort {
  constructor(
    private orderRepository: OrderRepository,
    private paymentGateway: PaymentGateway,
    private notificationService: NotificationService,
    private inventoryService: InventoryService,
  ) {}

  async createOrder(command: CreateOrderCommand): Promise<Order> {
    // Business logic validation
    await this.validateOrderCreation(command)

    // Create domain object
    const order = Order.create({
      customerId: command.customerId,
      items: command.items,
      shippingAddress: command.shippingAddress,
    })

    // Orchestrate external operations
    await this.reserveInventory(order.items)
    await this.orderRepository.save(order)
    await this.notificationService.sendOrderConfirmation(order)

    return order
  }

  async processOrderPayment(orderId: string, paymentData: PaymentData): Promise<void> {
    const order = await this.orderRepository.findById(orderId)
    if (!order) {
      throw new OrderNotFoundError(orderId)
    }

    const paymentRequest = PaymentRequest.from(order, paymentData)
    const result = await this.paymentGateway.processPayment(paymentRequest)

    if (result.isSuccess()) {
      order.markAsPaid(result.transactionId)
      await this.orderRepository.save(order)
    } else {
      order.markPaymentFailed(result.errorMessage)
      await this.orderRepository.save(order)
      throw new PaymentProcessingError(result.errorMessage)
    }
  }
}
```

### Adapters (Implementations)

#### Primary Adapters (Web, CLI, etc.)

```typescript
// Web Adapter (HTTP REST API)
@Controller('/api/orders')
export class OrderRestAdapter {
  constructor(private orderService: OrderService) {}

  @Post('/')
  async createOrder(@Body() request: CreateOrderHttpRequest): Promise<OrderHttpResponse> {
    const command = this.mapToCommand(request)
    const order = await this.orderService.createOrder(command)
    return this.mapToResponse(order)
  }

  @Post('/:orderId/payment')
  async processPayment(
    @Param('orderId') orderId: string,
    @Body() paymentRequest: PaymentHttpRequest,
  ): Promise<void> {
    const paymentData = this.mapToPaymentData(paymentRequest)
    await this.orderService.processOrderPayment(orderId, paymentData)
  }

  private mapToCommand(request: CreateOrderHttpRequest): CreateOrderCommand {
    return new CreateOrderCommand({
      customerId: request.customerId,
      items: request.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
      shippingAddress: {
        street: request.shippingAddress.street,
        city: request.shippingAddress.city,
        zipCode: request.shippingAddress.zipCode,
      },
    })
  }
}

// GraphQL Adapter
@Resolver(() => Order)
export class OrderGraphQLAdapter {
  constructor(private orderService: OrderService) {}

  @Mutation(() => Order)
  async createOrder(@Args('input') input: CreateOrderInput): Promise<Order> {
    const command = new CreateOrderCommand(input)
    return await this.orderService.createOrder(command)
  }

  @Query(() => Order)
  async order(@Args('id') id: string): Promise<Order> {
    return await this.orderService.getOrder(id)
  }
}
```

#### Secondary Adapters (Database, External Services)

```typescript
// Database Adapter
export class PostgresOrderRepository implements OrderRepository {
  constructor(private database: Database) {}

  async save(order: Order): Promise<void> {
    const orderData = this.mapToDatabase(order)

    await this.database.query(
      `
      INSERT INTO orders (id, customer_id, total, status, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
    `,
      [orderData.id, orderData.customerId, orderData.total, orderData.status, orderData.createdAt],
    )

    // Save order items
    for (const item of orderData.items) {
      await this.saveOrderItem(orderData.id, item)
    }
  }

  async findById(id: string): Promise<Order | null> {
    const orderRow = await this.database.queryOne('SELECT * FROM orders WHERE id = $1', [id])

    if (!orderRow) return null

    const itemRows = await this.database.query('SELECT * FROM order_items WHERE order_id = $1', [
      id,
    ])

    return this.mapToDomain(orderRow, itemRows)
  }
}

// Payment Gateway Adapter
export class StripePaymentAdapter implements PaymentGateway {
  constructor(private stripeClient: Stripe) {}

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      const charge = await this.stripeClient.charges.create({
        amount: request.amount * 100, // Convert to cents
        currency: 'usd',
        customer: request.customerId,
        source: request.paymentMethodId,
        description: `Order ${request.orderId}`,
      })

      return PaymentResult.success(charge.id)
    } catch (error) {
      return PaymentResult.failure(this.mapStripeError(error))
    }
  }

  private mapStripeError(error: Stripe.StripeError): string {
    switch (error.type) {
      case 'card_error':
        return 'Payment declined by card issuer'
      case 'rate_limit_error':
        return 'Too many requests, please try again later'
      default:
        return 'Payment processing failed'
    }
  }
}

// Email Notification Adapter
export class EmailNotificationAdapter implements NotificationService {
  constructor(private emailClient: EmailClient) {}

  async sendOrderConfirmation(order: Order): Promise<void> {
    const template = await this.loadEmailTemplate('order-confirmation')

    const emailContent = template.render({
      orderNumber: order.id,
      customerEmail: order.customerEmail,
      items: order.items,
      total: order.total,
      shippingAddress: order.shippingAddress,
    })

    await this.emailClient.send({
      to: order.customerEmail,
      subject: `Order Confirmation - ${order.id}`,
      html: emailContent,
    })
  }
}
```

## Dependency Injection Container

```typescript
// IoC Container Setup
export class ApplicationContainer {
  private container = new Container()

  configure(): void {
    // Register adapters
    this.container
      .bind<OrderRepository>('OrderRepository')
      .to(PostgresOrderRepository)
      .inSingletonScope()

    this.container
      .bind<PaymentGateway>('PaymentGateway')
      .to(StripePaymentAdapter)
      .inSingletonScope()

    this.container
      .bind<NotificationService>('NotificationService')
      .to(EmailNotificationAdapter)
      .inSingletonScope()

    // Register core services
    this.container.bind<OrderService>('OrderService').to(OrderServiceImpl).inSingletonScope()

    // Register primary adapters
    this.container
      .bind<OrderRestAdapter>('OrderRestAdapter')
      .to(OrderRestAdapter)
      .inSingletonScope()
  }

  get<T>(identifier: string): T {
    return this.container.get<T>(identifier)
  }
}
```

## Testing Strategy

### Unit Testing Core Logic

```typescript
describe('OrderService', () => {
  let orderService: OrderService
  let mockOrderRepository: jest.Mocked<OrderRepository>
  let mockPaymentGateway: jest.Mocked<PaymentGateway>
  let mockNotificationService: jest.Mocked<NotificationService>

  beforeEach(() => {
    mockOrderRepository = {
      save: jest.fn(),
      findById: jest.fn(),
    }
    mockPaymentGateway = {
      processPayment: jest.fn(),
    }
    mockNotificationService = {
      sendOrderConfirmation: jest.fn(),
    }

    orderService = new OrderService(
      mockOrderRepository,
      mockPaymentGateway,
      mockNotificationService,
      mockInventoryService,
    )
  })

  it('should create order successfully', async () => {
    const command = new CreateOrderCommand({
      customerId: 'customer-1',
      items: [{ productId: 'product-1', quantity: 2, price: 10 }],
      shippingAddress: { street: '123 Main St', city: 'City', zipCode: '12345' },
    })

    mockInventoryService.reserveItems.mockResolvedValue(true)
    mockOrderRepository.save.mockResolvedValue(undefined)
    mockNotificationService.sendOrderConfirmation.mockResolvedValue(undefined)

    const order = await orderService.createOrder(command)

    expect(order).toBeDefined()
    expect(order.customerId).toBe('customer-1')
    expect(mockOrderRepository.save).toHaveBeenCalledWith(order)
    expect(mockNotificationService.sendOrderConfirmation).toHaveBeenCalledWith(order)
  })
})
```

### Integration Testing Adapters

```typescript
describe('PostgresOrderRepository', () => {
  let repository: PostgresOrderRepository
  let testDatabase: TestDatabase

  beforeEach(async () => {
    testDatabase = await createTestDatabase()
    repository = new PostgresOrderRepository(testDatabase)
  })

  afterEach(async () => {
    await testDatabase.cleanup()
  })

  it('should save and retrieve order correctly', async () => {
    const order = Order.create({
      customerId: 'customer-1',
      items: [OrderItem.create({ productId: 'product-1', quantity: 1, price: 10 })],
      shippingAddress: Address.create({ street: '123 Main St', city: 'City' }),
    })

    await repository.save(order)
    const retrievedOrder = await repository.findById(order.id)

    expect(retrievedOrder).toEqual(order)
  })
})
```

## Pros and Cons

### Advantages

- **High Testability**: Easy to mock external dependencies
- **Technology Independence**: Core logic independent of frameworks
- **Flexibility**: Easy to swap implementations
- **Clean Dependencies**: Clear inward-pointing dependencies

### Disadvantages

- **Initial Complexity**: More setup and configuration required
- **Learning Curve**: Requires understanding of dependency inversion
- **Over-Engineering**: Can be overkill for simple applications
- **Boilerplate Code**: More interfaces and mappings needed

## Related Patterns

- **[Clean Architecture](clean-architecture.md)** - Similar dependency inversion approach
- **[Domain-Driven Design](../design-patterns/README.md)** - Domain modeling approach
- **[CQRS](cqrs.md)** - Can be combined for read/write separation
