# Architectural Guidelines

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

- Infrastructure deployment strategies
- Specific technology implementations
- Performance optimization techniques
- Security implementation details
- Testing strategies and methodologies

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
   - [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)

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

### Architecture Decision Records (ADRs)

**General ADR Guidelines:**

- Document significant architectural decisions
- Include context, options considered, and rationale
- Review decisions regularly in sprint retrospectives
- Maintain decisions in `/tech/adr/` directory

**Generic ADR Template:**

```markdown
# ADR-XXX: [Decision Title]

## Status

[Proposed | Accepted | Deprecated | Superseded]

## Context

- Business requirement or technical challenge
- Current system state and limitations
- Stakeholders and their concerns

## Decision

- Chosen solution and justification
- Implementation approach
- Impact on existing system

## Consequences

- Benefits of the decision
- Trade-offs and limitations
- Implementation requirements
- Long-term implications
```

**Infrastructure-Specific ADRs:**

For infrastructure and technology decisions, use the specialized process and checklist defined in [Infrastructure Guidelines](04-infrastructure-guidelines.md#technology-integration-process), which includes:

- Infrastructure-specific ADR considerations
- Service addition workflow
- Local development integration requirements
- Environment configuration impact
- Technology extension checklist

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

- **[Code Design Guidelines](02-code-design-guidelines.md)** - _Translates architecture into code patterns_
- **[Technical Guidelines](03-technical-guidelines.md)** - _Defines technology stack implementing this architecture_
- **[Infrastructure Guidelines](04-infrastructure-guidelines.md)** - _Deployment strategies for these patterns_
- **[06-definition-of-done.md](06-definition-of-done.md)**
- **[12-collaboration-and-process-guidelines/README.md](12-collaboration-and-process-guidelines/README.md)**

Supporting documents:

- **[Testing Strategy](07-testing-strategy.md)** - _Testing approaches for architectural validation_
- **[Performance Guidelines](09-performance-guidelines.md)** - _Optimization strategies for scalability_
