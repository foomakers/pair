# 📦 Integration Standards (Level 2)

**Focus**: API design, data management, and external service integration

Define standards for how different parts of the system integrate together, including API design, database patterns, external service integration, and cross-system communication.

## 📚 Integration Standards (Level 3)

### API Standards

- **[API Standards](api-standards.md)** - API design principles and implementation standards
  - BFF APIs (Next.js API Routes) with REST semantics
  - Bounded Context APIs (Fastify) with GraphQL for complex queries
  - API versioning strategy and backward compatibility
  - Response formats, error handling, and documentation standards
  - Authentication, rate limiting, and CORS configuration

### Database Integration

- **[Database Integration](database-integration.md)** - Database standards and data layer patterns
  - PostgreSQL + Prisma standards for type-safe queries
  - Redis standards for cache layer and session management
  - Polyglot persistence strategy for bounded contexts
  - Database migration patterns and version control
  - Cross-context data consistency strategies

### External Services

- **[External Services](external-services.md)** - Third-party service integration patterns and standards
  - BFF as Integration Layer for external API aggregation
  - Authentication providers (Auth0, Clerk, Firebase Auth)
  - Payment processing (Stripe, PayPal) integration standards
  - Cloud services (AWS, Azure, Vercel) integration patterns
  - Human validation requirements for external service choices

### Error Handling

- **[Error Handling](error-handling.md)** - Centralized error handling and resilience patterns
  - Frontend error boundaries and fallback UI components
  - BFF API error response formats and HTTP status codes
  - Bounded Context API error handling and detailed messages
  - Circuit breaker patterns for external dependencies
  - Error logging, monitoring, and recovery strategies

### Internationalization

- **[Internationalization](internationalization.md)** - Multi-language support and localization standards
  - Next.js i18n configuration and multi-language support
  - Content management for translatable content
  - Locale detection and fallback strategies
  - Route localization patterns for different markets
  - Type safety for translation keys and locale data

## 🔗 Related Practices

- **[Tech Stack](.pair/knowledge/guidelines/technical-standards/tech-stack/README.md)** - Technologies that enable these integration patterns
- **[Deployment Workflow](.pair/knowledge/guidelines/technical-standards/deployment-workflow/README.md)** - How integrations are deployed and managed
- **[Framework Patterns](.pair/knowledge/guidelines/code-design/framework-patterns/README.md)** - Implementation patterns for these standards

## 🎯 Quick Start

1. **API Foundation**: Establish [API Standards](api-standards.md) for consistent service communication
2. **Data Layer**: Configure [Database Integration](database-integration.md) patterns for data management
3. **External Connections**: Set up [External Services](external-services.md) integration strategies
4. **Error Management**: Implement [Error Handling](error-handling.md) patterns for resilience
5. **Localization**: Configure [Internationalization](internationalization.md) for global reach

---

_Integration Standards define the "connections" - how different parts of the system communicate and work together effectively._
