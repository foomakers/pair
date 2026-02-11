# Layered Architecture Pattern

Traditional enterprise architecture pattern organizing code into horizontal layers with clear separation of concerns.

## When to Use

**Ideal for:**

- Traditional enterprise applications
- Clear layer responsibilities needed
- Team familiar with layered patterns
- Moderate complexity domains
- Well-understood business domains

**Avoid when:**

- High testability requirements
- Complex external integrations
- Domain logic spread across layers
- Performance is critical

## Implementation Structure

```typescript
src/
├── presentation/   # Controllers, DTOs, Mappers, UI components
├── application/    # Use cases, Application services, Workflows
├── domain/        # Entities, Value objects, Domain services
├── infrastructure/ # Repositories, External services, Persistence
└── shared/        # Cross-cutting concerns, Utilities
```

## Layer Responsibilities

### Presentation Layer

```typescript
// Controllers handle HTTP concerns
@Controller('/api/orders')
export class OrderController {
  constructor(private orderApplicationService: OrderApplicationService) {}

  @Post('/')
  async createOrder(@Body() orderData: CreateOrderDto): Promise<OrderResponseDto> {
    const command = new CreateOrderCommand(orderData)
    const order = await this.orderApplicationService.createOrder(command)
    return OrderResponseDto.fromDomain(order)
  }
}

// DTOs for data transfer
export class CreateOrderDto {
  customerId: string
  items: OrderItemDto[]
  shippingAddress: AddressDto
}

export class OrderResponseDto {
  id: string
  customerId: string
  total: number
  status: string
  createdAt: Date

  static fromDomain(order: Order): OrderResponseDto {
    return {
      id: order.id.value,
      customerId: order.customerId.value,
      total: order.total.amount,
      status: order.status,
      createdAt: order.createdAt,
    }
  }
}
```

### Application Layer

```typescript
// Application Services orchestrate use cases
export class OrderApplicationService {
  constructor(
    private orderRepository: OrderRepository,
    private customerRepository: CustomerRepository,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
    private eventBus: EventBus,
  ) {}

  async createOrder(command: CreateOrderCommand): Promise<Order> {
    // Validate customer exists
    const customer = await this.customerRepository.findById(command.customerId)
    if (!customer) {
      throw new CustomerNotFoundError(command.customerId)
    }

    // Check inventory availability
    for (const item of command.items) {
      const available = await this.inventoryService.checkAvailability(item.productId, item.quantity)
      if (!available) {
        throw new InsufficientInventoryError(item.productId)
      }
    }

    // Create domain object
    const order = Order.create({
      customerId: new CustomerId(command.customerId),
      items: command.items.map(item =>
        OrderItem.create({
          productId: new ProductId(item.productId),
          quantity: item.quantity,
          price: new Money(item.price),
        }),
      ),
      shippingAddress: Address.create(command.shippingAddress),
    })

    // Save order
    await this.orderRepository.save(order)

    // Publish domain events
    const events = order.getUncommittedEvents()
    for (const event of events) {
      await this.eventBus.publish(event)
    }
    order.markEventsAsCommitted()

    return order
  }

  async processPayment(orderId: OrderId, paymentData: PaymentData): Promise<void> {
    const order = await this.orderRepository.findById(orderId)
    if (!order) {
      throw new OrderNotFoundError(orderId)
    }

    // Process payment through domain
    const paymentResult = await this.paymentService.processPayment({
      amount: order.total,
      customerId: order.customerId,
      ...paymentData,
    })

    if (paymentResult.success) {
      order.markAsPaid(paymentResult.transactionId)
      await this.orderRepository.save(order)
    } else {
      order.markPaymentFailed(paymentResult.error)
      await this.orderRepository.save(order)
      throw new PaymentFailedError(paymentResult.error)
    }
  }
}
```

### Domain Layer

```typescript
// Domain Entities with business logic
export class Order extends AggregateRoot {
  private constructor(
    public readonly id: OrderId,
    public readonly customerId: CustomerId,
    private _items: OrderItem[],
    private _status: OrderStatus,
    private _shippingAddress: Address,
    public readonly createdAt: Date,
  ) {
    super(id)
  }

  static create(data: {
    customerId: CustomerId
    items: OrderItem[]
    shippingAddress: Address
  }): Order {
    const order = new Order(
      OrderId.generate(),
      data.customerId,
      data.items,
      OrderStatus.PENDING,
      data.shippingAddress,
      new Date(),
    )

    // Domain event
    order.addDomainEvent(
      new OrderCreatedEvent(order.id, order.customerId, order.total, order.createdAt),
    )

    return order
  }

  get items(): ReadonlyArray<OrderItem> {
    return [...this._items]
  }

  get total(): Money {
    return this._items.reduce((total, item) => total.add(item.lineTotal), Money.zero())
  }

  get status(): string {
    return this._status.value
  }

  markAsPaid(transactionId: string): void {
    if (this._status !== OrderStatus.PENDING) {
      throw new InvalidOrderStateError(
        `Cannot mark order ${this.id.value} as paid. Current status: ${this._status.value}`,
      )
    }

    this._status = OrderStatus.PAID

    this.addDomainEvent(new OrderPaidEvent(this.id, transactionId, this.total, new Date()))
  }

  addItem(item: OrderItem): void {
    // Business rule: Maximum 10 items per order
    if (this._items.length >= 10) {
      throw new MaxItemsExceededError(10)
    }

    // Business rule: Cannot modify paid orders
    if (this._status === OrderStatus.PAID) {
      throw new InvalidOrderStateError('Cannot modify paid order')
    }

    this._items.push(item)

    this.addDomainEvent(new OrderItemAddedEvent(this.id, item.productId, item.quantity))
  }
}

// Value Objects
export class Money {
  constructor(public readonly amount: number) {
    if (amount < 0) {
      throw new Error('Money amount cannot be negative')
    }
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount)
  }

  static zero(): Money {
    return new Money(0)
  }
}

// Domain Services
export class PricingService {
  calculateOrderTotal(items: OrderItem[], customer: Customer): Money {
    let total = items.reduce((sum, item) => sum.add(item.lineTotal), Money.zero())

    // Apply customer-specific discounts
    if (customer.isPremium()) {
      total = this.applyPremiumDiscount(total)
    }

    return total
  }

  private applyPremiumDiscount(amount: Money): Money {
    const discountAmount = amount.amount * 0.1 // 10% discount
    return new Money(amount.amount - discountAmount)
  }
}
```

### Infrastructure Layer

```typescript
// Repository Implementation
export class PostgresOrderRepository implements OrderRepository {
  constructor(private db: Database) {}

  async save(order: Order): Promise<void> {
    const transaction = await this.db.beginTransaction()

    try {
      // Save order aggregate
      await this.saveOrderAggregate(transaction, order)

      // Save order items
      await this.saveOrderItems(transaction, order)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  async findById(id: OrderId): Promise<Order | null> {
    const orderData = await this.db.query('SELECT * FROM orders WHERE id = $1', [id.value])

    if (!orderData.rows[0]) return null

    const itemsData = await this.db.query('SELECT * FROM order_items WHERE order_id = $1', [
      id.value,
    ])

    return this.reconstructOrder(orderData.rows[0], itemsData.rows)
  }

  private reconstructOrder(orderData: any, itemsData: any[]): Order {
    // Reconstruction logic from database
    const items = itemsData.map(item => OrderItem.fromPersistence(item))

    return Order.fromPersistence({
      id: new OrderId(orderData.id),
      customerId: new CustomerId(orderData.customer_id),
      items,
      status: OrderStatus.fromString(orderData.status),
      shippingAddress: Address.fromPersistence(orderData.shipping_address),
      createdAt: orderData.created_at,
    })
  }
}

// External Service Adapters
export class StripePaymentService implements PaymentService {
  constructor(private stripeClient: Stripe) {}

  async processPayment(paymentData: PaymentData): Promise<PaymentResult> {
    try {
      const charge = await this.stripeClient.charges.create({
        amount: paymentData.amount.amount * 100, // Stripe uses cents
        currency: 'usd',
        customer: paymentData.customerId.value,
        source: paymentData.paymentMethodId,
      })

      return PaymentResult.success(charge.id)
    } catch (error) {
      return PaymentResult.failure(error.message)
    }
  }
}
```

## Testing Strategy

```typescript
// Unit Testing Domain Layer
describe('Order', () => {
  it('should calculate total correctly', () => {
    const items = [
      OrderItem.create({
        productId: new ProductId('1'),
        quantity: 2,
        price: new Money(10),
      }),
      OrderItem.create({
        productId: new ProductId('2'),
        quantity: 1,
        price: new Money(15),
      }),
    ]

    const order = Order.create({
      customerId: new CustomerId('customer-1'),
      items,
      shippingAddress: Address.create({}),
    })

    expect(order.total.amount).toBe(35) // (2 * 10) + (1 * 15)
  })
})

// Integration Testing Application Layer
describe('OrderApplicationService', () => {
  let service: OrderApplicationService
  let mockRepository: jest.Mocked<OrderRepository>

  beforeEach(() => {
    mockRepository = createMockRepository()
    service = new OrderApplicationService(
      mockRepository,
      mockCustomerRepository,
      mockInventoryService,
      mockPaymentService,
      mockEventBus,
    )
  })

  it('should create order when all validations pass', async () => {
    const command = new CreateOrderCommand({
      customerId: 'customer-1',
      items: [{ productId: 'product-1', quantity: 1, price: 10 }],
      shippingAddress: {},
    })

    mockCustomerRepository.findById.mockResolvedValue(mockCustomer)
    mockInventoryService.checkAvailability.mockResolvedValue(true)

    const order = await service.createOrder(command)

    expect(order).toBeDefined()
    expect(mockRepository.save).toHaveBeenCalledWith(order)
  })
})
```

## Pros and Cons

### Advantages

- **Clear Separation**: Well-defined layer responsibilities
- **Familiar Pattern**: Most developers understand the structure
- **Scalable Teams**: Different teams can work on different layers
- **Tool Support**: Good IDE and framework support

### Disadvantages

- **Tight Coupling**: Layers depend on lower layers
- **Shared Database**: Database changes affect multiple layers
- **Testing Challenges**: Hard to test layers in isolation
- **Performance**: Can introduce unnecessary abstraction overhead

## Common Pitfalls

1. **Anemic Domain Model**: Business logic in application layer instead of domain
2. **Database-Driven Design**: Domain model shaped by database concerns
3. **Layer Skipping**: Controllers directly accessing repositories
4. **Fat Application Services**: Too much logic in application layer

## Evolution Path

When layered architecture becomes insufficient:

1. **Extract Hexagonal Ports** → Better testability
2. **Implement Clean Architecture** → Dependency inversion
3. **Add CQRS** → Separate read/write models
4. **Consider Microservices** → Multiple bounded contexts

## Related Patterns

- **[Hexagonal Architecture](hexagonal.md)** - Dependency inversion evolution
- **[Clean Architecture](clean-architecture.md)** - Advanced layered approach
- **[Domain-Driven Design](../design-patterns/README.md)** - Domain modeling approach
