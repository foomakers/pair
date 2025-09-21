# CLI Workflows and Common Use Cases

This guide covers common pair-cli workflows and commands for managing documentation and configuration assets.

## Common Workflows

### 1. Project Onboarding

When joining a new pair-enabled project:

```bash
# First, check what assets are available
pair-cli install --list-targets

# Install all default assets
pair-cli install

# Verify installation by checking created folders
ls -la .pair/
ls -la .github/
```

### 2. Updating Assets

Keep your project's pair assets up to date:

```bash
# Update all installed assets to latest versions
pair-cli update

# Update specific target
pair-cli update knowledge
```

### 3. Custom Installation Paths

Install assets to non-standard locations:

```bash
# Install to custom .pair location
pair-cli install ./.pair_custom

# Install specific asset type to custom path
pair-cli install github ./.github_custom
```

### 4. Inspecting Assets

Before installation, inspect what will be installed:

```bash
# List all available asset types
pair-cli install --list-targets

# Get detailed info about a specific asset
pair-cli install --info knowledge
```

## Command Reference

### Install Command

```bash
pair-cli install [target] [path]
```

**Examples:**

```bash
# Install all targets to default paths
pair-cli install

# Install specific target
pair-cli install knowledge

# Install to custom path
pair-cli install knowledge ./docs/

# List available targets
pair-cli install --list-targets
```

### Update Command

```bash
pair-cli update [target]
```

**Examples:**

```bash
# Update all installed assets
pair-cli update

# Update specific asset type
pair-cli update github
```

### Help and Version

```bash
# Show help
pair-cli --help

# Show version
pair-cli --version
```

## Working with Temporary Directories

For testing or exploration, use temporary directories:

```bash
# Create temp directory and install
mkdir /tmp/pair-test
cd /tmp/pair-test
pair-cli install

# Clean up when done
cd -
rm -rf /tmp/pair-test
```

## Integration with Development Workflow

### CI/CD Integration

Add to your CI pipeline:

```yaml
# In .github/workflows/ci.yml
- name: Install pair assets
  run: |
    npm install -g @pair/pair-cli
    pair-cli install
```

### Local Development Setup

In your project's setup script:

```bash
#!/bin/bash
# setup.sh

# Install dependencies
pnpm install

# Install pair assets
pnpm dlx pair-cli install

echo "Setup complete! Check .pair/ and .github/ for documentation and workflows."
```

## Troubleshooting

If commands fail, check:

- Node.js version: `node --version` (should be 18+)
- pnpm availability: `pnpm --version`
- Permissions: Try with `sudo` if installing globally
- Network: For offline installs, use manual download

See [Troubleshooting](./03-troubleshooting.md) for detailed solutions.

## Next Steps

- [Troubleshooting Guide](./03-troubleshooting.md)
- [Adopter Checklist](./04-adopter-checklist.md)
