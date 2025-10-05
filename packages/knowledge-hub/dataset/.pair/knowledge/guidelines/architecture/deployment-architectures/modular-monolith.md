# Modular Monolith Architecture

Monolithic deployment with strong domain boundaries and independent module development.

## When to Use

- **Team Size**: 4-10 developers
- **Complexity**: Medium business logic with clear domains
- **Evolution**: Stepping stone to microservices
- **Performance**: Need ACID transactions with some isolation

## Architecture Pattern

```typescript
// Modular Monolith with Domain Events
src/
├── modules/
│   ├── user-management/
│   │   ├── api/              # External interface
│   │   ├── domain/           # Business logic
│   │   ├── infrastructure/   # Data access
│   │   └── events/          # Domain events
│   ├── order-processing/
│   │   ├── api/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   └── events/
├── shared-kernel/           # Shared domain concepts
├── event-bus/              # Internal messaging
└── main.ts
```

## Implementation Example

```typescript
// Module Interface
export interface ModuleInterface {
  readonly name: string
  initialize(): Promise<void>
  registerRoutes(app: FastifyInstance): void
  registerEventHandlers(eventBus: EventBus): void
}

// Domain Events
export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerId: string,
    public readonly total: number,
    public readonly timestamp: Date = new Date(),
  ) {}
}

// Module Implementation
export class OrderModule implements ModuleInterface {
  readonly name = 'order-processing'

  constructor(private orderService: OrderService, private eventBus: EventBus) {}

  async initialize(): Promise<void> {
    await this.orderService.initialize()
  }

  registerEventHandlers(eventBus: EventBus): void {
    // Listen to events from other modules
    eventBus.subscribe('user.created', this.handleUserCreated.bind(this))
  }

  private async handleUserCreated(event: UserCreatedEvent): Promise<void> {
    // React to user creation
    await this.orderService.createCustomerProfile(event.userId)
  }
}

// Inter-Module Communication
export class InternalEventBus {
  private handlers = new Map<string, Function[]>()

  subscribe(eventType: string, handler: Function): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, [])
    }
    this.handlers.get(eventType)!.push(handler)
  }

  async publish(eventType: string, event: any): Promise<void> {
    const handlers = this.handlers.get(eventType) || []

    // Process events asynchronously but within same transaction
    await Promise.all(handlers.map(handler => handler(event)))
  }
}
```

## Module Boundaries

**Strong Boundaries:**

- **Separate databases per module** (logical separation)
- **No direct database access** across modules
- **Communication via domain events**
- **Independent testing** strategies

**Shared Elements:**

- **Shared kernel** - Core domain concepts
- **Infrastructure** - Database connections, logging
- **Cross-cutting concerns** - Security, monitoring

## Benefits and Trade-offs

**Benefits:**

- **Team independence** - Teams can work on separate modules
- **Clear boundaries** - Domain-driven design principles
- **Migration ready** - Easy to extract to microservices
- **Single deployment** - Simplified operations
- **Transactional consistency** - ACID across modules when needed

**Trade-offs:**

- **Module coupling** - Shared database and runtime
- **Coordination overhead** - Interface changes affect multiple teams
- **Technology constraints** - Single tech stack across modules
- **Scaling limitations** - Scale entire application

## Best Practices

- **Domain events** - Use events for module communication
- **Database per module** - Logical or physical separation
- **API first** - Design module interfaces as APIs
- **Independent testing** - Each module can be tested separately
- **Migration planning** - Design for future microservice extraction

## Migration Strategies

**From Structured Monolith:**

1. Extract domain events
2. Separate module databases
3. Add module interfaces
4. Implement event-driven communication

**To Microservices:**

1. Start with least coupled module
2. Extract database completely
3. Replace events with HTTP/message queues
4. Add service discovery and configuration

## Related Patterns

- [Structured Monolith](structured-monolith.md) - Simpler alternative
- [Microservices](microservices.md) - Next evolution step
- [Domain-Driven Design](.pair/knowledge/guidelines/architecture/design-patterns/README.md) - Domain modeling approach
- [Event Sourcing](.pair/knowledge/guidelines/architecture/architectural-patterns/event-sourcing.md) - Event-based persistence
