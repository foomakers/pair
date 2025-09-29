# Code Design Guidelines

## Purpose

Define code structure, design patterns, and implementation standards that ensure high code quality, readability, and maintainability.

## Scope

**In Scope:**

- Code structure and design patterns
- Implementation standards and best practices
- Framework-specific patterns (React/Next.js, TypeScript)
- Code readability and maintainability guidelines
- Design principles and coding conventions

**Out of Scope:**

- Infrastructure and deployment configurations
- Performance optimization strategies
- Security implementation details
- Testing frameworks and strategies
- Third-party library integration patterns

---

## 📋 Table of Contents

1. [🎯 Design Principles](#-design-principles)

   - [Clear and Readable Code](#1-clear-and-readable-code)

2. [⚛️ Framework Patterns](#️-framework-patterns)

   - [React/Next.js Standards](#reactnextjs-standards)
     - [Component Definition](#component-definition)
     - [Custom Hooks Pattern](#custom-hooks-pattern)
     - [State Management with useReducer](#state-management-with-usereducer)
     - [Context Pattern for Global State](#context-pattern-for-global-state)
     - [Performance Optimization](#performance-optimization)
   - [Fastify Standards](#fastify-standards)
     - [Route Structure](#route-structure)
     - [Service Layer Pattern](#service-layer-pattern)
     - [Repository Pattern](#repository-pattern)
     - [Error Handling Pattern](#error-handling-pattern)
     - [Dependency Injection](#dependency-injection)

3. [🔧 Code Quality Standards](#-code-quality-standards)

   - [ESLint Configuration](#eslint-configuration)
     - [Shared ESLint Configuration](#shared-eslint-configuration)
     - [Project-Specific Configuration](#project-specific-configuration)
   - [Prettier Configuration](#prettier-configuration)
     - [Shared Prettier Configuration](#shared-prettier-configuration)
   - [Quality Metrics and Thresholds](#quality-metrics-and-thresholds)
     - [Coverage Requirements](#coverage-requirements)
     - [Complexity Analysis](#complexity-analysis)
     - [Automated Quality Gates](#automated-quality-gates)

4. [🔧 Implementation Standards](#-implementation-standards)

   - [Development Environment Standards](#development-environment-standards)
     - [Local Development Independence](#local-development-independence)
     - [Implementation Patterns](#implementation-patterns)
     - [Service Abstraction for Local Development](#service-abstraction-for-local-development)
     - [Service Factory Pattern for Environment Switching](#service-factory-pattern-for-environment-switching)
     - [Development Scripts with Service Management](#development-scripts-with-service-management)
     - [External Service Mocking Strategy](#external-service-mocking-strategy)
     - [Environment Detection and Service Resolution](#environment-detection-and-service-resolution)
   - [Function Design](#function-design)
   - [Error Handling](#error-handling)
   - [Performance Considerations](#performance-considerations)

5. [📁 Code Organization](#-code-organization)

   - [File Structure Standards](#file-structure-standards)
   - [Naming Conventions](#naming-conventions)

6. [🏗️ Workspace Structure](#️-workspace-structure)

   - [Feature-Based Architecture](#feature-based-architecture)
   - [Monorepo Organization](#monorepo-organization)
   - [Directory Structure Standards](#directory-structure-standards)
   - [Feature Module Guidelines](#feature-module-guidelines)

7. [📦 Dependency Management](#-dependency-management)

   - [PNPM Workspace Configuration](#pnpm-workspace-configuration)
   - [Version Catalog Strategy](#version-catalog-strategy)
   - [Shared Dependencies](#shared-dependencies)
   - [Library Version Consistency](#library-version-consistency)

8. [🔷 TypeScript Standards](#-typescript-standards)

   - [Version Management](#version-management)
   - [TSConfig Configuration](#tsconfig-configuration)
   - [Type Safety Principles](#type-safety-principles)
   - [Import/Export Conventions](#importexport-conventions)

9. [ Quality Gates](#-quality-gates)

   - [Code Review Checklist](#code-review-checklist)
   - [Automated Checks](#automated-checks)

10. [📋 Compliance](#-compliance)

---

## 🎯 Design Principles

### 1. Clear and Readable Code

- **Clear Naming**: Use descriptive, unambiguous names for functions, variables, and classes

---

## ⚛️ Framework Patterns

### React/Next.js Standards

#### Component Definition

```typescript
// ✅ Function components with arrow functions for consistency
type UserCardProps = {
  readonly user: User;
  readonly onEdit?: (user: User) => void;
  readonly children?: React.ReactNode; // Always explicit
};

const UserCard = ({ user, onEdit, children }: UserCardProps) => {
  // Component logic here
  return (
    <div>
      <h3>{user.name}</h3>
      {onEdit && <button onClick={() => onEdit(user)}>Edit</button>}
      {children}
    </div>
  );
};

// ✅ Export named components
export { UserCard };
export type { UserCardProps };
```

#### Custom Hooks Pattern

```typescript
// ✅ Custom hooks with clear return object (not array)
type UseUserDataReturn = {
  readonly user: User | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
};

const useUserData = (userId: string): UseUserDataReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const userData = await getUserById(userId);
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return { user, loading, error, refetch: fetchUser };
};
```

#### State Management with useReducer

```typescript
// ✅ Discriminated unions for complex state
type FormState =
  | { status: "idle"; data: FormData }
  | { status: "submitting"; data: FormData }
  | { status: "success"; data: FormData; result: SubmitResult }
  | { status: "error"; data: FormData; error: string };

type FormAction =
  | { type: "submit" }
  | { type: "success"; result: SubmitResult }
  | { type: "error"; error: string }
  | { type: "reset"; data: FormData };

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case "submit":
      return { ...state, status: "submitting" };
    case "success":
      return { status: "success", data: state.data, result: action.result };
    case "error":
      return { status: "error", data: state.data, error: action.error };
    case "reset":
      return { status: "idle", data: action.data };
    default:
      const _exhaustive: never = action;
      throw new Error("Unhandled action type");
  }
};

const useFormState = (initialData: FormData) => {
  const [state, dispatch] = useReducer(formReducer, {
    status: "idle",
    data: initialData,
  });

  return { state, dispatch };
};
```

#### Context Pattern for Global State

```typescript
// ✅ Context only for truly global state
type AuthContextValue = {
  readonly user: User | null;
  readonly login: (credentials: LoginCredentials) => Promise<void>;
  readonly logout: () => void;
  readonly loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

// ✅ Provider component
type AuthProviderProps = {
  readonly children: React.ReactNode;
};

const AuthProvider = ({ children }: AuthProviderProps) => {
  // Auth logic implementation
  const value: AuthContextValue = {
    user,
    login,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

#### Performance Optimization

```typescript
// ✅ useCallback/useMemo only when necessary
const ExpensiveComponent = ({ items, onSelect }: ExpensiveComponentProps) => {
  // ❌ Don't use useCallback by default
  // const handleClick = useCallback((item) => onSelect(item), [onSelect]);

  // ✅ Use only when child components are memoized and deps are stable
  const sortedItems = useMemo(
    () => items.sort((a, b) => a.priority - b.priority),
    [items] // Only when expensive calculation
  );

  return (
    <div>
      {sortedItems.map((item) => (
        <ItemCard key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
};
```

### Fastify Standards

#### Route Structure

```typescript
// ✅ Route handlers always async with proper typing
type CreateUserRequest = {
  readonly Body: {
    readonly name: string;
    readonly email: string;
  };
};

type CreateUserResponse = {
  readonly user: User;
  readonly created: true;
};

const createUserRoute = async (
  request: FastifyRequest<CreateUserRequest>,
  reply: FastifyReply
): Promise<CreateUserResponse> => {
  // Validate at boundary
  const createUserData = CreateUserSchema.parse(request.body);

  // Delegate to service layer
  const result = await userService.createUser(createUserData);

  return match(result, {
    success: (user) => {
      reply.status(201);
      return { user, created: true };
    },
    error: (error) => {
      reply.status(400);
      throw new Error(error.message);
    },
  });
};

// ✅ Schema validation with Zod
const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
```

#### Service Layer Pattern

```typescript
// ✅ Result pattern for error handling
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

type UserService = {
  readonly createUser: (data: CreateUserData) => Promise<Result<User>>;
  readonly getUserById: (id: UserId) => Promise<Result<User>>;
  readonly updateUser: (
    id: UserId,
    data: UpdateUserData
  ) => Promise<Result<User>>;
};

const createUserService = (repository: UserRepository): UserService => ({
  createUser: async (data) => {
    try {
      // Business logic validation
      const validatedData = await validateCreateUserData(data);
      const user = await repository.create(validatedData);
      return { success: true, data: user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Unknown error"),
      };
    }
  },

  getUserById: async (id) => {
    try {
      const user = await repository.findById(id);
      if (!user) {
        return { success: false, error: new Error("User not found") };
      }
      return { success: true, data: user };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  },

  updateUser: async (id, data) => {
    try {
      const existingUser = await repository.findById(id);
      if (!existingUser) {
        return { success: false, error: new Error("User not found") };
      }

      const updatedUser = await repository.update(id, data);
      return { success: true, data: updatedUser };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  },
});
```

#### Repository Pattern

```typescript
// ✅ Pure functions for data access
type UserRepository = {
  readonly create: (data: CreateUserData) => Promise<User>;
  readonly findById: (id: UserId) => Promise<User | null>;
  readonly update: (id: UserId, data: UpdateUserData) => Promise<User>;
  readonly delete: (id: UserId) => Promise<void>;
  readonly findByEmail: (email: Email) => Promise<User | null>;
};

const createUserRepository = (db: Database): UserRepository => ({
  create: async (data) => {
    const result = await db.query(
      `
      INSERT INTO users (name, email) 
      VALUES ($1, $2) 
      RETURNING *
    `,
      [data.name, data.email]
    );

    return UserSchema.parse(result.rows[0]);
  },

  findById: async (id) => {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);

    return result.rows[0] ? UserSchema.parse(result.rows[0]) : null;
  },

  update: async (id, data) => {
    const result = await db.query(
      `
      UPDATE users 
      SET name = $1, email = $2, updated_at = NOW()
      WHERE id = $3 
      RETURNING *
    `,
      [data.name, data.email, id]
    );

    return UserSchema.parse(result.rows[0]);
  },

  delete: async (id) => {
    await db.query("DELETE FROM users WHERE id = $1", [id]);
  },

  findByEmail: async (email) => {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    return result.rows[0] ? UserSchema.parse(result.rows[0]) : null;
  },
});
```

#### Error Handling Pattern

```typescript
// ✅ Functional error handling with match utility
const match = <T, E, R>(
  result: Result<T, E>,
  handlers: {
    success: (data: T) => R;
    error: (error: E) => R;
  }
): R => {
  return result.success
    ? handlers.success(result.data)
    : handlers.error(result.error);
};

// ✅ Usage in route handlers
const getUserRoute = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  const userId = createUserId(request.params.id);
  const result = await userService.getUserById(userId);

  return match(result, {
    success: (user) => ({ user }),
    error: (error) => {
      reply.status(404);
      throw new Error(error.message);
    },
  });
};
```

#### Dependency Injection

```typescript
// ✅ Functional dependency injection
type Dependencies = {
  readonly userRepository: UserRepository;
  readonly emailService: EmailService;
  readonly logger: Logger;
};

const createApp = (deps: Dependencies) => {
  const userService = createUserService(deps.userRepository);

  const app = fastify();

  app.post("/users", async (request, reply) => {
    return createUserRoute(request, reply, userService);
  });

  return app;
};

// ✅ Bootstrap with real dependencies
const bootstrap = async () => {
  const db = await createDatabase();
  const deps: Dependencies = {
    userRepository: createUserRepository(db),
    emailService: createEmailService(),
    logger: createLogger(),
  };

  return createApp(deps);
};
```

---

## 🔧 Code Quality Standards

### ESLint Configuration

#### Shared ESLint Configuration

```javascript
// tools/eslint-config/base.js - Shared workspace for common rules
module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking",
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: true,
  },
  rules: {
    // TypeScript-specific rules that enforce our guidelines
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/prefer-unknown-over-any": "error",
    "@typescript-eslint/strict-boolean-expressions": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",

    // Functional programming preferences
    "@typescript-eslint/prefer-readonly": "error",
    "@typescript-eslint/prefer-readonly-parameter-types": "warn",
    "prefer-const": "error",
    "no-var": "error",

    // Code quality
    complexity: ["error", 10],
    "max-depth": ["error", 4],
    "max-lines-per-function": ["error", 50],
    "max-params": ["error", 4],

    // Import organization
    "import/order": [
      "error",
      {
        groups: [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
        ],
        "newlines-between": "always",
        alphabetize: { order: "asc" },
      },
    ],
    "import/no-default-export": "error", // Prefer named exports

    // Prevent runtime errors that should be compile-time
    "no-throw-literal": "error",
    "@typescript-eslint/only-throw-error": "error",
  },
};
```

```javascript
// tools/eslint-config/react.js - React-specific extensions
module.exports = {
  extends: ["./base.js"],
  plugins: ["react", "react-hooks"],
  rules: {
    // React best practices
    "react/prop-types": "off", // We use TypeScript
    "react/react-in-jsx-scope": "off", // Not needed in React 17+
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",

    // Functional component patterns
    "react/function-component-definition": [
      "error",
      {
        namedComponents: "arrow-function",
        unnamedComponents: "arrow-function",
      },
    ],

    // Performance
    "react/jsx-no-bind": "error",
    "react/jsx-no-literals": "warn",
  },
};
```

**Accessibility ESLint Configuration:**

For comprehensive accessibility standards and ESLint integration, see [Accessibility Guidelines](08-accessibility-guidelines.md) which provides:

- Complete `react-a11y.js` extension with jsx-a11y plugin rules
- WCAG compliance rules integration
- Accessibility-specific linting standards aligned with [UX Guidelines](05-ux-guidelines.md)
- Development workflow integration for accessibility validation

#### Project-Specific Configuration

```javascript
// apps/web/.eslintrc.js
module.exports = {
  extends: ["../../tools/eslint-config/react.js"],
  rules: {
    // App-specific overrides if needed
  },
};

// services/api/.eslintrc.js
module.exports = {
  extends: ["../../tools/eslint-config/base.js"],
  rules: {
    // API-specific rules
    "@typescript-eslint/prefer-readonly-parameter-types": "off", // May be too strict for APIs
  },
};
```

### Prettier Configuration

#### Shared Prettier Configuration

```javascript
// tools/prettier-config/index.js
module.exports = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: "as-needed",
  trailingComma: "es5",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",

  // TypeScript-specific
  parser: "typescript",

  // Import sorting
  importOrder: ["^@core/(.*)$", "^@server/(.*)$", "^@ui/(.*)$", "^[./]"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};
```

```json
// apps/web/.prettierrc.js
module.exports = require('../../tools/prettier-config');

// services/api/.prettierrc.js
module.exports = require('../../tools/prettier-config');
```

### Quality Metrics and Thresholds

#### Coverage Requirements

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        global: {
          branches: 80,
          functions: 85,
          lines: 85,
          statements: 85,
        },
        // Exclude test files and type definitions
        exclude: ["src/test/**", "src/types/**", "**/*.d.ts", "**/*.config.ts"],
      },
      // Only measure meaningful coverage
      include: [
        "src/services/**/*.ts",
        "src/utils/**/*.ts",
        "src/components/**/*.tsx",
      ],
    },
  },
});
```

#### Complexity Analysis

```javascript
// .eslintrc.js complexity rules
module.exports = {
  rules: {
    complexity: ["error", { max: 10 }],
    "max-depth": ["error", 4],
    "max-lines-per-function": ["error", { max: 50, skipBlankLines: true }],
    "max-params": ["error", 4],

    // TypeScript complexity
    "@typescript-eslint/cognitive-complexity": ["error", 15],
  },
};
```

#### Automated Quality Gates

```json
// package.json scripts
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write src/**/*.{ts,tsx}",
    "format:check": "prettier --check src/**/*.{ts,tsx}",
    "type-check": "tsc --noEmit",
    "quality:check": "npm run lint && npm run format:check && npm run type-check",
    "test:coverage": "vitest run --coverage",
    "quality:gate": "npm run quality:check && npm run test:coverage"
  }
}
```

---

## 🔧 Implementation Standards

### Development Environment Standards

#### Local Development Independence

**Principle**: The monorepo must be executable locally without external services, unless there are no alternative solutions.

- **Self-Contained Development**: All dependencies required for local development must be manageable through project scripts
- **Automated Service Setup**: Development scripts must automatically provision required services (databases, message queues, etc.)
- **External Service Isolation**: External service dependencies must be abstracted and mockable for local development
- **Zero-Configuration Start**: Developers should be able to run the entire project with a single command

#### Implementation Patterns

```json
// package.json - Root level scripts
{
  "scripts": {
    "dev": "run-p dev:services dev:apps",
    "dev:services": "docker-compose -f docker-compose.dev.yml up -d",
    "dev:apps": "wait-on tcp:5432 tcp:6379 && run-p dev:web dev:api",
    "dev:web": "npm run dev --workspace=apps/web",
    "dev:api": "npm run dev --workspace=services/api",
    "dev:setup": "npm run dev:services && npm run db:migrate && npm run db:seed",
    "dev:clean": "docker-compose -f docker-compose.dev.yml down -v"
  }
}
```

```yaml
# docker-compose.dev.yml - Local services only
version: "3.8"

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: app_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev:/var/lib/postgresql/data
      - ./scripts/db/init:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev:/data

  # Local email service for development
  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025" # SMTP
      - "8025:8025" # Web UI

volumes:
  postgres_dev:
  redis_dev:
```

#### Service Abstraction for Local Development

```typescript
// src/config/environment.ts
type Environment = "development" | "test" | "production";

type ServiceConfig = {
  database: {
    url: string;
    ssl: boolean;
  };
  redis: {
    url: string;
  };
  email: {
    provider: "smtp" | "sendgrid" | "mock";
    config: Record<string, unknown>;
  };
  payment: {
    provider: "stripe" | "mock";
    config: Record<string, unknown>;
  };
};

const createConfig = (env: Environment): ServiceConfig => {
  switch (env) {
    case "development":
      return {
        database: {
          url: "postgresql://dev:dev@localhost:5432/app_dev",
          ssl: false,
        },
        redis: {
          url: "redis://localhost:6379",
        },
        email: {
          provider: "smtp",
          config: {
            host: "localhost",
            port: 1025, // MailHog
            secure: false,
          },
        },
        payment: {
          provider: "mock", // Always mock in development
          config: {},
        },
      };

    case "production":
      return {
        database: {
          url: process.env.DATABASE_URL!,
          ssl: true,
        },
        redis: {
          url: process.env.REDIS_URL!,
        },
        email: {
          provider: "sendgrid",
          config: {
            apiKey: process.env.SENDGRID_API_KEY!,
          },
        },
        payment: {
          provider: "stripe",
          config: {
            secretKey: process.env.STRIPE_SECRET_KEY!,
          },
        },
      };
  }
};
```

#### Service Factory Pattern for Environment Switching

```typescript
// src/services/email/email-service-factory.ts
import type { EmailService } from "./types";
import { createSmtpEmailService } from "./smtp-email-service";
import { createSendGridEmailService } from "./sendgrid-email-service";
import { createMockEmailService } from "./mock-email-service";

type EmailServiceConfig = {
  provider: "smtp" | "sendgrid" | "mock";
  config: Record<string, unknown>;
};

export const createEmailService = (
  config: EmailServiceConfig
): EmailService => {
  switch (config.provider) {
    case "smtp":
      return createSmtpEmailService(config.config);
    case "sendgrid":
      return createSendGridEmailService(config.config);
    case "mock":
      return createMockEmailService();
    default:
      throw new Error(`Unsupported email provider: ${config.provider}`);
  }
};

// src/services/email/mock-email-service.ts
export const createMockEmailService = (): EmailService => ({
  sendEmail: async (to, subject, body) => {
    console.log(`📧 Mock Email Sent:`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${body.substring(0, 100)}...`);

    // Always succeed in development
    return { success: true, messageId: `mock-${Date.now()}` };
  },

  sendTemplateEmail: async (to, templateId, data) => {
    console.log(`📧 Mock Template Email Sent:`);
    console.log(`  To: ${to}`);
    console.log(`  Template: ${templateId}`);
    console.log(`  Data:`, data);

    return { success: true, messageId: `mock-template-${Date.now()}` };
  },
});
```

#### Development Scripts with Service Management

```bash
#!/bin/bash
# scripts/dev-setup.sh

set -e

echo "🚀 Setting up development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start local services
echo "📦 Starting local services..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
npx wait-on tcp:localhost:5432 tcp:localhost:6379

# Install dependencies
echo "📚 Installing dependencies..."
npm ci

# Run database migrations
echo "🗄️  Running database migrations..."
npm run db:migrate

# Seed development data
echo "🌱 Seeding development data..."
npm run db:seed

echo "✅ Development environment ready!"
echo "🌐 Web app: http://localhost:3000"
echo "🔧 API: http://localhost:4000"
echo "📧 Email UI: http://localhost:8025"
```

```json
// apps/web/package.json
{
  "scripts": {
    "dev": "wait-on tcp:localhost:4000 && next dev",
    "build": "next build",
    "start": "next start"
  }
}

// services/api/package.json
{
  "scripts": {
    "dev": "wait-on tcp:localhost:5432 && tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

#### External Service Mocking Strategy

```typescript
// src/services/payment/payment-service-factory.ts
export const createPaymentService = (
  config: PaymentServiceConfig
): PaymentService => {
  switch (config.provider) {
    case "stripe":
      return createStripePaymentService(config.config);
    case "mock":
      return createMockPaymentService();
    default:
      throw new Error(`Unsupported payment provider: ${config.provider}`);
  }
};

// src/services/payment/mock-payment-service.ts
export const createMockPaymentService = (): PaymentService => ({
  createPaymentIntent: async (amount, currency) => {
    // Simulate realistic delays
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      success: true,
      data: {
        id: `pi_mock_${Date.now()}`,
        clientSecret: `pi_mock_${Date.now()}_secret_${Math.random()}`,
        status: "requires_payment_method",
      },
    };
  },

  confirmPayment: async (paymentIntentId) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate occasional failures for testing
    if (Math.random() < 0.1) {
      return {
        success: false,
        error: new Error("Mock payment failed - insufficient funds"),
      };
    }

    return {
      success: true,
      data: {
        id: paymentIntentId,
        status: "succeeded",
        amount: 2000,
        currency: "eur",
      },
    };
  },
});
```

#### Environment Detection and Service Resolution

```typescript
// src/bootstrap.ts
import { createConfig } from "./config/environment";
import { createEmailService } from "./services/email/email-service-factory";
import { createPaymentService } from "./services/payment/payment-service-factory";
import { createApp } from "./app";

export const bootstrap = async () => {
  const environment = (process.env.NODE_ENV as Environment) || "development";
  const config = createConfig(environment);

  // Create services based on environment
  const dependencies = {
    emailService: createEmailService(config.email),
    paymentService: createPaymentService(config.payment),
    database: await createDatabase(config.database),
    redis: await createRedisClient(config.redis),
  };

  console.log(`🌍 Environment: ${environment}`);
  console.log(`📧 Email Service: ${config.email.provider}`);
  console.log(`💳 Payment Service: ${config.payment.provider}`);

  return createApp(dependencies);
};
```

### Function Design

- **Pure Functions**: Prefer functions without side effects
- **Function Length**: Keep functions under 20 lines when possible
- **Parameter Limit**: Maximum 3-4 parameters; use objects for more
- **Return Types**: Always specify return types in typed languages
- **Single Responsibility**: Each function/class should have one clear purpose
- **Explicit Interfaces**: Well-defined contracts between components
- **Self-Documenting Code**: Code should be readable without comments through meaningful names and clear structure

### 2. Consistent Patterns

- **Established Conventions**: Follow language-specific and framework conventions
- **Pattern Library**: Reusable design patterns for common scenarios
- **Code Templates**: Standardized structures for common implementations
- **Style Consistency**: Uniform formatting and organization

### 3. Maintainable Design

- **SOLID Principles**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY (Don't Repeat Yourself)**: Eliminate code duplication
- **KISS (Keep It Simple, Stupid)**: Prefer simple solutions over complex ones
- **YAGNI (You Aren't Gonna Need It)**: Implement only what's currently needed

#### ✅ Self-Documenting Code Examples

```typescript
// ❌ Bad: Requires comments to understand
function calc(u: User, r: number): number {
  // Calculate user total with tax rate
  return (
    u.items.reduce((sum, item) => sum + item.price * item.qty, 0) * (1 + r)
  );
}

// ✅ Good: Self-documenting through naming
function calculateUserOrderTotalWithTax(user: User, taxRate: number): number {
  const orderSubtotal = calculateOrderSubtotal(user.items);
  return applyTaxToSubtotal(orderSubtotal, taxRate);
}

function calculateOrderSubtotal(items: OrderItem[]): number {
  return items.reduce(
    (subtotal, item) => subtotal + item.unitPrice * item.quantity,
    0
  );
}

function applyTaxToSubtotal(subtotal: number, taxRate: number): number {
  return subtotal * (1 + taxRate);
}
```

```typescript
// ❌ Bad: Magic numbers and unclear intent
function validateUser(user: User): boolean {
  if (user.age < 18) return false;
  if (user.email.length < 5) return false;
  if (user.name.length < 2) return false;
  return true;
}

// ✅ Good: Named constants and clear business rules
const MINIMUM_USER_AGE = 18;
const MINIMUM_EMAIL_LENGTH = 5;
const MINIMUM_NAME_LENGTH = 2;

function validateUserMeetsMinimumRequirements(user: User): boolean {
  return (
    userMeetsAgeRequirement(user.age) &&
    emailMeetsLengthRequirement(user.email) &&
    nameMeetsLengthRequirement(user.name)
  );
}

function userMeetsAgeRequirement(age: number): boolean {
  return age >= MINIMUM_USER_AGE;
}

function emailMeetsLengthRequirement(email: string): boolean {
  return email.length >= MINIMUM_EMAIL_LENGTH;
}

function nameMeetsLengthRequirement(name: string): boolean {
  return name.length >= MINIMUM_NAME_LENGTH;
}
```

#### Comments as Code Smell

```typescript
// ❌ Code smell: Comments explaining what the code does
function processOrder(order: Order) {
  // Check if user has sufficient balance
  if (user.balance < order.total) {
    throw new Error("Insufficient funds");
  }

  // Update inventory for each item
  order.items.forEach((item) => {
    inventory.updateQuantity(item.id, item.quantity);
  });

  // Send confirmation email
  emailService.send(user.email, "Order confirmed");
}

// ✅ Good: Self-explanatory code structure
function processOrder(order: Order) {
  ensureUserHasSufficientBalance(user, order);
  updateInventoryForOrderItems(order.items);
  sendOrderConfirmationEmail(user.email);
}

function ensureUserHasSufficientBalance(user: User, order: Order): void {
  if (user.balance < order.total) {
    throw new InsufficientFundsError();
  }
}

function updateInventoryForOrderItems(items: OrderItem[]): void {
  items.forEach((item) => inventory.updateQuantity(item.id, item.quantity));
}

function sendOrderConfirmationEmail(userEmail: string): void {
  emailService.send(userEmail, "Order confirmed");
}
```

#### When Comments Are Acceptable

```typescript
// ✅ Acceptable: Explaining business rules or external constraints
const PAYMENT_TIMEOUT_MS = 30_000; // Required by payment provider SLA

// ✅ Acceptable: Complex algorithm explanation when name isn't sufficient
function calculateOptimalDeliveryRoute(destinations: Location[]): Route {
  // Implements Traveling Salesman Problem approximation using nearest neighbor heuristic
  // Time complexity: O(n²), suitable for up to 100 destinations per route
  return nearestNeighborTSPApproximation(destinations);
}

// ✅ Acceptable: TODO for future improvements
function calculateShippingCost(order: Order): number {
  // TODO: Implement volume-based pricing when warehouse integration is complete
  return calculateWeightBasedShipping(order);
}
```

### Error Handling

- **Consistent Error Types**: Standardized error handling patterns
- **Graceful Degradation**: Handle failures without breaking the system
- **Error Context**: Provide meaningful error messages and context
- **Logging Integration**: Consistent error logging for observability

### Performance Considerations

- **Lazy Loading**: Load resources only when needed
- **Caching Strategies**: Implement appropriate caching at various levels
- **Resource Management**: Proper cleanup of resources and memory
- **Optimization Points**: Identify and document performance-critical sections

---

## 📁 Code Organization

### File Structure Standards

```
src/
├── components/           # Reusable UI components
├── services/            # Business logic and external service integrations
├── utils/               # Shared utility functions
├── types/               # Type definitions and interfaces
├── constants/           # Application constants
└── tests/               # Test files (co-located or separate)
```

### Naming Conventions

- **Files**: kebab-case for files (`user-service.ts`)
- **Functions**: camelCase (`getUserData`)
- **Classes**: PascalCase (`UserService`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Interfaces**: PascalCase with descriptive names (`UserRepository`)

---

## 🏗️ Workspace Structure

### Feature-Based Architecture

#### Principles

The workspace follows a **feature-based architecture** where code is organized around business features rather than technical layers. This approach provides:

- **Domain Clarity**: Features map directly to business requirements
- **Team Autonomy**: Teams can work independently on their features
- **Scalability**: Easy to add new features without restructuring
- **Maintainability**: Clear boundaries between different business domains

#### Feature Module Structure

```
features/
├── authentication/           # User authentication feature
│   ├── components/          # Feature-specific UI components
│   ├── services/           # Business logic for authentication
│   ├── types/              # Feature-specific types
│   ├── utils/              # Feature-specific utilities
│   ├── hooks/              # Custom hooks for authentication
│   ├── stores/             # State management (if needed)
│   └── index.ts            # Public API of the feature
├── user-management/         # User management feature
│   ├── components/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── hooks/
│   └── index.ts
└── payment-processing/      # Payment feature
    ├── components/
    ├── services/
    ├── types/
    ├── utils/
    ├── hooks/
    └── index.ts
```

### Monorepo Organization

#### Top-Level Structure

```
workspace/
├── apps/                    # Application entry points
│   ├── web/                # Next.js web application
│   ├── admin/              # Admin dashboard
│   ├── mobile/             # React Native mobile app
│   └── api/                # Fastify API server
├── packages/               # Shared packages
│   ├── ui/                 # Shared UI components
│   ├── utils/              # Shared utilities
│   ├── types/              # Shared type definitions
│   ├── config/             # Shared configuration
│   └── database/           # Database schema and migrations
├── tools/                  # Development tools and configurations
│   ├── eslint-config/      # Shared ESLint configuration
│   ├── typescript-config/  # Shared TypeScript configuration
│   └── build-scripts/      # Build and deployment scripts
├── docs/                   # Documentation
├── e2e/                    # End-to-end tests (separate project)
├── pnpm-workspace.yaml     # PNPM workspace configuration
├── pnpm-lock.yaml          # Lock file
└── package.json            # Root package.json with catalog
```

### Directory Structure Standards

#### Application Structure (Feature-Based)

```
apps/web/
├── src/
│   ├── features/           # Business features
│   │   ├── authentication/
│   │   ├── user-management/
│   │   ├── dashboard/
│   │   └── settings/
│   ├── shared/             # Shared across features
│   │   ├── components/     # Generic UI components
│   │   ├── hooks/          # Generic hooks
│   │   ├── utils/          # Generic utilities
│   │   ├── types/          # Generic types
│   │   ├── constants/      # Application constants
│   │   └── providers/      # Context providers
│   ├── pages/              # Next.js pages (routes only)
│   ├── styles/             # Global styles
│   └── lib/                # External service configurations
├── public/                 # Static assets
├── tests/                  # Application-specific tests
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.js
```

#### API Structure (Feature-Based)

```
apps/api/
├── src/
│   ├── features/           # Business features
│   │   ├── authentication/
│   │   │   ├── routes/     # HTTP routes
│   │   │   ├── services/   # Business logic
│   │   │   ├── repositories/ # Data access
│   │   │   ├── types/      # Feature types
│   │   │   ├── schemas/    # Validation schemas
│   │   │   └── index.ts    # Feature registration
│   │   ├── users/
│   │   └── payments/
│   ├── shared/             # Shared infrastructure
│   │   ├── database/       # Database connection
│   │   ├── middleware/     # HTTP middleware
│   │   ├── utils/          # Utilities
│   │   ├── types/          # Shared types
│   │   └── constants/      # Application constants
│   ├── plugins/            # Fastify plugins
│   ├── config/             # Configuration management
│   └── server.ts           # Application bootstrap
├── migrations/             # Database migrations
├── seeds/                  # Database seeds
├── tests/                  # API tests
└── package.json
```

### Feature Module Guidelines

#### Feature Public API

```typescript
// features/authentication/index.ts - Public API
export { LoginForm, SignupForm } from "./components";
export { useAuth, useLogin } from "./hooks";
export { authService } from "./services";
export type { User, LoginCredentials, AuthState } from "./types";

// ❌ Don't export internal implementation details
// export { validatePassword } from "./utils/validation";
// export { AuthRepository } from "./repositories/auth-repository";
```

#### Feature Internal Structure

```typescript
// features/authentication/components/index.ts
export { LoginForm } from "./login-form";
export { SignupForm } from "./signup-form";
export { LogoutButton } from "./logout-button";

// features/authentication/services/index.ts
export { authService } from "./auth-service";
export { sessionService } from "./session-service";

// features/authentication/types/index.ts
export type { User, AuthState, LoginCredentials } from "./auth-types";
export type { Session, SessionConfig } from "./session-types";
```

#### Cross-Feature Communication

```typescript
// ✅ Communication through shared events/stores
// shared/events/user-events.ts
export const userEvents = {
  userLoggedIn: (user: User) => ({ type: "USER_LOGGED_IN" as const, user }),
  userLoggedOut: () => ({ type: "USER_LOGGED_OUT" as const }),
} as const;

// features/dashboard/hooks/use-dashboard-data.ts
import { useAuth } from "@/features/authentication";
import { userEvents } from "@/shared/events/user-events";

export const useDashboardData = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      // React to user login
      loadDashboardData(user.id);
    }
  }, [user]);
};
```

#### Feature Dependencies

```typescript
// ✅ Features can depend on shared packages
import { Button } from "@/shared/components";
import { formatDate } from "@/shared/utils";
import { ApiClient } from "@workspace/utils";

// ✅ Features can depend on other features through public API only
import { useAuth } from "@/features/authentication";

// ❌ Features should NOT depend on internal details of other features
// import { validatePassword } from "@/features/authentication/utils/validation";
```

---

## 📘 TypeScript Standards

### Version Management

- **Consistent Versions**: All workspaces in the monorepo must use the same TypeScript version
- **Library Consistency**: Every library version must be identical across all workspaces
- **Configuration Sharing**: Identical tsconfig.json files across workspaces must be refactored into a shared workspace

### TSConfig Configuration

- **Strict Mode**: Enable all available checks for maximum consistency
- **Target Consistency**: Same compilation target across all projects
- **Shared Configuration**: Extract common tsconfig settings to reduce duplication

```json
// Recommended tsconfig.json base
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Type Safety Principles

#### ❌ Avoid `any` - Use `unknown`

```typescript
// ❌ Bad: Using any
function processApiResponse(data: any) {
  return data.result.items[0].name; // No type safety
}

// ✅ Good: Using unknown with validation
import { z } from "zod";

const ApiResponseSchema = z.object({
  result: z.object({
    items: z.array(
      z.object({
        name: z.string(),
      })
    ),
  }),
});

function processApiResponse(data: unknown) {
  const validated = ApiResponseSchema.parse(data); // Validate boundary
  return validated.result.items[0]?.name; // Type-safe access
}
```

#### ✅ Utility Types Over New Types

```typescript
// ❌ Bad: Creating new types unnecessarily
interface CreateUser {
  name: string;
  email: string;
  age: number;
}

interface UpdateUser {
  name?: string;
  email?: string;
  age?: number;
}

// ✅ Good: Using utility types with aliases
interface User {
  name: string;
  email: string;
  age: number;
}

type CreateUser = User;
type UpdateUser = Partial<User>;
type UserEmail = Pick<User, "email">;
type UserWithoutAge = Omit<User, "age">;
```

#### ✅ Discriminated Unions for State Modeling

```typescript
// ❌ Bad: Using classes and inheritance
abstract class RequestState {
  abstract status: string;
}

class LoadingState extends RequestState {
  status = "loading";
}

class SuccessState extends RequestState {
  status = "success";
  constructor(public data: any) {
    super();
  }
}

// ✅ Good: Using discriminated unions
type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; error: string };

function handleRequest(state: RequestState) {
  switch (state.status) {
    case "idle":
      return "Start request";
    case "loading":
      return "Loading...";
    case "success":
      return `Loaded ${state.data.length} users`; // Type-safe access
    case "error":
      return `Error: ${state.error}`;
    default:
      // Compile-time exhaustiveness check
      const _exhaustive: never = state;
      throw new Error("Unhandled state");
  }
}
```

#### ✅ Union Types Instead of Nullable

```typescript
// ❌ Bad: Using nullable types
interface UserProfile {
  name: string;
  avatar: string | null;
  preferences: UserPreferences | null;
}

// ✅ Good: Using union types for explicit states
type UserProfile =
  | { type: "basic"; name: string }
  | {
      type: "complete";
      name: string;
      avatar: string;
      preferences: UserPreferences;
    };

function renderProfile(profile: UserProfile) {
  switch (profile.type) {
    case "basic":
      return `<div>${profile.name}</div>`;
    case "complete":
      return `<div><img src="${profile.avatar}" />${profile.name}</div>`;
  }
}
```

#### ✅ Boundary Validation with Runtime Type Checking

```typescript
// Using Zod for runtime validation that matches compile-time types
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]),
});

type User = z.infer<typeof UserSchema>; // Type derived from schema

// Boundary validation
function createUser(rawData: unknown): User {
  return UserSchema.parse(rawData); // Throws if invalid
}

// Safe boundary validation
function safeCreateUser(rawData: unknown): User | null {
  const result = UserSchema.safeParse(rawData);
  return result.success ? result.data : null;
}
```

#### ✅ Compile-Time Business Rule Validation

```typescript
// Using branded types for business rules
type UserId = string & { readonly brand: unique symbol };
type Email = string & { readonly brand: unique symbol };

function createUserId(value: string): UserId {
  if (!value.match(/^user_\d+$/)) {
    throw new Error("Invalid user ID format");
  }
  return value as UserId;
}

function createEmail(value: string): Email {
  if (!value.includes("@")) {
    throw new Error("Invalid email format");
  }
  return value as Email;
}

// Business rule enforced at type level
function sendNotification(userId: UserId, email: Email) {
  // Can't pass wrong types here - compile-time safety
}

// ❌ This won't compile
// sendNotification("invalid", "not-email");

// ✅ This forces validation
const userId = createUserId("user_123");
const email = createEmail("user@example.com");
sendNotification(userId, email);
```

#### ✅ Functional Programming Over OOP

```typescript
// ❌ Bad: OOP approach
class UserService {
  private users: User[] = [];

  addUser(user: User) {
    this.users.push(user);
  }

  findUser(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }
}

// ✅ Good: Functional approach
type UserRepository = readonly User[];

const addUser = (users: UserRepository, user: User): UserRepository => [
  ...users,
  user,
];

const findUser = (users: UserRepository, id: string): User | undefined =>
  users.find((u) => u.id === id);

// Compose operations
const pipe = <T>(value: T, ...fns: Array<(arg: T) => T>): T =>
  fns.reduce((acc, fn) => fn(acc), value);

const processUsers = (users: UserRepository) =>
  pipe(
    users,
    (users) => users.filter((u) => u.isActive),
    (users) => users.sort((a, b) => a.name.localeCompare(b.name))
  );
```

### Import/Export Conventions

```typescript
// ✅ Separate type imports
import type { User, UserRepository } from "./types";
import { createUser, validateUser } from "./user-service";

// ✅ Named exports preferred over default exports
export { createUser, validateUser };
export type { User, UserRepository };

// ✅ Barrel exports for clean imports
// src/users/index.ts
export { createUser, validateUser } from "./user-service";
export { UserRepository } from "./user-repository";
export type { User, CreateUserRequest } from "./types";
```

---

## 📦 Dependency Management

### PNPM Workspace Configuration

#### Workspace Setup

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tools/*"
  - "e2e"

# Exclude test directories from workspace
exclude:
  - "**/tests/**"
  - "**/dist/**"
  - "**/node_modules/**"
```

### Version Catalog Strategy

#### Root Package.json with Catalog

```json
{
  "name": "workspace-root",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "pnpm": {
    "catalog": {
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "next": "^14.2.0",
      "typescript": "^5.5.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      "@types/node": "^20.14.0",
      "fastify": "^4.28.0",
      "zod": "^3.23.0",
      "vitest": "^1.6.0",
      "@testing-library/react": "^15.0.0",
      "@testing-library/jest-dom": "^6.4.0",
      "eslint": "^8.57.0",
      "@typescript-eslint/eslint-plugin": "^7.13.0",
      "@typescript-eslint/parser": "^7.13.0",
      "prettier": "^3.3.0",
      "tailwindcss": "^3.4.0",
      "autoprefixer": "^10.4.0",
      "postcss": "^8.4.0"
    },
    "catalogProtocol": "latest"
  },
  "scripts": {
    "dev": "pnpm --parallel --recursive dev",
    "build": "pnpm --recursive build",
    "test": "pnpm --recursive test",
    "lint": "pnpm --recursive lint",
    "type-check": "pnpm --recursive type-check",
    "clean": "pnpm --recursive clean"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "@types/node": "catalog:",
    "prettier": "catalog:",
    "eslint": "catalog:"
  }
}
```

#### Application Package.json

```json
{
  "name": "@workspace/web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:",
    "next": "catalog:",
    "zod": "catalog:",
    "@workspace/ui": "workspace:*",
    "@workspace/utils": "workspace:*",
    "@workspace/types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "@types/node": "catalog:",
    "vitest": "catalog:",
    "@testing-library/react": "catalog:",
    "@testing-library/jest-dom": "catalog:",
    "eslint": "catalog:",
    "@typescript-eslint/eslint-plugin": "catalog:",
    "@typescript-eslint/parser": "catalog:",
    "prettier": "catalog:",
    "tailwindcss": "catalog:",
    "autoprefixer": "catalog:",
    "postcss": "catalog:"
  }
}
```

#### API Package.json

```json
{
  "name": "@workspace/api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint src/**/*.ts",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "catalog:",
    "zod": "catalog:",
    "@workspace/database": "workspace:*",
    "@workspace/utils": "workspace:*",
    "@workspace/types": "workspace:*"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "@types/node": "catalog:",
    "tsx": "^4.16.0",
    "vitest": "catalog:",
    "eslint": "catalog:",
    "@typescript-eslint/eslint-plugin": "catalog:",
    "@typescript-eslint/parser": "catalog:",
    "prettier": "catalog:"
  }
}
```

### Shared Dependencies

#### Shared Package Structure

```
packages/
├── ui/                     # Shared UI components
│   ├── src/
│   │   ├── components/
│   │   ├── styles/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── utils/                  # Shared utilities
│   ├── src/
│   │   ├── date/
│   │   ├── validation/
│   │   ├── formatting/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── types/                  # Shared types
│   ├── src/
│   │   ├── api/
│   │   ├── user/
│   │   ├── common/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── config/                 # Shared configuration
    ├── src/
    │   ├── eslint/
    │   ├── typescript/
    │   ├── tailwind/
    │   └── index.ts
    ├── package.json
    └── tsconfig.json
```

#### Shared UI Package

```json
{
  "name": "@workspace/ui",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./styles": "./dist/styles.css"
  },
  "scripts": {
    "build": "tsc && tailwindcss -i ./src/styles/index.css -o ./dist/styles.css",
    "dev": "tsc --watch",
    "lint": "eslint src/**/*.{ts,tsx}",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "@types/react": "catalog:",
    "@types/react-dom": "catalog:",
    "tailwindcss": "catalog:",
    "eslint": "catalog:",
    "prettier": "catalog:"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

### Library Version Consistency

#### Version Synchronization Scripts

```json
{
  "scripts": {
    "sync-deps": "pnpm --recursive update",
    "check-deps": "pnpm audit --audit-level moderate",
    "upgrade-deps": "pnpm --recursive --latest update",
    "deps:outdated": "pnpm --recursive outdated"
  }
}
```

#### Catalog Management

```bash
# Update all catalog dependencies
pnpm catalog:update

# Add new dependency to catalog
pnpm catalog:add react@^18.3.1

# Remove dependency from catalog
pnpm catalog:remove old-package

# Check catalog consistency
pnpm catalog:check
```

#### Version Constraints

```json
{
  "pnpm": {
    "catalog": {
      "react": "^18.3.1",
      "react-dom": "^18.3.1"
    },
    "overrides": {
      "react": "$react",
      "react-dom": "$react-dom"
    },
    "packageExtensions": {
      "react": {
        "peerDependencies": {
          "react-dom": "*"
        }
      }
    }
  }
}
```

#### Development Tools Configuration

```json
{
  "pnpm": {
    "catalog": {
      "typescript": "^5.5.0",
      "eslint": "^8.57.0",
      "prettier": "^3.3.0",
      "vitest": "^1.6.0"
    }
  }
}
```

---

## 📘 TypeScript Standards

### Version Management

- **Consistent Versions**: All workspaces in the monorepo must use the same TypeScript version
- **Library Consistency**: Every library version must be identical across all workspaces
- **Configuration Sharing**: Identical tsconfig.json files across workspaces must be refactored into a shared workspace

### TSConfig Configuration

- **Strict Mode**: Enable all available checks for maximum consistency
- **Target Consistency**: Same compilation target across all projects
- **Shared Configuration**: Extract common tsconfig settings to reduce duplication

```json
// Recommended tsconfig.json base
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

### Type Safety Principles

#### ❌ Avoid `any` - Use `unknown`

```typescript
// ❌ Bad: Using any
function processApiResponse(data: any) {
  return data.result.items[0].name; // No type safety
}

// ✅ Good: Using unknown with validation
import { z } from "zod";

const ApiResponseSchema = z.object({
  result: z.object({
    items: z.array(
      z.object({
        name: z.string(),
      })
    ),
  }),
});

function processApiResponse(data: unknown) {
  const validated = ApiResponseSchema.parse(data); // Validate boundary
  return validated.result.items[0]?.name; // Type-safe access
}
```

#### ✅ Utility Types Over New Types

```typescript
// ❌ Bad: Creating new types unnecessarily
interface CreateUser {
  name: string;
  email: string;
  age: number;
}

interface UpdateUser {
  name?: string;
  email?: string;
  age?: number;
}

// ✅ Good: Using utility types with aliases
interface User {
  name: string;
  email: string;
  age: number;
}

type CreateUser = User;
type UpdateUser = Partial<User>;
type UserEmail = Pick<User, "email">;
type UserWithoutAge = Omit<User, "age">;
```

#### ✅ Discriminated Unions for State Modeling

```typescript
// ❌ Bad: Using classes and inheritance
abstract class RequestState {
  abstract status: string;
}

class LoadingState extends RequestState {
  status = "loading";
}

class SuccessState extends RequestState {
  status = "success";
  constructor(public data: any) {
    super();
  }
}

// ✅ Good: Using discriminated unions
type RequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; error: string };

function handleRequest(state: RequestState) {
  switch (state.status) {
    case "idle":
      return "Start request";
    case "loading":
      return "Loading...";
    case "success":
      return `Loaded ${state.data.length} users`; // Type-safe access
    case "error":
      return `Error: ${state.error}`;
    default:
      // Compile-time exhaustiveness check
      const _exhaustive: never = state;
      throw new Error("Unhandled state");
  }
}
```

#### ✅ Union Types Instead of Nullable

```typescript
// ❌ Bad: Using nullable types
interface UserProfile {
  name: string;
  avatar: string | null;
  preferences: UserPreferences | null;
}

// ✅ Good: Using union types for explicit states
type UserProfile =
  | { type: "basic"; name: string }
  | {
      type: "complete";
      name: string;
      avatar: string;
      preferences: UserPreferences;
    };

function renderProfile(profile: UserProfile) {
  switch (profile.type) {
    case "basic":
      return `<div>${profile.name}</div>`;
    case "complete":
      return `<div><img src="${profile.avatar}" />${profile.name}</div>`;
  }
}
```

#### ✅ Boundary Validation with Runtime Type Checking

```typescript
// Using Zod for runtime validation that matches compile-time types
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]),
});

type User = z.infer<typeof UserSchema>; // Type derived from schema

// Boundary validation
function createUser(rawData: unknown): User {
  return UserSchema.parse(rawData); // Throws if invalid
}

// Safe boundary validation
function safeCreateUser(rawData: unknown): User | null {
  const result = UserSchema.safeParse(rawData);
  return result.success ? result.data : null;
}
```

#### ✅ Compile-Time Business Rule Validation

```typescript
// Using branded types for business rules
type UserId = string & { readonly brand: unique symbol };
type Email = string & { readonly brand: unique symbol };

function createUserId(value: string): UserId {
  if (!value.match(/^user_\d+$/)) {
    throw new Error("Invalid user ID format");
  }
  return value as UserId;
}

function createEmail(value: string): Email {
  if (!value.includes("@")) {
    throw new Error("Invalid email format");
  }
  return value as Email;
}

// Business rule enforced at type level
function sendNotification(userId: UserId, email: Email) {
  // Can't pass wrong types here - compile-time safety
}

// ❌ This won't compile
// sendNotification("invalid", "not-email");

// ✅ This forces validation
const userId = createUserId("user_123");
const email = createEmail("user@example.com");
sendNotification(userId, email);
```

#### ✅ Functional Programming Over OOP

```typescript
// ❌ Bad: OOP approach
class UserService {
  private users: User[] = [];

  addUser(user: User) {
    this.users.push(user);
  }

  findUser(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }
}

// ✅ Good: Functional approach
type UserRepository = readonly User[];

const addUser = (users: UserRepository, user: User): UserRepository => [
  ...users,
  user,
];

const findUser = (users: UserRepository, id: string): User | undefined =>
  users.find((u) => u.id === id);

// Compose operations
const pipe = <T>(value: T, ...fns: Array<(arg: T) => T>): T =>
  fns.reduce((acc, fn) => fn(acc), value);

const processUsers = (users: UserRepository) =>
  pipe(
    users,
    (users) => users.filter((u) => u.isActive),
    (users) => users.sort((a, b) => a.name.localeCompare(b.name))
  );
```

### Import/Export Conventions

```typescript
// ✅ Separate type imports
import type { User, UserRepository } from "./types";
import { createUser, validateUser } from "./user-service";

// ✅ Named exports preferred over default exports
export { createUser, validateUser };
export type { User, UserRepository };

// ✅ Barrel exports for clean imports
// src/users/index.ts
export { createUser, validateUser } from "./user-service";
export { UserRepository } from "./user-repository";
export type { User, CreateUserRequest } from "./types";
```

---

## 📋 Quality Gates

### Code Review Checklist

- ✅ Follows naming conventions
- ✅ Implements single responsibility principle
- ✅ Includes appropriate error handling
- ✅ Has accompanying tests
- ✅ Code is self-documenting and readable
- ✅ No obvious performance issues
- ✅ Consistent with existing codebase patterns

### Automated Checks

- **Linting**: Automated style and convention checking
- **Type Checking**: Static type analysis where applicable
- **Complexity Analysis**: Cyclomatic complexity monitoring
- **Security Scanning**: Automated vulnerability detection

---

## 📋 Compliance

This document supports the **Definition of Done** requirements:

- ✅ Code quality standards met
- ✅ Design patterns consistently applied
- ✅ Self-documenting code standards followed
- ✅ Best practices implemented

---

## 🔗 Related Documents

Core references for code implementation:

- **[Architectural Guidelines](01-architectural-guidelines.md)** - _Architectural patterns guide code organization_
- **[Technical Guidelines](03-technical-guidelines.md)** - _Technology stack enables implementation_
- **[UX Guidelines](05-ux-guidelines.md)** - _UI standards complement React patterns_

Supporting documents:

- **[Testing Strategy](07-testing-strategy.md)** - _Testing approaches verify code quality_
- **[Definition of Done](06-definition-of-done.md)** - _Quality criteria validate code standards_
