# Clean Architecture Pattern

Advanced architecture pattern emphasizing dependency inversion, separation of concerns, and independence from external frameworks.

## When to Use

**Ideal for:**

- Complex business domains
- Long-term maintainability requirements
- Team experienced with DDD
- Need for framework independence
- High-value business applications

**Avoid when:**

- Simple CRUD applications
- Rapid prototyping needs
- Small team or tight deadlines
- Low complexity domains

## Architecture Layers

```
┌─────────────────────────────────────────┐
│             Frameworks & Drivers        │ ← External interfaces
├─────────────────────────────────────────┤
│          Interface Adapters             │ ← Controllers, Gateways, Presenters
├─────────────────────────────────────────┤
│           Application Business Rules    │ ← Use Cases, Interactors
├─────────────────────────────────────────┤
│          Enterprise Business Rules      │ ← Entities, Domain Services
└─────────────────────────────────────────┘
```

## Implementation Structure

```typescript
src/
├── entities/              # Enterprise Business Rules
│   ├── order/
│   ├── customer/
│   └── shared/
├── use-cases/            # Application Business Rules
│   ├── create-order/
│   ├── process-payment/
│   └── shared/
├── interface-adapters/   # Interface Adapters
│   ├── controllers/
│   ├── gateways/
│   ├── presenters/
│   └── repositories/
└── frameworks-drivers/   # Frameworks & Drivers
    ├── web/
    ├── database/
    ├── external-services/
    └── config/
```

## Layer 1: Enterprise Business Rules (Entities)

```typescript
// Core Business Entity
export class Order {
  private constructor(
    private readonly _id: OrderId,
    private readonly _customerId: CustomerId,
    private _items: OrderItem[],
    private _status: OrderStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(data: { customerId: CustomerId; items: OrderItem[] }): Order {
    // Business rule: Order must have at least one item
    if (data.items.length === 0) {
      throw new EmptyOrderError()
    }

    // Business rule: Order total must be positive
    const total = this.calculateTotal(data.items)
    if (total.isZero() || total.isNegative()) {
      throw new InvalidOrderTotalError()
    }

    const now = new Date()
    return new Order(
      OrderId.generate(),
      data.customerId,
      [...data.items],
      OrderStatus.PENDING,
      now,
      now,
    )
  }

  // Entity behavior encapsulates business rules
  addItem(item: OrderItem): void {
    // Business rule: Cannot modify confirmed orders
    if (this._status.isConfirmed()) {
      throw new OrderAlreadyConfirmedError(this._id)
    }

    // Business rule: Maximum 50 items per order
    if (this._items.length >= 50) {
      throw new MaxOrderItemsExceededError(50)
    }

    // Business rule: No duplicate products
    const existingItem = this._items.find(i => i.productId.equals(item.productId))
    if (existingItem) {
      existingItem.increaseQuantity(item.quantity)
    } else {
      this._items.push(item)
    }

    this._updatedAt = new Date()
  }

  confirmOrder(): void {
    // Business rule: Cannot confirm empty order
    if (this._items.length === 0) {
      throw new EmptyOrderError()
    }

    // Business rule: Can only confirm pending orders
    if (!this._status.isPending()) {
      throw new InvalidOrderStateTransitionError(this._status, OrderStatus.CONFIRMED)
    }

    this._status = OrderStatus.CONFIRMED
    this._updatedAt = new Date()
  }

  cancel(reason: string): void {
    // Business rule: Cannot cancel shipped orders
    if (this._status.isShipped()) {
      throw new CannotCancelShippedOrderError(this._id)
    }

    this._status = OrderStatus.CANCELLED
    this._updatedAt = new Date()
  }

  // Getters provide read-only access to internal state
  get id(): OrderId {
    return this._id
  }
  get customerId(): CustomerId {
    return this._customerId
  }
  get items(): ReadonlyArray<OrderItem> {
    return [...this._items]
  }
  get status(): OrderStatus {
    return this._status
  }
  get total(): Money {
    return this.calculateTotal(this._items)
  }
  get createdAt(): Date {
    return new Date(this._createdAt)
  }
  get updatedAt(): Date {
    return new Date(this._updatedAt)
  }

  private static calculateTotal(items: OrderItem[]): Money {
    return items.reduce((total, item) => total.add(item.lineTotal), Money.zero())
  }
}

// Value Objects
export class OrderId {
  private constructor(private readonly value: string) {
    if (!value || value.trim().length === 0) {
      throw new InvalidOrderIdError(value)
    }
  }

  static generate(): OrderId {
    return new OrderId(uuidv4())
  }

  static fromString(value: string): OrderId {
    return new OrderId(value)
  }

  equals(other: OrderId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}

export class Money {
  private constructor(private readonly amount: number) {
    if (amount < 0) {
      throw new NegativeMoneyError(amount)
    }
  }

  static fromAmount(amount: number): Money {
    return new Money(amount)
  }

  static zero(): Money {
    return new Money(0)
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount)
  }

  subtract(other: Money): Money {
    const result = this.amount - other.amount
    if (result < 0) {
      throw new NegativeMoneyError(result)
    }
    return new Money(result)
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new NegativeMoneyError(this.amount * factor)
    }
    return new Money(this.amount * factor)
  }

  isZero(): boolean {
    return this.amount === 0
  }
  isNegative(): boolean {
    return this.amount < 0
  }
  isGreaterThan(other: Money): boolean {
    return this.amount > other.amount
  }

  toNumber(): number {
    return this.amount
  }
}
```

## Layer 2: Application Business Rules (Use Cases)

```typescript
// Use Case Interface
export interface UseCase<Request, Response> {
  execute(request: Request): Promise<Response>
}

// Create Order Use Case
export class CreateOrderUseCase implements UseCase<CreateOrderRequest, CreateOrderResponse> {
  constructor(
    private orderRepository: OrderRepositoryPort,
    private customerRepository: CustomerRepositoryPort,
    private inventoryService: InventoryServicePort,
    private orderPresenter: OrderPresenterPort,
  ) {}

  async execute(request: CreateOrderRequest): Promise<CreateOrderResponse> {
    // Validate customer exists
    const customer = await this.customerRepository.findById(
      CustomerId.fromString(request.customerId),
    )
    if (!customer) {
      throw new CustomerNotFoundError(request.customerId)
    }

    // Validate inventory availability
    await this.validateInventory(request.items)

    // Create order items with current prices
    const orderItems = await this.createOrderItems(request.items)

    // Create order entity
    const order = Order.create({
      customerId: customer.id,
      items: orderItems,
    })

    // Save order
    await this.orderRepository.save(order)

    // Reserve inventory
    await this.reserveInventory(orderItems)

    // Present response
    return this.orderPresenter.present(order)
  }

  private async validateInventory(items: CreateOrderItemRequest[]): Promise<void> {
    for (const item of items) {
      const available = await this.inventoryService.checkAvailability(
        ProductId.fromString(item.productId),
        item.quantity,
      )

      if (!available) {
        throw new InsufficientInventoryError(item.productId, item.quantity)
      }
    }
  }

  private async createOrderItems(items: CreateOrderItemRequest[]): Promise<OrderItem[]> {
    const orderItems: OrderItem[] = []

    for (const item of items) {
      const currentPrice = await this.inventoryService.getCurrentPrice(
        ProductId.fromString(item.productId),
      )

      orderItems.push(
        OrderItem.create({
          productId: ProductId.fromString(item.productId),
          quantity: item.quantity,
          unitPrice: currentPrice,
        }),
      )
    }

    return orderItems
  }
}

// Process Payment Use Case
export class ProcessPaymentUseCase
  implements UseCase<ProcessPaymentRequest, ProcessPaymentResponse>
{
  constructor(
    private orderRepository: OrderRepositoryPort,
    private paymentGateway: PaymentGatewayPort,
    private paymentPresenter: PaymentPresenterPort,
  ) {}

  async execute(request: ProcessPaymentRequest): Promise<ProcessPaymentResponse> {
    // Find order
    const order = await this.orderRepository.findById(OrderId.fromString(request.orderId))
    if (!order) {
      throw new OrderNotFoundError(request.orderId)
    }

    // Validate order can be paid
    if (!order.status.canBePaid()) {
      throw new OrderCannotBePaidError(order.id, order.status)
    }

    // Process payment
    const paymentRequest = PaymentRequest.fromOrder(order, request.paymentMethod)
    const paymentResult = await this.paymentGateway.processPayment(paymentRequest)

    if (paymentResult.isSuccessful()) {
      // Update order status
      order.markAsPaid(paymentResult.transactionId)
      await this.orderRepository.save(order)

      return this.paymentPresenter.presentSuccess(paymentResult)
    } else {
      // Handle payment failure
      order.markPaymentFailed(paymentResult.errorMessage)
      await this.orderRepository.save(order)

      return this.paymentPresenter.presentFailure(paymentResult)
    }
  }
}
```

## Layer 3: Interface Adapters

```typescript
// Repository Adapter
export class OrderRepositoryAdapter implements OrderRepositoryPort {
  constructor(private database: Database) {}

  async save(order: Order): Promise<void> {
    const orderData = OrderMapper.toDatabase(order)

    await this.database.transaction(async tx => {
      await tx.query(
        `
        INSERT INTO orders (id, customer_id, status, total, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          total = EXCLUDED.total,
          updated_at = EXCLUDED.updated_at
      `,
        [
          orderData.id,
          orderData.customerId,
          orderData.status,
          orderData.total,
          orderData.createdAt,
          orderData.updatedAt,
        ],
      )

      // Delete existing items and insert new ones
      await tx.query('DELETE FROM order_items WHERE order_id = $1', [orderData.id])

      for (const item of orderData.items) {
        await tx.query(
          `
          INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [orderData.id, item.productId, item.quantity, item.unitPrice, item.lineTotal],
        )
      }
    })
  }

  async findById(id: OrderId): Promise<Order | null> {
    const orderRow = await this.database.queryOne(
      `
      SELECT id, customer_id, status, created_at, updated_at
      FROM orders 
      WHERE id = $1
    `,
      [id.toString()],
    )

    if (!orderRow) return null

    const itemRows = await this.database.query(
      `
      SELECT product_id, quantity, unit_price
      FROM order_items 
      WHERE order_id = $1
    `,
      [id.toString()],
    )

    return OrderMapper.toDomain(orderRow, itemRows)
  }
}

// Controller Adapter
export class OrderController {
  constructor(
    private createOrderUseCase: CreateOrderUseCase,
    private processPaymentUseCase: ProcessPaymentUseCase,
    private getOrderUseCase: GetOrderUseCase,
  ) {}

  @Post('/orders')
  async createOrder(@Body() httpRequest: CreateOrderHttpRequest): Promise<CreateOrderHttpResponse> {
    try {
      const useCaseRequest = CreateOrderRequestMapper.fromHttp(httpRequest)
      const useCaseResponse = await this.createOrderUseCase.execute(useCaseRequest)
      return CreateOrderResponseMapper.toHttp(useCaseResponse)
    } catch (error) {
      throw this.mapError(error)
    }
  }

  @Post('/orders/:orderId/payment')
  async processPayment(
    @Param('orderId') orderId: string,
    @Body() httpRequest: ProcessPaymentHttpRequest,
  ): Promise<ProcessPaymentHttpResponse> {
    try {
      const useCaseRequest = ProcessPaymentRequestMapper.fromHttp(orderId, httpRequest)
      const useCaseResponse = await this.processPaymentUseCase.execute(useCaseRequest)
      return ProcessPaymentResponseMapper.toHttp(useCaseResponse)
    } catch (error) {
      throw this.mapError(error)
    }
  }

  private mapError(error: Error): HttpError {
    if (error instanceof CustomerNotFoundError) {
      return new BadRequestHttpError(error.message)
    }
    if (error instanceof OrderNotFoundError) {
      return new NotFoundHttpError(error.message)
    }
    if (error instanceof InsufficientInventoryError) {
      return new BadRequestHttpError(error.message)
    }

    return new InternalServerHttpError('An unexpected error occurred')
  }
}
```

## Layer 4: Frameworks & Drivers

```typescript
// Web Framework Setup
export class WebApplication {
  private app: Express

  constructor(private container: DIContainer) {
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupRoutes(): void {
    const orderController = this.container.get<OrderController>('OrderController')

    this.app.use('/api', this.createRouter(orderController))
  }

  private createRouter(orderController: OrderController): Router {
    const router = Router()

    router.post('/orders', (req, res, next) =>
      orderController
        .createOrder(req.body)
        .then(result => res.json(result))
        .catch(next),
    )

    router.post('/orders/:orderId/payment', (req, res, next) =>
      orderController
        .processPayment(req.params.orderId, req.body)
        .then(result => res.json(result))
        .catch(next),
    )

    return router
  }
}

// Database Setup
export class DatabaseConfiguration {
  static createConnection(): Database {
    return new PostgresDatabase({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    })
  }
}

// Dependency Injection Container
export class ApplicationContainer {
  private container = new Container()

  configure(): void {
    // Layer 4: Frameworks & Drivers
    this.container
      .bind<Database>('Database')
      .toConstantValue(DatabaseConfiguration.createConnection())

    // Layer 3: Interface Adapters
    this.container
      .bind<OrderRepositoryPort>('OrderRepository')
      .to(OrderRepositoryAdapter)
      .inSingletonScope()

    this.container
      .bind<PaymentGatewayPort>('PaymentGateway')
      .to(StripePaymentGatewayAdapter)
      .inSingletonScope()

    // Layer 2: Application Business Rules
    this.container.bind<CreateOrderUseCase>('CreateOrderUseCase').to(CreateOrderUseCase)

    this.container.bind<ProcessPaymentUseCase>('ProcessPaymentUseCase').to(ProcessPaymentUseCase)

    // Layer 3: Controllers
    this.container.bind<OrderController>('OrderController').to(OrderController)
  }
}
```

## Testing Strategy

```typescript
// Unit Test: Entity
describe('Order Entity', () => {
  it('should create valid order', () => {
    const items = [
      OrderItem.create({
        productId: ProductId.fromString('product-1'),
        quantity: 2,
        unitPrice: Money.fromAmount(10),
      }),
    ]

    const order = Order.create({
      customerId: CustomerId.fromString('customer-1'),
      items,
    })

    expect(order.total.toNumber()).toBe(20)
    expect(order.status.isPending()).toBe(true)
  })

  it('should throw error for empty order', () => {
    expect(() => {
      Order.create({
        customerId: CustomerId.fromString('customer-1'),
        items: [],
      })
    }).toThrow(EmptyOrderError)
  })
})

// Unit Test: Use Case
describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase
  let mockOrderRepository: jest.Mocked<OrderRepositoryPort>
  let mockCustomerRepository: jest.Mocked<CustomerRepositoryPort>

  beforeEach(() => {
    mockOrderRepository = createMockOrderRepository()
    mockCustomerRepository = createMockCustomerRepository()

    useCase = new CreateOrderUseCase(
      mockOrderRepository,
      mockCustomerRepository,
      mockInventoryService,
      mockOrderPresenter,
    )
  })

  it('should create order when all validations pass', async () => {
    const request = new CreateOrderRequest({
      customerId: 'customer-1',
      items: [{ productId: 'product-1', quantity: 1 }],
    })

    mockCustomerRepository.findById.mockResolvedValue(mockCustomer)
    mockInventoryService.checkAvailability.mockResolvedValue(true)
    mockOrderRepository.save.mockResolvedValue(undefined)

    const response = await useCase.execute(request)

    expect(response).toBeDefined()
    expect(mockOrderRepository.save).toHaveBeenCalled()
  })
})
```

## Pros and Cons

### Advantages

- **Framework Independence**: Core logic independent of external frameworks
- **Highly Testable**: Easy to test business logic in isolation
- **Flexible**: Easy to change external dependencies
- **Maintainable**: Clear separation of concerns and dependencies

### Disadvantages

- **High Complexity**: Requires significant setup and understanding
- **Over-Engineering**: Can be overkill for simple applications
- **Learning Curve**: Team needs to understand dependency inversion
- **Development Overhead**: More code and abstraction layers

## Related Patterns

- **[Hexagonal Architecture](hexagonal.md)** - Similar approach with ports/adapters
- **[Domain-Driven Design](.pair/knowledge/guidelines/architecture/domain-driven-design.md)** - Domain modeling approach
- **[CQRS](cqrs.md)** - Can be combined for read/write separation
