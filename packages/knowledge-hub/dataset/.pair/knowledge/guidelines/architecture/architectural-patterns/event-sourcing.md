# Event Sourcing Pattern

Architecture pattern that persists domain events as the source of truth, enabling event replay, audit trails, and temporal queries.

## When to Use

**Ideal for:**
- Audit trail requirements
- Event replay needed
- Temporal queries important
- High data integrity needs
- Complex business workflows

**Avoid when:**
- Simple data requirements
- No audit trail needed
- Team unfamiliar with event-driven patterns
- Performance-critical reads

## Implementation Example

```typescript
// Domain Events
export class OrderCreatedEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly items: OrderItemData[],
    public readonly total: number,
    timestamp: Date = new Date()
  ) {
    super('OrderCreated', orderId, timestamp)
  }
}

export class OrderPaidEvent extends DomainEvent {
  constructor(
    public readonly orderId: string,
    public readonly paymentId: string,
    public readonly amount: number,
    timestamp: Date = new Date()
  ) {
    super('OrderPaid', orderId, timestamp)
  }
}

// Event Store
export interface EventStore {
  append(streamId: string, events: DomainEvent[]): Promise<void>
  getEvents(streamId: string, fromVersion?: number): Promise<DomainEvent[]>
}

export class PostgresEventStore implements EventStore {
  constructor(private database: Database) {}
  
  async append(streamId: string, events: DomainEvent[]): Promise<void> {
    await this.database.transaction(async (tx) => {
      for (const event of events) {
        await tx.query(`
          INSERT INTO events (stream_id, event_type, event_data, version, timestamp)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          streamId,
          event.eventType,
          JSON.stringify(event),
          event.version,
          event.timestamp
        ])
      }
    })
  }
  
  async getEvents(streamId: string, fromVersion = 0): Promise<DomainEvent[]> {
    const rows = await this.database.query(`
      SELECT event_type, event_data, version, timestamp
      FROM events 
      WHERE stream_id = $1 AND version >= $2
      ORDER BY version
    `, [streamId, fromVersion])
    
    return rows.map(row => this.deserializeEvent(row))
  }
}

// Aggregate Reconstruction
export class Order {
  private events: DomainEvent[] = []
  
  static fromHistory(events: DomainEvent[]): Order {
    const order = new Order()
    
    for (const event of events) {
      order.apply(event)
    }
    
    return order
  }
  
  private apply(event: DomainEvent): void {
    switch (event.eventType) {
      case 'OrderCreated':
        this.applyOrderCreated(event as OrderCreatedEvent)
        break
      case 'OrderPaid':
        this.applyOrderPaid(event as OrderPaidEvent)
        break
    }
  }
  
  private applyOrderCreated(event: OrderCreatedEvent): void {
    this._id = event.orderId
    this._customerId = event.customerId
    this._items = event.items
    this._total = event.total
    this._status = OrderStatus.PENDING
  }
  
  private applyOrderPaid(event: OrderPaidEvent): void {
    this._status = OrderStatus.PAID
    this._paymentId = event.paymentId
  }
}

// Repository with Event Store
export class EventSourcedOrderRepository {
  constructor(private eventStore: EventStore) {}
  
  async save(order: Order): Promise<void> {
    const uncommittedEvents = order.getUncommittedEvents()
    await this.eventStore.append(order.id, uncommittedEvents)
    order.markEventsAsCommitted()
  }
  
  async findById(orderId: string): Promise<Order | null> {
    const events = await this.eventStore.getEvents(orderId)
    
    if (events.length === 0) {
      return null
    }
    
    return Order.fromHistory(events)
  }
}
```

## Pros and Cons

### Advantages
- **Complete Audit Trail**: Every change is recorded
- **Event Replay**: Can reconstruct state at any point in time
- **Temporal Queries**: Query historical states
- **High Data Integrity**: Immutable event log

### Disadvantages
- **Complexity**: Requires event-driven thinking
- **Storage Overhead**: Events accumulate over time
- **Query Performance**: Rebuilding state can be slow
- **Schema Evolution**: Event structure changes are complex

## Related Patterns

- **[CQRS](architectural-patterns-cqrs.md)** - Often combined with Event Sourcing
- **[Architectural Patterns](architectural-patterns.md)** - Pattern selection framework
