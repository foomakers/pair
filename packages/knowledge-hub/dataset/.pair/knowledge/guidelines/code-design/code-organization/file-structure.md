# 📁 File Structure

**Focus**: Organizing files and directories for scalability and maintainability

Guidelines for structuring TypeScript, React, and Node.js projects with clear separation of concerns and logical organization.

## 🏗️ Project Structure Principles

### Core Organization Concepts

```
project-root/
├── src/                 # Source code
├── tests/               # Test files (if not co-located)
├── docs/                # Documentation
├── scripts/             # Build and utility scripts
├── config/              # Configuration files
├── public/              # Static assets (for web apps)
├── build/               # Build output
└── node_modules/        # Dependencies
```

### Separation of Concerns

```typescript
// ✅ Clear separation by layer and responsibility
src/
├── components/          # Presentation layer
├── services/           # Business logic layer
├── repositories/       # Data access layer
├── utils/              # Shared utilities
├── types/              # Type definitions
├── hooks/              # Custom React hooks
├── contexts/           # React contexts
├── config/             # Configuration
└── __tests__/          # Shared test utilities
```

## 📂 Frontend (React/Next.js) Structure

### Feature-Based Organization

```
src/
├── components/
│   ├── common/                    # Shared components
│   │   ├── button/
│   │   │   ├── button.component.tsx
│   │   │   ├── button.stories.tsx
│   │   │   ├── button.test.tsx
│   │   │   ├── button.module.css
│   │   │   └── index.ts
│   │   ├── modal/
│   │   ├── form/
│   │   └── index.ts
│   └── features/                  # Feature-specific components
│       ├── authentication/
│       │   ├── login-form/
│       │   │   ├── login-form.component.tsx
│       │   │   ├── login-form.test.tsx
│       │   │   ├── login-form.hook.ts
│       │   │   └── index.ts
│       │   ├── signup-form/
│       │   └── index.ts
│       ├── user-management/
│       │   ├── user-profile/
│       │   ├── user-list/
│       │   └── user-settings/
│       └── dashboard/
├── services/                      # Business logic
│   ├── api/
│   │   ├── user-api.service.ts
│   │   ├── auth-api.service.ts
│   │   └── index.ts
│   ├── authentication/
│   │   ├── auth.service.ts
│   │   ├── token.service.ts
│   │   └── index.ts
│   └── user/
│       ├── user.service.ts
│       ├── user-validation.service.ts
│       └── index.ts
├── hooks/                         # Custom React hooks
│   ├── use-auth.hook.ts
│   ├── use-api.hook.ts
│   ├── use-local-storage.hook.ts
│   └── index.ts
├── contexts/                      # React contexts
│   ├── auth.context.tsx
│   ├── theme.context.tsx
│   └── index.ts
├── utils/                         # Utility functions
│   ├── date-utils.ts
│   ├── validation-utils.ts
│   ├── format-utils.ts
│   └── index.ts
├── types/                         # Type definitions
│   ├── user.types.ts
│   ├── api.types.ts
│   ├── auth.types.ts
│   └── index.ts
├── config/                        # Configuration
│   ├── api.config.ts
│   ├── app.config.ts
│   └── index.ts
├── styles/                        # Global styles
│   ├── globals.css
│   ├── variables.css
│   └── components.css
└── __tests__/                     # Test utilities
    ├── test-helpers.tsx
    ├── mock-data.ts
    ├── setup.ts
    └── mocks/
        ├── api.mock.ts
        └── services.mock.ts
```

### Component Organization Pattern

```typescript
// ✅ Component folder structure
components/
├── common/
│   ├── button/
│   │   ├── button.component.tsx      # Main component
│   │   ├── button.types.ts           # Component-specific types
│   │   ├── button.stories.tsx        # Storybook stories
│   │   ├── button.test.tsx           # Unit tests
│   │   ├── button.module.css         # Component styles
│   │   └── index.ts                  # Barrel export
│   └── modal/
│       ├── modal.component.tsx
│       ├── modal.context.tsx         # Modal-specific context
│       ├── modal.hook.ts             # Modal-specific hook
│       ├── modal.types.ts
│       ├── modal.test.tsx
│       ├── modal.module.css
│       └── index.ts
└── features/
    ├── user-profile/
    │   ├── user-profile.component.tsx
    │   ├── user-profile.hook.ts      # Component logic
    │   ├── user-profile.service.ts   # Business logic
    │   ├── user-profile.types.ts
    │   ├── user-profile.test.tsx
    │   ├── user-profile.module.css
    │   └── index.ts
    └── payment-form/
        ├── payment-form.component.tsx
        ├── components/               # Sub-components
        │   ├── credit-card-input.tsx
        │   ├── billing-address.tsx
        │   └── payment-summary.tsx
        ├── payment-form.hook.ts
        ├── payment-form.service.ts
        ├── payment-form.types.ts
        ├── payment-form.test.tsx
        ├── payment-form.module.css
        └── index.ts

// ✅ Example barrel export (index.ts)
export { Button } from './button.component';
export type { ButtonProps, ButtonVariant } from './button.types';

// ✅ Main component file structure
import React from 'react';
import type { ButtonProps } from './button.types';
import styles from './button.module.css';

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  onClick,
  ...props
}) => {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]}`}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};
```

## 🔧 Backend (Node.js/Fastify) Structure

### Domain-Driven Structure

```
src/
├── domains/                       # Domain modules
│   ├── user/
│   │   ├── entities/
│   │   │   ├── user.entity.ts
│   │   │   └── user-profile.entity.ts
│   │   ├── repositories/
│   │   │   ├── user.repository.ts
│   │   │   └── user.repository.impl.ts
│   │   ├── services/
│   │   │   ├── user.service.ts
│   │   │   └── user-validation.service.ts
│   │   ├── controllers/
│   │   │   └── user.controller.ts
│   │   ├── routes/
│   │   │   └── user.routes.ts
│   │   ├── dto/
│   │   │   ├── create-user.dto.ts
│   │   │   └── update-user.dto.ts
│   │   ├── types/
│   │   │   └── user.types.ts
│   │   └── __tests__/
│   │       ├── user.service.test.ts
│   │       ├── user.controller.test.ts
│   │       └── user.repository.test.ts
│   ├── authentication/
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── token.service.ts
│   │   │   └── password.service.ts
│   │   ├── controllers/
│   │   │   └── auth.controller.ts
│   │   ├── routes/
│   │   │   └── auth.routes.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── rate-limit.middleware.ts
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   └── types/
│   │       └── auth.types.ts
│   └── payment/
│       ├── entities/
│       ├── services/
│       ├── controllers/
│       └── routes/
├── shared/                        # Shared infrastructure
│   ├── database/
│   │   ├── connection.ts
│   │   ├── migrations/
│   │   └── seeds/
│   ├── middleware/
│   │   ├── error-handler.middleware.ts
│   │   ├── logging.middleware.ts
│   │   └── validation.middleware.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── encryption.ts
│   │   └── validation.ts
│   ├── types/
│   │   ├── api.types.ts
│   │   └── common.types.ts
│   └── config/
│       ├── database.config.ts
│       ├── app.config.ts
│       └── env.config.ts
├── plugins/                       # Fastify plugins
│   ├── auth.plugin.ts
│   ├── database.plugin.ts
│   └── swagger.plugin.ts
└── app.ts                        # Application entry point
```

### Service Layer Organization

```typescript
// ✅ Service layer structure
src/domains/user/services/
├── user.service.ts               # Main user service
├── user-validation.service.ts    # Validation logic
├── user-notification.service.ts  # Notification logic
├── user-analytics.service.ts     # Analytics logic
└── index.ts                      # Barrel export

// ✅ Repository pattern structure
src/domains/user/repositories/
├── user.repository.ts            # Repository interface
├── user.repository.impl.ts       # Implementation
├── user-cache.repository.ts      # Caching implementation
└── index.ts

// ✅ Controller organization
src/domains/user/controllers/
├── user.controller.ts            # Main CRUD operations
├── user-profile.controller.ts    # Profile-specific operations
├── user-settings.controller.ts   # Settings operations
└── index.ts

// ✅ Route organization
src/domains/user/routes/
├── user.routes.ts                # Main user routes
├── user-profile.routes.ts        # Profile routes
├── user-admin.routes.ts          # Admin-only routes
└── index.ts
```

## 📚 Shared Libraries Structure

### Utility Library Organization

```
packages/
├── shared-types/                 # Shared type definitions
│   ├── src/
│   │   ├── user.types.ts
│   │   ├── api.types.ts
│   │   ├── common.types.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── utils/                        # Shared utilities
│   ├── src/
│   │   ├── date/
│   │   │   ├── date-utils.ts
│   │   │   ├── date-utils.test.ts
│   │   │   └── index.ts
│   │   ├── validation/
│   │   │   ├── validation-utils.ts
│   │   │   ├── schema-validators.ts
│   │   │   ├── validation-utils.test.ts
│   │   │   └── index.ts
│   │   ├── string/
│   │   │   ├── string-utils.ts
│   │   │   ├── string-utils.test.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── ui-components/                # Shared UI components
    ├── src/
    │   ├── components/
    │   │   ├── button/
    │   │   ├── input/
    │   │   ├── modal/
    │   │   └── index.ts
    │   ├── styles/
    │   │   ├── variables.css
    │   │   ├── mixins.css
    │   │   └── index.css
    │   ├── types/
    │   │   └── component.types.ts
    │   └── index.ts
    ├── package.json
    ├── tsconfig.json
    └── rollup.config.js
```

## 🧪 Test Structure

### Test Organization Patterns

```
// ✅ Co-located tests (recommended)
src/
├── components/
│   ├── button/
│   │   ├── button.component.tsx
│   │   ├── button.test.tsx        # Unit tests
│   │   └── button.integration.test.tsx  # Integration tests
│   └── modal/
│       ├── modal.component.tsx
│       ├── modal.test.tsx
│       └── modal.e2e.test.tsx     # E2E tests
└── services/
    ├── user.service.ts
    ├── user.service.test.ts       # Unit tests
    └── user.service.integration.test.ts

// ✅ Alternative: Mirrored test structure
src/
├── components/
│   ├── button/
│   │   └── button.component.tsx
│   └── modal/
│       └── modal.component.tsx
└── services/
    ├── user.service.ts
    └── auth.service.ts

__tests__/                         # Mirror of src structure
├── components/
│   ├── button/
│   │   ├── button.component.test.tsx
│   │   └── button.integration.test.tsx
│   └── modal/
│       ├── modal.component.test.tsx
│       └── modal.e2e.test.tsx
├── services/
│   ├── user.service.test.ts
│   └── auth.service.test.ts
└── test-utils/
    ├── render-helpers.tsx
    ├── mock-data.ts
    └── test-server.ts

// ✅ Test type organization
tests/
├── unit/                         # Fast, isolated tests
│   ├── components/
│   ├── services/
│   └── utils/
├── integration/                  # Tests with dependencies
│   ├── api/
│   ├── database/
│   └── services/
├── e2e/                         # End-to-end tests
│   ├── user-flows/
│   ├── admin-flows/
│   └── payment-flows/
└── performance/                  # Performance tests
    ├── load-tests/
    └── stress-tests/
```

## 📄 Configuration and Documentation

### Configuration Structure

```
config/
├── environments/
│   ├── development.ts
│   ├── staging.ts
│   ├── production.ts
│   └── test.ts
├── database/
│   ├── database.config.ts
│   ├── migrations/
│   │   ├── 001_create_users_table.ts
│   │   ├── 002_add_user_profiles.ts
│   │   └── index.ts
│   └── seeds/
│       ├── users.seed.ts
│       └── index.ts
├── api/
│   ├── swagger.config.ts
│   ├── cors.config.ts
│   └── rate-limit.config.ts
└── app.config.ts

docs/
├── api/                         # API documentation
│   ├── authentication.md
│   ├── users.md
│   └── payments.md
├── development/                 # Development guides
│   ├── setup.md
│   ├── testing.md
│   └── deployment.md
├── architecture/                # Architecture decisions
│   ├── adr-001-database-choice.md
│   ├── adr-002-auth-strategy.md
│   └── README.md
└── user-guides/                 # User documentation
    ├── getting-started.md
    ├── user-management.md
    └── troubleshooting.md
```

### Build and Scripts Organization

```
scripts/
├── build/
│   ├── build.sh
│   ├── clean.sh
│   └── verify.sh
├── database/
│   ├── migrate.sh
│   ├── seed.sh
│   └── reset.sh
├── deployment/
│   ├── deploy-staging.sh
│   ├── deploy-production.sh
│   └── rollback.sh
├── development/
│   ├── start-dev.sh
│   ├── generate-types.sh
│   └── check-types.sh
└── testing/
    ├── run-tests.sh
    ├── run-e2e.sh
    └── coverage.sh

build/                           # Build artifacts
├── client/                      # Frontend build
├── server/                      # Backend build
└── docs/                        # Documentation build
```

## 🔄 Import/Export Patterns

### Barrel Exports

```typescript
// ✅ Feature index.ts - barrel export
// src/domains/user/index.ts
export { UserService } from './services/user.service'
export { UserRepository } from './repositories/user.repository'
export { UserController } from './controllers/user.controller'
export { userRoutes } from './routes/user.routes'
export type { User, CreateUserRequest, UpdateUserRequest } from './types/user.types'

// ✅ Component index.ts
// src/components/common/button/index.ts
export { Button } from './button.component'
export type { ButtonProps, ButtonVariant, ButtonSize } from './button.types'

// ✅ Utility index.ts
// src/utils/index.ts
export * from './date-utils'
export * from './validation-utils'
export * from './string-utils'
export { logger } from './logger'

// ✅ Usage with clear imports
import { UserService, UserRepository } from '@/domains/user'
import { Button } from '@/components/common/button'
import { formatDate, validateEmail } from '@/utils'
```

### Import Aliasing

```typescript
// ✅ Path aliases in tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@/components/*": ["components/*"],
      "@/services/*": ["services/*"],
      "@/utils/*": ["utils/*"],
      "@/types/*": ["types/*"],
      "@/config/*": ["config/*"]
    }
  }
}

// ✅ Clean imports using aliases
import { UserService } from '@/services/user.service';
import { Button } from '@/components/common/button';
import { validateEmail } from '@/utils/validation-utils';
import type { User } from '@/types/user.types';
import { apiConfig } from '@/config/api.config';

// ❌ Avoid relative imports for distant files
import { UserService } from '../../../services/user.service';
import { Button } from '../../components/common/button';
```

## 🔗 Related Concepts

- **[Naming Conventions](naming-conventions.md)** - File and directory naming patterns
- **[Monorepo Organization](monorepo-organization.md)** - Multi-package project structure
- **[Clean Architecture](README.md)** - Architectural layers
- **[Dependency Management](dependency-management.md)** - Managing dependencies and imports

## 🎯 Implementation Guidelines

1. **Feature-Based Organization**: Group related files by feature rather than file type
2. **Consistent Structure**: Maintain the same folder structure across similar components/modules
3. **Co-locate Related Files**: Keep tests, styles, and types near the components that use them
4. **Use Barrel Exports**: Create index.ts files to simplify imports
5. **Separate Concerns**: Keep different layers (presentation, business, data) in separate folders
6. **Path Aliases**: Use TypeScript path mapping for cleaner imports
7. **Documentation**: Include README files in complex directory structures

## 📏 Benefits

- **Discoverability**: Logical organization makes files easy to find
- **Maintainability**: Related files are grouped together for easier maintenance
- **Scalability**: Structure supports growth without becoming unwieldy
- **Team Collaboration**: Consistent organization helps team members navigate the codebase
- **Tooling Support**: Good structure enables better IDE navigation and search
- **Testing**: Clear separation makes it easier to write and maintain tests

---

_Well-organized file structure is the foundation for maintainable, scalable applications that teams can work with effectively._
