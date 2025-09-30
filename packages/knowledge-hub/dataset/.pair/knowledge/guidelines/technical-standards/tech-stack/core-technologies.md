# 🛠️ Core Technologies

**Focus**: Fundamental technology stack decisions and architectural choices

Define the complete technology stack that forms the foundation of development, covering frontend, backend, data layer, and development tools.

## 🎯 Frontend & Full-Stack Framework

### React 18+ and Next.js 14+

- **React 18+**: Component-based frontend framework with TypeScript

  - Modern React patterns with hooks and functional components
  - TypeScript integration for type safety across components
  - Performance optimization with concurrent features
  - Component composition and reusability patterns

- **Next.js 14+**: Full-stack React framework for frontend and BFF services

  - App Router for modern routing and layout patterns
  - Server-side rendering (SSR) and static site generation (SSG)
  - API Routes for Backend for Frontend (BFF) pattern
  - Built-in optimization for performance and SEO

- **shadcn/ui**: Component library built on Radix UI and Tailwind CSS
  - Accessible components following WCAG guidelines
  - Customizable design system with Tailwind CSS
  - Copy-paste component approach for flexibility
  - TypeScript-first component definitions

## 🔧 Backend for Frontend (BFF)

### Next.js API Routes

- **Server-side API endpoints**: Next.js API Routes for BFF pattern

  - RESTful API design with proper HTTP semantics
  - TypeScript end-to-end type safety from frontend to BFF
  - Request/response validation with schema libraries
  - Middleware integration for authentication and logging

- **API Mesh & ACL**: Next.js services for API aggregation and access control layer
  - External API aggregation and data transformation
  - Access control layer for security and authorization
  - Rate limiting and request throttling
  - Circuit breaker patterns for external service resilience

## ⚡ Bounded Context APIs

### Fastify Framework

- **Fastify**: High-performance Node.js framework for domain-specific API services

  - High-performance HTTP server with schema validation
  - Plugin ecosystem for authentication, validation, and middleware
  - TypeScript-first development with comprehensive type safety
  - Async/await patterns for modern JavaScript development

- **Domain-Specific Design**: Not all Bounded Contexts require exposed APIs
  - GraphQL APIs for complex querying capabilities
  - REST APIs for simple CRUD operations
  - Event-driven communication between bounded contexts
  - Optional API exposure based on domain requirements

## 🗄️ Data Layer (Polyglot Persistence)

### PostgreSQL + Prisma

- **PostgreSQL**: Primary database for persistent data with ACID compliance

  - Relational database with strong consistency guarantees
  - Advanced features like JSON columns and full-text search
  - Scalability through read replicas and partitioning
  - Battle-tested reliability for production workloads

- **Prisma**: Type-safe database queries and migrations
  - End-to-end type safety from database to frontend
  - Database-first or schema-first development approaches
  - Automated migration generation and version control
  - Query optimization and performance monitoring

### Redis

- **Cache layer**: High-performance caching and session storage
  - In-memory data structure store for fast data access
  - Session management and temporary data storage
  - Pub/sub messaging for real-time features
  - Cache invalidation strategies and TTL management

### Bounded Context Strategy

- **Database choice per domain context**: Polyglot persistence based on requirements
  - PostgreSQL for transactional data requiring consistency
  - Redis for caching and real-time data requirements
  - Document databases for schema-flexible data (when needed)
  - Time-series databases for analytics and metrics (when needed)

## 🛠️ Development Foundation

### Package Management

- **pnpm workspaces**: Monorepo structure with efficient dependency management
  - Fast, disk space efficient package manager
  - Workspace support for monorepo development
  - Strict dependency resolution and peer dependency handling
  - Lock file consistency across development team

### Build Management

- **Turbo (optional)**: Optimized build orchestration and caching
  - Build pipeline optimization with intelligent caching
  - Parallel task execution across workspace packages
  - Remote caching for team efficiency
  - Task dependency management and scheduling

### Version Control

- **Git**: Version control with conventional commit messages
  - Feature branch workflow with pull request reviews
  - Conventional commits for automated changelog generation
  - Semantic versioning integration with release automation
  - Pre-commit hooks for code quality enforcement

### Documentation

- **Markdown**: All project documentation in Markdown format
  - Technical documentation with consistent formatting
  - README files for package and feature documentation
  - Architecture Decision Records (ADR) in Markdown
  - API documentation with OpenAPI and llms.txt

### Development Tools

- **IDE-agnostic setup**: Supporting multiple development environments
  - VS Code with GitHub Copilot for AI-assisted development
  - Cursor for enhanced AI development workflows
  - IDE configuration sharing through workspace settings
  - Extension recommendations for consistent development experience

## 🎯 Technology Integration Patterns

### Type Safety End-to-End

```typescript
// Database schema (Prisma)
model User {
  id    String @id @default(cuid())
  email String @unique
  name  String
}

// API response type (auto-generated from Prisma)
type UserResponse = {
  id: string;
  email: string;
  name: string;
};

// React component props (typed from API)
type UserCardProps = {
  user: UserResponse;
  onEdit: (user: UserResponse) => void;
};
```

### Development Workflow Integration

- **Local Development**: All services runnable locally with Docker
- **Type Generation**: Automated type generation from database to frontend
- **Testing Integration**: Testing frameworks aligned with technology choices
- **Deployment Pipeline**: Technology-specific optimization for each layer

## 🔗 Related Standards

- **[Framework Selection](framework-selection.md)** - Criteria used to select these technologies
- **[Frontend Stack](frontend-stack.md)** - Frontend-specific implementation patterns
- **[Backend Stack](backend-stack.md)** - Backend-specific architecture patterns
- **[TypeScript Standards](typescript-standards.md)** - TypeScript configuration for these technologies

---

_Core Technologies define the foundation that enables type-safe, scalable, and maintainable full-stack development._
