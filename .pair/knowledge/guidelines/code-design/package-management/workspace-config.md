# Workspace Configuration

## Overview

Workspace configuration defines how multiple packages are organized, built, and coordinated within a monorepo or multi-package project. This guide covers configuration patterns, automation strategies, and best practices for scalable workspace management.

## Workspace Configuration Philosophy

### Workspace-First Design

Design workspace configuration to support efficient multi-package development:

**Package Isolation**: Clear boundaries between packages with minimal cross-dependencies
**Shared Infrastructure**: Common tooling, scripts, and configuration across packages
**Coordinated Dependencies**: Aligned versions and consistent dependency management
**Scalable Build Process**: Efficient builds that scale with workspace size

### Configuration Principles

Structure workspace configuration for maintainability and developer experience:

**Convention Over Configuration**: Sensible defaults with customization where needed
**Incremental Complexity**: Start simple and add complexity as requirements grow
**Tool Integration**: Seamless integration with development tools and IDEs
**Documentation as Code**: Self-documenting configuration that explains decisions

## Package Manager Configuration

### pnpm Workspace Configuration

Configure pnpm for efficient monorepo management:

```yaml
# pnpm-workspace.yaml - Workspace package definition
packages:
  # Application packages
  - 'apps/*'

  # Shared library packages
  - 'packages/*'

  # Infrastructure and tooling
  - 'tools/*'

  # Documentation and examples
  - 'docs/*'

  # Exclude build artifacts and temporary directories
  - '!**/node_modules'
  - '!**/dist'
  - '!**/.temp'
```

```json
// package.json - Root workspace configuration
{
  "name": "my-workspace",
  "version": "1.0.0",
  "private": true,
  "type": "module",

  "packageManager": "pnpm@8.10.0",

  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "clean": "turbo run clean && rm -rf node_modules/.pnpm",

    "workspace:list": "pnpm list --recursive --depth 0",
    "workspace:outdated": "pnpm outdated --recursive",
    "workspace:update": "pnpm update --recursive"
  },

  "devDependencies": {
    "turbo": "^1.10.0",
    "prettier": "^3.0.0",
    "typescript": "^5.0.0"
  },

  "pnpm": {
    "overrides": {
      "react": "^18.2.0",
      "typescript": "^5.0.0"
    },
    "peerDependencyRules": {
      "allowedVersions": {
        "react": "18"
      },
      "ignoreMissing": ["@babel/core"]
    }
  }
}
```

### Build Orchestration Configuration

Configure Turborepo for efficient build coordination:

```json
// turbo.json - Build pipeline configuration
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],

  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["NODE_ENV", "NEXT_PUBLIC_*"]
    },

    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.{js,ts,tsx}", "test/**/*.{js,ts}"]
    },

    "lint": {
      "outputs": [".eslintcache"],
      "inputs": ["src/**/*.{js,ts,tsx}", "eslint.config.*"]
    },

    "dev": {
      "cache": false,
      "persistent": true,
      "env": ["NODE_ENV", "PORT", "NEXT_PUBLIC_*"]
    },

    "clean": {
      "cache": false,
      "outputs": []
    }
  }
}
```

## TypeScript Workspace Configuration

### Project References Setup

Configure TypeScript project references for efficient type checking:

```json
// tsconfig.json - Root TypeScript configuration
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,

    "baseUrl": ".",
    "paths": {
      "@workspace/*": ["packages/*/src"],
      "@apps/*": ["apps/*/src"]
    }
  },

  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/ui" },
    { "path": "./packages/utils" },
    { "path": "./apps/web" },
    { "path": "./apps/api" }
  ],

  "include": [],
  "exclude": ["node_modules", "dist", ".next"]
}
```

### Package-Level TypeScript Configuration

```json
// packages/core/tsconfig.json - Package-specific configuration
{
  "extends": "../../tsconfig.json",

  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },

  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts", "dist"],

  "references": [{ "path": "../utils" }]
}
```

## Development Environment Configuration

### Shared Development Tools

Configure consistent development tools across packages:

```javascript
// eslint.config.js - Workspace ESLint configuration
import baseConfig from './tools/eslint-config/eslint.config.js'

export default [
  ...baseConfig,

  {
    files: ['apps/**/*.{js,ts,tsx}'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  {
    files: ['packages/**/*.{js,ts}'],
    rules: {
      'no-console': 'error',
    },
  },

  {
    files: ['**/*.test.{js,ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
]
```

### Environment Configuration

Structure environment variables for workspace-wide consistency:

```bash
# .env.example - Environment variable template
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/myapp"
DATABASE_POOL_SIZE=10

# Authentication
AUTH_SECRET="your-auth-secret-here"
AUTH_PROVIDERS="github,google"

# External Services
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Development Settings
NODE_ENV="development"
LOG_LEVEL="debug"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Workspace Scripts and Automation

### Package Coordination Scripts

Create scripts for workspace-wide operations:

```javascript
// scripts/workspace-manager.js - Workspace management utilities
import { spawn } from 'child_process'
import { readdir } from 'fs/promises'
import path from 'path'

class WorkspaceManager {
  constructor() {
    this.workspaceRoot = process.cwd()
    this.packagesDir = path.join(this.workspaceRoot, 'packages')
    this.appsDir = path.join(this.workspaceRoot, 'apps')
  }

  async listPackages() {
    const packages = []

    try {
      const packageDirs = await readdir(this.packagesDir)
      for (const dir of packageDirs) {
        packages.push({
          name: dir,
          type: 'package',
          path: path.join(this.packagesDir, dir),
        })
      }

      const appDirs = await readdir(this.appsDir)
      for (const dir of appDirs) {
        packages.push({
          name: dir,
          type: 'app',
          path: path.join(this.appsDir, dir),
        })
      }
    } catch (error) {
      console.error('Error listing packages:', error.message)
    }

    return packages
  }

  async runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['run', command], {
        stdio: 'inherit',
        cwd: this.workspaceRoot,
        ...options,
      })

      child.on('exit', code => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Command failed with exit code ${code}`))
        }
      })
    })
  }
}
```

### Health Check Automation

Implement workspace health monitoring:

```bash
#!/bin/bash
# scripts/workspace-health-check.sh

echo "🔍 Running workspace health check..."

# Check workspace structure
echo "📁 Checking workspace structure..."
if [ ! -f "pnpm-workspace.yaml" ]; then
  echo "❌ Missing pnpm-workspace.yaml"
  exit 1
fi

# Validate package.json files
echo "📦 Validating package.json files..."
find . -name "package.json" -not -path "./node_modules/*" | while read -r file; do
  if ! jq empty "$file" 2>/dev/null; then
    echo "❌ Invalid JSON in $file"
    exit 1
  fi
done

# Check dependencies
echo "🔗 Checking dependency consistency..."
pnpm list --recursive --depth=0 > /dev/null

# Run tests
echo "🧪 Running workspace tests..."
pnpm test

echo "✅ Workspace health check completed successfully"
```

## Best Practices Summary

### Configuration Strategy

- **Centralized Base Configuration**: Share common settings through extended configurations
- **Package-Specific Overrides**: Allow packages to customize configuration as needed
- **Environment Consistency**: Use consistent environment variable patterns across packages
- **Tool Integration**: Ensure configuration works seamlessly with development tools

### Build Optimization

- **Incremental Builds**: Configure build systems for efficient incremental compilation
- **Dependency Optimization**: Use project references and smart caching strategies
- **Parallel Execution**: Enable parallel builds where dependencies allow
- **Cache Management**: Implement effective caching for development and CI environments

### Developer Experience

- **Simple Commands**: Provide clear, simple commands for common workspace operations
- **Documentation**: Self-document configuration decisions and rationale
- **Automation**: Automate repetitive tasks and health checks
- **IDE Integration**: Ensure configuration works well with popular development environments

### Maintenance Process

- **Regular Updates**: Keep workspace configuration current with tool updates
- **Health Monitoring**: Implement automated health checks for workspace integrity
- **Migration Planning**: Plan and document configuration migrations systematically
- **Team Training**: Educate team on workspace structure and development patterns

Effective workspace configuration provides the foundation for productive multi-package development, enabling teams to work efficiently while maintaining consistency and quality across all packages.
