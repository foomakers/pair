# Structured Monolith Architecture

Single deployable unit with clear domain organization and modular structure.

## When to Use

- **Team Size**: 1-5 developers
- **Complexity**: Low to moderate business logic
- **Timeline**: Fast time-to-market required
- **Experience**: Team new to distributed systems

## Architecture Pattern

```typescript
// Structured Monolith Organization
src/
├── modules/                    # Business modules
│   ├── user-management/       # User domain
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   └── models/
│   ├── order-processing/      # Order domain
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   └── inventory/            # Inventory domain
├── shared/                   # Shared components
│   ├── database/
│   ├── middleware/
│   ├── utilities/
└── main.ts                  # Single entry point
```

## Implementation Example

```typescript
// Module Organization
export class UserModule {
  constructor(
    private userService: UserService,
    private userController: UserController,
    private userRepository: UserRepository,
  ) {}

  registerRoutes(app: FastifyInstance): void {
    app.register(this.userController.routes, { prefix: '/api/users' })
  }

  // Clear module boundaries
  async initialize(): Promise<void> {
    await this.userRepository.initialize()
  }
}

// Main Application
export class Application {
  private modules: Module[] = []

  constructor() {
    this.modules = [
      new UserModule(userService, userController, userRepository),
      new OrderModule(orderService, orderController, orderRepository),
      new InventoryModule(inventoryService, inventoryController, inventoryRepository),
    ]
  }

  async start(): Promise<void> {
    // Initialize all modules
    for (const module of this.modules) {
      await module.initialize()
      module.registerRoutes(this.app)
    }

    await this.app.listen({ port: 3000 })
  }
}
```

## Benefits and Trade-offs

**Benefits:**

- **Simple deployment** - Single artifact to deploy
- **Fast development** - No network overhead between modules
- **Easy debugging** - Single codebase, unified logging
- **ACID transactions** - Full transactional consistency
- **Low operational overhead** - Single database, simple monitoring

**Trade-offs:**

- **Scaling limitations** - Scale entire application, not individual parts
- **Technology lock-in** - Single technology stack
- **Team coordination** - Shared codebase requires coordination
- **Single point of failure** - Entire application affected by failures

## Best Practices

- **Clear module boundaries** - Organize by business domain
- **Dependency injection** - Avoid tight coupling between modules
- **Interface-based design** - Abstract module interactions
- **Testing strategy** - Unit tests per module, integration tests across modules
- **Migration readiness** - Design for potential future extraction

## Migration Path

**To Modular Monolith:**

1. Strengthen module boundaries
2. Extract shared data models
3. Add module-to-module interfaces
4. Implement domain events

**To Microservices:**

1. Start with least coupled module
2. Extract database tables
3. Add API layer
4. Implement service communication

## Related Patterns

- [Modular Monolith](modular-monolith.md) - Next evolution step
- [Microservices](microservices.md) - Distributed alternative
- [Layered Architecture](../architectural-patterns/layer-architecture.md) - Internal organization pattern
