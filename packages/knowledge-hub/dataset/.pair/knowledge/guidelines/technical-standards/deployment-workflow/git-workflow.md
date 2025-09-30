# 🌲 Git Workflow

**Focus**: Comprehensive Git workflow patterns for team collaboration

Standardized Git workflow strategies including branching models, commit conventions, merge strategies, and collaboration patterns for effective team development.

## 🎯 Git Flow Strategy

### Branching Model

```bash
# ✅ Branch structure
main/
├── develop/
│   ├── feature/user-authentication
│   ├── feature/payment-integration
│   └── feature/dashboard-redesign
├── release/v2.1.0
├── hotfix/security-patch
└── support/v1.x

# Branch naming conventions
feature/[ticket-id]-[short-description]    # feature/AUTH-123-oauth-integration
bugfix/[ticket-id]-[short-description]     # bugfix/BUG-456-login-validation
hotfix/[ticket-id]-[short-description]     # hotfix/SEC-789-xss-vulnerability
release/v[version]                         # release/v2.1.0
chore/[description]                        # chore/update-dependencies
docs/[description]                         # docs/api-documentation
```

### Branch Protection Rules

```typescript
// ✅ Git branch protection configuration
interface BranchProtectionRules {
  main: {
    protectionRules: [
      'Require pull request reviews before merging',
      'Require status checks to pass before merging',
      'Require branches to be up to date before merging',
      'Require signed commits',
      'Include administrators in restrictions',
    ]
    requiredStatusChecks: ['ci/tests', 'ci/lint', 'ci/security-scan', 'ci/performance-test']
    requiredReviewers: 2
    dismissStaleReviews: true
    requireCodeOwnerReviews: true
  }

  develop: {
    protectionRules: [
      'Require pull request reviews before merging',
      'Require status checks to pass before merging',
    ]
    requiredStatusChecks: ['ci/tests', 'ci/lint']
    requiredReviewers: 1
    dismissStaleReviews: false
  }

  release: {
    protectionRules: [
      'Require pull request reviews before merging',
      'Require status checks to pass before merging',
      'Restrict pushes to specific people',
    ]
    allowedUsers: ['release-manager', 'tech-lead']
    requiredReviewers: 2
  }
}

// ✅ CODEOWNERS configuration
/*
# Global rules
* @team-leads @senior-developers

# Frontend specific
/src/components/ @frontend-team @ui-ux-team
/src/pages/ @frontend-team
/src/styles/ @ui-ux-team

# Backend specific
/src/api/ @backend-team @architects
/src/database/ @backend-team @dba
/src/auth/ @backend-team @security-team

# Infrastructure
/infrastructure/ @devops-team @architects
/docker/ @devops-team
/.github/ @devops-team @team-leads

# Documentation
/docs/ @tech-writers @team-leads
README.md @team-leads

# Configuration
package.json @senior-developers
tsconfig.json @senior-developers
*/
```

## 📝 Commit Conventions

### Conventional Commits

```bash
# ✅ Commit message format
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

# Types
feat:     # New feature
fix:      # Bug fix
docs:     # Documentation changes
style:    # Code style changes (formatting, etc.)
refactor: # Code refactoring
perf:     # Performance improvements
test:     # Adding or modifying tests
build:    # Build system changes
ci:       # CI configuration changes
chore:    # Maintenance tasks
revert:   # Reverting previous commits

# Examples
feat(auth): add OAuth2 authentication
fix(api): resolve user validation error
docs(readme): update installation instructions
style(components): fix eslint warnings
refactor(utils): simplify date formatting
perf(database): optimize user queries
test(auth): add integration tests for login
build(webpack): update to version 5
ci(github): add automated security scanning
chore(deps): update dependencies
revert: feat(auth): add OAuth2 authentication

# With body and footer
feat(auth): add OAuth2 authentication

Implement OAuth2 authentication flow with Google and GitHub providers.
Includes token validation, refresh logic, and user profile mapping.

Closes #123
Breaking-change: Authentication API has changed
```

### Commit Quality Guidelines

```typescript
// ✅ Commit quality standards
interface CommitQualityStandards {
  message: {
    subject: {
      maxLength: 50;
      format: 'imperative mood'; // "Add feature" not "Added feature"
      capitalization: 'sentence case';
      punctuation: 'no trailing period';
    };

    body: {
      wrapAt: 72;
      purpose: 'explain what and why, not how';
      format: 'present tense';
      separateFromSubject: true; // blank line
    };

    footer: {
      references: 'ticket numbers, breaking changes';
      format: 'key: value pairs';
    };
  };

  content: {
    atomicity: 'one logical change per commit';
    completeness: 'commit should not break the build';
    relevance: 'all changes should be related';
    tests: 'include tests for new functionality';
  };

  validation: {
    preCommitHooks: [
      'lint commit message',
      'run tests',
      'check code style',
      'validate no merge conflicts'
    ];
  };
}

// ✅ Pre-commit hook configuration
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run linting
pnpm lint-staged

# Run type checking
pnpm type-check

# Run unit tests for changed files
pnpm test:changed

# Check for secrets
pnpm check-secrets

# .husky/commit-msg
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Validate commit message format
pnpm commitlint --edit $1

# Check commit message length and format
pnpm validate-commit-msg $1
```

## 🔄 Merge Strategies

### Pull Request Workflow

```typescript
// ✅ Pull request workflow
interface PullRequestWorkflow {
  creation: {
    template: string // Pull request template
    checks: [
      'Link to ticket/issue',
      'Provide clear description',
      'List changes made',
      'Include testing instructions',
      'Add screenshots if UI changes',
      'Mark as draft if incomplete',
    ]

    automation: {
      assignReviewers: 'based on CODEOWNERS'
      addLabels: 'based on changed files'
      runChecks: 'CI/CD pipeline'
      notifications: 'team channels'
    }
  }

  review: {
    process: {
      codeReview: 'Check code quality, logic, style'
      testingReview: 'Verify test coverage and quality'
      securityReview: 'Check for security vulnerabilities'
      performanceReview: 'Assess performance impact'
      documentationReview: 'Ensure documentation is updated'
    }

    approval: {
      requiredApprovals: 2
      requiredCodeOwnerApproval: true
      dismissStaleReviews: true
      requireAllChecksPass: true
    }
  }

  merge: {
    strategies: {
      squashMerge: {
        when: 'feature branches with multiple commits'
        benefits: ['Clean history', 'Single commit per feature']
        process: 'Squash commits and merge'
      }

      mergeCommit: {
        when: 'release branches or significant features'
        benefits: ['Preserve branch context', 'Full history']
        process: 'Create merge commit'
      }

      rebaseMerge: {
        when: 'small changes or hotfixes'
        benefits: ['Linear history', 'No merge commits']
        process: 'Rebase and fast-forward merge'
      }
    }

    automation: {
      deleteBranch: true
      updateTickets: true
      notifyTeam: true
      deployPreview: 'for staging environment'
    }
  }
}

// ✅ Pull request template
/*
## Description
Brief description of the changes and their purpose.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring (no functional changes)
- [ ] Test improvements

## Related Tickets
- Closes #[ticket-number]
- Related to #[ticket-number]

## Changes Made
- [ ] Change 1
- [ ] Change 2
- [ ] Change 3

## Testing Instructions
1. Step 1
2. Step 2
3. Expected result

## Screenshots (if applicable)
Before: [screenshot]
After: [screenshot]

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Performance Impact
- [ ] No performance impact
- [ ] Minor performance improvement
- [ ] Significant performance improvement
- [ ] Potential performance regression (explain below)

## Security Considerations
- [ ] No security implications
- [ ] Security improvement
- [ ] Potential security concern (explain below)

## Breaking Changes
- [ ] No breaking changes
- [ ] Breaking changes (document migration path below)

## Deployment Notes
Any special deployment instructions or environment changes needed.
*/
```

## 🏗️ Feature Development Workflow

### Complete Feature Lifecycle

```bash
# ✅ Feature development workflow

# 1. Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/AUTH-123-oauth-integration

# 2. Development cycle
# Make changes...
git add .
git commit -m "feat(auth): implement OAuth2 provider interface"

# More changes...
git add .
git commit -m "feat(auth): add Google OAuth2 integration"

# Keep feature branch updated
git fetch origin
git rebase origin/develop

# 3. Prepare for review
# Run tests
pnpm test
pnpm lint
pnpm type-check

# Push feature branch
git push origin feature/AUTH-123-oauth-integration

# 4. Create pull request
gh pr create \
  --title "feat(auth): OAuth2 authentication integration" \
  --body-file .github/pull_request_template.md \
  --base develop \
  --assignee @me \
  --reviewer @team-lead,@senior-dev

# 5. Address review feedback
# Make requested changes...
git add .
git commit -m "fix(auth): handle OAuth2 error states"
git push origin feature/AUTH-123-oauth-integration

# 6. Final preparation
# Squash commits if needed
git rebase -i HEAD~3

# Force push after rebase
git push --force-with-lease origin feature/AUTH-123-oauth-integration

# 7. Merge (usually done via PR interface)
# Branch automatically deleted after merge
```

### Hotfix Workflow

```bash
# ✅ Hotfix workflow for production issues

# 1. Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/SEC-789-xss-vulnerability

# 2. Implement fix
# Make critical fix...
git add .
git commit -m "fix(security): sanitize user input to prevent XSS"

# 3. Test thoroughly
pnpm test
pnpm test:e2e
pnpm security-scan

# 4. Create PR to main
git push origin hotfix/SEC-789-xss-vulnerability
gh pr create \
  --title "fix(security): prevent XSS in user input" \
  --body "Critical security fix for XSS vulnerability" \
  --base main \
  --reviewer @security-team,@tech-lead

# 5. After merge to main, cherry-pick to develop
git checkout develop
git pull origin develop
git cherry-pick <hotfix-commit-hash>
git push origin develop

# 6. Tag release
git checkout main
git pull origin main
git tag -a v2.0.1 -m "Security hotfix v2.0.1"
git push origin v2.0.1
```

## 🚀 Release Workflow

### Release Preparation

```bash
# ✅ Release workflow

# 1. Create release branch
git checkout develop
git pull origin develop
git checkout -b release/v2.1.0

# 2. Prepare release
# Update version numbers
npm version 2.1.0 --no-git-tag-version

# Update CHANGELOG.md
# Run release tests
pnpm test:full
pnpm test:e2e
pnpm test:performance

# Commit release preparation
git add .
git commit -m "chore(release): prepare v2.1.0"

# 3. Create release PR to main
git push origin release/v2.1.0
gh pr create \
  --title "Release v2.1.0" \
  --body "Release v2.1.0 with features X, Y, Z" \
  --base main \
  --reviewer @release-team

# 4. After approval and merge
git checkout main
git pull origin main

# Create release tag
git tag -a v2.1.0 -m "Release v2.1.0"
git push origin v2.1.0

# 5. Merge back to develop
git checkout develop
git merge main
git push origin develop

# 6. Deploy release
# Trigger deployment pipeline
gh workflow run deploy-production.yml --ref v2.1.0
```

## 📊 Git Metrics & Health

### Repository Health Monitoring

```typescript
// ✅ Git repository health metrics
interface GitHealthMetrics {
  branchHealth: {
    staleBranches: Branch[]
    longLivedFeatures: Branch[]
    unmergedBranches: Branch[]
    branchCount: number
  }

  commitHealth: {
    commitFrequency: number
    averageCommitSize: number
    conventionalCommitCompliance: number
    authorsDistribution: AuthorStats[]
  }

  mergeHealth: {
    mergeConflictRate: number
    averagePRSize: number
    reviewTurnaroundTime: number
    hotfixFrequency: number
  }

  qualityMetrics: {
    testCoverage: number
    codeQualityScore: number
    securityIssues: number
    technicalDebtRatio: number
  }
}

// ✅ Git automation scripts
export class GitAutomation {
  /**
   * Clean up stale branches
   */
  async cleanupStaleBranches(): Promise<void> {
    // Delete merged feature branches
    await exec(
      'git branch --merged develop | grep -v "\\*\\|develop\\|main" | xargs -n 1 git branch -d',
    )

    // List stale branches (no commits in 30 days)
    const staleBranches = await exec(
      'git for-each-ref --format="%(refname:short) %(committerdate)" refs/heads | awk \'$2 < "$(date -d "30 days ago" +%Y-%m-%d)"\'',
    )

    console.log('Stale branches:', staleBranches)
  }

  /**
   * Generate release notes
   */
  async generateReleaseNotes(fromTag: string, toTag: string): Promise<string> {
    const commits = await exec(`git log ${fromTag}..${toTag} --pretty=format:"%h %s" --no-merges`)

    const features = commits.filter(c => c.includes('feat:'))
    const fixes = commits.filter(c => c.includes('fix:'))
    const breaking = commits.filter(c => c.includes('BREAKING CHANGE'))

    return `
## Features
${features.map(f => `- ${f}`).join('\n')}

## Bug Fixes
${fixes.map(f => `- ${f}`).join('\n')}

## Breaking Changes
${breaking.map(b => `- ${b}`).join('\n')}
    `
  }
}
```

## 🔗 Related Concepts

- **[Build & Release](build-release.md)** - Deployment pipeline integration
- **[Versioning Strategy](versioning-strategy.md)** - Version management
- **[Feature Flags](feature-flags.md)** - Feature deployment strategies

## 📏 Implementation Guidelines

1. **Consistent Branching**: Use standardized branch naming and structure
2. **Quality Commits**: Follow conventional commit format and best practices
3. **Comprehensive Reviews**: Implement thorough pull request review process
4. **Automated Checks**: Use pre-commit hooks and CI/CD validation
5. **Clean History**: Maintain readable and meaningful Git history
6. **Regular Cleanup**: Remove stale branches and maintain repository health
7. **Documentation**: Keep Git workflows and conventions documented
8. **Team Training**: Ensure all team members understand Git best practices

---

_Git Workflow provides comprehensive patterns for team collaboration using Git, ensuring clean history, effective branching strategies, and seamless integration with development and deployment processes._
