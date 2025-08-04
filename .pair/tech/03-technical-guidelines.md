# Technical Guidelines

## Purpose

Define comprehensive technical standards including tech stack, tools, frameworks, and integration requirements that support the development process.

## Scope

**In Scope:**

- Tech stack standards and framework selection
- Development tools and environment setup
- Integration requirements with external systems
- Technical standards and conventions
- Tool versioning and compatibility guidelines

**Out of Scope:**

- Business logic implementation details
- Specific coding patterns and design principles
- Infrastructure provisioning and deployment
- Security policies and compliance procedures
- Performance optimization strategies

---

## 📋 Table of Contents

1. [🛠️ Tech Stack Standards](#️-tech-stack-standards)

   - [Core Technologies](#core-technologies)
   - [Framework Selection Criteria](#framework-selection-criteria)

2. [🔧 Development Tools](#-development-tools)

   - [Required Tools](#required-tools)
   - [Recommended Development Tools](#recommended-development-tools)

3. [⚡ Code Standards](#-code-standards)

   - [Coding Conventions](#coding-conventions)
   - [Error Handling](#error-handling)
   - [Versioning Strategy](#versioning-strategy)
   - [Technical Debt Management](#technical-debt-management)
   - [Internationalization & Localization](#internationalization--localization)

4. [📦 Integration Requirements](#-integration-requirements)

   - [External Systems](#external-systems)
   - [Integration Patterns](#integration-patterns)

5. [🔄 API Standards](#-api-standards)

   - [API Design Principles](#api-design-principles)
   - [API Implementation Standards](#api-implementation-standards)

6. [📊 Data Management](#-data-management)

   - [Database Standards](#database-standards)

7. [🌐 External Integrations](#-external-integrations)

   - [Integration Strategy](#integration-strategy)
   - [Standard Integration Types](#standard-integration-types)
   - [External Integration Standards](#external-integration-standards)

8. [🤖 AI-Assisted Development](#-ai-assisted-development)

   - [Documentation Standards](#documentation-standards)
   - [AI Tool Integration](#ai-tool-integration)
   - [MCP Integration](#mcp-integration)
   - [Implementation Requirements](#implementation-requirements)

9. [🔄 Development Workflow](#-development-workflow)

   - [Git Workflow](#git-workflow)
   - [Quality Assurance](#quality-assurance)
   - [Testing Integration](#testing-integration)

10. [🚀 Deployment](#-deployment)

    - [Deployment Strategy](#deployment-strategy)
    - [Technical Integration Points](#technical-integration-points)
    - [Build and Release Standards](#build-and-release-standards)

11. [📋 Compliance](#-compliance)

---

## 🛠️ Tech Stack Standards

### Core Technologies

**Frontend & Full-Stack Framework:**

- **React 18+**: Component-based frontend framework with TypeScript
- **Next.js 14+**: Full-stack React framework for frontend and BFF services
- **shadcn/ui**: Component library built on Radix UI and Tailwind CSS

**Backend for Frontend (BFF):**

- **Next.js API Routes**: Server-side API endpoints for BFF pattern
- **API Mesh & ACL**: Next.js services for API aggregation and access control layer
- **TypeScript**: End-to-end type safety from frontend to BFF

**Bounded Context APIs:**

- **Fastify**: High-performance Node.js framework for domain-specific API services
- **TypeScript**: Type-safe API development with schema validation
- **Plugin Ecosystem**: Fastify plugins for authentication, validation, and middleware
- **Domain-Specific**: Not all Bounded Contexts require exposed APIs

**Data Layer (Polyglot Persistence):**

- **PostgreSQL + Prisma**: Primary database for persistent data with type-safe queries
- **Redis**: Cache layer and non-persistent data storage
- **Type Safety**: End-to-end type safety from database to frontend
- **Bounded Context Strategy**: Database choice per domain context as needed

**Development Foundation:**

- **Package Management**: pnpm workspaces for monorepo structure
- **Build Management**: Turbo (optional) for optimized build orchestration and caching
- **Version Control**: Git with conventional commit messages
- **Documentation**: Markdown for all project documentation
- **Development Tools**: IDE-agnostic setup supporting multiple development environments

### Framework Selection Criteria

1. **Development Support**: Good tooling and development experience
2. **Community Ecosystem**: Active community and extensive documentation
3. **Type Safety**: Strong typing support for better code reliability
4. **Testing Support**: Robust testing ecosystem (see [Testing Strategy](07-testing-strategy_TBR.md))
5. **Performance**: Meets performance requirements defined in [Performance Guidelines](09-performance-guidelines_TBR.md)
6. **Security**: Alignment with [Security Guidelines](10-security-guidelines_TBR.md) standards

---

## 🔧 Development Tools

### Required Tools

- **IDE/Editor**: Developer choice - project maintained IDE-agnostic
  - **Suggested**: VS Code with GitHub Copilot or Cursor for AI-assisted development
  - **Extensions**: React/TypeScript support (ES7+ React/Redux/React-Native snippets, TypeScript Importer)
- **Package Manager**: pnpm (consistent across team)
- **Build Tools**: Turbo (optional) for monorepo build optimization and caching
- **Git**: Version control with conventional commits
- **Linting**: ESLint with React/TypeScript rules, Prettier for formatting
- **Type Checking**: TypeScript compiler with strict mode enabled

### Recommended Development Tools

- **Next.js DevTools**: Built-in development server and debugging
- **React Developer Tools**: Browser extension for React debugging
- **AI-Assisted Development**: GitHub Copilot, Cursor, or similar AI coding assistants
- **TypeScript Support**: IDE-specific TypeScript language server and IntelliSense
- **Tailwind CSS Support**: IDE extensions for shadcn/ui and Tailwind development
- **Static Analysis**: ESLint, TypeScript compiler, and Prettier integration
- **API Testing**: Tools for testing Next.js API routes and external integrations

---

## ⚡ Code Standards

### Coding Conventions

For detailed coding standards, design patterns, and implementation guidelines, refer to:

- **[Code Design Guidelines](02-code-design-guidelines.md)**: Comprehensive code structure, patterns, and quality standards

**Key Standards:**

- **TypeScript**: Strict mode enabled across all projects
- **ESLint**: Consistent linting rules with React/TypeScript configuration
- **Prettier**: Automated code formatting with shared configuration
- **Naming Conventions**: Consistent naming patterns for variables, functions, and components
- **Component Structure**: Standardized React component patterns and organization
- **Import Organization**: Structured import ordering and path resolution

### Error Handling

**Centralized Error Handling:**

- **Frontend**: React Error Boundaries with fallback UI components
- **BFF APIs**: Consistent error response formats with proper HTTP status codes
- **Bounded Context APIs**: Domain-specific error handling with detailed error messages
- **External Integrations**: Circuit breaker patterns and graceful degradation

**Error Response Standards:**

- **Structure**: Consistent error object structure across all APIs
- **Logging**: Comprehensive error logging with context and stack traces
- **User Experience**: User-friendly error messages without exposing system details
- **Recovery**: Clear recovery paths and retry mechanisms where appropriate
- **Security**: Error handling follows [Security Guidelines](10-security-guidelines_TBR.md) to prevent information leakage
- **Monitoring**: Error tracking and alerting via [Observability Guidelines](11-observability-guidelines_TBR.md)

### Versioning Strategy

**Application Versioning:**

- **Semantic Versioning**: Follow semver (MAJOR.MINOR.PATCH) for all packages
- **Monorepo Versioning**: Coordinated versioning across workspace packages
- **Release Strategy**: Automated versioning with conventional commits
- **Changelog**: Automated changelog generation from commit messages

**API Versioning:**

- **URL-based Versioning**: `/api/v1/` pattern for BFF APIs
- **GraphQL Versioning**: Schema evolution strategies for Bounded Context APIs
- **Deprecation Policy**: Clear deprecation timelines and migration paths
- **Backward Compatibility**: Maintain compatibility during version transitions

**Database Versioning:**

- **Prisma Migrations**: Version-controlled database schema changes
- **Migration Strategy**: Safe migration patterns for production deployments
- **Rollback Procedures**: Database rollback strategies for failed deployments

### Technical Debt Management

**Identification:**

- **Code Quality Metrics**: Automated detection of technical debt through static analysis
- **Documentation**: Clear documentation of known technical debt items
- **Prioritization**: Regular assessment and prioritization of technical debt

**Management:**

- **Dedicated Time**: Allocated time in development cycles for technical debt reduction
- **Incremental Fixes**: Break down large technical debt items into manageable tasks
- **Prevention**: Code review processes to prevent accumulation of new technical debt

### Internationalization & Localization

**I18n Strategy:**

- **Framework Integration**: Next.js i18n configuration for multi-language support
- **Content Management**: Structured approach to translatable content
- **Locale Detection**: Automatic locale detection and fallback strategies
- **Route Localization**: Localized routing patterns for different markets

**Implementation Standards:**

- **Type Safety**: TypeScript interfaces for translation keys and locale data
- **Resource Organization**: Consistent organization of translation files
- **Pluralization**: Proper handling of plural forms across different languages
- **Date/Number Formatting**: Locale-aware formatting for dates, numbers, and currencies
- **Testing**: Automated testing for different locales and translation completeness

---

## 📦 Integration Requirements

**Focus**: Internal system integration patterns and data flow between application components.

### External Systems

**Database Strategy:**

- **PostgreSQL + Prisma**: Primary database for persistent data across bounded contexts
- **Redis**: Cache layer, sessions, and temporary data storage
- **Database Selection**: Context-specific database choices based on domain requirements
- **Type Safety**: End-to-end type safety from database queries to frontend components

**Integration Points:**

- **BFF APIs**: Next.js API Routes for frontend-specific aggregation and ACL
- **Bounded Context APIs**: Fastify services for domain-specific business logic
- **APIs Exposed by Bounded Context**: GraphQL/REST APIs with comprehensive documentation
- **Authentication**: Authentication and authorization systems
- **Third-party Services**: Cloud services, payment processors, etc.

### Integration Patterns

- **BFF Pattern**: Next.js API Routes for frontend-specific data aggregation (primarily REST)
- **Domain Services Pattern**: Fastify APIs for Bounded Context business logic (primarily GraphQL)
- **Bounded Context APIs**: Each BC may expose APIs for cross-context communication when needed
- **API Design**: Proper REST semantics or GraphQL based on querying complexity requirements
- **Data Validation**: Input validation at system boundaries
- **Rate Limiting**: Protection against abuse and overuse
- **Circuit Breakers**: Resilience patterns for external dependencies
- **Security Integration**: See [Security Guidelines](10-security-guidelines_TBR.md) for detailed security requirements
- **Infrastructure Integration**: See [Infrastructure Guidelines](04-infrastructure-guidelines_TBR.md) for environment and deployment details

---

## 🔄 API Standards

### API Design Principles

**BFF APIs (Next.js API Routes):**

- **Primary Style**: REST with proper semantic HTTP methods
- **GraphQL**: Only when complex querying capabilities are required
- **Versioning Strategy**: URL-based versioning (e.g., `/api/v1/`)
- **Response Formats**: Consistent JSON structure and error handling

**Bounded Context APIs (Fastify):**

- **Primary Style**: GraphQL for flexible data querying and cross-context communication
- **REST Fallback**: When simple CRUD operations don't require complex queries
- **Documentation**: OpenAPI/Swagger + llms.txt for AI-assisted development
- **Schema Design**: Strongly typed schemas for both REST and GraphQL
- **Optional Implementation**: Not all Bounded Contexts need to expose APIs

**API Documentation Strategy:**

- **OpenAPI/Swagger**: Complete API specification and interactive documentation
- **llms.txt**: AI-readable documentation following https://llmstxt.org standards
- **AI Tool Integration**: llms.txt files referenced in AI development tool rules

### API Implementation Standards

- **Authentication**: Token-based authentication (JWT, OAuth2, API Keys)
- **Rate Limiting**: Request throttling and quota management
- **CORS Configuration**: Cross-origin resource sharing policies
- **Validation**: Request/response validation schemas
- **Documentation Generation**: Automated OpenAPI/Swagger documentation
- **AI-Assisted Development**: llms.txt files for each API following https://llmstxt.org standards
- **Tool Integration**: AI development tools configured to reference llms.txt documentation

---

## 📊 Data Management

### Database Standards

**PostgreSQL + Prisma Standards:**

- **Type Safety**: Prisma Client for fully type-safe database queries
- **Schema Design**: Consistent naming conventions and relational structure
- **Migration Strategy**: Prisma migrations with version control integration
- **Performance**: Optimized queries with Prisma query optimization

**Redis Standards:**

- **Cache Strategy**: Consistent cache key patterns and TTL management
- **Session Management**: Secure session storage and cleanup policies
- **Data Structure**: Appropriate Redis data types for different use cases
- **Connection Management**: Connection pooling and failover strategies

**Polyglot Persistence:**

- **Bounded Context Analysis**: Database selection criteria per domain context
- **Cross-Context Integration**: Data consistency strategies across different databases
- **Backup Procedures**: Context-specific backup and recovery procedures

---

## 🌐 External Integrations

**Focus**: Third-party service integrations, vendor selection, and external API consumption patterns.

### Integration Strategy

**BFF as Integration Layer:**

- **API Mesh Pattern**: Next.js BFF aggregates and transforms external API calls
- **Access Control Layer**: Centralized authentication and authorization for external services
- **Data Transformation**: Consistent data format transformation for frontend consumption
- **Circuit Breaker**: Resilience patterns for external service failures

### Standard Integration Types

**Authentication & Authorization:**

- **Primary Choice**: Auth0 for comprehensive authentication features
- **Cost-Effective Alternatives**: Clerk or Firebase Auth for budget-conscious projects
- **Session Management**: Secure session handling across external auth providers
- **Token Management**: JWT handling and refresh token strategies
- **Decision Requirement**: All authentication choices must be validated with Human and documented in ADR

**Payment Processing:**

- **Standard Providers**: Stripe and PayPal integration through BFF layer
- **Implementation**: All payment integrations via BFF for security and consistency
- **Decision Requirement**: Payment provider selection must be validated with Human and documented in ADR

**Cloud Services:**

- **Primary Options**: AWS or Azure (maintain consistency across project)
- **Cost-Effective Alternative**: Vercel for low-cost requirements
- **Integration Patterns**: Cloud service integration patterns and best practices
- **Decision Requirement**: Cloud platform choice must be validated with Human and documented in ADR

**External APIs & SaaS:**

- **REST/GraphQL**: External service consumption with type safety
- **CRM, Analytics, Communication**: SaaS integrations based on project needs
- **Decision Requirement**: All external integrations must be validated with Human and documented in ADR

### External Integration Standards

- **Human Validation**: All external service selections require Human validation before implementation
- **ADR Documentation**: All integration choices must be documented in Architecture Decision Records (ADR)
- **Type Safety**: TypeScript interfaces for all external API responses
- **Error Handling**: Consistent error handling and fallback strategies
- **Rate Limiting**: Respect external API rate limits and implement backoff strategies
- **Security**: All external integrations follow [Security Guidelines](10-security-guidelines_TBR.md)
- **Monitoring**: Integration health monitoring via [Observability Guidelines](11-observability-guidelines_TBR.md)
- **Cost Monitoring**: Track and monitor costs for all external service integrations

---

## 🤖 AI-Assisted Development

### Documentation Standards

**llms.txt Implementation:**

- **Standard Format**: Follow https://llmstxt.org specification for all API documentation
- **Coverage**: Every Bounded Context API must have corresponding llms.txt documentation
- **Content**: Include API endpoints, data models, business rules, and usage examples
- **Maintenance**: Keep llms.txt files updated with API changes through automated generation

### AI Tool Integration

**Development Workflow:**

- **Tool Configuration**: AI development tools configured to reference llms.txt files
- **Context Sharing**: llms.txt files provide context for AI-assisted code generation
- **Code Quality**: AI tools use documentation to maintain consistency with established patterns
- **Cross-Reference**: llms.txt files reference related Bounded Context documentation

### MCP Integration

For comprehensive Model Context Protocol integration patterns and advanced AI-assisted development workflows, refer to:

- **[MCP Integration Guidelines](12-mcp-integration-guidelines_TBR.md)**: Complete MCP implementation standards and context sharing protocols

### Implementation Requirements

- **Automated Generation**: llms.txt generation integrated into API deployment pipeline
- **Version Control**: llms.txt files versioned alongside API code
- **Accessibility**: Centralized registry of all llms.txt endpoints for tool configuration
- **Validation**: Automated validation of llms.txt format compliance
- **MCP Compliance**: All context sharing follows MCP standards as defined in MCP Integration Guidelines

---

## 🔄 Development Workflow

### Git Workflow

- **Branch Strategy**: Feature branches with PR-based workflow
- **Commit Messages**: Conventional commit format
- **Code Review**: Mandatory PR reviews with peer validation
- **Release Process**: Defined release and deployment procedures

### Quality Assurance

- **Automated Testing**: Unit, integration, and end-to-end tests (see [Testing Strategy](07-testing-strategy_TBR.md))
- **Static Analysis**: Code quality and security scanning
- **Performance Testing**: Load testing and performance monitoring (see [Performance Guidelines](09-performance-guidelines_TBR.md))
- **Documentation Updates**: Keep technical documentation current

### Testing Integration

For comprehensive testing standards, strategies, and implementation details, refer to:

- **[Testing Strategy](07-testing-strategy_TBR.md)**: Complete testing framework and quality assurance standards

---

## 🚀 Deployment

### Deployment Strategy

For detailed deployment strategies, containerization standards, and infrastructure requirements, refer to the comprehensive documentation in:

- **[Infrastructure Guidelines](04-infrastructure-guidelines_TBR.md)**: Complete deployment strategies and environment management

### Technical Integration Points

**Application-Specific Considerations:**

- **Next.js Deployment**: Optimized builds for BFF and frontend components
- **Fastify Deployment**: Container optimization for Bounded Context APIs
- **Database Deployment**: PostgreSQL and Redis deployment configurations
- **Monorepo Strategy**: pnpm workspace-aware deployment for selective service updates
- **Build Optimization**: Turbo (if used) for efficient build caching and parallelization

### Build and Release Standards

- **Type Safety**: Ensure TypeScript compilation passes before deployment
- **Testing Requirements**: All tests pass as defined in [Testing Strategy](07-testing-strategy_TBR.md)
- **Documentation**: llms.txt files generated and accessible post-deployment
- **Security Compliance**: Deployment follows [Security Guidelines](10-security-guidelines_TBR.md)
- **Performance Validation**: Performance criteria met per [Performance Guidelines](09-performance-guidelines_TBR.md)
- **Observability**: Monitoring and logging configured per [Observability Guidelines](11-observability-guidelines_TBR.md)

---

## 📋 Compliance

This document supports the **Definition of Done** requirements:

- ✅ Technical standards documented and followed
- ✅ Integration requirements clearly defined
- ✅ Security practices implemented
- ✅ Development workflow established
- ✅ Quality assurance procedures in place
