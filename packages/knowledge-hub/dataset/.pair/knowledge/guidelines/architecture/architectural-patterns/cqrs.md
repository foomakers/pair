# CQRS (Command Query Responsibility Segregation)

Architecture pattern that separates read and write operations into different models, optimizing each for their specific use cases.

## When to Use

**Ideal for:**

- Different read/write performance requirements
- Complex query scenarios
- Event-driven architectures
- Separate read/write scaling needs
- Different consistency requirements

**Avoid when:**

- Simple CRUD operations
- Consistent data model sufficient
- Small scale applications
- Team unfamiliar with eventual consistency

## Implementation Example

```typescript
// Command Side (Write Model)
export class CreateOrderCommand {
  constructor(
    public readonly customerId: string,
    public readonly items: OrderItemData[],
    public readonly shippingAddress: AddressData,
  ) {}
}

export class CreateOrderCommandHandler {
  constructor(private orderRepository: OrderWriteRepository, private eventBus: EventBus) {}

  async handle(command: CreateOrderCommand): Promise<void> {
    const order = Order.create({
      customerId: command.customerId,
      items: command.items,
      shippingAddress: command.shippingAddress,
    })

    await this.orderRepository.save(order)

    const events = order.getUncommittedEvents()
    for (const event of events) {
      await this.eventBus.publish(event)
    }
  }
}

// Query Side (Read Model)
export interface OrderReadModel {
  id: string
  customerName: string
  status: string
  total: number
  itemCount: number
  createdAt: Date
}

export class GetOrderByIdQueryHandler {
  constructor(private orderReadRepository: OrderReadRepository) {}

  async handle(query: GetOrderByIdQuery): Promise<OrderReadModel | null> {
    return await this.orderReadRepository.findById(query.orderId)
  }
}

// Event-Driven Synchronization
export class OrderReadModelUpdater {
  constructor(private orderReadRepository: OrderReadRepository) {}

  @EventHandler(OrderCreatedEvent)
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    const readModel: OrderReadModel = {
      id: event.orderId,
      customerName: event.customerName,
      status: 'PENDING',
      total: event.total,
      itemCount: event.items.length,
      createdAt: event.createdAt,
    }

    await this.orderReadRepository.create(readModel)
  }
}
```

## Pros and Cons

### Advantages

- **Optimized Performance**: Separate optimization for reads and writes
- **Scalability**: Independent scaling of read and write sides
- **Flexibility**: Different data models for different use cases

### Disadvantages

- **Complexity**: Additional infrastructure and coordination
- **Eventual Consistency**: Must handle asynchronous updates
- **Data Duplication**: Same data stored in multiple places

## Related Patterns

- **[Event Sourcing](event-sourcing.md)** - Often combined with CQRS
- **[Architectural Patterns](README.md)** - Pattern selection framework
