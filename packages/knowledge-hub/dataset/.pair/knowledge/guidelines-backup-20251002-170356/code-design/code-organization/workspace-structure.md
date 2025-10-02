# 🏢 Workspace Structure

**Focus**: Development environment organization and team collaboration setup

Guidelines for organizing development workspaces, IDE configurations, and team collaboration tools to support efficient TypeScript development.

## 🚀 Development Environment Setup

### IDE Configuration

```json
// .vscode/settings.json - VS Code workspace settings
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "emmet.includeLanguages": {
    "javascript": "javascriptreact",
    "typescript": "typescriptreact"
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/coverage": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true
  },
  "typescript.preferences.quoteStyle": "single",
  "javascript.preferences.quoteStyle": "single"
}

// .vscode/extensions.json - Recommended extensions
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "yzhang.markdown-all-in-one",
    "ms-vscode-remote.remote-containers",
    "github.copilot",
    "ms-playwright.playwright"
  ]
}

// .vscode/launch.json - Debug configurations
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/apps/web/node_modules/.bin/next",
      "args": ["dev"],
      "cwd": "${workspaceFolder}/apps/web",
      "runtimeArgs": ["--inspect"],
      "env": {
        "NODE_OPTIONS": "--inspect"
      }
    },
    {
      "name": "Debug API Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/apps/api/src/server.ts",
      "cwd": "${workspaceFolder}/apps/api",
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "name": "Debug Jest Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--detectOpenHandles"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}

// .vscode/tasks.json - Build tasks
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build All",
      "type": "shell",
      "command": "pnpm",
      "args": ["turbo", "run", "build"],
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      }
    },
    {
      "label": "Test All",
      "type": "shell",
      "command": "pnpm",
      "args": ["turbo", "run", "test"],
      "group": {
        "kind": "test",
        "isDefault": true
      }
    },
    {
      "label": "Lint All",
      "type": "shell",
      "command": "pnpm",
      "args": ["turbo", "run", "lint"],
      "group": "build"
    }
  ]
}
```

### Git Configuration

```bash
# .gitignore - Comprehensive ignore patterns
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Build outputs
dist/
build/
.next/
out/
*.tsbuildinfo

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/settings.json.user
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Coverage
coverage/
.nyc_output/

# Cache directories
.cache/
.parcel-cache/
.turbo/

# Database
*.db
*.sqlite

# Temporary files
tmp/
temp/
```

```bash
# .gitattributes - File handling rules
# Text files
*.md text
*.txt text
*.json text
*.js text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.css text eol=lf
*.html text eol=lf
*.yml text eol=lf
*.yaml text eol=lf

# Binary files
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary

# Generated files
package-lock.json binary
pnpm-lock.yaml binary
```

## 📋 Project Configuration Files

### Root Configuration

```typescript
// Root package.json - Monorepo configuration
{
  "name": "my-workspace",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*",
    "tools/*"
  ],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:watch": "turbo run test:watch",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "type-check": "turbo run type-check",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "prepare": "husky install",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.26.0",
    "husky": "^8.0.3",
    "lint-staged": "^14.0.1",
    "prettier": "^3.0.3",
    "turbo": "^1.10.16",
    "typescript": "^5.2.2"
  },
  "packageManager": "pnpm@8.7.0",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}

// turbo.json - Build pipeline configuration
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [
    "**/.env.*local"
  ],
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "NEXT_PUBLIC_API_URL"
  ],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.tsx", "src/**/*.ts", "test/**/*.ts", "package.json"]
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint:fix": {
      "cache": false,
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

### TypeScript Workspace Configuration

```json
// tsconfig.json - Root TypeScript configuration
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "allowJs": true,
    "checkJs": false,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "removeComments": false,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "moduleDetection": "force",
    "allowUnusedLabels": false,
    "allowUnreachableCode": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "exclude": [
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx"
  ],
  "references": [
    { "path": "./apps/web" },
    { "path": "./apps/api" },
    { "path": "./packages/ui-components" },
    { "path": "./packages/shared-types" },
    { "path": "./packages/utils" }
  ]
}

// Project references for better build performance
// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "plugins": [{ "name": "next" }],
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"],
      "@/components/*": ["components/*"],
      "@/lib/*": ["lib/*"],
      "@/hooks/*": ["hooks/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "references": [
    { "path": "../../packages/ui-components" },
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/utils" }
  ]
}
```

## 🔧 Development Tools Configuration

### Linting and Formatting

```javascript
// eslint.config.js - ESLint flat config
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',

      // React rules
      'react/jsx-uses-react': 'off', // Not needed with new JSX transform
      'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // General rules
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      'eqeqeq': ['error', 'always']
    },
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  prettier
];

// .prettierrc.json - Prettier configuration
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "avoid",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": ["*.json", "*.yml", "*.yaml"],
      "options": {
        "tabWidth": 2
      }
    }
  ]
}
```

### Git Hooks and Quality Gates

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run lint-staged
npx lint-staged

# .husky/commit-msg
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate commit message format
npx commitlint --edit $1

# .husky/pre-push
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run type checking before push
pnpm type-check

# Run tests before push
pnpm test
```

```json
// .lintstagedrc.json - Lint staged configuration
{
  "*.{ts,tsx,js,jsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "*.{json,css,md,yml,yaml}": [
    "prettier --write"
  ],
  "package.json": [
    "sort-package-json",
    "prettier --write"
  ]
}

// .commitlintrc.json - Commit message linting
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "chore",
        "ci",
        "build"
      ]
    ],
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 72]
  }
}
```

## 🧪 Testing Configuration

### Test Setup

```typescript
// vitest.config.ts - Vitest configuration
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/coverage/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/test': resolve(__dirname, './test'),
    },
  },
})

// test/setup.ts - Test setup file
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

// Global test setup
beforeAll(async () => {
  // Setup test database, mock servers, etc.
  console.log('Setting up test environment...')
})

afterAll(async () => {
  // Cleanup test resources
  console.log('Cleaning up test environment...')
})

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks()
})

afterEach(() => {
  // Additional cleanup after each test
})

// Global test utilities
global.testUser = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
}

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
```

### Docker Development Environment

```dockerfile
# docker/Dockerfile.dev - Development container
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/*/package.json ./apps/*/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose ports
EXPOSE 3000 3001

# Start development servers
CMD ["pnpm", "dev"]
```

```yaml
# docker-compose.dev.yml - Development services
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - '3000:3000' # Next.js
      - '3001:3001' # API
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp_dev
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data

  test-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - '5433:5432'
    volumes:
      - test_postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
  test_postgres_data:
  redis_data:
```

## 📚 Documentation Structure

### Project Documentation

````
docs/
├── README.md                   # Project overview
├── CONTRIBUTING.md             # Contribution guidelines
├── CHANGELOG.md                # Version history
├── architecture/               # Architecture documentation
│   ├── README.md
│   ├── adr/                   # Architecture Decision Records
│   │   ├── 001-database-choice.md
│   │   ├── 002-state-management.md
│   │   └── template.md
│   ├── diagrams/              # Architecture diagrams
│   └── patterns/              # Design patterns used
├── api/                       # API documentation
│   ├── README.md
│   ├── authentication.md
│   ├── users.md
│   └── openapi.yml
├── development/               # Development guides
│   ├── getting-started.md
│   ├── local-setup.md
│   ├── testing.md
│   ├── deployment.md
│   └── troubleshooting.md
├── user-guides/               # End-user documentation
│   ├── user-management.md
│   ├── admin-panel.md
│   └── faq.md
└── rfcs/                      # Request for Comments
    ├── 001-new-feature.md
    └── template.md

# README.md template
# Project Name

Brief description of what this project does.

## Quick Start

```bash
# Clone the repository
git clone <repository-url>

# Install dependencies
pnpm install

# Start development servers
pnpm dev
````

## Project Structure

```
apps/           # Applications
packages/       # Shared packages
tools/          # Development tools
docs/           # Documentation
```

## Development

- Getting Started (`docs/getting-started.md`)
- Local Setup (`docs/local-setup.md`)
- Testing (`docs/testing.md`)
- Contributing (`CONTRIBUTING.md`)

## Architecture

- Overview (`docs/architecture/README.md`)
- Decision Records (`docs/architecture/adr/`)
- API Documentation (`docs/api/`)

## Scripts

- `pnpm dev` - Start development servers
- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm lint` - Run linting
- `pnpm type-check` - Run type checking

````

## 🤝 Team Collaboration Setup

### Code Review Guidelines

```markdown
# .github/PULL_REQUEST_TEMPLATE.md

## Description

Brief description of changes made.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)

## Additional Notes
````

### Issue Templates

```markdown
# .github/ISSUE_TEMPLATE/bug_report.md

---

name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''

---

## Bug Description

A clear and concise description of what the bug is.

## To Reproduce

Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Screenshots

If applicable, add screenshots to help explain your problem.

## Environment

- OS: [e.g. iOS]
- Browser [e.g. chrome, safari]
- Version [e.g. 22]
- Node.js version:
- Package manager version:

## Additional Context

Add any other context about the problem here.
```

## 🔗 Related Concepts

- **[File Structure](file-structure.md)** - Individual project organization
- **[Monorepo Organization](monorepo-organization.md)** - Multi-package workspace setup
- **[Dependency Management](dependency-management.md)** - Managing project dependencies
- **[Build Configuration](.pair/knowledge/guidelines/technical-standards/development-tools/build-tools.md)** - Build and deployment setup

## 🎯 Implementation Guidelines

1. **Consistent Configuration**: Use shared configurations across all workspace packages
2. **Development Environment**: Provide easy setup for new team members
3. **Quality Gates**: Implement automated checks for code quality and standards
4. **Documentation**: Maintain up-to-date documentation for all workspace aspects
5. **Team Collaboration**: Set up clear processes for code review and issue tracking
6. **IDE Support**: Configure IDE settings for optimal development experience
7. **Automation**: Automate repetitive tasks with scripts and CI/CD pipelines

## 📏 Benefits

- **Developer Productivity**: Well-configured workspace reduces setup time and friction
- **Code Quality**: Automated quality checks maintain consistent standards
- **Team Collaboration**: Clear processes and templates facilitate effective teamwork
- **Maintainability**: Organized structure makes projects easier to understand and maintain
- **Scalability**: Workspace structure supports growth and additional team members
- **Consistency**: Shared configurations ensure consistent development experience

---

_A well-organized workspace structure is the foundation for efficient team collaboration and high-quality software development._
