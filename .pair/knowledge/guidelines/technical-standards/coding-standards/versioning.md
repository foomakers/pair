# Versioning Standards

Comprehensive framework for semantic versioning, release management, and version control that ensures predictable, traceable, and maintainable software releases.

## Purpose

Establish unified versioning standards that enable clear communication of changes, automated dependency management, and predictable upgrade paths for all software components.

## Semantic Versioning Framework

### Version Number Structure

```text
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]

Examples:
1.0.0          - Initial stable release
1.2.3          - Standard release
2.0.0-alpha.1  - Pre-release version
1.4.5+20240315 - Release with build metadata
```

#### Version Component Definitions

**MAJOR** - Incompatible API changes

```typescript
// Version 1.x.x
interface User {
  id: string
  name: string
  email: string
}

// Version 2.0.0 - Breaking change
interface User {
  id: string
  profile: {
    firstName: string
    lastName: string
  }
  contact: {
    email: string
    phone?: string
  }
}
```

**MINOR** - Backward-compatible functionality additions

```typescript
// Version 1.1.0 - Added optional field
interface User {
  id: string
  name: string
  email: string
  avatar?: string // New optional field
}

// Version 1.2.0 - Added new method
class UserService {
  async getUser(id: string): Promise<User> {
    /* existing */
  }

  // New method, backward compatible
  async getUserWithProfile(id: string): Promise<UserWithProfile> {
    // Implementation
  }
}
```

**PATCH** - Backward-compatible bug fixes

```typescript
// Version 1.1.1 - Bug fix
function validateEmail(email: string): boolean {
  // FIXED: Now properly handles international domains
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
  return emailRegex.test(email)
}
```

### Pre-release Versioning

#### Pre-release Types

```typescript
enum PreReleaseType {
  ALPHA = 'alpha', // Internal testing, unstable
  BETA = 'beta', // External testing, feature complete
  RC = 'rc', // Release candidate, stable
}

// Pre-release version examples
const versions = [
  '2.0.0-alpha.1', // First alpha release
  '2.0.0-alpha.2', // Second alpha release
  '2.0.0-beta.1', // First beta release
  '2.0.0-rc.1', // First release candidate
  '2.0.0', // Final stable release
]
```

#### Pre-release Progression

```yaml
Development Flow: feature-branch → alpha → beta → rc → stable

Alpha (Internal):
  - New features under development
  - Breaking changes allowed
  - Internal team testing only

Beta (External):
  - Feature-complete
  - API stabilization
  - External user testing
  - Bug fixes only

RC (Release Candidate):
  - Production-ready code
  - Final testing and validation
  - Only critical bug fixes
  - Documentation finalization

Stable:
  - Production release
  - Full feature set
  - Comprehensive testing completed
  - Documentation complete
```

## Version Management Implementation

### Automated Version Bumping

```typescript
// package.json version management
interface VersionConfig {
  current: string
  strategy: 'semantic' | 'timestamp' | 'custom'
  autoIncrement: boolean
  prereleaseType?: PreReleaseType
}

class VersionManager {
  constructor(private config: VersionConfig) {}

  bumpVersion(changeType: 'major' | 'minor' | 'patch'): string {
    const currentVersion = this.parseVersion(this.config.current)

    switch (changeType) {
      case 'major':
        return `${currentVersion.major + 1}.0.0`
      case 'minor':
        return `${currentVersion.major}.${currentVersion.minor + 1}.0`
      case 'patch':
        return `${currentVersion.major}.${currentVersion.minor}.${currentVersion.patch + 1}`
    }
  }

  createPreRelease(type: PreReleaseType): string {
    const baseVersion = this.getNextVersion()
    const prereleaseNumber = this.getNextPrereleaseNumber(type)
    return `${baseVersion}-${type}.${prereleaseNumber}`
  }

  private parseVersion(version: string) {
    const [major, minor, patch] = version.split('.').map(Number)
    return { major, minor, patch }
  }
}
```

### Conventional Commits Integration

```typescript
// Commit message parsing for automatic versioning
interface CommitType {
  type: string
  versionBump: 'major' | 'minor' | 'patch' | 'none'
  description: string
}

const commitTypes: CommitType[] = [
  { type: 'feat', versionBump: 'minor', description: 'New feature' },
  { type: 'fix', versionBump: 'patch', description: 'Bug fix' },
  { type: 'docs', versionBump: 'none', description: 'Documentation' },
  { type: 'style', versionBump: 'none', description: 'Formatting' },
  { type: 'refactor', versionBump: 'patch', description: 'Code refactoring' },
  { type: 'perf', versionBump: 'patch', description: 'Performance improvement' },
  { type: 'test', versionBump: 'none', description: 'Testing' },
  { type: 'chore', versionBump: 'none', description: 'Maintenance' },
]

// Breaking change detection
function analyzeCommitForBreakingChanges(commit: string): boolean {
  return commit.includes('BREAKING CHANGE:') || commit.includes('!:') || /^[a-z]+!:/.test(commit)
}

// Examples of conventional commits
const commitExamples = [
  'feat: add user authentication system', // minor bump
  'fix: resolve email validation issue', // patch bump
  'feat!: change API response format', // major bump
  'fix: security vulnerability in auth', // patch bump
  'docs: update API documentation', // no bump
  'feat: add oauth integration\n\nBREAKING CHANGE: removes basic auth', // major bump
]
```

### Changesets Integration

```typescript
// .changeset/config.json
interface ChangesetConfig {
  changelog: boolean
  commit: boolean
  linked: string[]
  access: 'public' | 'restricted'
  baseBranch: string
  updateInternalDependencies: 'patch' | 'minor'
  ignore: string[]
}

// Example changeset file
/*
---
"@myorg/ui-components": minor
"@myorg/theme": patch
---

Add new Button component with theme integration

- Added Button component with multiple variants
- Updated theme system to support button styles
- Fixed theme color contrast issues
*/

// Automated changelog generation
class ChangelogGenerator {
  generateChangelog(version: string, commits: Commit[]): string {
    const sections = this.groupCommitsByType(commits)

    return `
## [${version}] - ${new Date().toISOString().split('T')[0]}

### 🚀 Features
${sections.features.map(c => `- ${c.description}`).join('\n')}

### 🐛 Bug Fixes  
${sections.fixes.map(c => `- ${c.description}`).join('\n')}

### 📚 Documentation
${sections.docs.map(c => `- ${c.description}`).join('\n')}

### 🔧 Internal
${sections.internal.map(c => `- ${c.description}`).join('\n')}
    `.trim()
  }
}
```

## Release Management

### Release Branch Strategy

```yaml
Branch Strategy:
  main: Production-ready code
  develop: Integration branch for features
  release/*: Release preparation branches
  hotfix/*: Critical production fixes

Release Process: 1. Create release/v1.2.0 from develop
  2. Finalize version number and changelog
  3. Bug fixes and final testing
  4. Merge to main and tag v1.2.0
  5. Deploy to production
  6. Merge back to develop
```

### Git Tagging Standards

```bash
# Tag creation with semantic versioning
git tag -a v1.2.0 -m "Release version 1.2.0

Features:
- Add user authentication
- Implement dashboard UI

Bug Fixes:
- Fix email validation
- Resolve memory leak in file upload"

# Tag naming conventions
v1.0.0          # Stable release
v1.0.0-alpha.1  # Pre-release
v1.0.0-rc.1     # Release candidate

# Tag with additional metadata
git tag -a v1.2.0 -m "Release v1.2.0" \
  --annotate \
  --sign  # GPG signature for verification
```

### Release Automation

```typescript
// GitHub Actions workflow for releases
interface ReleaseWorkflow {
  trigger: 'manual' | 'automatic'
  steps: ReleaseStep[]
  approvals: ApprovalConfig
  rollback: RollbackConfig
}

class ReleaseAutomation {
  async createRelease(version: string): Promise<Release> {
    // 1. Validate version format
    this.validateVersion(version)

    // 2. Run comprehensive tests
    await this.runTestSuite()

    // 3. Build release artifacts
    const artifacts = await this.buildArtifacts(version)

    // 4. Generate changelog
    const changelog = await this.generateChangelog(version)

    // 5. Create Git tag
    await this.createGitTag(version, changelog)

    // 6. Publish to registries
    await this.publishPackages(artifacts)

    // 7. Deploy to staging
    await this.deployToStaging(version)

    // 8. Create GitHub release
    return await this.createGitHubRelease(version, changelog, artifacts)
  }

  async validateVersion(version: string): Promise<void> {
    const semverRegex =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

    if (!semverRegex.test(version)) {
      throw new Error(`Invalid semantic version: ${version}`)
    }
  }
}
```

## Dependency Management

### Package Version Constraints

```json
{
  "dependencies": {
    "react": "^18.0.0", // Compatible minor/patch updates
    "next": "~13.4.0", // Compatible patch updates only
    "typescript": "5.1.6", // Exact version
    "@types/node": ">=18.0.0" // Minimum version constraint
  },
  "peerDependencies": {
    "react": ">=16.8.0 <19.0.0" // Range constraint
  }
}
```

### Monorepo Versioning Strategy

```typescript
// Independent versioning for packages
interface MonorepoVersioning {
  strategy: 'independent' | 'locked' | 'hybrid'
  packages: PackageVersionConfig[]
  synchronizedGroups?: string[][]
}

// Example configuration
const versioningConfig: MonorepoVersioning = {
  strategy: 'hybrid',
  packages: [
    { name: '@myorg/ui-components', strategy: 'independent' },
    { name: '@myorg/theme', strategy: 'independent' },
    { name: '@myorg/utils', strategy: 'independent' },
  ],
  synchronizedGroups: [
    ['@myorg/ui-components', '@myorg/theme'], // UI packages released together
    ['@myorg/api-client', '@myorg/types'], // API packages synchronized
  ],
}

// Version compatibility matrix
class CompatibilityMatrix {
  checkCompatibility(packages: Package[]): CompatibilityResult {
    const conflicts = packages.reduce((acc, pkg) => {
      const incompatible = this.findIncompatibleDependencies(pkg, packages)
      if (incompatible.length > 0) {
        acc[pkg.name] = incompatible
      }
      return acc
    }, {} as Record<string, string[]>)

    return {
      isCompatible: Object.keys(conflicts).length === 0,
      conflicts,
    }
  }
}
```

## Version Documentation

### API Versioning

```typescript
// API version management
interface ApiVersion {
  version: string
  status: 'stable' | 'deprecated' | 'sunset'
  supportedUntil?: Date
  migrationGuide?: string
}

const apiVersions: ApiVersion[] = [
  {
    version: 'v1',
    status: 'deprecated',
    supportedUntil: new Date('2024-12-31'),
    migrationGuide: '/docs/migration/v1-to-v2',
  },
  {
    version: 'v2',
    status: 'stable',
  },
]

// Version-aware routing
app.get('/api/v1/users', deprecationWarning, getUsersV1)
app.get('/api/v2/users', getUsersV2)

function deprecationWarning(req: Request, res: Response, next: NextFunction) {
  res.set('Warning', '299 - "API v1 is deprecated. Migrate to v2 by 2024-12-31"')
  next()
}
```

### Migration Documentation

````markdown
# Migration Guide: v1.x to v2.0

## Breaking Changes

### User Interface Changes

**Before (v1.x):**

```typescript

interface User {
  id: string
  name: string
  email: string
}

```
````

#### After (v2.0):

```typescript
interface User {
  id: string
  profile: {
    firstName: string
    lastName: string
  }
  contact: {
    email: string
  }
}
```

### Migration Steps

1. Update user data structure
2. Modify API calls to use new format
3. Update UI components
4. Test thoroughly

### Automated Migration

Use our migration tool:

```bash
npx @myorg/migrate-v1-to-v2 ./src
```

```text

This framework ensures consistent, predictable versioning that supports both automated processes and clear human communication about software changes.
```
