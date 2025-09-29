# Microservices Architecture

Independent service deployment with distributed system patterns.

## When to Use

- **Team Size**: 8+ developers across multiple teams
- **Complexity**: High business complexity with clear service boundaries
- **Scale Requirements**: Different scaling needs per service
- **Technology Diversity**: Need for different tech stacks per service

## Architecture Pattern

```typescript
// Service Organization
services/
├── user-service/
│   ├── src/
│   ├── database/
│   ├── Dockerfile
│   └── package.json
├── order-service/
│   ├── src/
│   ├── database/
│   ├── Dockerfile
│   └── package.json
├── inventory-service/
├── notification-service/
└── api-gateway/

// Service Independence
- Separate codebases
- Independent databases  
- Individual deployment pipelines
- Service-specific technologies
```

## Implementation Example

```typescript
// API Gateway
export class APIGateway {
  constructor(
    private userService: ServiceProxy,
    private orderService: ServiceProxy,
    private inventoryService: ServiceProxy
  ) {}
  
  async createOrder(orderData: CreateOrderRequest): Promise<OrderResponse> {
    // Orchestrate multiple services
    const user = await this.userService.getUser(orderData.userId)
    const inventory = await this.inventoryService.checkAvailability(orderData.items)
    
    if (!inventory.available) {
      throw new InsufficientInventoryError()
    }
    
    const order = await this.orderService.createOrder({
      ...orderData,
      userEmail: user.email
    })
    
    // Trigger async notifications
    await this.notificationService.sendOrderConfirmation(order.id)
    
    return order
  }
}

// Service Communication
export class ServiceProxy {
  constructor(
    private httpClient: HttpClient,
    private circuitBreaker: CircuitBreaker,
    private serviceDiscovery: ServiceDiscovery
  ) {}
  
  async getUser(userId: string): Promise<User> {
    const serviceUrl = await this.serviceDiscovery.getServiceUrl('user-service')
    
    return await this.circuitBreaker.execute(async () => {
      const response = await this.httpClient.get(`${serviceUrl}/users/${userId}`)
      return response.data
    })
  }
}

// Service Implementation
export class OrderService {
  constructor(
    private orderRepository: OrderRepository,
    private eventPublisher: EventPublisher
  ) {}
  
  async createOrder(orderData: CreateOrderCommand): Promise<Order> {
    const order = await this.orderRepository.save(orderData)
    
    // Publish event for other services
    await this.eventPublisher.publish('order.created', {
      orderId: order.id,
      customerId: order.customerId,
      items: order.items,
      total: order.total
    })
    
    return order
  }
}
```

## Service Communication Patterns

**Synchronous:**
- **HTTP/REST** - Simple request-response
- **gRPC** - High-performance RPC
- **GraphQL** - Flexible query interface

**Asynchronous:**
- **Message Queues** - Reliable async communication
- **Event Streaming** - Real-time event processing
- **Pub/Sub** - Event-driven architecture

## Benefits and Trade-offs

**Benefits:**
- **Independent scaling** - Scale services based on demand
- **Technology diversity** - Choose best tech per service
- **Team autonomy** - Independent development and deployment
- **Fault isolation** - Service failures don't affect entire system
- **Independent deployment** - Deploy services separately

**Trade-offs:**
- **Distributed complexity** - Network latency, failures
- **Data consistency** - Eventual consistency challenges
- **Operational overhead** - Multiple services to monitor
- **Testing complexity** - Integration testing across services
- **Development overhead** - Service discovery, configuration

## Best Practices

- **Database per service** - No shared databases
- **API versioning** - Backward compatible changes
- **Circuit breakers** - Prevent cascade failures
- **Distributed tracing** - Track requests across services
- **Health checks** - Monitor service availability
- **Configuration management** - Centralized config
- **Service mesh** - Infrastructure concerns

## Infrastructure Requirements

**Service Discovery:** Consul, Eureka, Kubernetes DNS
**Load Balancing:** NGINX, HAProxy, Envoy
**Monitoring:** Prometheus, Grafana, Jaeger
**Configuration:** Consul, etcd, Kubernetes ConfigMaps
**Deployment:** Docker, Kubernetes, Docker Swarm

## Migration Strategy

**From Modular Monolith:**
1. **Identify service boundaries** - Start with least coupled modules
2. **Extract database** - Create separate database per service
3. **Add service interface** - HTTP API instead of direct calls
4. **Replace events** - Use message queues instead of internal events
5. **Add infrastructure** - Service discovery, load balancing
6. **Monitor and optimize** - Add observability and performance tuning

## Related Patterns

- [Modular Monolith](deployment-architectures-modular-monolith.md) - Previous evolution step
- [Serverless](deployment-architectures-serverless.md) - Function-based alternative
- [API Gateway](integration-patterns.md) - Service composition pattern
- [Circuit Breaker](scaling-patterns-circuit-breaker.md) - Resilience pattern
