# 🛠️ Required Tools

**Focus**: Essential development tools for the project stack

Comprehensive list of required development tools, runtime environments, and utilities necessary for effective development, testing, and deployment of the application.

## 🎯 Core Development Environment

### Runtime & Package Management

```bash
# ✅ Node.js & Package Manager (Required)
# Node.js 20+ (LTS recommended)
node --version  # v20.11.0+
npm --version   # v10.0.0+

# pnpm (Required - primary package manager)
pnpm --version  # v8.15.0+
pnpm install -g pnpm  # Global installation

# Verify pnpm workspace support
pnpm workspaces list

# Turbo (Required - monorepo build system)
pnpm install -g turbo
turbo --version  # v1.12.0+
```

### Core Development Tools

```typescript
// ✅ Required development tools checklist
interface RequiredTools {
  runtime: {
    nodejs: {
      version: '20.11.0+'
      purpose: 'JavaScript/TypeScript runtime environment'
      installation: 'https://nodejs.org/ or use nvm'
      verification: 'node --version'
    }
  }

  packageManagers: {
    pnpm: {
      version: '8.15.0+'
      purpose: 'Fast, disk space efficient package manager'
      installation: 'npm install -g pnpm'
      verification: 'pnpm --version'
      required: true
    }

    turbo: {
      version: '1.12.0+'
      purpose: 'Monorepo build system and task runner'
      installation: 'pnpm install -g turbo'
      verification: 'turbo --version'
      required: true
    }
  }

  codeEditor: {
    vscode: {
      version: 'Latest'
      purpose: 'Primary code editor with TypeScript support'
      installation: 'https://code.visualstudio.com/'
      alternatives: ['WebStorm', 'Neovim with LSP']
      required: true
    }
  }

  versionControl: {
    git: {
      version: '2.40.0+'
      purpose: 'Version control system'
      installation: 'https://git-scm.com/ or system package manager'
      verification: 'git --version'
      required: true
    }
  }
}
```

## 🏗️ Build & Development Tools

### TypeScript & Compilation

```bash
# ✅ TypeScript (Required)
# Installed per project, not globally
pnpm add -D typescript@5.3.0+
pnpm add -D @types/node

# Verify TypeScript setup
pnpm tsc --version
pnpm tsc --noEmit  # Type checking

# ESBuild/Vite (Required - bundling)
# Included in framework dependencies
# Next.js uses built-in compilation
# Vite for frontend tooling
```

### Code Quality Tools

```json
// ✅ Required linting and formatting tools
{
  "devDependencies": {
    // ESLint (Required)
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.19.1",
    "@typescript-eslint/parser": "^6.19.1",
    "eslint-config-next": "^14.1.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",

    // Prettier (Required)
    "prettier": "^3.2.4",
    "prettier-plugin-tailwindcss": "^0.5.11",

    // Husky + lint-staged (Required)
    "husky": "^8.0.3",
    "lint-staged": "^15.2.0",

    // Commitlint (Required)
    "@commitlint/cli": "^18.6.0",
    "@commitlint/config-conventional": "^18.6.0"
  }
}

# Setup pre-commit hooks (Required)
npx husky install
npx husky add .husky/pre-commit "pnpm lint-staged"
npx husky add .husky/commit-msg "pnpm commitlint --edit $1"
```

## 🧪 Testing Infrastructure

### Testing Frameworks

```bash
# ✅ Vitest (Required - unit & integration testing)
pnpm add -D vitest@1.2.0+
pnpm add -D @vitest/ui
pnpm add -D @vitest/coverage-v8

# React Testing Library (Required for React components)
pnpm add -D @testing-library/react
pnpm add -D @testing-library/jest-dom
pnpm add -D @testing-library/user-event

# Playwright (Required - E2E testing)
pnpm add -D @playwright/test
pnpm exec playwright install  # Install browsers

# Verify testing setup
pnpm test
pnpm test:e2e
```

### Testing Configuration

```typescript
// ✅ Required testing tools configuration
interface TestingTools {
  unitTesting: {
    vitest: {
      version: '1.2.0+'
      purpose: 'Fast unit test runner with TypeScript support'
      config: 'vitest.config.ts'
      required: true
    }

    reactTestingLibrary: {
      version: 'Latest'
      purpose: 'React component testing utilities'
      setup: '@testing-library/jest-dom for extended matchers'
      required: true
    }
  }

  e2eTesting: {
    playwright: {
      version: '1.41.0+'
      purpose: 'Cross-browser end-to-end testing'
      browsers: ['Chromium', 'Firefox', 'WebKit']
      required: true
    }
  }

  coverage: {
    v8: {
      purpose: 'Native V8 code coverage'
      integration: 'Built into Vitest'
      thresholds: 'Configurable per project'
      required: true
    }
  }
}
```

## 🗄️ Database & Backend Tools

### Database Tools

```bash
# ✅ Prisma (Required - ORM)
pnpm add prisma@5.8.0+
pnpm add @prisma/client

# Database setup
pnpm dlx prisma init
pnpm dlx prisma generate
pnpm dlx prisma db push

# PostgreSQL (Required - production database)
# Installation varies by system:
# macOS: brew install postgresql@15
# Docker: docker run -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15

# Verify database connection
pnpm dlx prisma studio  # Database GUI
```

### Backend Development

```bash
# ✅ Next.js API (Required - framework)
pnpm add next@14.1.0+
pnpm add react@18.2.0+
pnpm add react-dom@18.2.0+

# Fastify (Required for dedicated API services)
pnpm add fastify@4.25.0+
pnpm add @fastify/cors
pnpm add @fastify/helmet
pnpm add @fastify/rate-limit

# Verification
pnpm dev  # Start development server
```

## 🎨 Frontend Development Tools

### UI Framework & Styling

```bash
# ✅ Tailwind CSS (Required - styling)
pnpm add -D tailwindcss@3.4.0+
pnpm add -D autoprefixer
pnpm add -D postcss

# Initialize Tailwind
pnpm dlx tailwindcss init -p

# UI Components (Required)
pnpm add @radix-ui/react-slot
pnpm add class-variance-authority
pnpm add clsx
pnpm add tailwind-merge

# Icons (Required)
pnpm add lucide-react
```

### State Management & Data Fetching

```bash
# ✅ State Management (Required)
pnpm add zustand@4.4.0+  # Global state
pnpm add @tanstack/react-query@5.17.0+  # Server state
pnpm add @tanstack/react-query-devtools

# Form Handling (Required)
pnpm add react-hook-form@7.49.0+
pnpm add @hookform/resolvers
pnpm add zod@3.22.0+  # Schema validation
```

## 🔧 Development Utilities

### Essential Utilities

```bash
# ✅ Environment Management (Required)
pnpm add dotenv@16.3.0+
pnpm add -D @types/node

# Date/Time Handling (Required)
pnpm add date-fns@3.2.0+

# HTTP Client (Required for API calls)
# Built into browsers and Node.js - use fetch()
# For advanced features:
pnpm add ky@1.2.0+  # Lightweight HTTP client
```

### Development Scripts

```json
// ✅ Required package.json scripts
{
  "scripts": {
    // Development (Required)
    "dev": "next dev",
    "build": "next build",
    "start": "next start",

    // Type checking (Required)
    "type-check": "tsc --noEmit",

    // Code quality (Required)
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",

    // Testing (Required)
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",

    // Database (Required)
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:seed": "tsx src/lib/db/seed.ts",

    // Monorepo (Required)
    "clean": "turbo clean",
    "build:all": "turbo build",
    "test:all": "turbo test",
    "lint:all": "turbo lint"
  }
}
```

## ✅ Tool Installation Verification

### Verification Script

```bash
#!/bin/bash
# ✅ verify-tools.sh - Check required tools installation

echo "🔍 Verifying required development tools..."

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js: Not installed"
    exit 1
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "✅ pnpm: $PNPM_VERSION"
else
    echo "❌ pnpm: Not installed"
    exit 1
fi

# Check turbo
if command -v turbo &> /dev/null; then
    TURBO_VERSION=$(turbo --version)
    echo "✅ Turbo: $TURBO_VERSION"
else
    echo "❌ Turbo: Not installed"
    exit 1
fi

# Check Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo "✅ Git: $GIT_VERSION"
else
    echo "❌ Git: Not installed"
    exit 1
fi

# Check VS Code (optional but recommended)
if command -v code &> /dev/null; then
    echo "✅ VS Code: Available in PATH"
else
    echo "⚠️  VS Code: Not in PATH (install or add to PATH)"
fi

# Check Docker (optional but recommended)
if command -v docker &> /dev/null; then
    echo "✅ Docker: Available"
else
    echo "⚠️  Docker: Not installed (recommended for databases)"
fi

echo ""
echo "🎉 Required tools verification complete!"
echo "📋 Next steps:"
echo "   1. Run 'pnpm install' to install project dependencies"
echo "   2. Run 'pnpm dev' to start development server"
echo "   3. Run 'pnpm test' to verify testing setup"
```

## 🚀 Quick Setup Guide

### New Developer Onboarding

```bash
# ✅ Complete setup for new developers
# 1. Install required tools
curl -fsSL https://get.pnpm.io/install.sh | sh  # pnpm
npm install -g turbo  # turbo

# 2. Clone repository
git clone <repository-url>
cd <project-name>

# 3. Install dependencies
pnpm install

# 4. Setup environment
cp .env.example .env.local
# Edit .env.local with your values

# 5. Setup database
pnpm db:push
pnpm db:seed

# 6. Verify setup
pnpm dev  # Should start successfully
pnpm test  # Should pass all tests
pnpm lint  # Should pass without errors

# 7. Setup IDE (VS Code)
code .  # Opens VS Code
# Install recommended extensions when prompted
```

## 🔗 Related Concepts

- **[Recommended Tools](recommended-tools.md)** - Additional productivity tools
- **[IDE Configuration](ide-configuration.md)** - Development environment setup
- **[Build & Release](.pair/knowledge/guidelines/technical-standards/deployment-workflow/build-release.md)** - CI/CD tool requirements

## 📏 Implementation Guidelines

1. **Version Consistency**: Use specific version ranges for stability
2. **Installation Verification**: Always verify tool installation
3. **Documentation**: Keep installation instructions up-to-date
4. **Team Consistency**: Ensure all team members use required tools
5. **Automation**: Automate tool installation where possible
6. **Backup Plans**: Provide alternative installation methods
7. **Regular Updates**: Keep tools updated for security and features
8. **Troubleshooting**: Document common installation issues

---

_Required Tools define the essential development environment components necessary for effective development, ensuring consistent tooling across team members and enabling the full development workflow._
