# Quick Start Guide for pair

Welcome to pair! This guide will get you up and running in minutes on macOS or Linux.

## Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Terminal/command line access

## Quick Install

### Option 1: npm Install (Recommended)

Install pair-cli globally for system-wide access:

```bash
npm install -g @pair/pair-cli
```

Or with pnpm:

```bash
pnpm add -g @pair/pair-cli
```

### Option 2: Manual Install (Offline)

For air-gapped environments or manual control:

1. Download the latest release from [GitHub Releases](https://github.com/foomakers/pair/releases)
2. Extract the `pair-cli-manual-vX.Y.Z.zip` file
3. Run directly from the extracted folder

## Verify Installation

After installation, verify pair-cli is working:

```bash
pair-cli --version
```

Expected output:

```
pair-cli vX.Y.Z
```

## First Command: List Available Targets

See what pair can install in your project:

```bash
pair-cli install --list-targets
```

Expected output:

```
📁 Available asset registries:

  github     🔄🎯 .github         GitHub workflows and configuration files
  knowledge  🔄 .pair            Knowledge base and documentation
  adoption   ➕ .pair/product/adopted  Adoption guides and onboarding materials
```

## Install Default Assets

Populate your project with pair's default configuration:

```bash
pair-cli install
```

This creates the standard `.pair` and `.github` folders with documentation, workflows, and configuration files.

## Next Steps

### Learning Resources

- **[CLI Commands Reference](../cli/commands.md)** - Complete command documentation with all options
- **[CLI Help Examples](../cli/help-examples.md)** - Copy-paste ready examples for common workflows
- [Explore CLI Workflows](./02-cli-workflows.md) - Common use cases and patterns
- [Troubleshooting](./03-troubleshooting.md) - Common issues and solutions

### Setup Validation

- [Adopter Checklist](./04-adopter-checklist.md) - Complete setup verification

## Need Help?

- File an issue on [GitHub](https://github.com/foomakers/pair/issues)
