# System Integration Patterns

Comprehensive guide for system integration patterns, communication strategies, and inter-service connectivity.

## Purpose

Define standardized patterns for system integration, service communication, and data exchange between bounded contexts and external systems.

## Integration Strategies

### Synchronous Integration

**REST APIs**
- Request-response communication
- Immediate consistency
- Direct coupling between services
- Best for real-time requirements

**GraphQL APIs**
- Flexible query language
- Single endpoint for multiple data sources
- Client-driven data fetching
- Best for frontend-driven applications

### Asynchronous Integration

**Event-Driven Architecture**
- Loose coupling between services
- Eventual consistency
- Scalable and resilient
- Best for high-volume, distributed systems

**Message Queues**
- Reliable message delivery
- Load balancing and scaling
- Error handling and retry mechanisms
- Best for background processing

## Communication Patterns

### API Design Patterns

```typescript
// RESTful Resource Design
GET    /api/users          // List users
GET    /api/users/{id}     // Get specific user
POST   /api/users          // Create user
PUT    /api/users/{id}     // Update user
DELETE /api/users/{id}     // Delete user
```

### Event Patterns

```typescript
// Domain Event Structure
interface DomainEvent {
  id: string
  type: string
  aggregateId: string
  aggregateType: string
  version: number
  timestamp: Date
  data: any
  metadata?: Record<string, any>
}

// Example: User Registration Event
interface UserRegisteredEvent extends DomainEvent {
  type: 'user.registered'
  data: {
    userId: string
    email: string
    registrationDate: Date
  }
}
```

## Data Consistency Patterns

### Eventual Consistency

- **Event Sourcing**: Store events, rebuild state
- **Saga Pattern**: Distributed transactions
- **CQRS**: Separate read/write models
- **Event Streaming**: Real-time data pipelines

### Strong Consistency

- **Two-Phase Commit**: Distributed transactions
- **Database Transactions**: ACID properties
- **Synchronous APIs**: Immediate consistency
- **Shared Database**: Single source of truth (discouraged)

## External Integration

### Third-Party Services

- **API Gateways**: Centralized external API management
- **Circuit Breakers**: Fault tolerance and resilience
- **Rate Limiting**: API usage control
- **Authentication**: Secure service communication

### Data Exchange

- **ETL Processes**: Extract, Transform, Load
- **Batch Processing**: Scheduled data synchronization
- **Real-time Streaming**: Continuous data flow
- **File-based Exchange**: Structured data formats

## Related Documents

- **[System Design README](README.md)** - Overall system design principles
- **[Bounded Context Patterns](bounded-context-patterns.md)** - Context boundary implementation
- **[Infrastructure Guidelines](.pair/knowledge/guidelines/operations/infrastructure/README.md)** - Infrastructure integration patterns
