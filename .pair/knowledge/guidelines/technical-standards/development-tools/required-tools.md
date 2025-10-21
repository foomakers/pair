# Required Tools

Essential development tools that must be installed and configured for consistent development environments across all team members and projects.

## Purpose

Define mandatory development tools that ensure consistency, compatibility, and productivity across all development environments while maintaining standardized workflows.

## Core Required Tools

### Development Environment

#### Code Editor (Required)

```bash
# Primary: Cursor (AI-enhanced development)
# Download from: https://cursor.sh/
# Version: Latest stable

# Configuration requirements:
- AI integration enabled
- Standardized extensions pack
- Team-wide settings sync
- Project-specific workspace configuration
```

#### Version Control (Required)

```bash
# Git - Latest stable version
# Installation via package manager
brew install git                    # macOS
sudo apt install git              # Ubuntu/Debian
winget install Git.Git            # Windows

# GitHub CLI (required for GitHub workflows)
brew install gh                    # macOS
sudo apt install gh              # Ubuntu/Debian
winget install GitHub.cli        # Windows

# Configuration requirements:
git config --global user.name "Your Name"
git config --global user.email "your.email@company.com"
git config --global init.defaultBranch main
git config --global pull.rebase true
git config --global push.autoSetupRemote true
```

#### Node.js Environment (Required)

```bash
# Node.js via Node Version Manager
# nvm (Unix/macOS) or nvm-windows (Windows)

# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install latest LTS Node.js
nvm install --lts
nvm use --lts
nvm alias default node

# Verify installation
node --version    # Should be v18.x.x or later
npm --version     # Should be v9.x.x or later

# Package manager requirements
npm install -g pnpm  # Primary package manager
npm install -g yarn  # Backup package manager
```

### Development Utilities (Required)

#### Essential CLI Tools

```bash
# Core development utilities (all platforms)
npm install -g typescript tsx
npm install -g eslint prettier
npm install -g vitest @vitest/ui
npm install -g turbo @changesets/cli

# System utilities (macOS/Linux via Homebrew)
brew install jq fx          # JSON processing
brew install bat exa         # Enhanced cat/ls
brew install fd ripgrep      # Enhanced find/grep
brew install httpie curl     # HTTP clients

# Windows alternatives
winget install BurntSushi.ripgrep.MSVC
winget install sharkdp.fd
winget install sharkdp.bat
```

#### Database Tools (Required)

```bash
# Database clients (choose based on project needs)
# DBeaver (Universal) - Required for all projects
# Download from: https://dbeaver.io/

# TablePlus (macOS) - Optional but recommended
# Download from: https://tableplus.com/

# Command-line database tools
brew install postgresql      # PostgreSQL client
brew install mysql-client   # MySQL client
brew install redis          # Redis client
```

### Container Technology (Required)

#### Docker Platform

```bash
# Docker Desktop (All platforms) - Required
# Download from: https://www.docker.com/products/docker-desktop/

# Verify installation
docker --version
docker-compose --version

# Alternative: Colima (macOS - lightweight alternative)
brew install colima
colima start

# Required Docker configuration
docker login ghcr.io  # GitHub Container Registry
```

#### Container Orchestration

```bash
# Kubernetes CLI (if using K8s)
brew install kubernetes-cli
kubectl version --client

# Helm (if using Helm charts)
brew install helm
helm version
```

## Development Standards Compliance

### Tool Version Requirements

```yaml
# .tool-versions (required in project root)
nodejs: 18.17.0
pnpm: 8.6.0
typescript: 5.1.6
eslint: 8.44.0
prettier: 3.0.0
vitest: 0.33.0
docker: 24.0.0
# Update policy:
# - Major versions: Team approval required
# - Minor versions: Auto-update allowed
# - Patch versions: Auto-update encouraged
```

### Configuration Validation

```typescript
// scripts/validate-tools.ts
interface ToolRequirement {
  name: string
  command: string
  minVersion: string
  required: boolean
}

const requiredTools: ToolRequirement[] = [
  { name: 'Node.js', command: 'node --version', minVersion: '18.0.0', required: true },
  { name: 'pnpm', command: 'pnpm --version', minVersion: '8.0.0', required: true },
  { name: 'Git', command: 'git --version', minVersion: '2.30.0', required: true },
  { name: 'Docker', command: 'docker --version', minVersion: '24.0.0', required: true },
  { name: 'TypeScript', command: 'tsc --version', minVersion: '5.0.0', required: true },
]

class ToolValidator {
  async validateEnvironment(): Promise<ValidationResult> {
    const results: ToolValidationResult[] = []

    for (const tool of requiredTools) {
      const result = await this.validateTool(tool)
      results.push(result)
    }

    const failedRequired = results.filter(r => !r.valid && r.required)

    return {
      valid: failedRequired.length === 0,
      results,
      failedRequired,
    }
  }

  private async validateTool(tool: ToolRequirement): Promise<ToolValidationResult> {
    try {
      const output = await this.executeCommand(tool.command)
      const version = this.extractVersion(output)
      const valid = this.isVersionValid(version, tool.minVersion)

      return {
        name: tool.name,
        required: tool.required,
        valid,
        currentVersion: version,
        minVersion: tool.minVersion,
      }
    } catch (error) {
      return {
        name: tool.name,
        required: tool.required,
        valid: false,
        error: error.message,
      }
    }
  }
}
```

### Installation Verification Scripts

```bash
#!/bin/bash
# scripts/verify-installation.sh

echo "🔍 Verifying development environment..."

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found"
    exit 1
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "✅ pnpm: $PNPM_VERSION"
else
    echo "❌ pnpm not found"
    exit 1
fi

# Check Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo "✅ Git: $GIT_VERSION"
else
    echo "❌ Git not found"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "✅ Docker: $DOCKER_VERSION"
else
    echo "❌ Docker not found"
    exit 1
fi

# Check GitHub CLI
if command -v gh &> /dev/null; then
    GH_VERSION=$(gh --version | head -1)
    echo "✅ GitHub CLI: $GH_VERSION"
else
    echo "⚠️  GitHub CLI not found (recommended)"
fi

echo "🎉 Environment verification complete!"
```

## Team Onboarding Requirements

### New Developer Setup Checklist

```markdown
# Developer Onboarding Checklist

## Required Tools Installation

- [ ] Install Cursor IDE with team extensions
- [ ] Install Node.js via nvm (LTS version)
- [ ] Install pnpm package manager
- [ ] Install Git and configure global settings
- [ ] Install Docker Desktop or Colima
- [ ] Install GitHub CLI and authenticate
- [ ] Install required CLI utilities

## Environment Configuration

- [ ] Clone development configuration repository
- [ ] Set up SSH keys for GitHub
- [ ] Configure Git signing (GPG keys)
- [ ] Set up IDE with team settings
- [ ] Configure development environment variables
- [ ] Test build and development workflows

## Verification Steps

- [ ] Run environment validation script
- [ ] Successfully build main project
- [ ] Run test suite locally
- [ ] Create and merge test pull request
- [ ] Deploy to development environment

## Access and Permissions

- [ ] GitHub organization member
- [ ] Repository access granted
- [ ] Development environment access
- [ ] CI/CD pipeline permissions
- [ ] Documentation and resources access
```

### Automated Setup Script

```bash
#!/bin/bash
# scripts/setup-dev-environment.sh

set -e

echo "🚀 Setting up development environment..."

# Install Homebrew (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
fi

# Install Node.js via nvm
if ! command -v nvm &> /dev/null; then
    echo "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    source ~/.bashrc
fi

echo "Installing Node.js LTS..."
nvm install --lts
nvm use --lts
nvm alias default node

# Install package managers
echo "Installing package managers..."
npm install -g pnpm yarn

# Install essential tools
echo "Installing development tools..."
npm install -g typescript tsx eslint prettier vitest turbo

# Install system utilities (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install git gh docker jq bat exa fd ripgrep
fi

# Verify installation
echo "Verifying installation..."
./scripts/verify-installation.sh

echo "✅ Development environment setup complete!"
echo "📝 Next steps:"
echo "1. Configure Git with your credentials"
echo "2. Set up SSH keys for GitHub"
echo "3. Clone project repositories"
echo "4. Run project-specific setup scripts"
```

This framework ensures all team members have consistent, properly configured development environments with all required tools and utilities.
