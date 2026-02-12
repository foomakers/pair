# Workspace Structure

## Overview

Modern TypeScript/JavaScript projects often require multiple packages, shared tooling, and coordinated builds. This guide covers monorepo organization patterns using pnpm workspaces, optimal folder structure, and shared configuration management.

## Monorepo Fundamentals

### Basic Structure

```text
my-project/
├── apps/                     # Applications (deployable units)
│   ├── web/                  # Next.js/React web app
│   ├── api/                  # Node.js/Fastify API
│   ├── admin/                # Admin dashboard
│   └── mobile/               # React Native (optional)
├── packages/                 # Shared libraries and tools
│   ├── ui/                   # Shared UI components
│   ├── types/                # Shared TypeScript types
│   ├── utils/                # Shared utilities
│   ├── database/             # Database layer
│   └── config/               # Shared configuration
├── tools/                    # Development and build tools
│   ├── eslint-config/        # Shared ESLint configuration
│   ├── tsconfig/             # Shared TypeScript configs
│   └── build-scripts/        # Custom build tools
├── docs/                     # Documentation
├── scripts/                  # Workspace-level scripts
├── package.json              # Root package.json with workspaces
├── pnpm-workspace.yaml       # pnpm workspace configuration
├── turbo.json                # Turbo build configuration
└── tsconfig.json             # Root TypeScript config
```

## Apps vs Packages

### Apps Directory

**Purpose**: Contains deployable applications - the final products that users interact with.

```text
apps/
├── web/                      # User-facing web application
│   ├── package.json
│   ├── next.config.js
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── lib/
│   └── public/
├── api/                      # Backend API service
│   ├── package.json
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   └── lib/
│   └── Dockerfile
└── admin/                    # Admin dashboard
    ├── package.json
    ├── vite.config.ts
    └── src/
```

**Characteristics**:

- Have their own `package.json` with specific dependencies
- Are built and deployed independently
- Can depend on packages but not on other apps
- Should be lightweight - most logic in packages

### Packages Directory

**Purpose**: Contains reusable libraries and shared code used across apps.

```text
packages/
├── ui/                       # Shared UI component library
│   ├── package.json
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button/
│   │   │   ├── Input/
│   │   │   └── Modal/
│   │   └── index.ts
│   └── tsconfig.json
├── types/                    # Shared TypeScript definitions
│   ├── package.json
│   ├── src/
│   │   ├── api.types.ts
│   │   ├── user.types.ts
│   │   └── index.ts
│   └── tsconfig.json
├── utils/                    # Shared utility functions
│   ├── package.json
│   ├── src/
│   │   ├── date.utils.ts
│   │   ├── validation.utils.ts
│   │   └── index.ts
│   └── tsconfig.json
└── database/                 # Database layer and models
    ├── package.json
    ├── src/
    │   ├── models/
    │   ├── repositories/
    │   └── migrations/
    └── tsconfig.json
```

**Characteristics**:

- Focused, single-purpose libraries
- Can depend on other packages
- Should have clear public APIs (via index.ts)
- Version independently if published to npm

## Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  # Applications
  - 'apps/*'
  # Shared packages
  - 'packages/*'
  # Development tools
  - 'tools/*'
  # Exclude build directories and node_modules
  - '!**/node_modules'
  - '!**/dist'
  - '!**/build'
```

### Root package.json

```json
{
  "name": "my-project",
  "private": true,
  "workspaces": ["apps/*", "packages/*", "tools/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "@turbo/gen": "^1.10.0",
    "turbo": "^1.10.0",
    "typescript": "^5.0.0"
  }
}
```

## Shared Configuration

### TypeScript Configuration

**Root tsconfig.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/ui/*": ["./packages/ui/src/*"],
      "@/types/*": ["./packages/types/src/*"],
      "@/utils/*": ["./packages/utils/src/*"]
    }
  },
  "include": [],
  "exclude": ["node_modules"]
}
```

**Package-specific tsconfig.json**:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.*"]
}
```

### ESLint Configuration

**Shared in tools/eslint-config**:

```javascript
module.exports = {
  extends: ['eslint:recommended', '@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Shared rules
  },
  overrides: [
    {
      files: ['**/*.tsx'],
      extends: ['plugin:react/recommended'],
    },
  ],
}
```

## Build Orchestration

### Turbo Configuration (turbo.json)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.tsx", "src/**/*.ts", "test/**/*.ts"]
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### Dependency Management

**Clear dependency boundaries**:

```json
// apps/web/package.json
{
  "dependencies": {
    "@my-project/ui": "workspace:*",
    "@my-project/types": "workspace:*",
    "@my-project/utils": "workspace:*",
    "next": "^13.0.0",
    "react": "^18.0.0"
  }
}

// packages/ui/package.json
{
  "dependencies": {
    "@my-project/types": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  }
}
```

## Package Naming

### Consistent Naming Convention

- Use scoped packages: `@my-project/package-name`
- Clear, descriptive names
- Consistent with folder structure

```json
{
  "name": "@my-project/ui", // packages/ui
  "name": "@my-project/types", // packages/types
  "name": "@my-project/utils", // packages/utils
  "name": "@my-project/database", // packages/database
  "name": "@my-project/eslint-config" // tools/eslint-config
}
```

## Tools Directory

### Development Tools Structure

```text
tools/
├── eslint-config/            # Shared ESLint rules
│   ├── package.json
│   ├── index.js
│   └── README.md
├── tsconfig/                 # TypeScript configuration presets
│   ├── package.json
│   ├── base.json
│   ├── react.json
│   └── node.json
├── prettier-config/          # Prettier configuration
│   ├── package.json
│   └── index.js
└── build-scripts/            # Custom build and deployment scripts
    ├── package.json
    ├── build.js
    └── deploy.js
```

## Scripts and Automation

### Workspace-level Scripts

```json
{
  "scripts": {
    "build": "turbo run build",
    "build:web": "turbo run build --filter=web",
    "dev": "turbo run dev --parallel",
    "test": "turbo run test",
    "test:watch": "turbo run test:watch",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write .",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "changeset publish"
  }
}
```

### Package-specific Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist"
  }
}
```

## Best Practices

### 1. Clear Boundaries

- Apps should not depend on other apps
- Packages should have focused, single responsibilities
- Dependencies should flow in one direction

### 2. Efficient Builds

- Use Turbo or similar for build orchestration
- Configure proper caching strategies
- Parallelize independent builds

### 3. Shared Configuration

- Centralize common configuration in tools/
- Use extends pattern for package-specific overrides
- Version control all configuration

### 4. Documentation

- Document workspace structure in README
- Maintain changelog for each package
- Clear contribution guidelines

### 5. Testing Strategy

- Unit tests at package level
- Integration tests at app level
- E2E tests for complete user journeys

## Migration Strategies

### From Single Package

1. Create workspace structure
2. Extract shared code into packages
3. Update import paths
4. Configure build pipeline
5. Test thoroughly

### Adding New Packages

1. Create package directory
2. Add package.json with proper name/version
3. Implement and export public API
4. Add to workspace configuration
5. Update dependent packages

## Common Patterns

### UI Component Library

```text
packages/ui/
├── src/
│   ├── components/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.test.tsx
│   │   │   ├── Button.stories.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── hooks/
│   ├── utils/
│   └── index.ts             # Main export
├── package.json
└── tsconfig.json
```

### Shared Types Package

```text
packages/types/
├── src/
│   ├── api/
│   │   ├── user.types.ts
│   │   └── order.types.ts
│   ├── common/
│   │   └── base.types.ts
│   └── index.ts             # Re-export all types
├── package.json
└── tsconfig.json
```

This workspace structure provides scalability, maintainability, and efficient development workflows for TypeScript/JavaScript projects.
