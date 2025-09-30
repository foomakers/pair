# 🏢 Monorepo Organization

**Focus**: Multi-package repository structure and dependency management

Guidelines for organizing monorepo projects with multiple packages, shared libraries, and coordinated development workflows.

## 🎯 Monorepo Structure Principles

### Core Organization Concepts

```
project-root/
├── apps/                    # Application packages
│   ├── web/                # Frontend application
│   ├── api/                # Backend API
│   ├── mobile/             # Mobile application
│   └── admin/              # Admin dashboard
├── packages/               # Shared libraries
│   ├── ui-components/      # Shared UI components
│   ├── shared-types/       # Common type definitions
│   ├── utils/              # Utility functions
│   ├── config/             # Shared configuration
│   └── database/           # Database utilities
├── tools/                  # Development tools
│   ├── build-tools/        # Custom build utilities
│   ├── eslint-config/      # Shared ESLint configuration
│   └── tsconfig/           # Shared TypeScript configurations
├── docs/                   # Documentation
│   ├── api/                # API documentation
│   ├── guides/             # Development guides
│   └── architecture/       # Architecture decisions
├── scripts/                # Shared scripts
│   ├── build.sh           # Build all packages
│   ├── test.sh            # Run all tests
│   └── deploy.sh          # Deployment scripts
├── package.json           # Root package.json
├── pnpm-workspace.yaml    # Workspace configuration
├── turbo.json             # Turbo configuration
└── tsconfig.json          # Root TypeScript config
```

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  # Applications
  - 'apps/*'
  # Shared packages
  - 'packages/*'
  # Development tools
  - 'tools/*'
  # Documentation sites
  - 'docs/*'
```

```json
// package.json (root)
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*", "tools/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean && rm -rf node_modules",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.26.0",
    "turbo": "^1.10.0",
    "typescript": "^5.0.0"
  },
  "packageManager": "pnpm@8.6.0"
}
```

## 📱 Application Packages (apps/)

### Frontend Application Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/             # App-specific components
│   │   ├── layout/
│   │   ├── features/
│   │   └── pages/
│   ├── lib/                    # App-specific utilities
│   │   ├── api-client.ts
│   │   ├── auth.ts
│   │   └── utils.ts
│   ├── hooks/                  # App-specific hooks
│   ├── stores/                 # State management
│   └── styles/                 # App-specific styles
├── public/                     # Static assets
├── package.json               # App dependencies
├── next.config.js             # Next.js configuration
├── tailwind.config.js         # Tailwind configuration
└── tsconfig.json              # TypeScript configuration

// apps/web/package.json
{
  "name": "@mycompany/web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@mycompany/ui-components": "workspace:*",
    "@mycompany/shared-types": "workspace:*",
    "@mycompany/utils": "workspace:*"
  },
  "devDependencies": {
    "@mycompany/eslint-config": "workspace:*",
    "@mycompany/tsconfig": "workspace:*",
    "@types/react": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Backend API Structure

```
apps/api/
├── src/
│   ├── app.ts                  # Application entry point
│   ├── server.ts               # Server configuration
│   ├── routes/                 # API routes
│   │   ├── auth/
│   │   ├── users/
│   │   └── index.ts
│   ├── controllers/            # Request handlers
│   ├── services/               # Business logic
│   ├── middleware/             # Custom middleware
│   ├── plugins/                # Fastify plugins
│   └── types/                  # API-specific types
├── migrations/                 # Database migrations
├── seeds/                      # Database seeds
├── package.json               # API dependencies
├── Dockerfile                 # Container configuration
└── tsconfig.json              # TypeScript configuration

// apps/api/package.json
{
  "name": "@mycompany/api",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "migrate": "prisma migrate deploy",
    "seed": "tsx src/scripts/seed.ts",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^4.0.0",
    "prisma": "^5.0.0",
    "@mycompany/shared-types": "workspace:*",
    "@mycompany/utils": "workspace:*",
    "@mycompany/database": "workspace:*"
  },
  "devDependencies": {
    "@mycompany/eslint-config": "workspace:*",
    "@mycompany/tsconfig": "workspace:*",
    "tsx": "^3.0.0",
    "vitest": "^0.34.0"
  }
}
```

## 📦 Shared Packages (packages/)

### UI Components Package

```
packages/ui-components/
├── src/
│   ├── components/
│   │   ├── button/
│   │   │   ├── button.tsx
│   │   │   ├── button.stories.tsx
│   │   │   ├── button.test.tsx
│   │   │   └── index.ts
│   │   ├── input/
│   │   ├── modal/
│   │   └── index.ts            # Barrel export
│   ├── styles/
│   │   ├── globals.css
│   │   ├── variables.css
│   │   └── components.css
│   ├── types/
│   │   └── component.types.ts
│   ├── utils/
│   │   └── component-utils.ts
│   └── index.ts                # Main export
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── rollup.config.js            # Build configuration
└── README.md

// packages/ui-components/package.json
{
  "name": "@mycompany/ui-components",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "module": "./dist/index.esm.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.esm.js",
      "require": "./dist/index.js"
    },
    "./styles": "./dist/styles.css"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c --watch",
    "test": "vitest",
    "lint": "eslint src",
    "type-check": "tsc --noEmit",
    "storybook": "storybook dev -p 6006"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@mycompany/shared-types": "workspace:*"
  },
  "devDependencies": {
    "@mycompany/eslint-config": "workspace:*",
    "@mycompany/tsconfig": "workspace:*",
    "@rollup/plugin-typescript": "^11.0.0",
    "@storybook/react": "^7.0.0",
    "rollup": "^3.0.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

### Shared Types Package

```
packages/shared-types/
├── src/
│   ├── api/
│   │   ├── auth.types.ts
│   │   ├── user.types.ts
│   │   ├── common.types.ts
│   │   └── index.ts
│   ├── database/
│   │   ├── user.types.ts
│   │   ├── session.types.ts
│   │   └── index.ts
│   ├── ui/
│   │   ├── component.types.ts
│   │   ├── theme.types.ts
│   │   └── index.ts
│   ├── utils/
│   │   ├── result.types.ts
│   │   ├── brand.types.ts
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md

// packages/shared-types/src/index.ts
export * from './api';
export * from './database';
export * from './ui';
export * from './utils';

// packages/shared-types/package.json
{
  "name": "@mycompany/shared-types",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.esm.js",
      "require": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "type-check": "tsc --noEmit",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@mycompany/eslint-config": "workspace:*",
    "@mycompany/tsconfig": "workspace:*",
    "typescript": "^5.0.0"
  }
}
```

### Utilities Package

```
packages/utils/
├── src/
│   ├── date/
│   │   ├── date-utils.ts
│   │   ├── date-utils.test.ts
│   │   └── index.ts
│   ├── validation/
│   │   ├── validation-utils.ts
│   │   ├── schema-validators.ts
│   │   ├── validation-utils.test.ts
│   │   └── index.ts
│   ├── string/
│   │   ├── string-utils.ts
│   │   ├── string-utils.test.ts
│   │   └── index.ts
│   ├── result/
│   │   ├── result.ts
│   │   ├── result.test.ts
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md

// packages/utils/package.json
{
  "name": "@mycompany/utils",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.esm.js",
      "require": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "lint": "eslint src",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@mycompany/shared-types": "workspace:*"
  },
  "devDependencies": {
    "@mycompany/eslint-config": "workspace:*",
    "@mycompany/tsconfig": "workspace:*",
    "typescript": "^5.0.0",
    "vitest": "^0.34.0"
  }
}
```

## 🛠️ Development Tools (tools/)

### Shared ESLint Configuration

```
tools/eslint-config/
├── index.js                    # Main ESLint config
├── react.js                    # React-specific config
├── node.js                     # Node.js-specific config
├── package.json
└── README.md

// tools/eslint-config/index.js
module.exports = {
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'prefer-const': 'error',
    'no-var': 'error'
  }
};

// tools/eslint-config/package.json
{
  "name": "@mycompany/eslint-config",
  "version": "1.0.0",
  "main": "index.js",
  "files": [
    "index.js",
    "react.js",
    "node.js"
  ],
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint-config-prettier": "^9.0.0"
  },
  "peerDependencies": {
    "eslint": ">=8.0.0",
    "typescript": ">=5.0.0"
  }
}
```

### Shared TypeScript Configuration

```
tools/tsconfig/
├── base.json                   # Base TypeScript config
├── react.json                  # React-specific config
├── node.json                   # Node.js-specific config
├── package.json
└── README.md

// tools/tsconfig/base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "removeComments": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true
  },
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.test.tsx"
  ]
}

// tools/tsconfig/react.json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "allowJs": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ]
}

// tools/tsconfig/package.json
{
  "name": "@mycompany/tsconfig",
  "version": "1.0.0",
  "files": [
    "base.json",
    "react.json",
    "node.json"
  ]
}
```

## ⚡ Build and Development Workflow

### Turbo Configuration

```json
// turbo.json
{
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Development Scripts

```bash
#!/bin/bash
# scripts/dev.sh - Start development environment

echo "Starting development environment..."

# Start all development servers in parallel
pnpm turbo run dev --parallel --filter="./apps/*"

#!/bin/bash
# scripts/build.sh - Build all packages

echo "Building all packages..."

# Build shared packages first, then applications
pnpm turbo run build --filter="./packages/*"
pnpm turbo run build --filter="./apps/*"

#!/bin/bash
# scripts/test.sh - Run all tests

echo "Running tests..."

# Run tests with coverage
pnpm turbo run test --coverage

echo "Running e2e tests..."
pnpm --filter "@mycompany/web" run e2e

#!/bin/bash
# scripts/release.sh - Release packages

echo "Releasing packages..."

# Version packages
pnpm changeset version

# Build all packages
./scripts/build.sh

# Publish to registry
pnpm changeset publish
```

### Package Dependency Management

```typescript
// Example of workspace dependency usage

// In apps/web/src/components/user-card.tsx
import { Button, Card } from '@mycompany/ui-components'
import { User } from '@mycompany/shared-types'
import { formatDate } from '@mycompany/utils'

interface UserCardProps {
  user: User
  onEdit: (user: User) => void
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit }) => {
  return (
    <Card>
      <h3>{user.name}</h3>
      <p>Joined: {formatDate(user.createdAt)}</p>
      <Button onClick={() => onEdit(user)}>Edit User</Button>
    </Card>
  )
}

// In apps/api/src/services/user.service.ts
import { User, CreateUserRequest } from '@mycompany/shared-types'
import { validateEmail, generateId } from '@mycompany/utils'
import { UserRepository } from '@mycompany/database'

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async createUser(request: CreateUserRequest): Promise<User> {
    if (!validateEmail(request.email)) {
      throw new Error('Invalid email format')
    }

    const user: User = {
      id: generateId(),
      name: request.name,
      email: request.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return this.userRepository.save(user)
  }
}
```

## 📋 Version Management

### Changesets Configuration

```json
// .changeset/config.json
{
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@mycompany/eslint-config", "@mycompany/tsconfig"]
}
```

### Package Publishing Strategy

```typescript
// Example changeset file (.changeset/new-feature.md)
---
"@mycompany/ui-components": minor
"@mycompany/web": patch
---

Add new Modal component with improved accessibility features

- Added Modal component with focus management
- Updated Button component with new variant
- Fixed accessibility issues in Card component
```

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm turbo run type-check

      - name: Lint
        run: pnpm turbo run lint

      - name: Test
        run: pnpm turbo run test

      - name: Build
        run: pnpm turbo run build

  release:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm turbo run build

      - name: Create Release Pull Request
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## 🔗 Related Concepts

- **[File Structure](file-structure.md)** - Individual package organization
- **[Dependency Management](dependency-management.md)** - Managing package dependencies
- **[Workspace Structure](workspace-structure.md)** - Development environment setup
- **[Build Configuration](.pair/knowledge/guidelines/technical-standards/development-tools/build-tools.md)** - Build tool configuration

## 🎯 Implementation Guidelines

1. **Clear Package Boundaries**: Define clear responsibilities for each package
2. **Minimize Dependencies**: Keep package dependencies minimal and well-defined
3. **Consistent Structure**: Use consistent folder structure across packages
4. **Shared Configuration**: Centralize common configuration in tools packages
5. **Incremental Builds**: Use build tools that support incremental compilation
6. **Version Management**: Use semantic versioning and automated changelog generation
7. **Documentation**: Maintain clear documentation for each package's purpose and API

## 📏 Benefits

- **Code Reuse**: Shared packages eliminate code duplication
- **Consistent Standards**: Shared tooling ensures consistent code quality
- **Efficient Development**: Coordinated builds and testing across packages
- **Independent Deployment**: Packages can be versioned and deployed independently
- **Team Collaboration**: Clear package boundaries support team ownership
- **Scalability**: Structure supports adding new packages and applications

---

_Well-organized monorepos enable efficient development of complex applications with shared code and coordinated workflows._
