# Testing Strategy

## Purpose

Define comprehensive testing approach that ensures code quality, reliability, and maintainability throughout the development lifecycle, aligned with project architecture and [Definition of Done](06-definition-of-done.md).

## Scope

**In Scope:**

- Testing methodologies and strategic approaches
- Test automation frameworks and integration patterns
- Code coverage requirements and quality standards
- Testing pyramid implementation and distribution strategy
- Quality assurance processes and development workflow integration
- Testing patterns for architectural components and domain boundaries
- Performance testing integration within testing strategy
- End-to-end testing implementation guidelines and best practices
- Usability testing methodologies and user acceptance testing procedures

**Out of Scope:**

- Production monitoring and alerting (see [Observability Guidelines](11-observability-guidelines.md))
- UX design principles and component guidelines (see [UX Guidelines](05-ux-guidelines.md))
- Detailed performance optimization strategies (see [Performance Guidelines](09-performance-guidelines.md))
- Comprehensive security testing methodologies (see [Security Guidelines](10-security-guidelines.md))
- Manual testing workflows and documentation
- Detailed tool configurations (see [Technical Guidelines](03-technical-guidelines.md))

---

## 📋 Table of Contents

1. [🔬 Testing Philosophy](#-testing-philosophy)

   - [Enhanced Testing](#enhanced-testing)
   - [Test-Driven Development (TDD)](#test-driven-development-tdd)

2. [🏗️ Test Pyramid Strategy](#️-test-pyramid-strategy)

   - [Unit Tests (70%)](#unit-tests-70)
   - [Integration Tests (20%)](#integration-tests-20)
   - [End-to-End Tests (10%)](#end-to-end-tests-10)

3. [🎯 Testing Types and Coverage](#-testing-types-and-coverage)

   - [Functional Testing](#functional-testing)
   - [Non-Functional Testing](#non-functional-testing)
   - [Specialized Testing](#specialized-testing)

4. [🛠️ Testing Tools and Framework](#️-testing-tools-and-framework)

   - [Framework Integration with Project Architecture](#framework-integration-with-project-architecture)
   - [Test Framework Selection Criteria](#test-framework-selection-criteria)

5. [🏗️ Architecture-Specific Testing](#️-architecture-specific-testing)

   - [Next.js BFF Testing Patterns](#nextjs-bff-testing-patterns)
   - [Fastify Bounded Context Testing](#fastify-bounded-context-testing)
   - [Cross-Service Integration Testing](#cross-service-integration-testing)
   - [Database Layer Testing](#database-layer-testing)

6. [📊 Coverage Requirements](#-coverage-requirements)

   - [Minimum Coverage Targets](#minimum-coverage-targets)
   - [Coverage Quality Metrics](#coverage-quality-metrics)

7. [🔄 Testing in Development Workflow](#-testing-in-development-workflow)

   - [Development Phase Testing](#development-phase-testing)
   - [Code Review Testing](#code-review-testing)
   - [CI/CD Pipeline Testing](#cicd-pipeline-testing)

8. [🔧 Modern Testing Integration](#-modern-testing-integration)

   - [Tool-Generated Tests](#tool-generated-tests)
   - [Tool-Assisted Test Maintenance](#tool-assisted-test-maintenance)

9. [📋 Test Quality Gates](#-test-quality-gates)

   - [Pre-Development](#pre-development)
   - [During Development](#during-development)
   - [Pre-Merge](#pre-merge)
   - [Post-Deployment](#post-deployment)

10. [🩺 Observability Integration](#-observability-integration)

11. [📈 Continuous Improvement](#-continuous-improvement)

    - [Testing Metrics](#testing-metrics)
    - [Regular Reviews](#regular-reviews)

12. [🧪 Testing Standards](#-testing-standards)

    - [Test Framework Configuration](#test-framework-configuration)
    - [Unit Testing Patterns](#unit-testing-patterns)
    - [Test Fixtures and Data Builders](#test-fixtures-and-data-builders)
    - [React Component Testing](#react-component-testing)
    - [Integration Testing for APIs](#integration-testing-for-apis)
    - [Test Organization](#test-organization)
    - [Testing Philosophy](#testing-philosophy)

13. [🌐 End-to-End Testing Implementation](#-end-to-end-testing-implementation)

    - [E2E Testing Strategy](#e2e-testing-strategy)
    - [Project Setup and Architecture](#project-setup-and-architecture)
    - [Test Environment Management](#test-environment-management)
    - [User Journey Testing Patterns](#user-journey-testing-patterns)
    - [Cross-Service Integration Testing](#cross-service-integration-testing-patterns)
    - [E2E CI/CD Integration](#e2e-cicd-integration)

14. [👥 Usability Testing & User Acceptance](#-usability-testing--user-acceptance)

    - [Testing Methodology](#testing-methodology)
    - [Coordination with Testing Strategy](#coordination-with-testing-strategy)
    - [Frequency & Timing Alignment](#frequency--timing-alignment)
    - [User Recruitment & Sample Size Guidelines](#user-recruitment--sample-size-guidelines)
    - [Budget Considerations](#budget-considerations)
    - [Usability Validation Criteria](#usability-validation-criteria)

---

## 🔬 Testing Philosophy

### Enhanced Testing

- **Test Generation**: Leverage modern tools to generate comprehensive test cases
- **Test Maintenance**: Tool-assisted test updates when code changes
- **Coverage Analysis**: Intelligent identification of untested code paths
- **Quality Assurance**: Automated test quality assessment and improvement suggestions

### Test-Driven Development (TDD)

- **Red-Green-Refactor**: Write failing tests first, implement, then refactor
- **Specification by Example**: Use tests as living documentation
- **Continuous Validation**: Tests run continuously during development
- **Design Driver**: Let tests guide implementation design

---

## 🏗️ Test Pyramid Strategy

### Unit Tests (70%)

**Purpose**: Test individual functions, methods, and classes in isolation

**Characteristics**:

- Fast execution (< 1ms per test)
- Isolated and independent
- High code coverage target (80%+)
- Mock external dependencies

**Tool Assistance**: 🔧

- Auto-generate unit tests from function signatures
- Suggest edge cases and boundary conditions
- Maintain test quality and coverage

### Framework Selection Criteria

1. **Development Tool Compatibility**: Good support from modern development tools
2. **Language Ecosystem**: Native support for project language
3. **Assertion Library**: Rich assertion capabilities
4. **Mocking Support**: Comprehensive mocking and stubbing
5. **Reporting**: Clear test results and coverage reporting

**Example Scenarios**:

- Pure function behavior validation
- Class method functionality
- Error handling and edge cases
- Data transformation logic

### Integration Tests (20%)

**Purpose**: Test component interactions and system integration points

**Characteristics**:

- Medium execution time (< 100ms per test)
- Test real component interactions
- Database and API integration testing
- In-memory test databases where possible

**Tool Assistance**: �

- Generate integration test scenarios
- Identify integration points needing coverage
- Suggest test data and setup patterns

**Example Scenarios**:

- API endpoint testing
- Database operation validation
- Service-to-service communication
- Configuration and environment testing

### End-to-End Tests (10%)

**Purpose**: Test complete user workflows and system behavior

**Characteristics**:

- Slower execution (1-10 seconds per test)
- Test critical user journeys
- Full system stack involvement
- Real browser/environment simulation

**Tool Assistance**:

- Suggest critical user path coverage
- Generate test scenarios from user stories
- Maintain test scripts when UI changes

**Example Scenarios**:

- Complete user workflows
- Cross-browser compatibility
- Performance under load
- Security vulnerability testing

---

## 🎯 Testing Types and Coverage

### Functional Testing

- **Happy Path Testing**: Standard use case validation
- **Error Path Testing**: Exception and error condition handling
- **Boundary Testing**: Edge cases and limit validation
- **Regression Testing**: Ensure existing functionality remains intact

### Non-Functional Testing

- **Performance Testing**: Response time validation and load testing integration (detailed optimization in [Performance Guidelines](09-performance-guidelines.md))
- **Security Testing**: Basic vulnerability checks (comprehensive testing in [Security Guidelines](10-security-guidelines.md))
- **Accessibility Testing**: WCAG compliance validation (detailed standards in [Accessibility Guidelines](08-accessibility-guidelines.md))

**Accessibility Testing Implementation:**

For comprehensive accessibility testing patterns and examples, see [Accessibility Guidelines](08-accessibility-guidelines.md) which provides:

- **React Testing Library Integration**: Complete axe-core integration examples for component testing
- **Playwright Automation**: End-to-end accessibility testing patterns with axe-core
- **Component-Level Testing**: Accessibility validation patterns for React components
- **CI/CD Integration**: Lighthouse accessibility score validation in automated pipelines
- **Testing Strategy Integration**: Accessibility testing across all levels of the test pyramid

- **Compatibility Testing**: Cross-platform and browser testing

#### Performance Testing Integration

**Unit Level Performance Testing:**

- Benchmark critical algorithms and data processing functions
- Memory usage validation for data-intensive operations
- Execution time assertions for performance-critical code paths

**Integration Level Performance Testing:**

- API response time validation (< 200ms for critical endpoints)
- Database query performance testing
- External service integration timeout and retry testing

**End-to-End Performance Testing:**

- Page load time validation (< 3s for critical user flows)
- Core Web Vitals measurement (LCP, FID, CLS)
- Performance regression detection in CI/CD pipeline

### Specialized Testing

- **API Testing**: RESTful service validation and contract testing
- **Database Testing**: Data integrity and query performance
- **UI Testing**: Component behavior and user interaction with usability testing methodologies defined in this document
- **Mobile Testing**: Responsive design and mobile-specific functionality

---

## 🛠️ Testing Tools and Framework

### Framework Integration with Project Architecture

**Frontend & BFF Testing (Next.js):**

- **Vitest**: Unit and integration testing (configured per [Technical Guidelines](03-technical-guidelines.md))
- **React Testing Library**: Component testing for React components
- **Next.js Test Utils**: API route and middleware testing

**Bounded Context API Testing (Fastify):**

- **Vitest**: Unit testing for domain logic
- **Fastify Testing**: Integration testing with `app.inject()`
- **Supertest**: Alternative for HTTP endpoint testing

**Database Testing:**

- **Prisma Test Client**: Type-safe database testing
- **Redis Mock**: In-memory Redis testing for cache layer

**E2E Testing:**

- **Playwright**: Cross-browser testing (configured per [Technical Guidelines](03-technical-guidelines.md))
- **Separate E2E Project**: Isolated test environment

### Test Framework Selection Criteria

For detailed tool selection and configuration, see [Technical Guidelines](03-technical-guidelines.md).

1. **Project Architecture Compatibility**: Supports Next.js + Fastify stack
2. **TypeScript Integration**: Full type safety across test suite
3. **Domain-Driven Design Support**: Testing patterns for bounded contexts
4. **AI Tool Compatibility**: Good support from modern development tools
5. **Performance**: Fast execution for continuous testing

---

## 🏗️ Architecture-Specific Testing

### Next.js BFF Testing Patterns

**API Route Testing:**

```typescript
// Testing Next.js API routes as BFF layer
import { createMocks } from "node-mocks-http";
import handler from "../pages/api/users/[id]";

describe("/api/users/[id]", () => {
  it("should return user data", async () => {
    const { req, res } = createMocks({
      method: "GET",
      query: { id: "user-1" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.user.id).toBe("user-1");
  });
});
```

**Middleware Testing:**

```typescript
// Testing Next.js middleware
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("middleware", () => {
  it("should authenticate valid requests", async () => {
    const request = new NextRequest("http://localhost:3000/protected", {
      headers: { authorization: "Bearer valid-token" },
    });

    const response = await middleware(request);
    expect(response.status).toBe(200);
  });
});
```

### Fastify Bounded Context Testing

**Domain Service Testing:**

```typescript
// Testing domain services in bounded contexts
import { createUserService } from "../services/user-service";
import { createTestUserRepository } from "../test/fixtures";

describe("UserService (Bounded Context)", () => {
  it("should create user following domain rules", async () => {
    const repository = createTestUserRepository();
    const userService = createUserService(repository);

    const result = await userService.createUser({
      email: "test@example.com",
      name: "Test User",
    });

    expect(result.success).toBe(true);
    // Verify domain invariants are maintained
    expect(result.data.status).toBe("PENDING_VERIFICATION");
  });
});
```

**Fastify Route Testing:**

```typescript
// Testing Fastify API endpoints
import { build } from "../app";

describe("User API (Bounded Context)", () => {
  const app = build({ logger: false });

  afterAll(() => app.close());

  it("should create user via Fastify API", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users",
      payload: { name: "John Doe", email: "john@example.com" },
    });

    expect(response.statusCode).toBe(201);
    const user = JSON.parse(response.payload);
    expect(user.name).toBe("John Doe");
  });
});
```

### Cross-Service Integration Testing

**BFF to Bounded Context Communication:**

```typescript
// Testing integration between Next.js BFF and Fastify services
describe("BFF Integration", () => {
  it("should aggregate data from multiple bounded contexts", async () => {
    // Setup test services
    const userService = createTestUserService();
    const orderService = createTestOrderService();

    // Test BFF aggregation logic
    const userProfile = await getUserProfile("user-1", {
      userService,
      orderService,
    });

    expect(userProfile.user).toBeDefined();
    expect(userProfile.recentOrders).toHaveLength(3);
    expect(userProfile.preferences).toBeDefined();
  });
});
```

### Database Layer Testing

**Prisma Repository Testing:**

```typescript
// Testing Prisma-based repositories
import { PrismaClient } from "@prisma/client";
import { createUserRepository } from "../repositories/user-repository";

describe("UserRepository", () => {
  const prisma = new PrismaClient();
  const userRepository = createUserRepository(prisma);

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it("should store and retrieve user data", async () => {
    const userData = { name: "Test User", email: "test@example.com" };

    const createdUser = await userRepository.create(userData);
    const foundUser = await userRepository.findById(createdUser.id);

    expect(foundUser).toEqual(createdUser);
  });
});
```

**Redis Cache Testing:**

```typescript
// Testing Redis cache layer
import { createCacheService } from "../services/cache-service";
import { createTestRedisClient } from "../test/helpers";

describe("CacheService", () => {
  const redisClient = createTestRedisClient();
  const cacheService = createCacheService(redisClient);

  it("should cache and retrieve data", async () => {
    const key = "user:123";
    const data = { name: "Test User" };

    await cacheService.set(key, data, 300);
    const cached = await cacheService.get(key);

    expect(cached).toEqual(data);
  });
});
```

---

## 📊 Coverage Requirements

### Minimum Coverage Targets (Aligned with [Definition of Done](06-definition-of-done.md))

- **Unit Test Coverage**: 80% line coverage minimum for business logic
- **Branch Coverage**: 70% branch coverage for critical paths
- **Integration Coverage**: 100% of API endpoints and integration points
- **E2E Coverage**: 100% of critical user journeys

### Architecture-Specific Coverage

- **Next.js BFF Layer**: 80% coverage for API routes and middleware
- **Fastify Bounded Contexts**: 80% coverage for domain services and controllers
- **Database Layer**: 100% coverage for repository patterns and data access
- **Cross-Service Integration**: 100% coverage for service-to-service communication

### Coverage Quality Metrics

- **Meaningful Tests**: Tests validate behavior, not just coverage
- **Assert Quality**: Each test includes meaningful assertions
- **Test Independence**: Tests can run in any order
- **Maintenance Cost**: Tests are easy to maintain and update

---

## 🔄 Testing in Development Workflow

### Development Phase Testing

1. **TDD Cycle**: Write test → Implement → Refactor
2. **Continuous Testing**: Tests run on every code change
3. **Pre-commit Hooks**: Fast test suite runs before commit
4. **Tool-Assisted Generation**: Modern tools generate initial test cases

### Code Review Testing

1. **Test Coverage Review**: Ensure adequate test coverage
2. **Test Quality Assessment**: Review test meaningfulness and design
3. **Tool Test Validation**: Modern tools review test completeness and quality
4. **Manual Test Review**: Human validation of test logic and coverage

### CI/CD Pipeline Testing

1. **Fast Test Suite**: Unit and fast integration tests (< 5 minutes)
2. **Full Test Suite**: Complete test suite including E2E (< 30 minutes)
3. **Performance Tests**: Load and stress testing in staging
4. **Security Tests**: Vulnerability scanning and security validation

---

## 🔧 Modern Testing Integration

### Tool-Generated Tests

- **Function-Based Generation**: Generate tests from function signatures
- **Story-Based Generation**: Generate tests from user story acceptance criteria
- **Coverage-Driven Generation**: Generate tests for uncovered code paths
- **Regression Test Generation**: Create tests for reported bugs

### Tool-Assisted Test Maintenance

- **Refactoring Updates**: Update tests when code structure changes
- **Assertion Improvement**: Suggest better assertions and validations
- **Test Optimization**: Identify and remove redundant or flaky tests
- **Pattern Recognition**: Suggest testing patterns based on code structure

---

## 📋 Test Quality Gates

These gates are integrated with [Definition of Done](06-definition-of-done.md) checklist:

### Pre-Development

- [ ] Test plan defined based on requirements and architecture
- [ ] Test environment setup for Next.js + Fastify stack
- [ ] Test data preparation for bounded contexts
- [ ] Development tools configured per [Technical Guidelines](03-technical-guidelines.md)

### During Development

- [ ] Tests written before or alongside implementation (TDD)
- [ ] Unit test coverage meets 80% threshold for business logic
- [ ] Integration tests cover API endpoints and service interactions
- [ ] All tests pass consistently in local environment

### Pre-Merge (DoD Compliance)

- [ ] Full test suite passes without failures
- [ ] Coverage requirements met per [Definition of Done](06-definition-of-done.md)
- [ ] Test code reviewed and approved
- [ ] Security and performance tests indicate acceptable results (basic validation only)

### Post-Deployment

- [ ] Smoke tests pass in production environment
- [ ] Monitoring configured per [Observability Guidelines](11-observability-guidelines.md)
- [ ] Test results documented and analyzed
- [ ] Feedback incorporated for continuous improvement

---

## 🩺 Observability Integration

### Alignment with Observability Guidelines

Testing and observability are tightly integrated to ensure post-deployment quality and rapid issue detection. For full observability setup details, see [Observability Guidelines](11-observability-guidelines.md).

#### Integration Points:

- **Post-Deployment Testing Gates:**  
  All post-deployment test results (smoke tests, E2E, performance) are monitored and reported using the same observability stack as production (e.g., Prometheus, Grafana, ELK, Datadog).
- **Monitoring Requirements for Test Environments:**
  - **Unit/Integration:**
    - Local and CI environments should log test execution, failures, and performance metrics.
    - Test environments must expose health endpoints and basic telemetry for CI/CD monitoring.
  - **E2E:**
    - E2E test environments mirror production monitoring (application logs, error rates, resource usage).
    - Synthetic monitoring and alerting are configured for critical user journeys.
- **Test Result Monitoring and Alerting:**
  - CI/CD pipelines must push test results and coverage metrics to observability dashboards.
  - Automated alerts are triggered for test failures, coverage drops, or performance regressions.
  - Test run metrics (duration, pass/fail rate, flaky test rate) are tracked and visualized.
- **Test Failure Monitoring and Metrics Collection:**
  - All test failures are logged and correlated with deployment events.
  - Metrics on test reliability, execution time, and defect escape rates are collected and reviewed.
  - Observability tools are used to analyze trends and identify root causes for recurring test failures.

#### Example Practices:

- Integrate test result exporters (e.g., JUnit, Allure) with observability dashboards.
- Use CI/CD hooks to send alerts to Slack/Teams for failed test gates.
- Monitor test environment health and resource usage during test execution.
- Align test metrics collection with production observability standards for consistency.

---

## 📈 Continuous Improvement

### Testing Metrics

- **Test Execution Time**: Monitor and optimize test performance
- **Flaky Test Rate**: Identify and fix unreliable tests
- **Coverage Trends**: Track coverage improvements over time
- **Defect Escape Rate**: Measure testing effectiveness

### Regular Reviews

- **Test Strategy Review**: Quarterly assessment of testing approach
- **Tool Evaluation**: Regular evaluation of testing tools and frameworks
- **Modern Integration Assessment**: Review tool effectiveness in testing
- **Team Training**: Continuous learning on testing best practices

---

## 🧪 Testing Standards

### Test Framework Configuration

#### Vitest Setup

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom", // For React components
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/test/"],
    },
  },
});
```

```typescript
// src/test/setup.ts
import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Cleanup after each test
afterEach(() => {
  cleanup();
});
```

### Unit Testing Patterns

#### Pure Function Testing

```typescript
// ✅ Test pure functions with clear input/output
import { describe, it, expect } from "vitest";
import { calculateTotalPrice, formatCurrency } from "../utils/pricing";

describe("calculateTotalPrice", () => {
  it("should calculate total with tax correctly", () => {
    // Arrange
    const items = [
      { price: 100, quantity: 2 },
      { price: 50, quantity: 1 },
    ];
    const taxRate = 0.1;

    // Act
    const result = calculateTotalPrice(items, taxRate);

    // Assert
    expect(result).toBe(275); // (200 + 50) * 1.1
  });

  it("should handle empty items array", () => {
    expect(calculateTotalPrice([], 0.1)).toBe(0);
  });

  it("should handle zero tax rate", () => {
    const items = [{ price: 100, quantity: 1 }];
    expect(calculateTotalPrice(items, 0)).toBe(100);
  });
});
```

#### Service Layer Testing with Dependency Injection

```typescript
import { describe, it, expect } from "vitest";
import { createUserService } from "../services/user-service";
import type { UserRepository } from "../types/user";
import { createTestUser } from "../test/fixtures/user-fixtures";

// ✅ Create test implementation instead of mocking
const createTestUserRepository = (): UserRepository => ({
  create: async (data) => {
    const user = createTestUser({ ...data, id: "generated-id" });
    return user;
  },

  findById: async (id) => {
    if (id === "existing-user") {
      return createTestUser({ id });
    }
    return null;
  },

  update: async (id, data) => {
    return createTestUser({ id, ...data });
  },

  delete: async () => {},

  findByEmail: async (email) => {
    if (email === "existing@example.com") {
      return createTestUser({ email });
    }
    return null;
  },
});

// ✅ Test repository that throws errors for error scenarios
const createFailingUserRepository = (): UserRepository => ({
  create: async () => {
    throw new Error("Database connection failed");
  },
  findById: async () => {
    throw new Error("Database connection failed");
  },
  update: async () => {
    throw new Error("Database connection failed");
  },
  delete: async () => {
    throw new Error("Database connection failed");
  },
  findByEmail: async () => {
    throw new Error("Database connection failed");
  },
});

describe("UserService", () => {
  describe("createUser", () => {
    it("should create user successfully", async () => {
      // Arrange - Inject test dependencies
      const testRepository = createTestUserRepository();
      const userService = createUserService(testRepository);
      const userData = { name: "John Doe", email: "john@example.com" };

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(userData.name);
        expect(result.data.email).toBe(userData.email);
        expect(result.data.id).toBe("generated-id");
      }
    });

    it("should handle repository errors", async () => {
      // Arrange - Inject failing repository
      const failingRepository = createFailingUserRepository();
      const userService = createUserService(failingRepository);
      const userData = { name: "John Doe", email: "john@example.com" };

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Database connection failed");
      }
    });
  });

  describe("getUserById", () => {
    it("should return user when found", async () => {
      // Arrange
      const testRepository = createTestUserRepository();
      const userService = createUserService(testRepository);

      // Act
      const result = await userService.getUserById("existing-user" as UserId);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("existing-user");
      }
    });

    it("should return error when user not found", async () => {
      // Arrange
      const testRepository = createTestUserRepository();
      const userService = createUserService(testRepository);

      // Act
      const result = await userService.getUserById("non-existent" as UserId);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("User not found");
      }
    });
  });
});
```

#### Pure Function Testing with Currying

```typescript
// ✅ Instead of mocking external services, use currying for dependency injection
import { describe, it, expect } from "vitest";

// Service that depends on external API
type EmailService = {
  readonly sendEmail: (
    to: string,
    subject: string,
    body: string
  ) => Promise<boolean>;
};

type NotificationService = {
  readonly sendWelcomeEmail: (user: User) => Promise<Result<void>>;
};

// ✅ Service factory with dependency injection
const createNotificationService = (
  emailService: EmailService
): NotificationService => ({
  sendWelcomeEmail: async (user) => {
    try {
      const success = await emailService.sendEmail(
        user.email,
        "Welcome!",
        `Hello ${user.name}, welcome to our platform!`
      );

      return success
        ? { success: true, data: undefined }
        : { success: false, error: new Error("Failed to send email") };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
    }
  },
});

describe("NotificationService", () => {
  it("should send welcome email successfully", async () => {
    // Arrange - Create test email service
    const testEmailService: EmailService = {
      sendEmail: async (to, subject, body) => {
        // Test implementation that always succeeds
        expect(to).toBe("test@example.com");
        expect(subject).toBe("Welcome!");
        expect(body).toContain("Hello Test User");
        return true;
      },
    };

    const notificationService = createNotificationService(testEmailService);
    const user = createTestUser({
      name: "Test User",
      email: "test@example.com",
    });

    // Act
    const result = await notificationService.sendWelcomeEmail(user);

    // Assert
    expect(result.success).toBe(true);
  });

  it("should handle email service failures", async () => {
    // Arrange - Create failing email service
    const failingEmailService: EmailService = {
      sendEmail: async () => false, // Simulates failure
    };

    const notificationService = createNotificationService(failingEmailService);
    const user = createTestUser();

    // Act
    const result = await notificationService.sendWelcomeEmail(user);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Failed to send email");
    }
  });

  it("should handle email service exceptions", async () => {
    // Arrange - Create throwing email service
    const throwingEmailService: EmailService = {
      sendEmail: async () => {
        throw new Error("Network timeout");
      },
    };

    const notificationService = createNotificationService(throwingEmailService);
    const user = createTestUser();

    // Act
    const result = await notificationService.sendWelcomeEmail(user);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Network timeout");
    }
  });
});
```

#### Higher-Order Function Testing

```typescript
// ✅ Test higher-order functions with different implementations
import { describe, it, expect } from 'vitest';

// Generic repository pattern
type Repository<T, ID> = {
  readonly findById: (id: ID) => Promise<T | null>;
  readonly create: (data: Omit<T, 'id'>) => Promise<T>;
  readonly update: (id: ID, data: Partial<T>) => Promise<T>;
};

// Generic service factory
const createCrudService = <T, ID>(repository: Repository<T, ID>) => ({
  get: async (id: ID): Promise<Result<T>> => {
    try {
      const item = await repository.findById(id);
      return item
        ? { success: true, data: item }
        : { success: false, error: new Error('Item not found') };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  },

  create: async (data: Omit<T, 'id'>): Promise<Result<T>> => {
    try {
      const item = await repository.create(data);
      return { success: true, data: item };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }
});

describe('createCrudService', () => {
  it('should work with user repository', async () => {
    // Arrange - Create user-specific test repository
    const testUserRepository: Repository<User, string> = {
      findById: async (id) =>
        id === 'user-1' ? createTestUser({ id }) : null,
      create: async (data) =>
        createTestUser({ ...data, id: 'new-user-id' }),
      update: async (id, data) =>
        createTestUser({ id, ...data })
    };

    const userService = createCrudService(testUserRepository);

    // Act & Assert
    const result = await userService.get('user-1');
    expect(result.success).toBe(true);
  });

  it('should work with product repository', async () => {
    // Arrange - Create product-specific test repository
    type Product = { id: number; name: string; price: number };

    const testProductRepository: Repository<Product, number> = {
      findById: async (id) =>
        id === 1 ? { id, name: 'Test Product', price: 100 } : null,
      create: async (data) =>
        { id: 1, ...data },
      update: async (id, data) =>
        { id, name: 'Test Product', price: 100, ...data }
    };

    const productService = createCrudService(testProductRepository);

    // Act & Assert
    const result = await productService.get(1);
    expect(result.success).toBe(true);
  });
});
```

### Test Fixtures and Data Builders

```typescript
// ✅ Centralized test data creation
// src/test/fixtures/user-fixtures.ts
import type { User, CreateUserData } from "../../types/user";

export const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: "test-user-1",
  name: "Test User",
  email: "test@example.com",
  role: "user",
  createdAt: new Date("2023-01-01"),
  updatedAt: new Date("2023-01-01"),
  ...overrides,
});

export const createTestUserData = (
  overrides: Partial<CreateUserData> = {}
): CreateUserData => ({
  name: "Test User",
  email: "test@example.com",
  ...overrides,
});

// Builder pattern for complex objects
export class UserBuilder {
  private user: Partial<User> = {};

  withId(id: string): UserBuilder {
    this.user.id = id;
    return this;
  }

  withName(name: string): UserBuilder {
    this.user.name = name;
    return this;
  }

  withEmail(email: string): UserBuilder {
    this.user.email = email;
    return this;
  }

  asAdmin(): UserBuilder {
    this.user.role = "admin";
    return this;
  }

  build(): User {
    return createTestUser(this.user);
  }
}

// Usage in tests
const adminUser = new UserBuilder()
  .withId("admin-1")
  .withName("Admin User")
  .asAdmin()
  .build();
```

### React Component Testing

#### Component Testing with React Testing Library

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserCard } from "../components/user-card";
import { createTestUser } from "../test/fixtures/user-fixtures";

describe("UserCard", () => {
  const defaultProps = {
    user: createTestUser(),
    onEdit: vi.fn(),
  };

  it("should render user information", () => {
    // Arrange & Act
    render(<UserCard {...defaultProps} />);

    // Assert - Test what user sees
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("should call onEdit when edit button is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(<UserCard {...defaultProps} onEdit={onEdit} />);

    // Act - Simulate user interaction
    const editButton = screen.getByRole("button", { name: /edit/i });
    await user.click(editButton);

    // Assert
    expect(onEdit).toHaveBeenCalledWith(defaultProps.user);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("should not render edit button when onEdit is not provided", () => {
    // Arrange & Act
    render(<UserCard user={defaultProps.user} />);

    // Assert
    expect(
      screen.queryByRole("button", { name: /edit/i })
    ).not.toBeInTheDocument();
  });
});
```

#### Custom Hook Testing

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUserData } from "../hooks/use-user-data";
import * as userService from "../services/user-service";

// Mock external dependencies
vi.mock("../services/user-service");

describe("useUserData", () => {
  const mockGetUserById = vi.mocked(userService.getUserById);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch user data successfully", async () => {
    // Arrange
    const userId = "user-1";
    const userData = createTestUser({ id: userId });
    mockGetUserById.mockResolvedValue(userData);

    // Act
    const { result } = renderHook(() => useUserData(userId));

    // Assert initial state
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBe(null);
    expect(result.current.error).toBe(null);

    // Wait for async operation
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Assert final state
    expect(result.current.user).toEqual(userData);
    expect(result.current.error).toBe(null);
    expect(mockGetUserById).toHaveBeenCalledWith(userId);
  });

  it("should handle fetch errors", async () => {
    // Arrange
    const userId = "user-1";
    const errorMessage = "User not found";
    mockGetUserById.mockRejectedValue(new Error(errorMessage));

    // Act
    const { result } = renderHook(() => useUserData(userId));

    // Wait for async operation
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Assert
    expect(result.current.user).toBe(null);
    expect(result.current.error).toBe(errorMessage);
  });
});
```

### Integration Testing for APIs

#### Fastify Route Testing

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../test/helpers/test-app";
import { createTestDatabase } from "../test/helpers/test-database";
import { createTestUser } from "../test/fixtures/user-fixtures";

describe("/api/users", () => {
  let app: FastifyInstance;
  let db: TestDatabase;

  beforeAll(async () => {
    // Setup test database
    db = await createTestDatabase();
    app = await createTestApp({ database: db });
  });

  afterAll(async () => {
    await app.close();
    await db.cleanup();
  });

  beforeEach(async () => {
    // Clean database before each test
    await db.reset();
  });

  describe("POST /api/users", () => {
    it("should create user successfully", async () => {
      // Arrange
      const userData = {
        name: "John Doe",
        email: "john@example.com",
      };

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/users",
        payload: userData,
      });

      // Assert
      expect(response.statusCode).toBe(201);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.user).toMatchObject({
        name: userData.name,
        email: userData.email,
      });
      expect(responseBody.user.id).toBeDefined();
      expect(responseBody.created).toBe(true);
    });

    it("should return 400 for invalid email", async () => {
      // Arrange
      const invalidUserData = {
        name: "John Doe",
        email: "invalid-email",
      };

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/users",
        payload: invalidUserData,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/users/:id", () => {
    it("should return user by id", async () => {
      // Arrange
      const user = await db.createUser(createTestUser());

      // Act
      const response = await app.inject({
        method: "GET",
        url: `/api/users/${user.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);

      const responseBody = JSON.parse(response.body);
      expect(responseBody.user).toEqual(user);
    });

    it("should return 404 for non-existent user", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/users/non-existent-id",
      });

      // Assert
      expect(response.statusCode).toBe(404);
    });
  });
});
```

#### Database Testing Helpers

```typescript
// src/test/helpers/test-database.ts
import { Client } from "pg";
import { randomUUID } from "crypto";

export type TestDatabase = {
  readonly client: Client;
  readonly createUser: (userData: Partial<User>) => Promise<User>;
  readonly reset: () => Promise<void>;
  readonly cleanup: () => Promise<void>;
};

export const createTestDatabase = async (): Promise<TestDatabase> => {
  // Create unique database for each test run
  const dbName = `test_db_${randomUUID().replace(/-/g, "")}`;

  const client = new Client({
    host: "localhost",
    port: 5432,
    database: dbName,
    user: "postgres",
    password: "password",
  });

  await client.connect();

  // Run migrations
  await runMigrations(client);

  return {
    client,

    createUser: async (userData) => {
      const user = createTestUser(userData);
      const result = await client.query(
        "INSERT INTO users (id, name, email, role) VALUES ($1, $2, $3, $4) RETURNING *",
        [user.id, user.name, user.email, user.role]
      );
      return UserSchema.parse(result.rows[0]);
    },

    reset: async () => {
      await client.query("TRUNCATE TABLE users CASCADE");
    },

    cleanup: async () => {
      await client.end();
      // Drop test database
      const adminClient = new Client({ database: "postgres" });
      await adminClient.connect();
      await adminClient.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await adminClient.end();
    },
  };
};
```

### Test Organization

```typescript
// ✅ Clear test structure
describe("UserService", () => {
  // Group related tests
  describe("createUser", () => {
    it("should create user with valid data", () => {});
    it("should handle duplicate email error", () => {}); // Only test runtime errors
  });

  describe("getUserById", () => {
    it("should return user when found", () => {});
    it("should return error when user not found", () => {}); // Business logic error
  });
});

// ✅ Test naming convention: should [expected behavior] when [condition]
it("should return user data when valid ID is provided", () => {});
it("should handle database connection failure", () => {}); // Only runtime errors
```

### Testing Philosophy

#### ❌ Avoid Redundant Tests - Use Types Instead

```typescript
// ❌ Don't test what TypeScript already validates
it("should reject invalid email format", () => {
  const result = validateEmail("invalid-email");
  expect(result.valid).toBe(false);
});

// ✅ Use branded types to make errors compile-time
type Email = string & { readonly brand: unique symbol };

const createEmail = (value: string): Email => {
  if (!value.includes("@")) {
    throw new Error("Invalid email"); // Only for runtime validation
  }
  return value as Email;
};

// ❌ This won't compile - no test needed
// const userEmail: Email = "invalid-email";

// ✅ Only test business logic and external boundaries
it("should handle email service timeout", async () => {
  const service = createEmailService(throwingEmailClient);
  const result = await service.sendEmail(validEmail, "subject", "body");
  expect(result.success).toBe(false);
});
```

#### ✅ Focus on Runtime Boundaries and Business Logic

```typescript
// ✅ Test external system boundaries
it("should handle database connection failure", async () => {
  const repository = createUserRepository(failingDatabase);
  const result = await repository.findById("user-1");
  expect(result.success).toBe(false);
});

// ✅ Test complex business rules that can't be expressed in types
it("should prevent user creation when account limit exceeded", async () => {
  const repository = createRepositoryWithUserLimit(5);
  // Create 5 users first
  for (let i = 0; i < 5; i++) {
    await repository.create(createTestUser());
  }

  const result = await repository.create(createTestUser());
  expect(result.success).toBe(false);
  expect(result.error.code).toBe("ACCOUNT_LIMIT_EXCEEDED");
});

// ✅ Test state transitions that involve external effects
it("should send notification email when user is activated", async () => {
  const emailsSent: string[] = [];
  const testEmailService = createTestEmailService(emailsSent);
  const userService = createUserService(repository, testEmailService);

  await userService.activateUser("user-1");

  expect(emailsSent).toHaveLength(1);
  expect(emailsSent[0]).toContain("Account activated");
});
```

## 🌐 End-to-End Testing Implementation

### E2E Testing Strategy

**Core Principles:**

- **Separate Project Architecture**: E2E tests run in isolated project with independent dependencies
- **Real System Testing**: Test against deployed or containerized application instances
- **Critical Path Focus**: Cover essential user journeys and business-critical workflows
- **Production-Like Environment**: Test in environments that mirror production setup

**When to Write E2E Tests:**

- Critical user registration and authentication flows
- Payment and transaction processing
- Data flow across multiple services/bounded contexts
- Cross-browser compatibility requirements
- Regulatory compliance workflows

### Project Setup and Architecture

**Recommended Project Structure:**

```
workspace/
├── apps/
│   ├── web/                    # Main Next.js application
│   └── api/                    # Fastify bounded context APIs
├── packages/
│   └── shared/                 # Shared libraries and types
└── e2e/                        # Separate E2E test project
    ├── package.json            # Independent dependencies
    ├── playwright.config.ts    # Test configuration
    ├── tests/
    │   ├── user-flows/         # User journey tests
    │   ├── api/                # API integration tests
    │   └── cross-service/      # Multi-service tests
    ├── fixtures/               # Test data and helpers
    └── utils/                  # Test utilities and helpers
```

**Environment Isolation Benefits:**

- No dependency conflicts with application code
- Independent deployment and scaling of test suite
- Realistic testing against production-like deployments
- Clear separation of concerns between application and test code

### Test Environment Management

**Docker Compose Setup:**

```yaml
# docker-compose.e2e.yml
version: "3.8"
services:
  web-app:
    build: ./apps/web
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://test:test@postgres:5432/e2e_test
    depends_on:
      - postgres
      - redis

  api-service:
    build: ./apps/api
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://test:test@postgres:5432/e2e_test
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=e2e_test
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

**Environment Configuration:**

```typescript
// e2e/.env.test
E2E_BASE_URL=http://localhost:3000
E2E_API_URL=http://localhost:4000
E2E_DB_URL=postgresql://test:test@localhost:5432/e2e_test
E2E_ADMIN_EMAIL=admin@e2e.test
E2E_ADMIN_PASSWORD=TestPassword123!
E2E_SERVICE_TOKEN=test-service-token
```

### User Journey Testing Patterns

**Page Object Model:**

```typescript
// e2e/pages/registration-page.ts
export class RegistrationPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/register");
  }

  async fillForm(userData: UserData) {
    await this.page.fill('[data-testid="name-input"]', userData.name);
    await this.page.fill('[data-testid="email-input"]', userData.email);
    await this.page.fill('[data-testid="password-input"]', userData.password);
  }

  async submit() {
    await this.page.click('[data-testid="submit-button"]');
  }

  async getSuccessMessage() {
    return this.page.locator('[data-testid="success-message"]');
  }

  async getErrorMessage() {
    return this.page.locator('[data-testid="error-message"]');
  }
}
```

**User Journey Test Example:**

```typescript
// e2e/tests/user-flows/registration.spec.ts
import { test, expect } from "@playwright/test";
import { RegistrationPage } from "../pages/registration-page";
import { TestUser } from "../fixtures/test-users";
import { SystemVerification } from "../utils/system-verification";

test.describe("User Registration Journey", () => {
  let registrationPage: RegistrationPage;
  let systemVerification: SystemVerification;

  test.beforeEach(async ({ page }) => {
    registrationPage = new RegistrationPage(page);
    systemVerification = new SystemVerification();
  });

  test("should complete full registration flow", async () => {
    // Arrange
    const testUser = TestUser.create();

    // Act
    await registrationPage.goto();
    await registrationPage.fillForm(testUser);
    await registrationPage.submit();

    // Assert - UI feedback
    await expect(registrationPage.getSuccessMessage()).toBeVisible();
    await expect(registrationPage.page).toHaveURL("/welcome");

    // Assert - System state verification
    const userExists = await systemVerification.verifyUserExists(
      testUser.email
    );
    expect(userExists).toBe(true);

    const emailSent = await systemVerification.verifyWelcomeEmailSent(
      testUser.email
    );
    expect(emailSent).toBe(true);
  });

  test("should handle duplicate email registration", async () => {
    // Arrange
    const existingUser = TestUser.existing();

    // Act
    await registrationPage.goto();
    await registrationPage.fillForm(existingUser);
    await registrationPage.submit();

    // Assert
    await expect(registrationPage.getErrorMessage()).toContainText(
      "Email already exists"
    );
    await expect(registrationPage.page).toHaveURL("/register");
  });
});
```

### Cross-Service Integration Testing Patterns

**Service Communication Testing:**

```typescript
// e2e/tests/cross-service/user-order-flow.spec.ts
import { test, expect } from "@playwright/test";
import { UserPage } from "../pages/user-page";
import { OrderPage } from "../pages/order-page";
import { SystemVerification } from "../utils/system-verification";

test.describe("User-Order Integration Flow", () => {
  test("should create order and update user history", async ({ page }) => {
    const userPage = new UserPage(page);
    const orderPage = new OrderPage(page);
    const systemVerification = new SystemVerification();

    // Step 1: Create user account
    const testUser = await userPage.createAccount();

    // Step 2: Create order
    await orderPage.goto();
    const order = await orderPage.createOrder({
      items: [{ name: "Test Product", quantity: 1, price: 29.99 }],
      userId: testUser.id,
    });

    // Step 3: Verify cross-service data consistency
    const userProfile = await systemVerification.getUserProfile(testUser.id);
    expect(userProfile.orderHistory).toContainEqual(
      expect.objectContaining({
        orderId: order.id,
        status: "completed",
      })
    );

    // Step 4: Verify inventory service was updated
    const inventory = await systemVerification.getInventoryLevel(
      "Test Product"
    );
    expect(inventory.available).toBe(inventory.previous - 1);
  });
});
```

**System Verification Utilities:**

```typescript
// e2e/utils/system-verification.ts
export class SystemVerification {
  private baseApiUrl = process.env.E2E_API_URL;
  private serviceToken = process.env.E2E_SERVICE_TOKEN;

  async verifyUserExists(email: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseApiUrl}/test/users/by-email/${email}`,
      {
        headers: { Authorization: `Bearer ${this.serviceToken}` },
      }
    );
    return response.status === 200;
  }

  async verifyWelcomeEmailSent(email: string): Promise<boolean> {
    const response = await fetch(`${this.baseApiUrl}/test/emails/sent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.serviceToken}`,
      },
      body: JSON.stringify({ to: email, subject: "Welcome" }),
    });
    const emails = await response.json();
    return emails.length > 0;
  }

  async getUserProfile(userId: string) {
    const response = await fetch(`${this.baseApiUrl}/users/${userId}/profile`, {
      headers: { Authorization: `Bearer ${this.serviceToken}` },
    });
    return response.json();
  }

  async getInventoryLevel(productName: string) {
    const response = await fetch(
      `${this.baseApiUrl}/inventory/products/${productName}`,
      {
        headers: { Authorization: `Bearer ${this.serviceToken}` },
      }
    );
    return response.json();
  }
}
```

### E2E CI/CD Integration

**GitHub Actions Workflow:**

```yaml
# .github/workflows/e2e-tests.yml
name: End-to-End Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 2 * * *" # Daily at 2 AM

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "18"
          cache: "npm"

      - name: Start services
        run: |
          docker-compose -f docker-compose.e2e.yml up -d

      - name: Wait for services
        run: |
          npm run wait-for-services

      - name: Install E2E dependencies
        working-directory: ./e2e
        run: |
          npm ci
          npx playwright install

      - name: Run E2E tests
        working-directory: ./e2e
        run: npx playwright test
        env:
          E2E_BASE_URL: http://localhost:3000
          E2E_API_URL: http://localhost:4000

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-test-results
          path: e2e/test-results/

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: e2e/playwright-report/

      - name: Cleanup services
        if: always()
        run: docker-compose -f docker-compose.e2e.yml down
```

**Service Readiness Check:**

```typescript
// e2e/scripts/wait-for-services.ts
const waitForServices = async (services: string[], timeout = 60000) => {
  const startTime = Date.now();

  for (const serviceUrl of services) {
    console.log(`Waiting for ${serviceUrl}...`);

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${serviceUrl}/health`);
        if (response.ok) {
          console.log(`✅ ${serviceUrl} is ready`);
          break;
        }
      } catch (error) {
        console.log(`⏳ ${serviceUrl} not ready yet...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  console.log("🚀 All services are ready!");
};

waitForServices(["http://localhost:3000", "http://localhost:4000"]);
```

**Performance Integration in E2E:**

```typescript
// e2e/tests/performance/core-web-vitals.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Core Web Vitals", () => {
  test("should meet performance benchmarks on critical pages", async ({
    page,
  }) => {
    // Navigate to page and measure Core Web Vitals
    const response = await page.goto("/", { waitUntil: "networkidle" });

    // Measure Largest Contentful Paint (LCP)
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry.startTime);
        }).observe({ entryTypes: ["largest-contentful-paint"] });
      });
    });

    // Assert performance thresholds
    expect(lcp).toBeLessThan(2500); // LCP should be under 2.5s
    expect(response?.status()).toBe(200);

    // Measure page load time
    const loadTime = await page.evaluate(
      () => performance.timing.loadEventEnd - performance.timing.navigationStart
    );
    expect(loadTime).toBeLessThan(3000); // Page load under 3s
  });
});
```

This comprehensive E2E implementation strategy provides clear guidelines for setting up, organizing, and maintaining end-to-end tests while ensuring they integrate properly with the overall testing strategy and CI/CD pipeline.

---

## 👥 Usability Testing & User Acceptance

### Testing Methodology

#### 1. Moderated Testing

**Live Session Facilitation:**

- Live session with facilitator present
- Real-time observation and questioning
- Deeper insights through think-aloud protocol
- Higher cost but richer qualitative data
- **Use case:** Complex workflows, exploratory research, critical user journeys

**Implementation Process:**

- Pre-session preparation with test scenarios
- Live screen sharing or in-person observation
- Real-time note-taking and follow-up questions
- Post-session debriefing and analysis

#### 2. Unmoderated Testing

**Self-Guided Sessions:**

- Self-guided user sessions
- Task-based scenarios with screen recording
- Larger sample sizes possible
- Cost-effective for frequent testing
- **Use case:** Specific feature validation, A/B testing, iterative improvements

**Implementation Process:**

- Automated test scenario distribution
- Screen recording and interaction tracking
- Quantitative data collection (completion rates, time on task)
- Post-session analysis and pattern identification

#### 3. Remote vs In-Person Testing

**Remote Testing:**

- **Advantages:** Lower cost, broader geographical reach, natural environment
- **Tools:** Zoom, Teams, specialized usability testing platforms
- **Best for:** Regular testing cycles, broad user base validation

**In-Person Testing:**

- **Advantages:** Better observation, technical setup control, stronger rapport
- **Requirements:** Physical testing space, equipment setup
- **Best for:** Deep-dive research, complex workflow validation

**Hybrid Approach:**

- Remote for broad insights and quick validation
- In-person for deep dives and complex scenario testing

### Coordination with Testing Strategy

#### Integration Timeline

**Cross-Testing Coordination:**

```
Sprint Testing Flow:
1. Unit/Integration Tests (Dev) →
2. E2E Tests (QA) →
3. Performance/Security Tests (DevOps) →
4. Usability Testing (UX) →
5. User Acceptance (Business)
```

#### Pre-Usability Testing Requirements

**Technical Prerequisites:**

- Functional testing completion with 95%+ pass rate
- E2E tests covering critical user journeys
- Performance benchmarks within acceptable ranges
- Accessibility automated testing passed

**Integration Points:**

- **Functional Testing Results:** Inform usability test scenarios
- **Performance Data:** Set expectations for load time tolerance
- **E2E Test Coverage:** Validate technical implementation before user testing
- **Accessibility Results:** Ensure assistive technology compatibility

#### Post-Usability Testing Actions

**Feedback Integration:**

- Document usability issues for development backlog
- Coordinate with QA for regression testing of fixes
- Update E2E tests to cover newly identified edge cases
- Performance impact assessment of UX improvements

### Frequency & Timing Alignment

#### Per Sprint Integration (Agile Workflow)

**Week 1: Planning Phase**

- Usability test planning during sprint planning
- Define test scenarios based on sprint deliverables
- Coordinate with development team on feature readiness
- Schedule testing sessions with recruited users

**Week 2: Preparation Phase**

- Recruit target users based on personas
- Prepare detailed test scenarios and tasks
- Set up testing environment and tools
- Coordinate with development for staging environment access

**Week 3: Execution Phase**

- Execute unmoderated tests on completed features
- Conduct moderated sessions for complex workflows
- Real-time monitoring and initial data collection
- Daily stand-up updates on testing progress

**Week 4: Analysis & Integration Phase**

- Analyze results and identify patterns
- Integrate feedback into next sprint planning
- Update test scenarios based on findings
- Document lessons learned and methodology improvements

#### Per Release Validation (Major Releases)

**Pre-Release Testing (2 weeks before release):**

- Comprehensive moderated testing with primary personas
- Full user journey validation from onboarding to completion
- Cross-browser and cross-device usability verification
- Accessibility compliance validation with assistive technologies

**Release Readiness Criteria:**

- 95%+ task completion rate for primary user flows
- No critical usability issues identified
- Accessibility testing passed with assistive technologies
- Performance impact on UX measured and acceptable

#### Ad-Hoc Testing Triggers

**Critical Issue Validation:**

- Post-hotfix usability validation
- User-reported issue investigation
- Competitive analysis response testing

**Feature Hypothesis Testing:**

- New feature concept validation
- A/B testing setup and analysis
- User behavior pattern investigation

### User Recruitment & Sample Size Guidelines

#### Target User Distribution

**Primary Personas (80% of participants):**

- Main target audience for the application
- Regular users with established workflows
- Representative of core business use cases

**Secondary Personas (20% of participants):**

- Edge case users and alternative workflows
- Users with different technical proficiency levels
- Accessibility users requiring assistive technologies

**Accessibility Users (Minimum 2 per major release):**

- Users with visual, auditory, motor, or cognitive disabilities
- Screen reader users for visual accessibility validation
- Keyboard-only users for motor accessibility testing

#### Sample Size Framework

**Moderated Testing:**

- **5-8 users per persona** (Nielsen's 85% issue discovery principle)
- **3-5 sessions for exploratory research**
- **8-12 users for comparative testing** (A/B scenarios)

**Unmoderated Testing:**

- **15-30 users for statistical significance**
- **50+ users for quantitative behavior analysis**
- **100+ users per variant for A/B testing**

**Accessibility Testing:**

- **3-5 users with relevant disabilities**
- **2+ screen reader users for each major feature**
- **2+ keyboard-only users for interaction validation**

#### Recruitment Strategy

**Internal Recruitment:**

- Employee friends and family for early-stage testing
- Internal stakeholder testing for business logic validation
- Cross-team collaboration for domain expertise

**Customer Base Recruitment:**

- Existing users for feature validation and improvement
- Customer interviews for deep workflow understanding
- Beta user communities for advanced feature testing

**Professional Recruitment:**

- User research panel platforms (UserInterviews, Respondent)
- Specialized accessibility testing communities
- Demographic-specific recruitment for target markets

**Community Recruitment:**

- Social media and forum outreach
- Industry-specific community engagement
- University partnerships for diverse user testing

### Budget Considerations

#### Free/Low-Cost Tools

**Session Recording & Analytics:**

- **Hotjar:** Heatmaps, session recordings (free tier: 35 sessions/day)
- **Google Analytics:** Behavior flow analysis, conversion tracking
- **Microsoft Clarity:** Free session recordings and heatmaps

**Communication & Moderation:**

- **Zoom:** Remote moderated sessions with recording capabilities
- **Microsoft Teams:** Built-in screen sharing and recording
- **Google Meet:** Basic session facilitation

**Feedback Collection:**

- **Google Forms:** Free survey and feedback collection
- **Typeform:** Enhanced form experience (free tier available)
- **UserVoice:** Community feedback aggregation

**Internal Testing:**

- Employee and stakeholder testing sessions
- Cross-team collaboration for domain validation
- Guerrilla testing with available participants

#### Premium Solution Investment

**Professional Unmoderated Testing:**

- **UserTesting:** Professional unmoderated testing ($49+ per video)
- **Maze:** Unmoderated usability testing with advanced analytics ($99/month)
- **UsabilityHub:** First-click tests, preference tests ($89/month)

**Moderated Testing Platforms:**

- **Lookback:** Live moderated testing platform ($200/month)
- **User Interviews:** Professional participant recruitment ($200/month)
- **Respondent:** High-quality participant sourcing ($300/month)

**Advanced Analytics:**

- **Optimal Workshop:** Card sorting, tree testing, first-click testing ($249/month)
- **Hotjar Business:** Advanced analytics and unlimited recordings ($389/month)
- **FullStory:** Comprehensive user session analysis ($199/month)

#### Budget Allocation Strategy

**Monthly Testing Budget Framework:**

- **Startup/Small Team:** $500-1000/month

  - Focus on free tools + occasional professional testing
  - Internal testing + guerrilla methods
  - 1-2 professional sessions per month

- **Growing Company:** $1000-3000/month

  - Mix of free and premium tools
  - Regular professional testing cycles
  - 4-6 professional sessions per month

- **Enterprise:** $3000-5000/month
  - Full premium tool suite
  - Dedicated testing team resources
  - 10+ professional sessions per month

**Cost Per Participant Guidelines:**

- **Internal/Free:** $0-10 (snacks, small thank-you gifts)
- **Community/Guerrilla:** $10-25 (coffee cards, small incentives)
- **Professional Recruitment:** $50-150 (depending on demographics and session length)
- **Specialized Demographics:** $100-300 (professionals, accessibility users, niche markets)

### Usability Validation Criteria

#### Integration with Definition of Done

**Quantitative Success Metrics:**

**Task Completion Rates:**

- **Primary user flows:** ≥85% completion rate
- **Critical tasks:** ≥95% completion rate
- **Secondary workflows:** ≥75% completion rate

**Error Rate Thresholds:**

- **Critical tasks:** ≤5% error rate
- **Primary workflows:** ≤15% error rate
- **Complex tasks:** ≤25% error rate

**Performance Benchmarks:**

- **Time on task:** Within 20% of benchmark for returning users
- **First-time user success:** 70% task completion without assistance
- **Expert user efficiency:** 90% of benchmark time for frequent users

**Satisfaction Scoring:**

- **System Usability Scale (SUS):** Score ≥68 (above average)
- **Task-level satisfaction:** ≥4/5 average rating
- **Overall experience rating:** ≥4/5 average rating

#### Qualitative Success Criteria

**User Understanding:**

- **Mental model alignment:** Users understand information architecture
- **Feature discoverability:** Key features found without guidance
- **Error recovery:** Users can successfully recover from common errors

**Accessibility Compliance:**

- **Screen reader compatibility:** All user flows accessible via screen reader
- **Keyboard navigation:** Complete functionality available via keyboard
- **WCAG 2.1 AA compliance:** No critical accessibility violations

**Cross-Platform Consistency:**

- **Device parity:** Equal usability across desktop and mobile
- **Browser consistency:** Identical user experience across supported browsers
- **Performance impact:** Usability maintained under performance constraints

#### Definition of Done Integration Checklist

```
UX Validation Requirements:
□ Usability testing completed for new features
□ Critical user journeys validated with target users
□ Accessibility testing passed with assistive technologies
□ Performance impact on UX measured and acceptable
□ User feedback incorporated or documented for future iterations
□ SUS score meets or exceeds target threshold (≥68)
□ Task completion rates meet defined benchmarks
□ Error rates within acceptable thresholds
□ Cross-browser/device compatibility validated
□ Documentation updated with usability findings
```

#### Continuous Improvement Framework

**Baseline Establishment:**

- Initial usability baseline measurement
- Benchmark task completion times and satisfaction scores
- Identify recurring usability patterns and issues

**Iterative Improvement Tracking:**

- Sprint-over-sprint usability metric tracking
- A/B testing for usability improvement validation
- Long-term user satisfaction trend analysis

**Knowledge Management:**

- Usability pattern library development
- Common issue documentation and solutions
- Best practice sharing across development teams

---

## 📋 Compliance

This document supports the **Definition of Done** requirements:

- ✅ Comprehensive testing strategy implemented across all levels
- ✅ Test coverage requirements met (unit 70%, integration 20%, e2e 10%)
- ✅ Quality gates integrated into development workflow
- ✅ Automated testing pipeline configured and operational
- ✅ Performance testing integrated within testing strategy
- ✅ Accessibility testing validated across test pyramid levels
- ✅ Security testing patterns implemented and verified
- ✅ Testing infrastructure properly configured and maintained

---

## 🔗 Related Documents

**Core Integration:**

- **[Architectural Guidelines](01-architectural-guidelines.md)** - _Architecture patterns determine testing strategies_
- **[Code Design Guidelines](02-code-design-guidelines.md)** - _Testable code design enables effective testing_
- **[Technical Guidelines](03-technical-guidelines.md)** - _Tech stack determines testing tools_
- **[Infrastructure Guidelines](04-infrastructure-guidelines.md)** - _Infrastructure supports automated testing_

**Supporting Documents:**

- **[Definition of Done](06-definition-of-done.md)** - _Quality gates ensure testing completeness_
- **[UX Guidelines](05-ux-guidelines.md)** - _UX testing validates user experience_
- **[Observability Guidelines](11-observability-guidelines.md)** - _Monitoring and alerting for test and production environments_
- **[12-collaboration-and-process-guidelines.md](12-collaboration-and-process-guidelines.md)**
