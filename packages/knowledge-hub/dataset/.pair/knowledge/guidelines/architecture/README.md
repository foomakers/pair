# 🏗️ Architecture Guidelines (Level 1)

System architecture patterns, bounded contexts, and architectural decision processes for scalable software design.

## 📚 Architecture Practices (Level 2)

### Core Architecture Patterns

- **[Architectural Patterns](architectural-patterns/README.md)** - Core architecture patterns (CRUD, Layered, Hexagonal, Clean, CQRS, Event Sourcing)
- **[Scaling Patterns](scaling-patterns/README.md)** - Horizontal and vertical scaling strategies
- **[Deployment Architectures](deployment-architectures/README.md)** - Deployment patterns and strategies
- **[Performance Patterns](performance-patterns/README.md)** - Performance optimization techniques

### Project-Specific Architecture

- **[Project Constraints](project-constraints/README.md)** - Team size, desktop-only, self-hosting constraints
- **[LLM Integration](llm-integration/README.md)** - RAG, Ollama, Supabase, and AI assistant patterns

### Domain-Driven Design

- **[Domain-Driven Design](domain-driven-design.md)** - DDD principles and implementation
- **[Bounded Context Patterns](bounded-context-patterns.md)** - Context boundary definitions
- **[Event Sourcing](architectural-patterns/event-sourcing.md)** - Event-based persistence patterns
- **[CQRS Pattern](architectural-patterns/cqrs.md)** - Command Query Responsibility Segregation

### System Integration

- **[Integration Patterns](integration-patterns.md)** - Service communication and integration strategies
- **[System Design](system-design/README.md)** - System design patterns and performance optimization

### Decision Records Practice

- **[Decision Records](decision-records/README.md)** - ADR process, templates, and decision-making frameworks
- **[Decision Records](decision-records.md)** - ADR implementation guidance and examples

### Standalone Guides

- **[LLM Integration](llm-integration.md)** - AI/LLM integration patterns overview
- **[Project Constraints](project-constraints.md)** - Constraint-driven architecture decisions

## 🛠️ Level 3: Pattern-Specific Implementations

_Each pattern folder contains specific implementations and detailed guides:_

- **Architectural Patterns**: CRUD, Layered, Hexagonal, Clean, CQRS, Event Sourcing implementations
- **Scaling Patterns**: Database sharding, load balancing, circuit breakers, auto-scaling
- **Deployment Patterns**: Monolith, microservices, serverless, hybrid architectures
- **Performance Patterns**: Caching, database optimization, concurrency, memory management

## 🔗 Related Guidelines

- **[Code Design Guidelines](.pair/knowledge/guidelines/code-design/README.md)** - Code patterns implementing these architectural decisions
- **[Operations Guidelines](.pair/knowledge/guidelines/operations/README.md)** - Infrastructure deployment strategies for these patterns
- **[Quality Guidelines](.pair/knowledge/guidelines/quality/README.md)** - Quality criteria ensuring architectural integrity

## 🎯 Quick Start

1. **Architectural Patterns**: Start with [Architectural Patterns](architectural-patterns/README.md) for core patterns and DDD
2. **Document Decisions**: Use [Decision Records](decision-records/README.md) for ADR process and templates
3. **Validate Architecture**: Ensure alignment with Quality Standards

---

_Assistant Context: Focus on system architecture, bounded contexts, and ADR processes when discussing architectural decisions._
