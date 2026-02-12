# Development Environment Setup

## 🎯 Overview

This document provides comprehensive guidelines for setting up and maintaining consistent development environments across teams and projects, ensuring reproducibility, reliability, and optimal developer experience.

## 🏗️ Environment Setup Strategy

### Core Principles

1. **Reproducible Environments**: Identical setups across all development machines
2. **Version Consistency**: Synchronized tool and dependency versions
3. **Automated Configuration**: Script-driven setup and maintenance
4. **Environment Isolation**: Project-specific configurations without conflicts
5. **Performance Optimization**: Optimized settings for development productivity

### Environment Types

- **Local Development**: Day-to-day development and testing with IDE, runtime, database, and tools
- **Containerized Development**: Consistent isolated development using Docker and Docker Compose
- **Cloud Development**: Remote development and collaboration with cloud IDEs and synchronization

## 🔧 Core Environment Components

### 1. System Requirements

#### Hardware Requirements:

- Minimum 8GB RAM (16GB recommended)
- 50GB+ available disk space
- Multi-core processor for optimal performance

#### Operating System Support:

- macOS (latest 2 versions)
- Linux (Ubuntu 20.04+ or equivalent)
- Windows 10/11 with WSL2

### 2. Package Manager Setup

#### Essential Package Managers:

- **Node.js**: Install via nvm for version management
- **pnpm**: Primary package manager for JavaScript/TypeScript projects
- **System Package Manager**: Homebrew (macOS), apt (Linux), Chocolatey (Windows)

#### Configuration:

- Set up pnpm global store directory
- Configure auto-install for peer dependencies
- Enable version consistency across projects

### 3. Development Tools Installation

#### Essential Tools:

- **Git**: Version control with proper configuration
- **Docker**: Containerization platform with Docker Compose
- **VS Code**: Primary IDE with essential extensions
- **Node.js**: Runtime environment (LTS version via nvm)

#### Tool Configuration:

- Git: User credentials, editor, pull strategy, default branch
- Docker: Resource limits, security settings, network configuration
- VS Code: Settings sync, extensions, workspace configuration

### 4. IDE and Editor Configuration

#### VS Code Setup:

- Install VS Code via system package manager
- Essential extensions: TypeScript, ESLint, Prettier, Tailwind CSS, Vitest, Playwright
- Workspace settings for consistent formatting and code actions
- Extension recommendations for project teams

#### Key Configuration:

- Default formatter: Prettier
- Format on save: Enabled
- Auto-fix ESLint issues on save
- TypeScript preferences for import handling

### 5. Project Environment Configuration

#### Workspace Configuration:

- `.vscode/settings.json`: Project-specific VS Code settings
- `.vscode/extensions.json`: Recommended extensions for the project
- Environment files: `.env.example` template and `.env.local` for development

#### Development Services:

- Docker Compose for local service orchestration
- Database setup and connection management
- External service configuration and API keys
- Hot reload and development server configuration

## 🔒 Environment Security

### 1. Secrets Management

#### Environment Variables:

- Use `.env.example` as template for required environment variables
- Create `.env.local` for development with actual values
- Never commit sensitive data to version control
- Use git-crypt for encrypted files when necessary

#### API Keys and Tokens:

- Store in environment variables or secure key management systems
- Rotate keys regularly and use minimal permissions
- Use separate keys for development, staging, and production

### 2. SSH and GPG Setup

#### SSH Keys:

- Generate Ed25519 keys for better security
- Add public keys to GitHub, GitLab, and other services
- Use SSH agent for key management
- Configure SSH config for different hosts

#### GPG Commit Signing:

- Generate GPG keys for commit verification
- Configure Git to sign commits automatically
- Add public keys to Git hosting services
- Verify signed commits in team workflows

## 🔄 Environment Maintenance

### 1. Update Management

#### Automated Updates:

- Schedule regular updates for system packages, Node.js, and global tools
- Use dependency update tools for security patches
- Automate VS Code extension updates
- Clean up Docker images and containers regularly

#### Manual Updates:

- Review major version updates before applying
- Coordinate breaking changes with team
- Test experimental features in separate environments
- Document update procedures and rollback plans

### 2. Environment Validation

#### Health Checks:

- Verify all required tools are installed and accessible
- Test project build and test processes
- Check development services status
- Validate environment variable configuration

#### Performance Monitoring:

- Track build and test execution times
- Monitor development server startup performance
- Measure hot reload and file watch responsiveness
- Check memory and CPU usage during development

## 📚 Troubleshooting Guide

### Common Issues and Solutions

#### Node.js and Package Manager Issues:

- Clear npm/pnpm cache when facing installation problems
- Fix permission issues with global package directories
- Reinstall Node.js via nvm if version conflicts occur
- Check network connectivity for package downloads

#### Docker Issues:

- Restart Docker daemon when containers fail to start
- Clean up unused images, containers, and volumes regularly
- Check resource allocation (memory, disk space)
- Verify Docker network configuration

#### VS Code Issues:

- Reset extensions when experiencing crashes or slowdowns
- Clear extension cache and reinstall problematic extensions
- Check workspace settings for conflicts
- Update to latest stable version

#### Git and Security Issues:

- Regenerate SSH keys if authentication fails
- Check GPG key expiration for commit signing
- Verify Git configuration (user, email, signing)
- Update Git credentials for remote repositories

## 📊 Environment Monitoring

### Performance Metrics

#### Build Performance:

- Track build execution time and memory usage
- Monitor dependency installation time
- Measure hot reload and file watch performance
- Check TypeScript compilation speed

#### Development Experience:

- Monitor IDE startup and responsiveness
- Track test execution performance
- Measure development server startup time
- Check linting and formatting speed

#### Resource Usage:

- Monitor CPU and memory usage during development
- Track disk space consumption by development tools
- Check network usage for package downloads
- Monitor Docker resource allocation

## 🚀 Quick Setup Commands

### Essential Installation Commands

```bash
# Install nvm and Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts && nvm use --lts

# Install pnpm
npm install -g pnpm@latest

# Configure Git (replace with your information)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
git config --global init.defaultBranch main

# Generate SSH key (replace with your email)
ssh-keygen -t ed25519 -C "your.email@example.com"
```

## 📋 Environment Checklist

### Pre-Development Checklist

- [ ] **System Requirements**

  - [ ] Operating system compatibility verified
  - [ ] Minimum hardware requirements met
  - [ ] Network connectivity established

- [ ] **Core Tools**

  - [ ] Git installed and configured
  - [ ] Node.js (LTS) installed via nvm
  - [ ] pnpm package manager installed
  - [ ] Docker and Docker Compose installed
  - [ ] VS Code installed with essential extensions

- [ ] **Security Setup**

  - [ ] SSH keys generated and added to services
  - [ ] GPG keys configured for commit signing
  - [ ] Secrets management configured
  - [ ] Environment files created and secured

- [ ] **Project Environment**

  - [ ] Project dependencies installed
  - [ ] Development services running
  - [ ] Environment variables configured
  - [ ] Build and test processes verified

- [ ] **Development Workflow**
  - [ ] Code formatting and linting configured
  - [ ] Git hooks and workflow established
  - [ ] Debug configuration set up
  - [ ] Performance monitoring enabled

### Post-Setup Validation

- [ ] All tools accessible from command line
- [ ] Project builds successfully
- [ ] Tests run without errors
- [ ] Development server starts correctly
- [ ] Hot reload functionality working
- [ ] Code formatting and linting active
- [ ] Git operations functioning properly
- [ ] Debug configuration working

---

## 🔗 Related Documentation

- **Required Tools**: Detailed installation guides for essential development tools
- **Tool Configuration**: Advanced configuration and optimization settings
- **Workflow Tools**: Integration and automation tool setup
- **Git Workflow**: Version control setup and best practices
- **Security Guidelines**: Security considerations for development environments

---

_This environment setup guide provides comprehensive automation and configuration for consistent, secure, and productive development environments across all team members and projects._
