# Git Development Process

## Overview

This document establishes a comprehensive Git workflow that supports our rapid development methodology while maintaining code quality and enabling effective collaboration. Our approach emphasizes simplicity, speed, and clear commit history.

## Branching Strategy

### 1. Branch Structure

#### Main Branch (main)

- **Purpose**: Production-ready code
- **Protection**: Branch protection rules enabled
- **Merge Strategy**: Squash and merge only
- **Status**: Always deployable

#### Feature Branches

- **Naming Convention**: `feature/brief-description` or `feat/ticket-id-description`
- **Lifecycle**: Short-lived (days, not weeks)
- **Origin**: Always branch from latest `main`
- **Merge**: Via pull request with squash

#### Hotfix Branches

- **Naming Convention**: `hotfix/brief-description` or `fix/critical-issue`
- **Purpose**: Critical production fixes
- **Process**: Expedited review and immediate merge

### 2. Branch Management

#### Creating Feature Branches

```bash
# Update main branch
git checkout main
git pull origin main

# Create and switch to feature branch
git checkout -b feature/user-authentication

# Push branch to origin
git push -u origin feature/user-authentication
```

#### Branch Cleanup

```bash
# After successful merge, delete local branch
git branch -d feature/user-authentication

# Delete remote branch (if not automatically deleted)
git push origin --delete feature/user-authentication

# Clean up local references to deleted remote branches
git remote prune origin
```

## Commit Standards

### 1. Commit Message Format

#### Structure

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### Types

- **feat**: New feature implementation
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring without functional changes
- **test**: Adding or modifying tests
- **chore**: Maintenance tasks, dependency updates

#### Examples

```bash
# Feature commits
git commit -m "feat(auth): add user authentication with JWT tokens"
git commit -m "feat(api): implement user profile endpoints"

# Bug fixes
git commit -m "fix(auth): resolve token expiration issue"
git commit -m "fix(ui): correct button alignment on mobile devices"

# Documentation
git commit -m "docs(api): add authentication endpoint documentation"

# Refactoring
git commit -m "refactor(auth): extract JWT token validation to utility function"
```

### 2. Commit Best Practices

#### Atomic Commits

- Each commit should represent a single logical change
- Avoid mixing different types of changes in one commit
- Test that each commit builds and passes tests

#### Descriptive Messages

```bash
# Good: Descriptive and specific
git commit -m "feat(user-profile): add avatar upload with image validation"

# Bad: Vague and uninformative
git commit -m "update user stuff"
```

#### Commit Preparation

```bash
# Stage specific files
git add src/auth/jwt-service.ts src/auth/types.ts

# Review staged changes
git diff --staged

# Commit with descriptive message
git commit -m "feat(auth): implement JWT token service with refresh capability"
```

## Pull Request Workflow

### 1. Pre-Pull Request Checklist

#### Code Quality Checks

```bash
# Run linting
pnpm lint

# Run tests
pnpm test

# Build the project
pnpm build

# Type checking
pnpm type-check
```

#### Commit History Preparation

```bash
# Squash multiple commits into one (if needed)
git rebase -i HEAD~3

# Update branch with latest main
git checkout main
git pull origin main
git checkout feature/user-authentication
git rebase main
```

### 2. Creating Pull Requests

#### PR Title Format

```
<type>(<scope>): <description>
```

#### PR Description Template

```markdown
## Description

Brief description of the changes and why they were made.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist

- [ ] Code follows the style guidelines
- [ ] Self-review of code completed
- [ ] Code is commented where necessary
- [ ] Documentation updated if needed
- [ ] No new warnings or errors introduced

## Related Issues

Closes #[issue number]
```

### 3. Pull Request Review Process

#### Review Requirements

- **Minimum Reviewers**: 1 for standard features, 2 for critical changes
- **Review Focus**: Code quality, security, performance, maintainability
- **Timeline**: Reviews completed within 24 hours during business days

#### Reviewer Guidelines

```markdown
## Review Checklist

### Code Quality

- [ ] Code is readable and well-structured
- [ ] Functions and variables have descriptive names
- [ ] Code follows established patterns and conventions
- [ ] No unnecessary complexity or over-engineering

### Functionality

- [ ] Changes align with requirements
- [ ] Edge cases are handled appropriately
- [ ] Error handling is implemented
- [ ] No obvious bugs or logical errors

### Testing

- [ ] Adequate test coverage
- [ ] Tests are meaningful and not just for coverage
- [ ] Tests follow naming conventions
- [ ] Mock usage is appropriate

### Security

- [ ] No sensitive data exposed
- [ ] Input validation implemented
- [ ] Authentication/authorization properly handled
- [ ] No SQL injection or XSS vulnerabilities

### Performance

- [ ] No obvious performance bottlenecks
- [ ] Database queries are optimized
- [ ] Caching implemented where appropriate
- [ ] Resource usage is reasonable
```

## Merge and Deployment Strategy

### 1. Merge Requirements

#### Pre-Merge Validation

- All CI/CD checks must pass
- Required reviews approved
- Branch is up-to-date with main
- No merge conflicts

#### Merge Process

```bash
# Option 1: GitHub UI (Recommended)
# Use "Squash and merge" button in GitHub PR interface

# Option 2: Command line
git checkout main
git pull origin main
git merge --squash feature/user-authentication
git commit -m "feat(auth): implement user authentication with JWT tokens"
git push origin main
```

### 2. Post-Merge Actions

#### Branch Cleanup

```bash
# Automatic cleanup (configured in GitHub)
# - Delete branch after merge
# - Update issue status
# - Trigger deployment pipeline

# Manual cleanup (if needed)
git branch -d feature/user-authentication
git push origin --delete feature/user-authentication
```

#### Deployment Verification

- Monitor deployment pipeline
- Verify feature functionality in staging
- Confirm production deployment success

## Advanced Git Operations

### 1. Interactive Rebase

#### Squashing Commits

```bash
# Squash last 3 commits
git rebase -i HEAD~3

# In the editor, change 'pick' to 'squash' for commits to combine
# Save and edit the commit message
```

#### Fixing Commit Messages

```bash
# Amend last commit message
git commit --amend -m "feat(auth): implement JWT authentication service"

# Fix older commit messages with interactive rebase
git rebase -i HEAD~3
# Change 'pick' to 'reword' for commits to modify
```

### 2. Conflict Resolution

#### Merge Conflict Handling

```bash
# When conflicts occur during rebase
git status  # See conflicted files

# Edit files to resolve conflicts
# Remove conflict markers (<<<<<<<, =======, >>>>>>>)

# Stage resolved files
git add resolved-file.ts

# Continue rebase
git rebase --continue
```

#### Best Practices for Conflicts

- Understand both changes before resolving
- Test the resolution thoroughly
- Communicate with the other developer if needed
- Consider pair programming for complex conflicts

### 3. Git Hooks

#### Pre-commit Hook Example

```bash
#!/bin/sh
# .git/hooks/pre-commit

# Run linting
pnpm lint --staged
if [ $? -ne 0 ]; then
  echo "Linting failed. Please fix issues before committing."
  exit 1
fi

# Run type checking
pnpm type-check
if [ $? -ne 0 ]; then
  echo "Type checking failed. Please fix issues before committing."
  exit 1
fi

# Run tests
pnpm test --passWithNoTests
if [ $? -ne 0 ]; then
  echo "Tests failed. Please fix issues before committing."
  exit 1
fi
```

## Troubleshooting Common Issues

### 1. Merge Conflicts

#### Prevention

- Keep feature branches short-lived
- Regularly sync with main branch
- Communicate about overlapping changes

#### Resolution Process

```bash
# Step 1: Update your branch
git fetch origin
git rebase origin/main

# Step 2: Resolve conflicts in your editor
# Edit conflicted files, remove markers, test changes

# Step 3: Stage and continue
git add .
git rebase --continue

# Step 4: Force push (if already pushed)
git push --force-with-lease origin feature/branch-name
```

### 2. Accidental Commits

#### Undo Last Commit (Keep Changes)

```bash
git reset --soft HEAD~1
```

#### Undo Last Commit (Discard Changes)

```bash
git reset --hard HEAD~1
```

#### Remove Sensitive Data

```bash
# Remove file from last commit
git rm --cached sensitive-file.txt
git commit --amend --no-edit

# For older commits, use filter-branch or BFG Repo-Cleaner
```

### 3. Lost Work Recovery

#### Find Lost Commits

```bash
# Show reflog
git reflog

# Checkout lost commit
git checkout [commit-hash]

# Create branch from lost commit
git checkout -b recovery-branch
```

## Performance and Optimization

### 1. Repository Maintenance

#### Regular Cleanup

```bash
# Clean untracked files
git clean -fd

# Garbage collection
git gc --aggressive

# Prune remote references
git remote prune origin
```

#### Large File Handling

```bash
# Check repository size
du -sh .git

# Identify large files
git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | grep '^blob' | sort -k3nr | head -20

# Use Git LFS for large assets
git lfs track "*.psd"
git lfs track "*.zip"
```

### 2. Workflow Optimization

#### Aliases for Common Operations

```bash
# Add to ~/.gitconfig
[alias]
    co = checkout
    br = branch
    ci = commit
    st = status
    unstage = reset HEAD --
    last = log -1 HEAD
    visual = !gitk
    cleanup = "!git branch --merged | grep -v '\\*\\|main\\|develop' | xargs -n 1 git branch -d"
```

## Continuous Integration Integration

### 1. GitHub Actions Workflow

```yaml
# .github/workflows/pr-validation.yml
name: PR Validation

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linting
        run: pnpm lint

      - name: Run type checking
        run: pnpm type-check

      - name: Run tests
        run: pnpm test --coverage

      - name: Build project
        run: pnpm build
```

### 2. Quality Gates

- All tests must pass
- Code coverage must meet threshold
- No linting errors
- Security scan passes
- Performance budget not exceeded

## Related Documentation

- [Version Control Standards](version-control.md)
- [Quality Assurance Process](quality-assurance.md)
- [Code Review Guidelines](.pair/knowledge/guidelines/collaboration/README.md)
- [Testing Strategy](.pair/knowledge/guidelines/testing/README.md)
- [Deployment Workflow](.pair/knowledge/guidelines/technical-standards/deployment-workflow/README.md)
