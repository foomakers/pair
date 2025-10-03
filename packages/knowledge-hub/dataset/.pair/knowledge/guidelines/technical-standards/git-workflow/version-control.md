# Version Control Standards

## Overview

This document defines comprehensive version control standards for our development ecosystem, focusing on Git best practices, repository management, and collaborative development workflows that support our rapid iteration methodology.

## Repository Standards

### 1. Repository Structure

#### Standard Repository Layout

```
project-root/
├── .git/                          # Git metadata
├── .github/                       # GitHub-specific files
│   ├── workflows/                 # CI/CD workflows
│   ├── ISSUE_TEMPLATE/           # Issue templates
│   ├── PULL_REQUEST_TEMPLATE.md  # PR template
│   └── dependabot.yml            # Dependency updates
├── .gitignore                     # Git ignore rules
├── .gitattributes                # Git attributes
├── README.md                      # Project documentation
├── CHANGELOG.md                   # Version history
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                        # License file
├── package.json                   # Project configuration
├── pnpm-workspace.yaml           # Workspace configuration
├── turbo.json                     # Turborepo configuration
├── src/                           # Source code
├── tests/                         # Test files
├── docs/                          # Documentation
├── scripts/                       # Automation scripts
└── .pair/                         # Project guidelines
```

#### Git Configuration Files

```bash
# .gitignore - Comprehensive ignore patterns
# Dependencies
node_modules/
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
build/
*.tsbuildinfo

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/settings.json
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Log files
logs/
*.log

# Coverage reports
coverage/
*.lcov

# Temporary files
tmp/
temp/
*.tmp
```

```bash
# .gitattributes - File handling rules
# Text files
*.md text
*.txt text
*.json text
*.js text
*.ts text
*.tsx text
*.jsx text
*.css text
*.scss text
*.html text
*.xml text
*.yml text
*.yaml text

# Binary files
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
*.zip binary
*.tar.gz binary

# Line ending handling
* text=auto
*.sh text eol=lf
*.bat text eol=crlf

# Archive files
*.zip filter=lfs diff=lfs merge=lfs -text
*.tar.gz filter=lfs diff=lfs merge=lfs -text

# Large assets
*.psd filter=lfs diff=lfs merge=lfs -text
*.ai filter=lfs diff=lfs merge=lfs -text
```

### 2. Repository Configuration

#### Branch Protection Rules

```yaml
# GitHub branch protection configuration
branches:
  main:
    protection:
      required_status_checks:
        strict: true
        contexts:
          - 'ci/lint'
          - 'ci/test'
          - 'ci/build'
          - 'ci/security-scan'
      enforce_admins: true
      required_pull_request_reviews:
        required_approving_review_count: 1
        dismiss_stale_reviews: true
        require_code_owner_reviews: true
        restrict_pushes: true
      restrictions:
        users: []
        teams: ['core-developers']
      allow_force_pushes: false
      allow_deletions: false
```

#### Repository Settings

```json
{
  "repository": {
    "settings": {
      "has_issues": true,
      "has_projects": true,
      "has_wiki": false,
      "has_downloads": true,
      "default_branch": "main",
      "allow_squash_merge": true,
      "allow_merge_commit": false,
      "allow_rebase_merge": false,
      "delete_branch_on_merge": true,
      "archived": false,
      "disabled": false
    },
    "security": {
      "security_and_analysis": {
        "secret_scanning": { "status": "enabled" },
        "secret_scanning_push_protection": { "status": "enabled" },
        "dependabot_security_updates": { "status": "enabled" },
        "dependency_graph": { "status": "enabled" }
      }
    }
  }
}
```

## Git Configuration Standards

### 1. Global Git Configuration

#### User Configuration

```bash
# Set user information
git config --global user.name "Your Full Name"
git config --global user.email "your.email@company.com"

# Set signing key for commits
git config --global user.signingkey YOUR_GPG_KEY_ID
git config --global commit.gpgsign true

# Set default editor
git config --global core.editor "code --wait"

# Set default init branch
git config --global init.defaultBranch main
```

#### Performance and Behavior

```bash
# Improve performance for large repositories
git config --global core.preloadindex true
git config --global core.fscache true
git config --global gc.auto 256

# Set line ending handling
git config --global core.autocrlf input  # Unix/Mac
git config --global core.autocrlf true   # Windows

# Enable rerere (reuse recorded resolution)
git config --global rerere.enabled true

# Set push behavior
git config --global push.default simple
git config --global push.followTags true

# Enable colored output
git config --global color.ui auto
```

#### Useful Aliases

```bash
# Productivity aliases
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status
git config --global alias.unstage 'reset HEAD --'
git config --global alias.last 'log -1 HEAD'
git config --global alias.visual '!gitk'

# Advanced aliases
git config --global alias.lg "log --oneline --decorate --all --graph"
git config --global alias.cleanup "!git branch --merged | grep -v '\\*\\|main\\|develop' | xargs -n 1 git branch -d"
git config --global alias.uncommit "reset --soft HEAD~1"
git config --global alias.recommit "commit --amend --no-edit"
```

### 2. Project-Level Configuration

#### Repository-Specific Settings

```bash
# .git/config or using git config --local

# Set specific author for work projects
git config --local user.name "Work Name"
git config --local user.email "work.email@company.com"

# Repository-specific hooks path
git config --local core.hooksPath .githooks

# Large file threshold
git config --local core.bigFileThreshold 10m

# Commit template
git config --local commit.template .gitmessage
```

#### Commit Message Template

```bash
# .gitmessage template file
# <type>(<scope>): <subject>
#
# <body>
#
# <footer>

# Type: feat, fix, docs, style, refactor, test, chore
# Scope: auth, api, ui, db, etc.
# Subject: Short description (50 chars max)
# Body: Detailed explanation (wrap at 72 chars)
# Footer: Breaking changes, issues closed, etc.
```

## Versioning Strategy

### 1. Semantic Versioning

#### Version Format

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
```

#### Version Components

- **MAJOR**: Incompatible API changes
- **MINOR**: Backward-compatible functionality additions
- **PATCH**: Backward-compatible bug fixes
- **PRERELEASE**: Alpha, beta, rc versions
- **BUILD**: Build metadata

#### Examples

```
1.0.0          # Initial release
1.0.1          # Bug fix
1.1.0          # New feature
2.0.0          # Breaking change
2.0.0-alpha.1  # Pre-release
2.0.0+20240101 # Build metadata
```

### 2. Tagging Strategy

#### Creating Tags

```bash
# Lightweight tag
git tag v1.0.0

# Annotated tag (recommended)
git tag -a v1.0.0 -m "Release version 1.0.0"

# Tag specific commit
git tag -a v1.0.0 9fceb02 -m "Release version 1.0.0"

# Push tags
git push origin v1.0.0
git push origin --tags
```

#### Tag Management

```bash
# List tags
git tag
git tag -l "v1.*"

# Show tag information
git show v1.0.0

# Delete tag
git tag -d v1.0.0
git push origin --delete v1.0.0

# Checkout tag
git checkout v1.0.0
```

#### Automated Tagging

```yaml
# GitHub Actions workflow for automatic tagging
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Determine version
        id: version
        run: |
          # Extract version from package.json or calculate from commits
          VERSION=$(node -p "require('./package.json').version")
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Create tag
        run: |
          git tag -a v${{ steps.version.outputs.version }} -m "Release v${{ steps.version.outputs.version }}"
          git push origin v${{ steps.version.outputs.version }}

      - name: Create release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ steps.version.outputs.version }}
          release_name: Release v${{ steps.version.outputs.version }}
          draft: false
          prerelease: false
```

## Commit Standards and Quality

### 1. Commit Message Standards

#### Conventional Commits

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Commit Types

```typescript
interface CommitType {
  feat: 'New feature'
  fix: 'Bug fix'
  docs: 'Documentation only changes'
  style: 'Changes that do not affect the meaning of the code'
  refactor: 'Code change that neither fixes a bug nor adds a feature'
  perf: 'Code change that improves performance'
  test: 'Adding missing tests or correcting existing tests'
  build: 'Changes that affect the build system or external dependencies'
  ci: 'Changes to CI configuration files and scripts'
  chore: "Other changes that don't modify src or test files"
  revert: 'Reverts a previous commit'
}
```

#### Examples of Good Commits

```bash
# Feature additions
git commit -m "feat(auth): implement OAuth2 authentication flow"
git commit -m "feat(api): add user profile management endpoints"

# Bug fixes
git commit -m "fix(ui): resolve button alignment issue on mobile"
git commit -m "fix(db): prevent SQL injection in user query"

# Documentation
git commit -m "docs(api): add comprehensive endpoint documentation"
git commit -m "docs(readme): update installation instructions"

# Refactoring
git commit -m "refactor(auth): extract JWT validation to separate service"
git commit -m "refactor(ui): simplify component prop structure"

# Performance improvements
git commit -m "perf(api): optimize database query for user search"
git commit -m "perf(ui): implement virtual scrolling for large lists"
```

### 2. Commit Quality Enforcement

#### Pre-commit Hooks

```bash
#!/bin/sh
# .githooks/pre-commit

# Run linting
echo "Running linter..."
pnpm lint --staged
if [ $? -ne 0 ]; then
    echo "❌ Linting failed. Please fix errors before committing."
    exit 1
fi

# Run type checking
echo "Running type check..."
pnpm type-check
if [ $? -ne 0 ]; then
    echo "❌ Type checking failed. Please fix errors before committing."
    exit 1
fi

# Run tests
echo "Running tests..."
pnpm test --passWithNoTests --watchAll=false
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Please fix failing tests before committing."
    exit 1
fi

echo "✅ All checks passed. Proceeding with commit."
```

#### Commit Message Validation

```bash
#!/bin/sh
# .githooks/commit-msg

commit_regex='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ Invalid commit message format!"
    echo "Format: <type>(<scope>): <description>"
    echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    echo "Example: feat(auth): add user authentication"
    exit 1
fi

echo "✅ Commit message format is valid."
```

## Advanced Git Workflows

### 1. Git Flow Integration

#### Git Flow Commands

```bash
# Initialize git flow
git flow init

# Start a new feature
git flow feature start user-authentication

# Finish a feature
git flow feature finish user-authentication

# Start a release
git flow release start 1.2.0

# Finish a release
git flow release finish 1.2.0

# Start a hotfix
git flow hotfix start critical-bug

# Finish a hotfix
git flow hotfix finish critical-bug
```

### 2. Submodule Management

#### Adding Submodules

```bash
# Add a submodule
git submodule add https://github.com/company/shared-library.git lib/shared

# Initialize submodules after cloning
git submodule init
git submodule update

# Or combine both
git submodule update --init --recursive
```

#### Updating Submodules

```bash
# Update all submodules
git submodule update --remote

# Update specific submodule
git submodule update --remote lib/shared

# Pull latest changes in submodule
cd lib/shared
git pull origin main
cd ../..
git add lib/shared
git commit -m "chore: update shared library submodule"
```

### 3. Worktree Management

#### Multiple Working Trees

```bash
# Create a new worktree
git worktree add ../project-feature feature/new-feature

# List worktrees
git worktree list

# Remove worktree
git worktree remove ../project-feature

# Prune stale worktree references
git worktree prune
```

## Security and Access Control

### 1. SSH Key Management

#### SSH Key Generation

```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your.email@company.com"

# Add to SSH agent
ssh-add ~/.ssh/id_ed25519

# Copy public key
cat ~/.ssh/id_ed25519.pub
```

#### SSH Configuration

```bash
# ~/.ssh/config
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes

Host company-gitlab
    HostName gitlab.company.com
    User git
    IdentityFile ~/.ssh/id_company
    IdentitiesOnly yes
```

### 2. GPG Signing

#### GPG Key Setup

```bash
# Generate GPG key
gpg --full-generate-key

# List GPG keys
gpg --list-secret-keys --keyid-format LONG

# Export public key
gpg --armor --export YOUR_KEY_ID

# Configure Git to use GPG
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

#### Signing Commits and Tags

```bash
# Sign individual commit
git commit -S -m "feat(auth): add secure authentication"

# Sign tag
git tag -s v1.0.0 -m "Release version 1.0.0"

# Verify signatures
git log --show-signature
git verify-commit HEAD
git verify-tag v1.0.0
```

## Performance Optimization

### 1. Repository Performance

#### Large Repository Optimization

```bash
# Enable partial clone
git clone --filter=blob:none <url>

# Enable sparse checkout
git config core.sparseCheckout true
echo "src/*" > .git/info/sparse-checkout
git read-tree -m -u HEAD

# Optimize repository
git gc --aggressive --prune=now
git repack -Ad
```

#### Git LFS for Large Files

```bash
# Install Git LFS
git lfs install

# Track large files
git lfs track "*.zip"
git lfs track "*.pdf"
git lfs track "assets/**/*.png"

# Add .gitattributes
git add .gitattributes

# Normal git operations work
git add large-file.zip
git commit -m "feat: add large asset file"
git push origin main
```

### 2. Workflow Optimization

#### Efficient Branch Management

```bash
# Fetch and prune in one command
git fetch --prune

# Clean up merged branches
git branch --merged | grep -v "\*\|main\|develop" | xargs -n 1 git branch -d

# Use shallow clones for CI
git clone --depth=1 <url>
```

#### Parallel Operations

```bash
# Configure parallel processing
git config --global submodule.fetchJobs 8
git config --global checkout.workers 8
```

## Troubleshooting and Recovery

### 1. Common Issues

#### Merge Conflicts

```bash
# Abort merge
git merge --abort

# Abort rebase
git rebase --abort

# Use merge tool
git mergetool

# Show conflict history
git log --merge
```

#### Undoing Changes

```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Undo specific file changes
git checkout HEAD -- filename.txt

# Revert a commit
git revert <commit-hash>
```

### 2. Data Recovery

#### Recovering Lost Commits

```bash
# Show reflog
git reflog

# Recover from reflog
git checkout <lost-commit-hash>
git branch recovery-branch

# Find lost commits
git fsck --lost-found
```

#### Repository Corruption Recovery

```bash
# Check repository integrity
git fsck --full

# Recover from backup
git clone --bare /path/to/backup.git recovered.git
cd recovered.git
git config --bool core.bare false
git reset --hard
```

## Related Documentation

- [Development Process](./development-process.md)
- [Quality Assurance](./quality-assurance.md)
- [Code Review Guidelines](../../collaboration/README.md)
- [Deployment Workflow](../deployment-workflow/README.md)
- [Security Guidelines](../../quality-assurance/security/README.md)
