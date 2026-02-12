# Hybrid Architecture

Mixed deployment patterns combining multiple architectural approaches.

## When to Use

- **Complex requirements** - Different parts need different architectures
- **Migration scenarios** - Gradual transition between architectures
- **Performance optimization** - Use best pattern per use case
- **Legacy integration** - Combine new and existing systems

## Architecture Patterns

### Monolith + Microservices

```typescript
// Core monolith with extracted services
system/
├── core-monolith/           # Main business logic
│   ├── user-management/
│   ├── order-processing/
│   └── shared-services/
├── extracted-services/      # Specialized services
│   ├── analytics-service/   # High-scale analytics
│   ├── notification-service/ # Event-driven notifications
│   └── payment-service/     # External integration
└── api-gateway/            # Unified entry point
```

### Serverless + Microservices

```typescript
// Event-driven hybrid
architecture/
├── core-services/          # Stateful services
│   ├── user-service/
│   ├── order-service/
│   └── inventory-service/
├── serverless-functions/   # Event handlers
│   ├── order-notifications/
│   ├── analytics-processors/
│   └── scheduled-tasks/
└── event-backbone/        # Event routing
    ├── event-bridge/
    ├── message-queues/
    └── event-store/
```

## Implementation Example

```typescript
// Hybrid Order Processing
export class HybridOrderSystem {
  constructor(
    private coreOrderService: OrderService, // Monolith
    private analyticsService: AnalyticsService, // Microservice
    private notificationFunction: Function, // Serverless
    private eventBus: EventBus,
  ) {}

  async processOrder(orderData: CreateOrderRequest): Promise<Order> {
    // Core processing in monolith
    const order = await this.coreOrderService.createOrder(orderData)

    // Async analytics in microservice
    await this.analyticsService.recordOrderCreation({
      orderId: order.id,
      customerId: order.customerId,
      total: order.total,
      timestamp: new Date(),
    })

    // Event-driven notifications via serverless
    await this.eventBus.publish('order.created', {
      orderId: order.id,
      customerEmail: order.customerEmail,
      items: order.items,
    })

    return order
  }
}

// Event Router for Hybrid Communication
export class HybridEventRouter {
  constructor(
    private monolithEvents: InternalEventBus,
    private serviceEvents: MessageQueue,
    private serverlessEvents: EventBridge,
  ) {}

  async routeEvent(event: DomainEvent): Promise<void> {
    const { type, data, routing } = event

    // Route to appropriate destination based on event type
    switch (routing.destination) {
      case 'monolith':
        await this.monolithEvents.publish(type, data)
        break

      case 'microservice':
        await this.serviceEvents.sendMessage({
          type,
          data,
          routing: routing.service,
        })
        break

      case 'serverless':
        await this.serverlessEvents.putEvent({
          Source: routing.source,
          DetailType: type,
          Detail: JSON.stringify(data),
        })
        break

      case 'broadcast':
        // Send to all destinations
        await Promise.all([
          this.monolithEvents.publish(type, data),
          this.serviceEvents.sendMessage({ type, data }),
          this.serverlessEvents.putEvent({
            Source: 'hybrid-system',
            DetailType: type,
            Detail: JSON.stringify(data),
          }),
        ])
        break
    }
  }
}
```

## Hybrid Patterns

### Strangler Fig Pattern

```typescript
// Gradual replacement of monolith
export class StranglerFigProxy {
  constructor(
    private legacySystem: LegacyMonolith,
    private newServices: Map<string, MicroService>,
    private routingRules: RoutingRules,
  ) {}

  async handleRequest(request: Request): Promise<Response> {
    const route = this.routingRules.getRoute(request.path)

    if (route.target === 'new-service') {
      const service = this.newServices.get(route.serviceName)
      return await service.handleRequest(request)
    } else {
      return await this.legacySystem.handleRequest(request)
    }
  }

  // Gradually migrate routes
  async migrateRoute(path: string, targetService: string): Promise<void> {
    this.routingRules.updateRoute(path, {
      target: 'new-service',
      serviceName: targetService,
    })
  }
}
```

### Backend for Frontend (BFF)

```typescript
// Different backends for different client needs
export class BFFOrchestrator {
  constructor(
    private coreServices: CoreServices,
    private mobileOptimizedFunctions: ServerlessFunctions,
    private webOptimizedServices: MicroServices,
  ) {}

  // Mobile BFF - Optimized for mobile constraints
  async getMobileUserDashboard(userId: string): Promise<MobileDashboard> {
    // Use serverless for quick, lightweight responses
    const [profile, notifications] = await Promise.all([
      this.mobileOptimizedFunctions.getUserProfile(userId),
      this.mobileOptimizedFunctions.getNotifications(userId),
    ])

    return {
      profile: this.minimizeMobileProfile(profile),
      notifications: notifications.slice(0, 5), // Limit for mobile
      quickActions: this.getMobileQuickActions(profile),
    }
  }

  // Web BFF - Rich data for web application
  async getWebUserDashboard(userId: string): Promise<WebDashboard> {
    // Use microservices for rich data
    const [profile, orders, analytics, recommendations] = await Promise.all([
      this.webOptimizedServices.userService.getDetailedProfile(userId),
      this.webOptimizedServices.orderService.getOrderHistory(userId),
      this.webOptimizedServices.analyticsService.getUserAnalytics(userId),
      this.webOptimizedServices.recommendationService.getRecommendations(userId),
    ])

    return {
      profile,
      orders,
      analytics,
      recommendations,
      fullFeatureSet: true,
    }
  }
}
```

## Benefits and Trade-offs

#### Benefits:

- **Best of both worlds** - Use optimal pattern per use case
- **Gradual migration** - Evolve architecture incrementally
- **Risk mitigation** - Reduce big-bang migration risks
- **Performance optimization** - Optimize each component individually

#### Trade-offs:

- **Increased complexity** - Multiple patterns to understand and maintain
- **Operational overhead** - Different deployment and monitoring strategies
- **Team coordination** - Requires coordination across different architectural styles
- **Data consistency** - Complex consistency requirements across patterns

## Best Practices

- **Clear boundaries** - Define clear ownership and boundaries
- **Consistent communication** - Standardize inter-component communication
- **Unified monitoring** - Single pane of glass for observability
- **Gradual evolution** - Plan migration paths and timelines
- **Documentation** - Document architectural decisions and patterns
- **Team alignment** - Ensure teams understand the hybrid approach

## Migration Strategies

#### Monolith → Hybrid:

1. **Identify extraction candidates** - High-scale or specialized components
2. **Extract gradually** - One service at a time
3. **Maintain compatibility** - Keep existing interfaces working
4. **Add event backbone** - Enable async communication

#### Microservices → Hybrid:

1. **Identify consolidation candidates** - Chatty or related services
2. **Add serverless for events** - Event processing and scheduled tasks
3. **Optimize for use case** - Use best pattern per requirement

## Related Patterns

- [Structured Monolith](structured-monolith.md) - Starting point
- [Microservices](microservices.md) - Target for some components
- [Serverless](serverless.md) - Event-driven components
- [Integration Patterns](../design-patterns/README.md) - Communication strategies
