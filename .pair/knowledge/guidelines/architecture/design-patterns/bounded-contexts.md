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

- **Linguistic Boundaries**: Where terminology changes meaning or different words mean the same thing
- **Organizational Boundaries**: Team and department structures that naturally separate concerns
- **Technical Boundaries**: Different technology stacks, data requirements, or performance needs
- **Workflow Boundaries**: End-to-end business processes that operate independently
- **Data Ownership**: Clear boundaries where different entities or aggregates belong to specific contexts

## Implementation Strategies

### Monolith with Bounded Contexts

```text
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

```text
services/
├── user-service/        # User Management Context
├── order-service/       # Order Processing Context
├── inventory-service/   # Inventory Context
└── billing-service/     # Billing Context
```

## Context Relationships

### Upstream and Downstream Dependencies

- **Upstream Context**: Provides data/services to other contexts, free to evolve but changes impact downstream
- **Downstream Context**: Consumes data/services from upstream contexts, restricted by dependencies
- **Bidirectional**: Contexts can be both upstream and downstream depending on the relationship

### Relationship Documentation

```text
Context A ----> Context B    (A is upstream, B is downstream)
Context C <---> Context D    (Bidirectional dependency)
```

## Integration Patterns

### Context Communication

- **Partnership**: Both teams cooperate and coordinate interface evolution
- **Shared Kernel**: Common codebase shared between contexts (keep minimal)
- **Customer-Supplier**: Formal upstream-downstream relationship with negotiated interfaces
- **Conformist**: Downstream context conforms to upstream model without negotiation
- **Anticorruption Layer**: Downstream context protects itself with translation layer
- **Open Host Service**: Well-defined services with stable protocols for multiple consumers
- **Published Language**: Documented exchange format (XML, JSON schemas) for integration
- **Separate Ways**: No integration - contexts operate independently

### Data Consistency

- **Eventual Consistency**: Asynchronous data synchronization between contexts
- **Saga Pattern**: Distributed transaction management across context boundaries
- **Event Sourcing**: Event-based state management within contexts
- **CQRS**: Separate read and write models, often used with event sourcing

## Context Maps

### Creating Context Maps

A context map documents:

- Context boundaries and names
- Integration patterns between contexts
- Upstream/downstream relationships
- Data flow and dependencies
- Team responsibilities

### Example Context Map Structure

```text
┌─────────────────┐    Partnership    ┌─────────────────┐
│   User Context  │ ←─────────────→   │  Order Context  │
└─────────────────┘                   └─────────────────┘
        │                                      │
        │ Customer-Supplier                   │ ACL
        ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│ Identity Context│                   │Inventory Context│
└─────────────────┘                   └─────────────────┘
```

## Ubiquitous Language

### Context-Specific Language

- Each bounded context has its own dialect of the ubiquitous language
- Same terms may mean different things in different contexts
- Context boundaries help prevent language conflicts
- Translation between contexts happens at integration points

## Related Documents

- **[Strategic Subdomain Definition](strategic-subdomain-definition.md)** - Subdomain identification and classification before context definition
- **[System Design README](README.md)** - Overall system design principles
- **[Domain-Driven Design](domain-driven-design.md)** - DDD implementation details
- **[Integration Patterns](integration-patterns.md)** - System integration strategies
