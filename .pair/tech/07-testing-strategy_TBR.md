# Testing Strategy

## Purpose

Define comprehensive testing approach that ensures code quality, reliability, and maintainability throughout the development lifecycle.

## Scope

**In Scope:**

- Testing methodologies and strategies
- Test automation frameworks and tools
- Code coverage requirements and standards
- Testing pyramid implementation (unit, integration, e2e)
- Quality assurance processes and procedures

**Out of Scope:**

- Production monitoring and alerting
- User acceptance testing procedures
- Performance load testing strategies
- Security penetration testing
- Manual testing workflows and documentation

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

   - [Test Framework Selection Criteria](#test-framework-selection-criteria)
   - [Common Framework Examples](#common-framework-examples)
   - [Modern Testing Tools](#modern-testing-tools)

5. [📊 Coverage Requirements](#-coverage-requirements)

   - [Minimum Coverage Targets](#minimum-coverage-targets)
   - [Coverage Quality Metrics](#coverage-quality-metrics)

6. [🔄 Testing in Development Workflow](#-testing-in-development-workflow)

   - [Development Phase Testing](#development-phase-testing)
   - [Code Review Testing](#code-review-testing)
   - [CI/CD Pipeline Testing](#cicd-pipeline-testing)

7. [🔧 Modern Testing Integration](#-modern-testing-integration)

   - [Tool-Generated Tests](#tool-generated-tests)
   - [Tool-Assisted Test Maintenance](#tool-assisted-test-maintenance)

8. [📋 Test Quality Gates](#-test-quality-gates)

   - [Pre-Development](#pre-development)
   - [During Development](#during-development)
   - [Pre-Merge](#pre-merge)
   - [Post-Deployment](#post-deployment)

9. [📈 Continuous Improvement](#-continuous-improvement)

   - [Testing Metrics](#testing-metrics)
   - [Regular Reviews](#regular-reviews)

10. [🧪 Testing Standards](#-testing-standards)

    - [Test Framework Configuration](#test-framework-configuration)
    - [Unit Testing Patterns](#unit-testing-patterns)
    - [Test Fixtures and Data Builders](#test-fixtures-and-data-builders)
    - [React Component Testing](#react-component-testing)
    - [Integration Testing for APIs](#integration-testing-for-apis)
    - [Test Organization](#test-organization)
    - [Testing Philosophy](#testing-philosophy)
    - [End-to-End Testing](#end-to-end-testing)

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

**Tool Assistance**: �

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

- **Performance Testing**: Response time and throughput validation
- **Security Testing**: Vulnerability and access control verification
- **Accessibility Testing**: WCAG compliance and usability validation
- **Compatibility Testing**: Cross-platform and browser testing

**TODO - Usability Testing Integration**: Define comprehensive usability testing methodology including:

- Testing approach (moderated vs unmoderated, remote vs in-person)
- Frequency and timing (per sprint, per release, ad-hoc)
- User recruitment and sample size guidelines
- Qualitative vs quantitative metrics collection
- Budget considerations (free tools vs premium solutions)
- Integration with UX Guidelines validation criteria

### Specialized Testing

- **API Testing**: RESTful service validation and contract testing
- **Database Testing**: Data integrity and query performance
- **UI Testing**: Component behavior and user interaction
- **Mobile Testing**: Responsive design and mobile-specific functionality

**TODO**: Expand UI Testing section to include shadcn/ui component testing and visual regression testing patterns

---

## 🛠️ Testing Tools and Framework

### Test Framework Selection Criteria

1. **AI Tool Compatibility**: Good support from AI coding assistants
2. **Language Ecosystem**: Native support for project language
3. **Assertion Library**: Rich assertion capabilities
4. **Mocking Support**: Comprehensive mocking and stubbing
5. **Reporting**: Clear test results and coverage reporting

### Common Framework Examples

- **JavaScript/TypeScript**: Jest, Vitest, Cypress, Playwright
- **Python**: pytest, unittest, Selenium
- **Java**: JUnit, TestNG, Mockito
- **C#**: xUnit, NUnit, MSTest

### Modern Testing Tools

- **Test Generation**: Modern IDE features for test case generation
- **Test Maintenance**: Automated test updating tools
- **Coverage Analysis**: Enhanced coverage gap identification
- **Quality Assessment**: Automated test quality scoring

---

## 📊 Coverage Requirements

### Minimum Coverage Targets

- **Unit Test Coverage**: 80% line coverage minimum
- **Branch Coverage**: 70% branch coverage for critical paths
- **Integration Coverage**: 100% of API endpoints and integration points
- **E2E Coverage**: 100% of critical user journeys

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

### Pre-Development

- [ ] Test plan defined based on requirements
- [ ] Test environment setup and configuration
- [ ] Test data preparation and management
- [ ] Modern testing tools configured and ready

### During Development

- [ ] Tests written before or alongside implementation
- [ ] Unit test coverage meets minimum thresholds
- [ ] Integration tests cover component interactions
- [ ] All tests pass consistently

### Pre-Merge

- [ ] Full test suite passes without failures
- [ ] Coverage requirements met across all test types
- [ ] Test code reviewed and approved
- [ ] Performance tests indicate acceptable performance

### Post-Deployment

- [ ] Smoke tests pass in production environment
- [ ] Monitoring alerts configured for test failures
- [ ] Test results documented and analyzed
- [ ] Feedback incorporated for future test improvements

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

### End-to-End Testing

#### Project Separation for E2E Tests

E2E tests must run in a **separate project** from the application being tested to ensure:

- Complete isolation of test dependencies
- Independent deployment and scaling
- Realistic production-like testing environment
- No interference between test code and application code

#### E2E Project Structure

```
workspace/
├── apps/
│   ├── web/                    # Main application
│   └── api/                    # Backend services
├── services/
│   └── payment/                # External services
└── e2e/                        # Separate E2E test project
    ├── package.json            # Independent dependencies
    ├── playwright.config.ts    # Test configuration
    ├── tests/
    │   ├── user-flows/         # User journey tests
    │   ├── api/                # API integration tests
    │   └── cross-service/      # Multi-service tests
    └── fixtures/               # Test data and helpers
```

#### Playwright Setup in Separate Project

```typescript
// e2e/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    // Point to deployed or containerized application
    baseURL: process.env.E2E_BASE_URL || "http://test-app:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  // No webServer - application runs independently
  globalSetup: "./setup/global-setup.ts",
  globalTeardown: "./setup/global-teardown.ts",
});
```

#### Environment Setup for Isolated Testing

```typescript
// e2e/setup/global-setup.ts
import { chromium } from "@playwright/test";
import { waitForServices } from "./wait-for-services";

async function globalSetup() {
  // Wait for all required services to be ready
  await waitForServices([
    process.env.E2E_BASE_URL || "http://test-app:3000",
    process.env.E2E_API_URL || "http://test-api:4000",
    process.env.E2E_DB_URL || "postgresql://test-db:5432",
  ]);

  // Setup test data
  await setupTestDatabase();

  console.log("✅ E2E environment ready");
}

async function setupTestDatabase() {
  // Reset and seed test database
  const response = await fetch(`${process.env.E2E_API_URL}/test/reset`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.E2E_ADMIN_TOKEN}` },
  });

  if (!response.ok) {
    throw new Error("Failed to setup test database");
  }
}

export default globalSetup;
```

```typescript
// e2e/setup/wait-for-services.ts
export const waitForServices = async (
  urls: string[],
  timeout = 60000
): Promise<void> => {
  const startTime = Date.now();

  for (const url of urls) {
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) {
          console.log(`✅ Service ready: ${url}`);
          break;
        }
      } catch (error) {
        console.log(`⏳ Waiting for service: ${url}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
};
```

#### User Journey Testing Against Deployed Services

```typescript
// e2e/tests/user-flows/user-registration.spec.ts
import { test, expect } from "@playwright/test";
import { TestUser } from "../fixtures/test-users";

test.describe("User Registration Flow", () => {
  test("should complete full registration journey", async ({ page }) => {
    // Test against deployed application
    await page.goto("/register");

    // Generate unique test data
    const testUser = TestUser.create();

    // Fill registration form
    await page.fill('[data-testid="name-input"]', testUser.name);
    await page.fill('[data-testid="email-input"]', testUser.email);
    await page.fill('[data-testid="password-input"]', testUser.password);

    // Submit form
    await page.click('[data-testid="submit-button"]');

    // Verify success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page).toHaveURL("/welcome");

    // Verify user was actually created in system
    await verifyUserExistsInDatabase(testUser.email);
  });

  test("should handle registration with existing email", async ({ page }) => {
    // Use pre-seeded test data
    const existingUser = TestUser.existing();

    await page.goto("/register");

    await page.fill('[data-testid="email-input"]', existingUser.email);
    await page.fill('[data-testid="name-input"]', "Jane Doe");
    await page.fill('[data-testid="password-input"]', "Password123!");

    await page.click('[data-testid="submit-button"]');

    // Verify error message
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      "Email already exists"
    );
    await expect(page).toHaveURL("/register");
  });
});

// Helper function to verify against real system
async function verifyUserExistsInDatabase(email: string): Promise<void> {
  const response = await fetch(
    `${process.env.E2E_API_URL}/test/users/${email}`,
    {
      headers: { Authorization: `Bearer ${process.env.E2E_ADMIN_TOKEN}` },
    }
  );

  expect(response.status).toBe(200);
}
```

#### Cross-Service Integration Testing

```typescript
// e2e/tests/cross-service/payment-flow.spec.ts
import { test, expect } from "@playwright/test";
import { TestPayment } from "../fixtures/test-payments";

test.describe("Payment Integration Flow", () => {
  test("should process payment across all services", async ({ page }) => {
    const testPayment = TestPayment.create();

    // Step 1: Create order in main app
    await page.goto("/checkout");
    await fillCheckoutForm(page, testPayment);
    await page.click('[data-testid="submit-payment"]');

    // Step 2: Verify payment service was called
    const paymentRecord = await verifyPaymentServiceCall(testPayment.orderId);
    expect(paymentRecord.status).toBe("processed");

    // Step 3: Verify inventory service updated
    const inventoryUpdate = await verifyInventoryServiceUpdate(
      testPayment.items
    );
    expect(inventoryUpdate.success).toBe(true);

    // Step 4: Verify notification service sent emails
    const emailsSent = await verifyNotificationServiceEmails(
      testPayment.customerEmail
    );
    expect(emailsSent.length).toBeGreaterThan(0);

    // Step 5: Verify final UI state
    await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
  });
});

// Service verification helpers
async function verifyPaymentServiceCall(orderId: string) {
  const response = await fetch(
    `${process.env.E2E_PAYMENT_SERVICE_URL}/payments/${orderId}`,
    {
      headers: { Authorization: `Bearer ${process.env.E2E_SERVICE_TOKEN}` },
    }
  );
  return response.json();
}

async function verifyInventoryServiceUpdate(items: PaymentItem[]) {
  const response = await fetch(
    `${process.env.E2E_INVENTORY_SERVICE_URL}/updates`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.E2E_SERVICE_TOKEN}` },
      body: JSON.stringify({ items }),
    }
  );
  return response.json();
}
```

#### API End-to-End Testing Against Real Services

```typescript
// e2e/tests/api/user-api.spec.ts
import { test, expect } from "@playwright/test";
import { TestAuth } from "../fixtures/test-auth";

test.describe("User API End-to-End", () => {
  let authToken: string;
  let userId: string;

  test.beforeAll(async ({ request }) => {
    // Authenticate against real auth service
    const authResponse = await request.post(
      `${process.env.E2E_API_URL}/auth/login`,
      {
        data: {
          email: TestAuth.adminUser.email,
          password: TestAuth.adminUser.password,
        },
      }
    );

    const { token } = await authResponse.json();
    authToken = token;
  });

  test("should complete full user lifecycle", async ({ request }) => {
    const testUser = TestUser.create();

    // Create user via real API
    const createResponse = await request.post(
      `${process.env.E2E_API_URL}/users`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          name: testUser.name,
          email: testUser.email,
        },
      }
    );

    expect(createResponse.status()).toBe(201);
    const { user } = await createResponse.json();
    userId = user.id;

    // Get user from real database
    const getResponse = await request.get(
      `${process.env.E2E_API_URL}/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(getResponse.status()).toBe(200);
    const fetchedUser = await getResponse.json();
    expect(fetchedUser.user.email).toBe(testUser.email);

    // Update user in real system
    const updateResponse = await request.put(
      `${process.env.E2E_API_URL}/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { name: "Updated Name" },
      }
    );

    expect(updateResponse.status()).toBe(200);
    const updatedUser = await updateResponse.json();
    expect(updatedUser.user.name).toBe("Updated Name");

    // Delete user from real system
    const deleteResponse = await request.delete(
      `${process.env.E2E_API_URL}/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(deleteResponse.status()).toBe(204);

    // Verify deletion in real database
    const verifyResponse = await request.get(
      `${process.env.E2E_API_URL}/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(verifyResponse.status()).toBe(404);
  });
});
```

#### Test Data Management for Separate Projects

```typescript
// e2e/fixtures/test-users.ts
export class TestUser {
  constructor(
    public readonly name: string,
    public readonly email: string,
    public readonly password: string
  ) {}

  static create(): TestUser {
    const timestamp = Date.now();
    return new TestUser(
      `Test User ${timestamp}`,
      `test.user.${timestamp}@e2e.test`,
      "TestPassword123!"
    );
  }

  static existing(): TestUser {
    // Pre-seeded user in test environment
    return new TestUser(
      "Existing User",
      "existing.user@e2e.test",
      "ExistingPassword123!"
    );
  }

  static admin(): TestUser {
    return new TestUser("Admin User", "admin@e2e.test", "AdminPassword123!");
  }
}

// e2e/fixtures/test-auth.ts
export class TestAuth {
  static get adminUser() {
    return {
      email: process.env.E2E_ADMIN_EMAIL || "admin@e2e.test",
      password: process.env.E2E_ADMIN_PASSWORD || "AdminPassword123!",
    };
  }

  static get serviceToken() {
    return process.env.E2E_SERVICE_TOKEN || "test-service-token";
  }
}
```

#### Environment Configuration for Separate E2E Project

```typescript
// e2e/.env.example
# Application URLs (pointing to deployed/containerized apps)
E2E_BASE_URL=http://test-app:3000
E2E_API_URL=http://test-api:4000
E2E_PAYMENT_SERVICE_URL=http://test-payment:5000
E2E_INVENTORY_SERVICE_URL=http://test-inventory:6000

# Test credentials
E2E_ADMIN_EMAIL=admin@e2e.test
E2E_ADMIN_PASSWORD=AdminPassword123!
E2E_SERVICE_TOKEN=test-service-token-123

# Database
E2E_DB_URL=postgresql://test-db:5432/e2e_test
```

```json
// e2e/package.json - Independent dependencies
{
  "name": "e2e-tests",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui",
    "test:report": "playwright show-report"
  },
  "dependencies": {
    "@playwright/test": "^1.40.0"
  },
  "devDependencies": {
    "dotenv": "^16.0.0"
  }
}
```

#### Real System State Verification

```typescript
// e2e/helpers/system-verification.ts
import { test } from "@playwright/test";

export const withSystemVerification = () => {
  return {
    verifyUserExists: async (email: string): Promise<boolean> => {
      const response = await fetch(
        `${process.env.E2E_API_URL}/test/users/${email}`,
        {
          headers: { Authorization: `Bearer ${process.env.E2E_SERVICE_TOKEN}` },
        }
      );
      return response.status === 200;
    },

    verifyEmailSent: async (to: string, subject: string): Promise<boolean> => {
      // Verify in real email service or queue
      const response = await fetch(
        `${process.env.E2E_EMAIL_SERVICE_URL}/sent-emails`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.E2E_SERVICE_TOKEN}` },
          body: JSON.stringify({ to, subject }),
        }
      );
      const emails = await response.json();
      return emails.some(
        (email: any) => email.to === to && email.subject.includes(subject)
      );
    },

    verifyPaymentProcessed: async (orderId: string): Promise<boolean> => {
      const response = await fetch(
        `${process.env.E2E_PAYMENT_SERVICE_URL}/payments/${orderId}`,
        {
          headers: { Authorization: `Bearer ${process.env.E2E_SERVICE_TOKEN}` },
        }
      );
      const payment = await response.json();
      return payment.status === "processed";
    },

    verifyInventoryUpdated: async (
      productId: string,
      expectedQuantity: number
    ): Promise<boolean> => {
      const response = await fetch(
        `${process.env.E2E_INVENTORY_SERVICE_URL}/products/${productId}`,
        {
          headers: { Authorization: `Bearer ${process.env.E2E_SERVICE_TOKEN}` },
        }
      );
      const product = await response.json();
      return product.quantity === expectedQuantity;
    },
  };
};

// Usage in tests
test.describe("User Registration with System Verification", () => {
  const system = withSystemVerification();

  test("should persist user data across all services", async ({ page }) => {
    const testUser = TestUser.create();

    await page.goto("/register");
    await page.fill('[data-testid="email-input"]', testUser.email);
    await page.fill('[data-testid="name-input"]', testUser.name);
    await page.click('[data-testid="submit-button"]');

    // Verify user exists in real database
    const userExists = await system.verifyUserExists(testUser.email);
    expect(userExists).toBe(true);

    // Verify welcome email sent via real email service
    const emailSent = await system.verifyEmailSent(testUser.email, "Welcome");
    expect(emailSent).toBe(true);
  });
});
```

#### CI/CD Integration for Separate E2E Project

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    services:
      # Start real services in containers
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: e2e_test
        ports:
          - 5432:5432

      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      # Build and start application services
      - name: Build application
        run: |
          docker-compose -f docker-compose.e2e.yml build
          docker-compose -f docker-compose.e2e.yml up -d

      # Wait for services to be ready
      - name: Wait for services
        run: |
          timeout 300 bash -c 'until curl -f http://localhost:3000/health; do sleep 5; done'
          timeout 300 bash -c 'until curl -f http://localhost:4000/health; do sleep 5; done'

      # Setup E2E test environment
      - name: Setup E2E project
        working-directory: ./e2e
        run: |
          npm ci
          npx playwright install

      # Run E2E tests against real services
      - name: Run E2E tests
        working-directory: ./e2e
        env:
          E2E_BASE_URL: http://localhost:3000
          E2E_API_URL: http://localhost:4000
          E2E_ADMIN_EMAIL: admin@e2e.test
          E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
        run: npx playwright test

      # Upload results
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-results
          path: e2e/test-results/
```

---

This testing strategy ensures comprehensive quality assurance while leveraging modern development tools to enhance testing efficiency and coverage in the development process.
