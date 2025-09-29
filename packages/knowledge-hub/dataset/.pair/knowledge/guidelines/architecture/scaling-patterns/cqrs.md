# CQRS Scaling Pattern

Command Query Responsibility Segregation for independent read/write scaling.

## When to Use

- **Different read/write performance** requirements
- **Complex reporting** needs
- **Audit trail** requirements
- **Independent scaling** of reads and writes

## Implementation

```typescript
// Command Side (Write Model)
export class OrderCommandHandler {
  constructor(
    private eventStore: EventStore,
    private eventBus: EventBus
  ) {}
  
  async createOrder(command: CreateOrderCommand): Promise<void> {
    const events = [
      new OrderCreatedEvent(command.orderId, command.customerId, command.items),
      new OrderTotalCalculatedEvent(command.orderId, command.total)
    ]
    
    await this.eventStore.saveEvents(command.orderId, events)
    
    // Publish events for read model updates
    for (const event of events) {
      await this.eventBus.publish(event)
    }
  }
}

// Query Side (Read Model)
export class OrderQueryHandler {
  constructor(private readDatabase: ReadDatabase) {}
  
  async getOrderSummary(customerId: string): Promise<OrderSummary[]> {
    // Optimized read model for fast queries
    return await this.readDatabase.orderSummaries
      .where('customerId', customerId)
      .orderBy('createdAt', 'desc')
      .limit(50)
  }
  
  async getOrderAnalytics(dateRange: DateRange): Promise<OrderAnalytics> {
    // Pre-aggregated data for fast analytics
    return await this.readDatabase.orderAnalytics
      .where('date', 'between', [dateRange.start, dateRange.end])
      .groupBy('date')
      .sum('total')
  }
}

// Read Model Projections
export class OrderProjectionHandler {
  constructor(private readDatabase: ReadDatabase) {}
  
  @EventHandler(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    // Update multiple read models optimized for different queries
    await Promise.all([
      this.updateOrderSummary(event),
      this.updateCustomerOrderHistory(event),
      this.updateOrderAnalytics(event)
    ])
  }
  
  private async updateOrderSummary(event: OrderCreatedEvent): Promise<void> {
    await this.readDatabase.orderSummaries.insert({
      orderId: event.orderId,
      customerId: event.customerId,
      status: 'Created',
      createdAt: event.timestamp
    })
  }
}
```

## Pros and Cons

**Pros:**
- **Independent scaling** - Scale reads and writes separately
- **Optimized models** - Different models for different use cases
- **Performance** - Fast reads from denormalized models
- **Flexibility** - Multiple read models for same data

**Cons:**
- **Complexity** - Dual models to maintain
- **Eventual consistency** - Read lag behind writes
- **Development overhead** - More code to write and test

## Best Practices

- **Event-driven updates** - Use events to sync read models
- **Projection monitoring** - Track read model freshness
- **Graceful degradation** - Handle temporary read model lag

## Related Patterns

- [Event Sourcing](architectural-patterns-event-sourcing.md) - Event-based persistence
- [Database Sharding](scaling-patterns-database-sharding.md) - Horizontal partitioning
- [Read Replicas](scaling-patterns-database-read-replicas.md) - Read scaling
