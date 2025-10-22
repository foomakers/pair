# Branch Template

## Branch Information

**Branch Name:** [Standardized format based on type and ID]  
**Story/Task ID:** [US-XXX or TASK-XXX]  
**Type:** [feature/bug/hotfix/chore/docs]  
**Base Branch:** [main/develop/release]  
**Developer:** [Your name]  
**Created Date:** [YYYY-MM-DD]

## Branch Naming Standards

### Standard Format

```
<type>/<story-id>-<brief-description>
```

### Branch Types

- **feature/** - New functionality or enhancements
- **bug/** - Bug fixes and corrections
- **hotfix/** - Critical production fixes
- **chore/** - Maintenance, refactoring, or tooling
- **docs/** - Documentation updates
- **release/** - Release preparation branches

### Naming Examples

```
feature/US-123-user-authentication
bug/BUG-456-login-validation-error
hotfix/HOT-789-payment-processing-fix
chore/TASK-321-dependency-updates
docs/DOC-654-api-documentation
release/v1.2.0-preparation
```

## Branch Workflow

### 1. Branch Creation

```bash
# Ensure you're on the latest base branch
git checkout main
git pull origin main

# Create and switch to new branch
git checkout -b feature/US-123-user-authentication

# Set upstream tracking
git push -u origin feature/US-123-user-authentication
```

### 2. Development Workflow

```bash
# Make changes and stage them
git add .

# Commit using commit template standards
git commit -m "feat(auth): implement user authentication system

- Add JWT token generation and validation
- Implement password hashing with bcrypt
- Create authentication middleware
- Add login/logout endpoints

Closes US-123"

# Push changes regularly
git push origin feature/US-123-user-authentication
```

### 3. Branch Synchronization

```bash
# Keep branch updated with base branch
git checkout main
git pull origin main
git checkout feature/US-123-user-authentication
git rebase main

# Or use merge if preferred by team
git merge main

# Push updated branch
git push origin feature/US-123-user-authentication --force-with-lease
```

### 4. Pull Request Creation

```bash
# Ensure branch is ready for review
git push origin feature/US-123-user-authentication

# Create PR using gh CLI or web interface
gh pr create --title "[US-123] feat: implement user authentication system" \
  --body-file .github/pull_request_template.md \
  --assignee @me \
  --reviewer @teammate1,@teammate2
```

## Branch Lifecycle Management

### Branch States

- **Active Development** - Feature work in progress
- **Ready for Review** - Code complete, PR created
- **In Review** - Undergoing code review process
- **Approved** - Approved and ready to merge
- **Merged** - Successfully merged to base branch
- **Archived** - Branch deleted after merge

### Branch Protection Rules

- [ ] Require PR for all changes to main/develop
- [ ] Require status checks to pass before merging
- [ ] Require branches to be up to date before merging
- [ ] Require review from code owners
- [ ] Restrict pushes to matching branches

### Cleanup Process

```bash
# After successful merge, delete local branch
git checkout main
git pull origin main
git branch -d feature/US-123-user-authentication

# Delete remote branch (usually done automatically after PR merge)
git push origin --delete feature/US-123-user-authentication

# Clean up tracking references
git remote prune origin
```

## Branch Management Guidelines

### Long-Running Branches

- **main** - Production-ready code
- **develop** - Integration branch for features
- **release/x.x.x** - Release preparation and stabilization
- **hotfix/xxx** - Critical production fixes

### Short-Lived Branches

- **feature/xxx** - Individual feature development
- **bug/xxx** - Bug fix development
- **chore/xxx** - Maintenance and tooling work

### Branching Strategy

#### Git Flow Model

```
main
├── develop
│   ├── feature/US-123-authentication
│   ├── feature/US-124-user-profile
│   └── feature/US-125-dashboard
├── release/v1.2.0
└── hotfix/v1.1.1-critical-fix
```

#### GitHub Flow Model

```
main
├── feature/US-123-authentication
├── feature/US-124-user-profile
└── hotfix/critical-security-fix
```

### Branch Naming Conventions

#### User Story Branches

```
feature/US-[story-number]-[brief-description]
feature/US-123-user-authentication
feature/US-124-profile-management
```

#### Bug Fix Branches

```
bug/BUG-[bug-number]-[brief-description]
bug/BUG-456-login-validation
bug/BUG-789-payment-error
```

#### Task Branches

```
chore/TASK-[task-number]-[brief-description]
chore/TASK-321-update-dependencies
chore/TASK-654-refactor-api-client
```

#### Hotfix Branches

```
hotfix/[severity]-[brief-description]
hotfix/critical-payment-processing
hotfix/security-user-data-leak
```

## Commit Strategy on Branches

### Atomic Commits

Each commit should represent a single logical change:

```bash
git commit -m "feat(auth): add JWT token generation"
git commit -m "test(auth): add authentication middleware tests"
git commit -m "docs(auth): update API documentation for auth endpoints"
```

### Commit Message Format

```
<type>(<scope>): <description>

<optional body>

<optional footer>
```

### Pre-Commit Checklist

- [ ] Code compiles without errors
- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated if needed
- [ ] No sensitive data in commit
- [ ] Commit message follows standards

## Collaboration Guidelines

### Branch Ownership

- **Primary Developer** - Creates and owns the branch
- **Collaborators** - Can contribute with permission
- **Reviewers** - Review code but don't commit directly

### Collaboration Commands

```bash
# Add collaborator to branch
git checkout feature/US-123-authentication
git pull origin feature/US-123-authentication

# Make changes and push
git add .
git commit -m "feat(auth): add additional validation"
git push origin feature/US-123-authentication
```

### Conflict Resolution

```bash
# When conflicts occur during rebase/merge
git status  # Check conflicted files
# Edit files to resolve conflicts
git add .
git rebase --continue  # or git merge --continue
git push origin feature/US-123-authentication --force-with-lease
```

## Quality Assurance

### Branch Quality Checklist

- [ ] Branch follows naming conventions
- [ ] All commits have proper messages
- [ ] Code changes are focused and related
- [ ] Tests added for new functionality
- [ ] Documentation updated appropriately
- [ ] No merge commits in feature branch
- [ ] Branch is up to date with base branch

### Automated Checks

- **CI/CD Pipeline** - Runs on every push
- **Code Quality** - Linting and formatting checks
- **Security Scan** - Dependency and code security
- **Test Coverage** - Maintains minimum coverage threshold

### Manual Review Points

- **Code Standards** - Follows team conventions
- **Architecture** - Aligns with system design
- **Performance** - No performance regressions
- **Security** - No security vulnerabilities

## Troubleshooting

### Common Issues

#### Branch Diverged from Base

```bash
# Solution: Rebase onto latest base
git checkout main
git pull origin main
git checkout feature/US-123-authentication
git rebase main
```

#### Force Push After Rebase

```bash
# Use force-with-lease for safety
git push origin feature/US-123-authentication --force-with-lease
```

#### Branch Name Conflicts

```bash
# Rename local branch
git branch -m old-branch-name new-branch-name

# Delete old remote branch and push new one
git push origin --delete old-branch-name
git push -u origin new-branch-name
```

#### Lost Commits After Rebase

```bash
# Use reflog to find lost commits
git reflog
git checkout [commit-hash]
git checkout -b recovery-branch
```

### Emergency Procedures

#### Revert Branch Changes

```bash
# Revert last commit
git revert HEAD

# Revert multiple commits
git revert HEAD~3..HEAD

# Hard reset to specific commit (use with caution)
git reset --hard [commit-hash]
```

#### Emergency Hotfix Process

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-security-fix

# Make minimal fix
# Test thoroughly
# Create emergency PR with expedited review
```

---

## Branch Templates for Different Types

### Feature Branch Template

```
Branch: feature/US-[ID]-[description]
Purpose: Implement new functionality
Base: develop (or main for GitHub Flow)
Lifecycle: Create → Develop → PR → Review → Merge → Delete
```

### Bug Fix Branch Template

```
Branch: bug/BUG-[ID]-[description]
Purpose: Fix identified issues
Base: develop (or main for hotfixes)
Lifecycle: Create → Fix → Test → PR → Review → Merge → Delete
```

### Chore Branch Template

```
Branch: chore/TASK-[ID]-[description]
Purpose: Maintenance, refactoring, tooling
Base: develop (or main)
Lifecycle: Create → Work → PR → Review → Merge → Delete
```

### Release Branch Template

```
Branch: release/v[version]
Purpose: Release preparation and stabilization
Base: develop
Lifecycle: Create → Stabilize → Merge to main → Tag → Delete
```

This branch template provides comprehensive guidance for professional Git workflow management, ensuring consistent practices across all development activities.
