# 🏗️ System Design Practice (Level 2)

Domain-driven design, architectural patterns, and system design principles for scalable software architecture.

## Purpose

Define system design patterns, structural choices, and architectural decisions that ensure scalability, maintainability, and quality.

## Scope

**In Scope:**

- System architecture patterns and design principles
- Repository structure and workspace organization
- Architectural decision records (ADRs)
- Scalability and maintainability patterns
- System integration patterns

**Out of Scope:**

- Infrastructure deployment strategies (see [Infrastructure](.pair/knowledge/guidelines/operations/infrastructure/README.md))
- Specific technology implementations (see [Technical Standards](.pair/knowledge/guidelines/development/technical-standards/README.md))
- Performance optimization techniques (see [Performance](.pair/knowledge/guidelines/quality/performance/README.md))
- Security implementation details (see [Security](.pair/knowledge/guidelines/quality/security/README.md))
- Testing strategies and methodologies (see [Testing](.pair/knowledge/guidelines/development/testing/README.md))

## Level 3 Implementation Guides

### Core Domain Design

- **[Domain-Driven Design](domain-driven-design.md)** - DDD implementation patterns and bounded contexts
- **[Bounded Context Patterns](bounded-context-patterns.md)** - Context mapping and integration strategies
- **[Integration Patterns](integration-patterns.md)** - Service integration and communication patterns

### Architectural Pattern Implementations

- **[Architectural Patterns](architectural-patterns.md)** - Pattern selection framework and decision tree
- **[CRUD Architecture](architectural-patterns-crud.md)** - Simple data operations pattern
- **[Layered Architecture](architectural-patterns-layered.md)** - Traditional enterprise pattern
- **[Hexagonal Architecture](architectural-patterns-hexagonal.md)** - Ports and adapters pattern
- **[Clean Architecture](architectural-patterns-clean.md)** - Dependency inversion pattern
- **[CQRS](architectural-patterns-cqrs.md)** - Command Query Responsibility Segregation
- **[Event Sourcing](architectural-patterns-event-sourcing.md)** - Event-based persistence pattern

### System Scaling and Performance

- **[Scaling Patterns](scaling-patterns.md)** - Scaling strategy framework and decision tree
- **[Database Read Replicas](scaling-patterns-database-read-replicas.md)** - Read-heavy workload optimization
- **[Database Sharding](scaling-patterns-database-sharding.md)** - Large dataset horizontal partitioning
- **[CQRS Scaling](scaling-patterns-cqrs.md)** - Command-query separation for scale
- **[Load Balancing](scaling-patterns-load-balancing.md)** - Traffic distribution strategies
- **[Circuit Breaker](scaling-patterns-circuit-breaker.md)** - Failure resilience patterns
- **[Auto-Scaling](scaling-patterns-auto-scaling.md)** - Dynamic resource adjustment
- **[Multi-Level Caching](scaling-patterns-caching.md)** - Hierarchical caching strategies
- **[Deployment Architectures](deployment-architectures.md)** - Deployment patterns from monolith to microservices
- **[Performance Patterns](performance-patterns.md)** - Performance optimization and monitoring patterns

---

## 📋 Table of Contents

1. [🏗️ Architecture Principles](#️-architecture-principles)

   - [Clear Design](#1-clear-design)
   - [Modular Architecture](#2-modular-architecture)
   - [Quality-First Patterns](#3-quality-first-patterns)

2. [🔧 Architectural Patterns](#-architectural-patterns)

   - [Repository Structure](#repository-structure)
   - [Workspace Organization Principles](#workspace-organization-principles)
   - [Workspace Creation Criteria](#workspace-creation-criteria)
   - [Bounded Context Decision Checklist](#bounded-context-decision-checklist)
   - [Layer Architecture](#layer-architecture)

3. [🎯 Decision Framework](#-decision-framework)

   - [Technology Stack Standards](#technology-stack-standards)
   - [Technology Selection Criteria](#technology-selection-criteria)
   - [Decision Documentation](#decision-documentation)

4. [🔄 Evolution Strategy](#-evolution-strategy)

   - [Continuous Architecture](#continuous-architecture)

5. [📋 Compliance](#-compliance)

6. [🔗 Related Documents](#-related-documents)

---

## 🏗️ Architecture Principles

### 1. Clear Design

- **Context-Aware Architecture**: Design systems with clear context through well-structured code organization
- **Bounded Context Clarity**: Implement Domain-Driven Design principles with clear boundaries
- **Documentation-Driven**: Maintain architectural documentation that is clear and easily interpretable

### 2. Modular Architecture

- **Workspace Structure**: Support monorepo patterns with clear package boundaries
- **Separation of Concerns**: Clear distinction between business logic, presentation, and infrastructure layers
- **Plugin Architecture**: Enable extensibility for different project types and requirements

### 3. Quality-First Patterns

- **Testable Design**: Architecture that supports the testing strategy defined in way-of-working
- **Observable Systems**: Built-in monitoring and logging capabilities
- **Security by Design**: Security considerations integrated at architectural level

---

## 🔧 Architectural Patterns

### Repository Structure

```
project/
├── .pair/                    # AI-specific assets and documentation for consistent code generation and review
├── apps/                     # Deployable applications with human interaction (web, mobile, desktop, console)
├── services/                 # Deployable services with machine interaction (APIs, endpoints, microservices)
├── packages/                 # Cross-project libraries and components (UI components, auth libraries)
├── tools/                    # Development utilities and configurations (linting, scaffolding, scripts)
└── docs/                     # Project documentation
```

### Workspace Organization Principles

- **Apps**: Each app represents a bounded context (DDD) for human-facing deployables
- **Services**: Each service represents a bounded context (DDD) for machine-facing deployables
- **Packages**: Created when capabilities become cross-cutting across multiple bounded contexts
- **Tools**: Created when development utilities become shared across multiple workspaces

### Workspace Creation Criteria

#### Apps & Services (Bounded Contexts)

- **One workspace per bounded context**: Each app or service should represent a single DDD bounded context
- **Human vs Machine Interaction**: Apps for human users, services for API/machine consumers
- **Independent Deployment**: Each workspace should be independently deployable
- **Clear Domain Boundaries**: Well-defined business domain with minimal coupling to other contexts

#### Packages & Tools (Shared Resources)

- **Cross-Cutting Emergence**: Create only when functionality is needed across multiple bounded contexts
- **Validation Required**: Must be validated during user story task breakdown phase
- **Explicit Dependencies**: All external library usage must be defined in task specifications

### Bounded Context Decision Checklist

When creating a new bounded context (app or service), the following decisions must be made and documented in the corresponding **Architecture Decision Record (ADR)**:

#### ✅ Architecture Pattern Selection

- [ ] **DDD + CRUD**: Simple domain with straightforward data operations
- [ ] **DDD + Transaction Script**: Simple business logic with procedural approach
- [ ] **DDD + CQRS**: Complex domain with separate read/write models
- [ ] **DDD + Event Sourcing**: Domain requiring event history and audit trails
- [ ] **Custom Pattern**: Justified deviation with ADR documentation

#### ✅ Data Persistence Strategy

- [ ] **Database Type**: SQL vs NoSQL (with justification)
- [ ] **Database Ownership**: Dedicated database per bounded context
- [ ] **ORM/ODM Choice**: TypeORM, Prisma, Mongoose, or direct drivers
- [ ] **Migration Strategy**: Database versioning and deployment approach

#### ✅ Technology Consistency

- [ ] **TypeScript Version**: Consistent across workspaces (unless justified)
- [ ] **Framework Versions**: Aligned with other workspaces (unless justified)
- [ ] **Tool Versions**: Linting, testing, build tools consistency

#### ✅ Documentation Requirements

- [ ] **ADR Creation**: Architecture Decision Record for key choices
- [ ] **Bounded Context Documentation**: Domain boundaries and responsibilities
- [ ] **API Documentation**: For services exposing endpoints
- [ ] **Integration Points**: Dependencies and external communications

### Layer Architecture

- **Presentation Layer**: UI components, API controllers
- **Application Layer**: Business logic, use cases
- **Infrastructure Layer**: Data access, external services
- **Cross-Cutting**: Logging, security, monitoring

---

## 🎯 Decision Framework

### Technology Stack Standards

#### Core Technologies

- **Language**: TypeScript (consistent across all workspaces)
- **Web Applications**: Next.js
- **Desktop Applications**: Electron
- **Mobile Applications**: React Native
- **API Services**: Fastify

#### Architectural Patterns

- **Domain-Driven Design (DDD)**: Primary approach for bounded context definition
- **CQRS**: Command Query Responsibility Segregation for complex domains
- **Event Sourcing**: For domains requiring event history and audit trails
- **CRUD**: For simple data management scenarios
- **Transaction Script**: For straightforward business logic

#### Pattern Selection Principle

- **Simplicity First**: Choose the simplest pattern that meets the requirements
- **Contextual Selection**: Each bounded context can have different architecture patterns
- **Convergence Preferred**: Align patterns across contexts where possible for consistency
- **Justified Complexity**: Complex patterns (CQRS, Event Sourcing) only when clearly needed

### Technology Selection Criteria

1. **Development Compatibility**: Tools and frameworks that support efficient development
2. **Team Familiarity**: Leverage existing team knowledge and skills
3. **Community Support**: Active community and documentation
4. **Scalability**: Ability to grow with project needs
5. **Maintainability**: Long-term support and evolution

### Decision Documentation

For architectural decisions and documentation patterns, refer to:

- **[Decision Records Practice](.pair/knowledge/guidelines/architecture/decision-records/README.md)** - ADR process, templates, and decision-making frameworks

---

## 🔄 Evolution Strategy

### Continuous Architecture

- **Regular Reviews**: Architecture assessment in sprint planning
- **Refactoring Cycles**: Planned technical debt reduction
- **Pattern Recognition**: Identification of architectural improvements
- **Knowledge Capture**: Document learnings for future projects

---

## 📋 Compliance

This document supports the **Definition of Done** requirements:

- ✅ Architecture decisions documented and reviewed
- ✅ Bounded contexts clearly defined
- ✅ Security considerations addressed
- ✅ Scalability patterns implemented

## 🔗 Related Documents

Core references for implementing architectural decisions:

- **[Code Design Guidelines](.pair/knowledge/guidelines/development/code-design/code-design-guidelines.md)** - _Translates architecture into code patterns_
- **[Technical Guidelines](.pair/knowledge/guidelines/development/technical-standards/technical-guidelines.md)** - _Defines technology stack implementing this architecture_
- **[Infrastructure Guidelines](.pair/knowledge/guidelines/operations/infrastructure/infrastructure-guidelines.md)** - _Deployment strategies for these patterns_
- **[06-definition-of-done.md](.pair/knowledge/guidelines/quality/standards/definition-of-done.md)**
- **[project-management/README.md](.pair/knowledge/guidelines/collaboration/project-management/README.md)**

Supporting documents:

- **[Testing Strategy](.pair/knowledge/guidelines/development/testing/testing-strategy.md)** - _Testing approaches for architectural validation_
- **[Performance Guidelines](.pair/knowledge/guidelines/quality/performance/performance-guidelines.md)** - _Optimization strategies for scalability_
