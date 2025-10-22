# pnpm Package Management

## Overview

pnpm (performant npm) is a fast, disk space efficient package manager that uses hard links and symlinks to avoid duplicating dependencies. This guide covers pnpm workspace configuration, optimization strategies, and best practices for monorepo management.

## pnpm Philosophy

### Efficient Dependency Management

pnpm addresses common npm/yarn challenges through innovative approaches:

**Content-Addressable Storage**: Packages stored once globally, linked to projects
**Strict Dependency Resolution**: Prevents phantom dependencies and ensures reproducible builds
**Workspace Efficiency**: Native monorepo support with optimal dependency sharing
**Fast Installation**: Parallel processing and efficient linking reduce installation time

### Workspace-First Design

pnpm workspaces provide powerful monorepo capabilities:

**Dependency Hoisting**: Intelligent dependency sharing across workspace packages
**Cross-Package Dependencies**: Seamless local package linking and development
**Script Orchestration**: Coordinated script execution across multiple packages
**Selective Operations**: Target specific packages or dependency patterns

## Workspace Configuration

### Basic Workspace Setup

Configure pnpm workspace fundamentals:

```yaml
# pnpm-workspace.yaml - Workspace definition
packages:
  # Applications
  - 'apps/*'
  - 'apps/*/packages/*'

  # Shared packages
  - 'packages/*'
  - 'packages/*/packages/*'

  # Tools and utilities
  - 'tools/*'

  # Documentation
  - 'docs'

  # Exclude test fixtures and examples
  - '!**/test/**'
  - '!**/examples/**'
  - '!**/__tests__/**'
```

```json
// package.json - Root workspace configuration
{
  "name": "my-workspace",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "clean": "turbo clean && pnpm store prune"
  },
  "devDependencies": {
    "turbo": "^1.10.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  },
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": ["@types/react", "@types/react-dom"]
    },
    "overrides": {
      "vulnerable-package": "^2.0.0"
    }
  },
  "packageManager": "pnpm@8.15.0"
}
```

### Advanced Workspace Configuration

Optimize workspace behavior for specific needs:

```yaml
# .pnpmrc - Advanced configuration
store-dir=~/.pnpm-store
cache-dir=~/.pnpm-cache

# Workspace behavior
link-workspace-packages=true
prefer-workspace-packages=true
shared-workspace-lockfile=true

# Dependency resolution
auto-install-peers=true
strict-peer-dependencies=false
resolution-mode=highest

# Performance optimization
network-concurrency=16
hoist-pattern[]=*
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*
public-hoist-pattern[]=@types/*
```

## Dependency Management Strategies

### Workspace Dependencies

Manage dependencies efficiently across workspace:

```json
// Root package.json - Shared dependencies
{
  "devDependencies": {
    // Build tools (shared across all packages)
    "typescript": "^5.0.0",
    "turbo": "^1.10.0",

    // Linting and formatting (hoisted)
    "eslint": "^8.50.0",
    "prettier": "^3.0.0",

    // Testing (shared test utilities)
    "vitest": "^0.34.0",
    "@types/node": "^20.0.0"
  }
}

// packages/ui/package.json - Package-specific dependencies
{
  "name": "@workspace/ui",
  "dependencies": {
    "react": "^18.2.0",
    "clsx": "^2.0.0",

    // Internal workspace dependencies
    "@workspace/utils": "workspace:*",
    "@workspace/tokens": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=16.8.0",
    "react-dom": ">=16.8.0"
  }
}
```

### Version Management

Use workspace protocols for internal dependencies:

```bash
# Install internal workspace dependency
pnpm add @workspace/ui --filter @workspace/app

# Install external dependency to specific package
pnpm add lodash --filter @workspace/utils

# Install dev dependency to root
pnpm add -Dw typescript

# Update all workspace dependencies
pnpm update --recursive
```

## Script Orchestration

### Package Scripts Organization

Structure scripts for efficient workspace operations:

```json
// Root package.json - Orchestration scripts
{
  "scripts": {
    // Development
    "dev": "turbo dev --parallel",
    "dev:ui": "turbo dev --filter @workspace/ui",

    // Building
    "build": "turbo build",
    "build:libs": "turbo build --filter './packages/*'",

    // Testing
    "test": "turbo test",
    "test:changed": "turbo test --filter=[HEAD^1]",

    // Quality
    "lint": "turbo lint",
    "lint:fix": "turbo lint:fix",
    "type-check": "turbo type-check",

    // Utilities
    "clean": "turbo clean && pnpm store prune",
    "reset": "pnpm clean && rm -rf node_modules && pnpm install"
  }
}
```

## Performance Optimization

### Installation Optimization

Optimize pnpm installation performance:

```bash
# .pnpmrc - Performance optimization
network-concurrency=32
fetch-retries=5
package-import-method=copy
prefer-frozen-lockfile=true
```

### Workspace Analysis

Monitor workspace health and dependencies:

```javascript
// scripts/workspace-analyzer.js
class WorkspaceAnalyzer {
  analyzeWorkspaceDependencies() {
    const analysis = {
      totalPackages: this.packages.length,
      internalDependencies: new Map(),
      externalDependencies: new Map(),
      circularDependencies: [],
    }

    this.packages.forEach(pkg => {
      this.analyzePackageDependencies(pkg, analysis)
    })

    return analysis
  }

  detectVersionConflicts() {
    return Array.from(this.externalDependencies.entries()).filter(
      ([_, info]) => info.versions.size > 1,
    )
  }
}
```

## Troubleshooting and Maintenance

### Common Issues and Solutions

Address frequent pnpm workspace challenges:

```bash
# Clear cache and reinstall
pnpm store prune
rm -rf node_modules
pnpm install

# Fix peer dependency warnings
pnpm install --fix-peer-deps

# Audit and fix vulnerabilities
pnpm audit --fix

# Update all dependencies
pnpm update --recursive --latest
```

### Maintenance Scripts

Automate workspace maintenance:

```javascript
// Workspace maintenance automation
class WorkspaceMaintenance {
  async performMaintenance() {
    await this.cleanupStores()
    await this.updateDependencies()
    await this.auditSecurity()
    await this.optimizeWorkspace()
  }

  async cleanupStores() {
    execSync('pnpm store prune', { stdio: 'inherit' })
  }
}
```

## Best Practices Summary

### Workspace Organization

- **Clear Structure**: Organize packages by purpose (apps, libraries, tools)
- **Dependency Boundaries**: Use workspace protocols for internal dependencies
- **Script Consistency**: Maintain consistent script naming across packages
- **Configuration Sharing**: Share common configuration through root workspace

### Performance Optimization

- **Efficient Hoisting**: Configure appropriate hoisting patterns for shared dependencies
- **Build Caching**: Use Turbo or similar tools for intelligent build caching
- **Parallel Processing**: Leverage pnpm's parallel installation and execution capabilities
- **Store Management**: Regular store cleanup and optimization

### Dependency Management

- **Version Consistency**: Use peer dependencies and overrides to manage version conflicts
- **Security Monitoring**: Regular security audits and dependency updates
- **Workspace Protocols**: Use workspace: protocol for internal package dependencies
- **Lock File Management**: Maintain shared lockfile for reproducible builds

### Development Workflow

- **Script Orchestration**: Use filtering and parallel execution for efficient workflows
- **Development Environment**: Provide automated setup and maintenance scripts
- **Documentation**: Maintain clear documentation of workspace structure and conventions
- **Monitoring**: Regular analysis of dependency graph and workspace health

pnpm workspaces provide a powerful foundation for monorepo management, enabling efficient dependency sharing, fast installations, and scalable development workflows through intelligent dependency resolution and workspace organization.
