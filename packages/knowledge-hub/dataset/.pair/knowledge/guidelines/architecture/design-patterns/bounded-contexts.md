# Bounded Context Patterns and Implementation

Guidelines for defining, implementing, and managing bounded contexts in domain-driven architectures.

## Purpose

Provide practical guidance for identifying, designing, and implementing bounded contexts with clear boundaries and integration patterns.

## Context Identification

### Bounded Context Criteria

- **Business Capability**: Each context represents a distinct business capability
- **Data Ownership**: Clear data ownership and responsibility
- **Team Alignment**: Context boundaries align with team structure
- **Language Boundaries**: Different terminology and concepts

### Context Boundaries

- **Linguistic Boundaries**: Where terminology changes meaning
- **Organizational Boundaries**: Team and department structures  
- **Technical Boundaries**: Different technology or data requirements
- **Workflow Boundaries**: End-to-end business processes

## Implementation Strategies

### Monolith with Bounded Contexts

```
monolith/
├── contexts/
│   ├── user-management/
│   ├── order-processing/
│   ├── inventory/
│   └── billing/
└── shared/
    ├── kernel/
    └── infrastructure/
```

### Microservices with Bounded Contexts

```
services/
├── user-service/        # User Management Context
├── order-service/       # Order Processing Context  
├── inventory-service/   # Inventory Context
└── billing-service/     # Billing Context
```

## Integration Patterns

### Context Communication

- **API Integration**: RESTful APIs between contexts
- **Event-Driven**: Asynchronous event communication
- **Database Integration**: Shared database (discouraged)
- **File Transfer**: Batch data exchange

### Data Consistency

- **Eventual Consistency**: Asynchronous data synchronization
- **Saga Pattern**: Distributed transaction management
- **Event Sourcing**: Event-based state management
- **CQRS**: Separate read and write models

## Related Documents

- **[System Design README](README.md)** - Overall system design principles
- **[Domain-Driven Design](domain-driven-design.md)** - DDD implementation details
- **[Integration Patterns](integration-patterns.md)** - System integration strategies
