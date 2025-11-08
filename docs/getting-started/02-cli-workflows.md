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

### 5. Link Validation and Updates

After installation or project changes, validate and update KB links:

```bash
# Preview link changes
pair-cli update-link --dry-run

# Update all links to relative paths (default)
pair-cli update-link

# Convert to absolute paths
pair-cli update-link --absolute

# Detailed logging for troubleshooting
pair-cli update-link --verbose
```

**Common Scenarios:**
- **After project restructure**: `pair-cli update-link` to fix broken links
- **After moving project**: `pair-cli update-link --absolute` for portability
- **Link health check**: `pair-cli update-link --dry-run --verbose` to inspect

See [Link Update Guide](./05-cli-update-link.md) for comprehensive documentation.

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

### Update-Link Command

```bash
pair-cli update-link [options]
```

**Examples:**

```bash
# Update all KB links to relative paths (default)
pair-cli update-link

# Preview changes first
pair-cli update-link --dry-run

# Convert to absolute paths
pair-cli update-link --absolute

# Verbose output for debugging
pair-cli update-link --verbose
```

See [Link Update Guide](./05-cli-update-link.md) for detailed usage.

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

# Validate KB links
pnpm dlx pair-cli update-link --dry-run

echo "Setup complete! Check .pair/ and .github/ for documentation and workflows."
```

### Complete Maintenance Workflow

Typical workflow for keeping KB content updated:

```bash
# 1. Update KB content from source
pair-cli update

# 2. Validate links after update
pair-cli update-link --dry-run

# 3. Fix any broken links
pair-cli update-link

# 4. Commit changes
git add .pair/
git commit -m "chore: update KB content and fix links"
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
