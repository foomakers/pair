# Version Catalog Management

## Overview

A version catalog provides centralized version management for dependencies across a monorepo or multi-package project. This guide covers strategies for implementing, maintaining, and automating version catalogs to ensure consistency, security, and efficient dependency coordination.

## Version Catalog Philosophy

### Centralized Dependency Control

Version catalogs address complexity in large-scale dependency management:

**Single Source of Truth**: Centralized version definitions prevent conflicts and drift
**Consistent Updates**: Coordinated dependency updates across all packages
**Security Management**: Centralized security patch deployment and vulnerability tracking
**Dependency Governance**: Controlled approval process for new dependencies and versions

### Catalog Design Principles

Design version catalogs for maintainability and usability:

**Semantic Organization**: Group dependencies by purpose and lifecycle
**Flexible Versioning**: Support both exact versions and version ranges as appropriate
**Change Tracking**: Maintain history of version changes and rationale
**Automation Integration**: Enable automated updates and compliance checking

## Catalog Implementation Strategies

### JSON-Based Version Catalog

Implement a structured JSON catalog for dependency versions:

```json
// versions.json - Central version catalog
{
  "catalog": {
    "metadata": {
      "version": "1.0.0",
      "lastUpdated": "2024-01-15T10:30:00Z",
      "maintainer": "platform-team"
    },

    "infrastructure": {
      "description": "Build tools and development infrastructure",
      "dependencies": {
        "typescript": {
          "version": "^5.0.0",
          "rationale": "Latest stable with improved performance",
          "lastUpdated": "2024-01-10",
          "securityReview": "2024-01-10"
        },
        "vite": {
          "version": "^4.4.0",
          "rationale": "Stable build performance with React support",
          "lastUpdated": "2024-01-08"
        }
      }
    },

    "frameworks": {
      "description": "Frontend and backend frameworks",
      "dependencies": {
        "react": {
          "version": "^18.2.0",
          "rationale": "Latest stable with concurrent features",
          "peerDependencies": {
            "react-dom": "^18.2.0"
          }
        },
        "next": {
          "version": "^13.5.0",
          "rationale": "App router stability improvements",
          "dependsOn": ["react", "react-dom"]
        }
      }
    }
  },

  "policies": {
    "updateFrequency": {
      "security": "immediate",
      "major": "quarterly",
      "minor": "monthly"
    },
    "approvalRequired": ["infrastructure", "frameworks"],
    "autoUpdateAllowed": ["quality", "testing"]
  }
}
```

### Catalog Management Tools

Create tools for catalog maintenance and validation:

```javascript
// Version catalog management
class VersionCatalogManager {
  constructor(catalogPath = './versions.json') {
    this.catalogPath = catalogPath
    this.catalog = this.loadCatalog()
  }

  updateDependencyVersion(category, dependencyName, newVersion, rationale) {
    const dependency = this.catalog.catalog[category].dependencies[dependencyName]

    // Store previous version for rollback
    const previousVersion = dependency.version

    // Update dependency
    dependency.version = newVersion
    dependency.lastUpdated = new Date().toISOString().split('T')[0]
    dependency.rationale = rationale
    dependency.previousVersion = previousVersion

    console.log(`✅ Updated ${dependencyName}: ${previousVersion} → ${newVersion}`)
    return { previous: previousVersion, current: newVersion }
  }

  validateCatalog() {
    const errors = []
    const warnings = []

    // Validate each category and dependency
    Object.entries(this.catalog.catalog).forEach(([categoryName, category]) => {
      if (!category.dependencies) return

      Object.entries(category.dependencies).forEach(([depName, dep]) => {
        if (!dep.version) {
          errors.push(`${categoryName}.${depName}: Missing version`)
        }
        if (!dep.rationale) {
          warnings.push(`${categoryName}.${depName}: Missing rationale`)
        }
      })
    })

    return { errors, warnings }
  }
}
```

## Catalog Automation

### Automated Catalog Updates

Implement automated dependency update workflows:

```yaml
# .github/workflows/dependency-updates.yml
name: Dependency Catalog Updates

on:
  schedule:
    - cron: '0 9 * * 1' # Weekly on Mondays

jobs:
  update-catalog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Validate current catalog
        run: node scripts/version-catalog-manager.js validate

      - name: Check for security updates
        run: |
          pnpm audit --json > audit-results.json || true
          echo "security_issues=$(jq '.metadata.vulnerabilities.total' audit-results.json)" >> $GITHUB_OUTPUT

      - name: Apply dependency updates
        run: node scripts/apply-catalog-updates.js

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          title: 'Automated Dependency Catalog Update'
          body: 'Automated updates to dependency catalog with security patches'
```

### Catalog Synchronization

Keep catalog synchronized with actual workspace dependencies:

```javascript
// Catalog synchronization
class CatalogSynchronizer {
  syncCatalogWithLockfile() {
    const discrepancies = []

    // Check each catalog entry against lockfile
    Object.entries(this.catalog.catalog).forEach(([categoryName, category]) => {
      Object.entries(category.dependencies).forEach(([depName, catalogDep]) => {
        const lockfileVersion = this.getLockfileVersion(depName)

        if (lockfileVersion && lockfileVersion !== catalogDep.version) {
          discrepancies.push({
            dependency: depName,
            category: categoryName,
            catalogVersion: catalogDep.version,
            lockfileVersion,
            action: 'update-catalog',
          })
        }
      })
    })

    return discrepancies
  }

  applyAutomaticSync() {
    const discrepancies = this.syncCatalogWithLockfile()

    discrepancies.forEach(discrepancy => {
      if (discrepancy.action === 'update-catalog') {
        this.catalogManager.updateDependencyVersion(
          discrepancy.category,
          discrepancy.dependency,
          discrepancy.lockfileVersion,
          'Automatic sync from lockfile',
        )
      }
    })

    this.catalogManager.saveCatalog()
  }
}
```

## Workspace Integration

### Generate Package Manager Overrides

Convert catalog to workspace configuration:

```javascript
// Generate workspace overrides from catalog
generateWorkspaceOverrides() {
  const overrides = {};

  Object.values(this.catalog.catalog).forEach(category => {
    if (!category.dependencies) return;

    Object.entries(category.dependencies).forEach(([depName, dep]) => {
      overrides[depName] = dep.version;
    });
  });

  return {
    pnpm: {
      overrides
    }
  };
}
```

### Catalog Validation in CI

Integrate catalog validation into continuous integration:

```bash
#!/bin/bash
# scripts/validate-catalog-compliance.sh

echo "🔍 Validating catalog compliance..."

# Validate catalog structure
node scripts/version-catalog-manager.js validate

# Check workspace compliance
node scripts/check-workspace-compliance.js

# Verify no dependency drift
node scripts/sync-catalog-from-lockfile.js --check-only

echo "✅ Catalog validation completed"
```

## Best Practices Summary

### Catalog Design

- **Semantic Organization**: Group dependencies by purpose and lifecycle for easier management
- **Rich Metadata**: Include rationale, security review dates, and compatibility information
- **Version Flexibility**: Use appropriate version ranges while maintaining stability
- **Change Documentation**: Track version change history and decision rationale

### Automation Strategy

- **Automated Validation**: Regular catalog validation and compliance checking
- **Security Monitoring**: Automated security audit integration and patch management
- **Update Workflows**: Scheduled dependency update reviews and approvals
- **Synchronization**: Keep catalog aligned with actual workspace dependencies

### Governance Process

- **Approval Workflows**: Define approval requirements for different types of changes
- **Security Reviews**: Regular security assessment of catalog dependencies
- **Migration Planning**: Structured approach to breaking changes and deprecations
- **Team Training**: Educate team on catalog usage and maintenance procedures

### Integration Points

- **Build System**: Generate workspace overrides from catalog automatically
- **CI/CD Pipeline**: Validate catalog compliance in continuous integration
- **Development Tools**: Integrate catalog with IDE and development workflows
- **Documentation**: Maintain clear documentation of catalog structure and processes

Version catalogs provide centralized control over dependency management, enabling consistent updates, security management, and governance while reducing complexity and coordination overhead in large-scale projects.
