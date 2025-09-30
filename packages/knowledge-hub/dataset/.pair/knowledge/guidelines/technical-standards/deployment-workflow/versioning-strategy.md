# Versioning Strategy

This document defines our comprehensive approach to version management across all project components, including semantic versioning, release strategies, and dependency management.

## Overview

Our versioning strategy ensures predictable releases, clear compatibility communication, and systematic dependency management across the entire project ecosystem.

## Semantic Versioning (SemVer)

### Version Format

```typescript
interface SemanticVersion {
  major: number // Breaking changes
  minor: number // New features (backward compatible)
  patch: number // Bug fixes (backward compatible)
  prerelease?: string // alpha, beta, rc
  build?: string // Build metadata
}

// Example: 2.1.3-beta.1+build.123
const version: SemanticVersion = {
  major: 2,
  minor: 1,
  patch: 3,
  prerelease: 'beta.1',
  build: 'build.123',
}
```

### Version Increment Rules

```typescript
enum VersionChangeType {
  MAJOR = 'major', // Breaking API changes
  MINOR = 'minor', // New features, backward compatible
  PATCH = 'patch', // Bug fixes, backward compatible
  PRERELEASE = 'prerelease', // Pre-release versions
}

interface VersioningRules {
  breaking_changes: VersionChangeType.MAJOR
  new_features: VersionChangeType.MINOR
  bug_fixes: VersionChangeType.PATCH
  security_fixes: VersionChangeType.PATCH
  documentation: VersionChangeType.PATCH
  performance_improvements: VersionChangeType.MINOR
}
```

## Package Versioning Strategy

### Monorepo Versioning

```typescript
interface MonorepoVersioning {
  strategy: 'independent' | 'fixed' | 'hybrid'
  packages: Record<string, PackageVersionConfig>
}

interface PackageVersionConfig {
  name: string
  current_version: string
  versioning_type: 'independent' | 'locked'
  release_cadence: 'on-demand' | 'scheduled' | 'synchronized'
  dependencies: string[]
}

// Example configuration
const versioningConfig: MonorepoVersioning = {
  strategy: 'hybrid',
  packages: {
    '@pair/content-ops': {
      name: '@pair/content-ops',
      current_version: '1.2.3',
      versioning_type: 'independent',
      release_cadence: 'on-demand',
      dependencies: [],
    },
    '@pair/knowledge-hub': {
      name: '@pair/knowledge-hub',
      current_version: '1.2.3',
      versioning_type: 'independent',
      release_cadence: 'scheduled',
      dependencies: ['@pair/content-ops'],
    },
    'pair-cli': {
      name: 'pair-cli',
      current_version: '1.2.3',
      versioning_type: 'locked',
      release_cadence: 'synchronized',
      dependencies: ['@pair/content-ops', '@pair/knowledge-hub'],
    },
  },
}
```

### Version Synchronization

```typescript
interface VersionSyncRule {
  trigger_package: string
  affected_packages: string[]
  sync_type: 'major_only' | 'minor_and_major' | 'all'
  delay_hours?: number
}

const syncRules: VersionSyncRule[] = [
  {
    trigger_package: '@pair/content-ops',
    affected_packages: ['@pair/knowledge-hub', 'pair-cli'],
    sync_type: 'major_only',
  },
  {
    trigger_package: 'pair-cli',
    affected_packages: [],
    sync_type: 'all',
  },
]
```

## Release Strategy

### Release Types

```typescript
enum ReleaseType {
  STABLE = 'stable', // Production-ready release
  PRERELEASE = 'prerelease', // Alpha, beta, RC
  HOTFIX = 'hotfix', // Critical bug fixes
  SNAPSHOT = 'snapshot', // Development builds
}

interface ReleaseStrategy {
  type: ReleaseType
  branch_pattern: string
  approval_required: boolean
  automated_testing: boolean
  staging_deployment: boolean
  rollback_strategy: string
}

const releaseStrategies: Record<ReleaseType, ReleaseStrategy> = {
  [ReleaseType.STABLE]: {
    type: ReleaseType.STABLE,
    branch_pattern: 'release/*',
    approval_required: true,
    automated_testing: true,
    staging_deployment: true,
    rollback_strategy: 'immediate',
  },
  [ReleaseType.PRERELEASE]: {
    type: ReleaseType.PRERELEASE,
    branch_pattern: 'develop',
    approval_required: false,
    automated_testing: true,
    staging_deployment: true,
    rollback_strategy: 'scheduled',
  },
  [ReleaseType.HOTFIX]: {
    type: ReleaseType.HOTFIX,
    branch_pattern: 'hotfix/*',
    approval_required: true,
    automated_testing: true,
    staging_deployment: false,
    rollback_strategy: 'immediate',
  },
}
```

### Release Scheduling

```typescript
interface ReleaseSchedule {
  major_releases: string[] // Quarterly: Q1, Q2, Q3, Q4
  minor_releases: string[] // Monthly: first Tuesday
  patch_releases: string[] // As needed
  prerelease_window: string[] // Two weeks before minor
}

const releaseSchedule: ReleaseSchedule = {
  major_releases: ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4'],
  minor_releases: ['first-tuesday-monthly'],
  patch_releases: ['on-demand'],
  prerelease_window: ['two-weeks-before-minor'],
}
```

## Version Management Tools

### Changeset Configuration

```json
{
  "$schema": "https://unpkg.com/@changesets/config@2.3.1/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    {
      "repo": "your-org/your-repo"
    }
  ],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@pair/internal-tools"]
}
```

### Automated Version Bumping

```typescript
interface VersionBumpConfig {
  trigger: 'merge' | 'tag' | 'manual'
  bump_rules: Array<{
    pattern: string
    bump: VersionChangeType
  }>
  pre_bump_hooks: string[]
  post_bump_hooks: string[]
}

const versionBumpConfig: VersionBumpConfig = {
  trigger: 'merge',
  bump_rules: [
    {
      pattern: 'feat!:*',
      bump: VersionChangeType.MAJOR,
    },
    {
      pattern: 'feat:*',
      bump: VersionChangeType.MINOR,
    },
    {
      pattern: 'fix:*',
      bump: VersionChangeType.PATCH,
    },
  ],
  pre_bump_hooks: ['npm run test', 'npm run lint', 'npm run build'],
  post_bump_hooks: ['npm run changelog', 'git add .', 'git commit -m "chore: version bump"'],
}
```

## Dependency Versioning

### Dependency Management Strategy

```typescript
interface DependencyVersioning {
  production_deps: DependencyRule
  dev_deps: DependencyRule
  peer_deps: DependencyRule
  internal_deps: DependencyRule
}

interface DependencyRule {
  version_range: 'exact' | 'caret' | 'tilde' | 'range'
  update_frequency: 'automatic' | 'manual' | 'scheduled'
  security_updates: 'immediate' | 'scheduled'
  breaking_change_policy: 'block' | 'review' | 'allow'
}

const dependencyVersioning: DependencyVersioning = {
  production_deps: {
    version_range: 'caret',
    update_frequency: 'scheduled',
    security_updates: 'immediate',
    breaking_change_policy: 'review',
  },
  dev_deps: {
    version_range: 'caret',
    update_frequency: 'automatic',
    security_updates: 'immediate',
    breaking_change_policy: 'allow',
  },
  peer_deps: {
    version_range: 'range',
    update_frequency: 'manual',
    security_updates: 'immediate',
    breaking_change_policy: 'block',
  },
  internal_deps: {
    version_range: 'exact',
    update_frequency: 'automatic',
    security_updates: 'immediate',
    breaking_change_policy: 'allow',
  },
}
```

### Version Pinning Strategy

```typescript
interface VersionPinning {
  critical_dependencies: string[] // Always pinned
  security_sensitive: string[] // Pinned to patch level
  stable_apis: string[] // Caret range allowed
  experimental: string[] // Wide range allowed
}

const versionPinning: VersionPinning = {
  critical_dependencies: ['react', 'next', 'typescript', '@types/node'],
  security_sensitive: ['jsonwebtoken', 'bcrypt', 'helmet', 'cors'],
  stable_apis: ['lodash', 'date-fns', 'zod'],
  experimental: ['@experimental/feature-flags', '@beta/new-api'],
}
```

## Version Documentation

### Changelog Management

```typescript
interface ChangelogEntry {
  version: string
  date: string
  changes: {
    added: string[]
    changed: string[]
    deprecated: string[]
    removed: string[]
    fixed: string[]
    security: string[]
  }
  migration_guide?: string
  breaking_changes?: string[]
}

// Automated changelog generation
function generateChangelog(fromVersion: string, toVersion: string): ChangelogEntry {
  const commits = getCommitsBetween(fromVersion, toVersion)
  const categorizedChanges = categorizeCommits(commits)

  return {
    version: toVersion,
    date: new Date().toISOString().split('T')[0],
    changes: categorizedChanges,
    migration_guide: generateMigrationGuide(categorizedChanges),
    breaking_changes: identifyBreakingChanges(categorizedChanges),
  }
}
```

### Migration Guides

```typescript
interface MigrationGuide {
  from_version: string
  to_version: string
  breaking_changes: BreakingChange[]
  automated_migration?: string
  manual_steps: string[]
  estimated_effort: 'low' | 'medium' | 'high'
}

interface BreakingChange {
  type: 'api' | 'config' | 'behavior' | 'dependency'
  description: string
  old_way: string
  new_way: string
  affected_components: string[]
  migration_script?: string
}
```

## Version Validation

### Version Consistency Checks

```typescript
interface VersionValidation {
  cross_package_consistency: boolean
  dependency_compatibility: boolean
  api_compatibility: boolean
  breaking_change_detection: boolean
}

async function validateVersionConsistency(): Promise<VersionValidation> {
  return {
    cross_package_consistency: await checkCrossPackageVersions(),
    dependency_compatibility: await validateDependencyMatrix(),
    api_compatibility: await runApiCompatibilityTests(),
    breaking_change_detection: await detectBreakingChanges(),
  }
}
```

### Automated Version Checks

```typescript
// CI/CD version validation
interface VersionCheckResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

async function runVersionChecks(): Promise<VersionCheckResult> {
  const checks = [
    checkSemVerCompliance(),
    validateDependencyRanges(),
    checkForCircularDependencies(),
    validateChangelogEntry(),
    checkMigrationGuideCompleteness(),
  ]

  const results = await Promise.all(checks)
  return aggregateResults(results)
}
```

## Rollback Strategy

### Version Rollback Procedures

```typescript
interface RollbackStrategy {
  triggers: RollbackTrigger[]
  automated_rollback: boolean
  rollback_window: string
  validation_steps: string[]
  notification_channels: string[]
}

enum RollbackTrigger {
  CRITICAL_BUG = 'critical_bug',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  SECURITY_VULNERABILITY = 'security_vulnerability',
  INTEGRATION_FAILURE = 'integration_failure',
}

const rollbackStrategy: RollbackStrategy = {
  triggers: [RollbackTrigger.CRITICAL_BUG, RollbackTrigger.SECURITY_VULNERABILITY],
  automated_rollback: true,
  rollback_window: '2 hours',
  validation_steps: ['health_checks', 'smoke_tests', 'performance_metrics'],
  notification_channels: ['slack', 'email', 'pagerduty'],
}
```

## Related Concepts

- **Build Release**: Automated build and release processes
- **Feature Flags**: Feature toggles and gradual rollouts
- **Git Workflow**: Branch management and merge strategies
- **Quality Gates**: Automated quality checks before release
- **Deployment Workflow**: Production deployment procedures

## Tools Integration

- **Changesets**: Automated version management for monorepos
- **Semantic Release**: Automated semantic versioning
- **Renovate**: Automated dependency updates
- **npm**: Package registry and version management
- **GitHub Releases**: Release notes and asset distribution
