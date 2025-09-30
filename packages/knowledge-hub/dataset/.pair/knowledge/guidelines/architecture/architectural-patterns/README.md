# Architectural Patterns

Comprehensive guide for selecting and implementing various architectural patterns based on domain complexity and business requirements.

## Available Architectural Patterns

- **[CRUD Architecture](crud.md)** - Simple data operations and basic business logic
- **[Layered Architecture](layered.md)** - Traditional separation of concerns through layers
- **[Hexagonal Architecture](hexagonal.md)** - Ports and adapters for clean boundaries
- **[Clean Architecture](clean.md)** - Complete dependency inversion approach (autocontained)
- **[CQRS Pattern](cqrs.md)** - Command Query Responsibility Segregation
- **[Event Sourcing Pattern](event-sourcing.md)** - Event-based persistence and state management

## Pattern Selection Framework

### Pattern Complexity Matrix

```
Simple Domain     → CRUD/Transaction Script
Moderate Domain   → Layered/Hexagonal Architecture
Complex Domain    → Clean Architecture + DDD
Event-Heavy       → Event Sourcing + CQRS
High-Scale        → Microservices + Event-Driven
```

### Decision Tree

```
Start: What's your domain complexity?
│
├── Simple (CRUD operations, minimal business logic)
│   └── → [CRUD Architecture](crud.md)
│
├── Moderate (Some business rules, clear boundaries)
│   ├── Traditional approach → [Layered Architecture](layered.md)
│   └── Dependency inversion → [Hexagonal Architecture](hexagonal.md)
│
├── Complex (Rich domain model, complex business rules)
│   └── → [Clean Architecture](clean.md)
│
├── Event-Heavy (Event-driven workflows, audit trails)
│   ├── Read/Write separation → [CQRS](cqrs.md)
│   └── Event history required → [Event Sourcing](event-sourcing.md)
│
└── High-Scale (Multiple contexts, distributed)
    └── → Combine patterns (see deployment architectures)
```

## Pattern Comparison

| Pattern            | Complexity | Learning Curve | Scalability | Flexibility | Use Case                |
| ------------------ | ---------- | -------------- | ----------- | ----------- | ----------------------- |
| **CRUD**           | Low        | Low            | Limited     | Low         | Simple apps, prototypes |
| **Layered**        | Medium     | Medium         | Good        | Medium      | Enterprise apps         |
| **Hexagonal**      | Medium     | Medium         | Good        | High        | Testable systems        |
| **Clean**          | High       | High           | Excellent   | High        | Complex domains         |
| **CQRS**           | High       | High           | Excellent   | Medium      | Read/write separation   |
| **Event Sourcing** | Very High  | Very High      | Excellent   | High        | Audit trails, replay    |

## Trade-offs Analysis

### Development Speed vs. Long-term Maintainability

```
Fast Development     →     Long-term Maintainability
     CRUD    →    Layered    →    Hexagonal    →    Clean
```

### Complexity vs. Benefits

```
Low Complexity/Benefits  →  High Complexity/Benefits
    CRUD → Layered → Hexagonal → Clean → CQRS → Event Sourcing
```

## Implementation Guidelines

### General Principles

1. **Start Simple**: Begin with the simplest pattern that meets requirements
2. **Evolve Gradually**: Refactor to more complex patterns as needs grow
3. **Test First**: All patterns must support the testing strategy
4. **Document Decisions**: Create ADRs for pattern choices

### Pattern Selection Criteria

**Choose CRUD when:**

- Simple CRUD operations dominate
- Minimal business logic
- Fast development required
- Small team or prototype

**Choose Layered when:**

- Traditional enterprise application
- Clear layer responsibilities
- Team familiar with pattern
- Moderate complexity

**Choose Hexagonal when:**

- High testability required
- Multiple adapters needed
- Dependency inversion important
- External integrations complex

**Choose Clean when:**

- Complex business rules
- Domain expertise critical
- Long-term maintainability
- Team experienced with DDD

**Choose CQRS when:**

- Different read/write models
- Performance optimization needed
- Separate query optimization
- Event-driven architecture

**Choose Event Sourcing when:**

- Audit trail required
- Event replay needed
- Temporal queries important
- High data integrity needs

## Anti-Patterns to Avoid

### Over-Engineering

- Using complex patterns for simple domains
- Premature optimization
- Architecture astronaut syndrome

### Under-Engineering

- Using CRUD for complex domains
- Ignoring future scalability needs
- No separation of concerns

### Pattern Mixing Without Strategy

- Combining patterns inconsistently
- No clear boundaries between patterns
- Inconsistent abstraction levels

## Related Patterns

- **[Domain-Driven Design](.pair/knowledge/guidelines/architecture/domain-driven-design.md)** - Domain modeling approach
- **[Bounded Context Patterns](.pair/knowledge/guidelines/architecture/bounded-context-patterns.md)** - Context boundaries
- **[Integration Patterns](.pair/knowledge/guidelines/architecture/integration-patterns.md)** - Service integration
- **[Scaling Patterns](.pair/knowledge/guidelines/architecture/scaling-patterns/README.md)** - Performance and scaling
- **[Deployment Architectures](.pair/knowledge/guidelines/architecture/deployment-architectures/README.md)** - Deployment strategies

## Implementation Guides

Each pattern has detailed implementation guidance with code examples:

- **[CRUD Architecture](crud.md)** - Simple data operations pattern
- **[Layered Architecture](layered.md)** - Traditional enterprise pattern
- **[Hexagonal Architecture](hexagonal.md)** - Ports and adapters pattern
- **[Clean Architecture](clean.md)** - Dependency inversion pattern
- **[CQRS](cqrs.md)** - Command Query Responsibility Segregation
- **[Event Sourcing](event-sourcing.md)** - Event-based persistence pattern
