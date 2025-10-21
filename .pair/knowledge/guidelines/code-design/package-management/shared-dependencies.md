# Shared Dependencies Management

## Overview

Shared dependencies are packages used across multiple components in a monorepo or multi-package project. This guide covers strategies for dependency sharing, deduplication, version management, and coordination of critical infrastructure packages across workspace boundaries.

## Dependency Sharing Philosophy

### Strategic Dependency Management

Shared dependencies require careful coordination to balance benefits and complexity:

**Consistency Benefits**: Unified versions reduce conflicts and ensure compatibility
**Bundle Optimization**: Shared dependencies enable better tree-shaking and code splitting
**Maintenance Efficiency**: Centralized updates reduce coordination overhead
**Security Management**: Single-point security updates and vulnerability management

### Dependency Classification

Categorize dependencies by sharing strategy:

**Infrastructure Dependencies**: Build tools, testing frameworks, linting utilities
**Framework Dependencies**: React, Vue, Angular and their ecosystems
**Utility Libraries**: Lodash, date-fns, utility packages used across multiple packages
**Design System Dependencies**: UI components, styling libraries, design tokens

## Dependency Sharing Strategies

### Workspace-Level Sharing

Implement workspace-wide dependency coordination:

```json
// Root package.json - Infrastructure dependencies
{
  "name": "monorepo-workspace",
  "private": true,
  "devDependencies": {
    // Build and development infrastructure
    "typescript": "^5.0.0",
    "vite": "^4.4.0",
    "turbo": "^1.10.0",

    // Code quality tools
    "eslint": "^8.50.0",
    "prettier": "^3.0.0",

    // Testing infrastructure
    "vitest": "^0.34.0",
    "@types/node": "^20.0.0"
  },
  "pnpm": {
    "overrides": {
      // Force specific versions for security or compatibility
      "semver": "^7.5.0",
      "lodash": "^4.17.21"
    }
  }
}
```

### Package-Level Coordination

Coordinate shared dependencies across packages:

```json
// packages/ui/package.json - Shared framework dependencies
{
  "name": "@workspace/ui",
  "dependencies": {
    "clsx": "^2.0.0",
    "lodash-es": "^4.17.21",
    "@workspace/tokens": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

## Dependency Deduplication

### Automatic Deduplication

Configure package managers for optimal deduplication:

```yaml
# .pnpmrc - Deduplication configuration
hoist-pattern[]=*
public-hoist-pattern[]=*react*
public-hoist-pattern[]=*lodash*
public-hoist-pattern[]=@types/*

link-workspace-packages=true
prefer-workspace-packages=true
resolution-mode=highest
```

### Deduplication Analysis

Analyze and optimize dependency duplication:

```javascript
// Dependency deduplication analysis
class DependencyAnalyzer {
  analyzeDuplicates() {
    this.workspacePackages.forEach(pkg => {
      this.processPaсkageDependencies(pkg)
    })

    this.identifyDuplicates()
    this.generateDeduplicationReport()
  }

  identifyDuplicates() {
    this.dependencyMap.forEach((info, depName) => {
      if (info.versions.size > 1) {
        this.duplicates.set(depName, {
          versions: info.versions,
          totalPackages: info.packages.length,
          recommendation: this.generateRecommendation(depName, info),
        })
      }
    })
  }
}
```

## Version Coordination Strategies

### Centralized Version Management

Coordinate versions across workspace packages:

```json
// package.json - Centralized version overrides
{
  "pnpm": {
    "overrides": {
      // Security updates
      "semver": "^7.5.4",
      "tough-cookie": "^4.1.3",

      // Framework consistency
      "react": "^18.2.0",
      "react-dom": "^18.2.0",

      // Utility library standardization
      "lodash": "^4.17.21",
      "typescript": "^5.0.0"
    },
    "peerDependencyRules": {
      "allowedVersions": {
        "react": "18",
        "react-dom": "18"
      }
    }
  }
}
```

### Version Policy Enforcement

Define and enforce version policies:

```javascript
// Version policy enforcement
class VersionPolicyChecker {
  constructor() {
    this.policies = {
      'ui-packages': {
        pattern: /^@workspace\/(ui|components)/,
        rules: {
          react: { range: '^18.0.0', type: 'peerDependency' },
          typescript: { range: '^5.0.0', type: 'devDependency' },
        },
      },
    }
  }

  checkPackageCompliance(packageJson) {
    const violations = []
    // Implementation for checking compliance
    return violations
  }
}
```

## Critical Infrastructure Dependencies

### Infrastructure Package Coordination

Manage build tools and development infrastructure:

```json
// Infrastructure dependency coordination
{
  "devDependencies": {
    // TypeScript ecosystem
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",

    // Build tools
    "vite": "^4.4.0",
    "turbo": "^1.10.0",

    // Code quality
    "eslint": "^8.50.0",
    "prettier": "^3.0.0",

    // Testing
    "vitest": "^0.34.0",
    "@testing-library/react": "^13.4.0"
  }
}
```

### Security Coordination

Coordinate security updates across shared dependencies:

```javascript
// Security update coordination
class SecurityCoordinator {
  async auditWorkspaceSecurity() {
    const auditOutput = execSync('pnpm audit --json', { encoding: 'utf8' })
    const auditData = JSON.parse(auditOutput)

    this.processSecurityAudit(auditData)
  }

  generateSecurityFixPlan(vulnerabilities) {
    const autoFixable = vulnerabilities.filter(([, vuln]) => vuln.fixAvailable)

    if (autoFixable.length > 0) {
      console.log('🔧 Auto-fixable vulnerabilities:')
      console.log('pnpm audit --fix')
    }
  }
}
```

## Best Practices Summary

### Dependency Sharing Strategy

- **Clear Categorization**: Classify dependencies by sharing pattern (infrastructure, framework, utility)
- **Version Coordination**: Use workspace overrides and peer dependencies for version alignment
- **Deduplication Monitoring**: Regular analysis and optimization of duplicate dependencies
- **Policy Enforcement**: Implement automated checks for dependency version policies

### Infrastructure Management

- **Centralized Infrastructure**: Manage build tools and development dependencies at workspace root
- **Security Coordination**: Implement workspace-wide security auditing and update processes
- **Performance Optimization**: Use hoisting and deduplication for optimal installation performance
- **Documentation**: Maintain clear documentation of dependency sharing decisions and policies

### Maintenance and Monitoring

- **Regular Audits**: Automated dependency analysis and duplication detection
- **Update Coordination**: Systematic approach to dependency updates across workspace
- **Compliance Checking**: Automated validation of version policies and dependency rules
- **Security Monitoring**: Continuous security scanning and vulnerability management

### Team Coordination

- **Clear Guidelines**: Document dependency sharing patterns and version policies
- **Automated Enforcement**: Use tools to enforce dependency policies and detect violations
- **Change Management**: Coordinate dependency updates to minimize disruption
- **Knowledge Sharing**: Educate team on dependency management best practices and rationale

Effective shared dependency management reduces complexity, improves consistency, and enables efficient maintenance while preserving package independence and flexibility for specific requirements.
