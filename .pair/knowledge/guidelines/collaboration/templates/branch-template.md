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

```text
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

```text
feature/US-123-user-authentication
bug/BUG-456-login-validation-error
hotfix/HOT-789-payment-processing-fix
chore/TASK-321-dependency-updates
docs/DOC-654-api-documentation
release/v1.2.0-preparation
```

## Branch Workflow

1. **Creation**: branch from the up-to-date base branch, push with upstream tracking (`git checkout -b <branch> && git push -u origin <branch>`).
2. **Development**: commit per the [commit template](commit-template.md), push regularly.
3. **Synchronization**: keep the branch updated with the base branch (rebase or merge per team preference); after a rebase, push with `--force-with-lease`.
4. **Pull request**: create the PR per the [PR template](pr-template.md) when the branch is ready for review.

## Branch Lifecycle Management

### Branch States

Active Development → Ready for Review → In Review → Approved → Merged → Archived (deleted).

### Branch Protection Rules

- [ ] Require PR for all changes to main/develop
- [ ] Require status checks to pass before merging
- [ ] Require branches to be up to date before merging
- [ ] Require review from code owners
- [ ] Restrict pushes to matching branches

### Cleanup Process

After merge: delete the local and remote branch, then `git remote prune origin` (remote deletion is usually automatic after PR merge).

## Branch Management Guidelines

### Long-Running Branches

- **main** - Production-ready code
- **develop** - Integration branch for features
- **release/x.x.x** - Release preparation and stabilization
- **hotfix/xxx** - Critical production fixes

### Short-Lived Branches

- **feature/xxx**, **bug/xxx**, **chore/xxx** - Individual story, fix, or maintenance work; created from the base branch, deleted after merge.

### Branching Strategy

- **Git Flow**: features branch from `develop`; `release/*` and `hotfix/*` branch toward `main`.
- **GitHub Flow**: everything branches directly from `main`.

The adopted strategy determines each branch type's base branch.

## Commit Strategy on Branches

Commits on branches follow the [commit template](commit-template.md): atomic commits, standard message format, pre-commit checklist (tests pass, style clean, no sensitive data).

## Collaboration Guidelines

- **Primary Developer** - Creates and owns the branch
- **Collaborators** - Can contribute with permission (pull, commit, push on the shared branch)
- **Reviewers** - Review code but don't commit directly

Conflicts are resolved by the branch owner during rebase/merge, then pushed with `--force-with-lease`.

## Quality Assurance

### Branch Quality Checklist

- [ ] Branch follows naming conventions
- [ ] All commits have proper messages
- [ ] Code changes are focused and related
- [ ] Tests added for new functionality
- [ ] Documentation updated appropriately
- [ ] No merge commits in feature branch
- [ ] Branch is up to date with base branch

Automated checks (CI/CD, linting, security scan, coverage) and review standards are defined in the [quality-assurance guidelines](../../quality-assurance/README.md).

## Troubleshooting

- **Branch diverged from base**: rebase onto the latest base branch.
- **Push rejected after rebase**: `git push --force-with-lease`.
- **Lost commits after rebase**: recover via `git reflog`.
- **Emergency hotfix**: branch `hotfix/<severity>-<description>` from `main`, minimal fix, expedited PR review.
