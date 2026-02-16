# CLI Workflows and Common Use Cases

This guide covers common pair-cli workflows for managing documentation and configuration assets.

**📚 For complete command documentation with all options, see:**

- **[CLI Commands Reference](../cli/commands.md)** - Full command syntax and options
- **[CLI Help Examples](../cli/help-examples.md)** - 20+ copy-paste ready examples

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
```

**Common Scenarios:**

- **After project restructure**: `pair-cli update-link` to fix broken links
- **Link health check**: `pair-cli update-link --dry-run --log-level debug` to inspect

See [Link Update Guide](./05-cli-update-link.md) for comprehensive documentation.

### 6. Package Distribution and Verification

Create and verify KB packages for distribution:

```bash
# Package KB for distribution
pair package --name "My KB" --version "1.0.0" -o dist/kb-v1.0.0.zip

# Verify package integrity before distribution
pair kb-verify dist/kb-v1.0.0.zip

# Verify package with JSON output (CI/CD)
pair kb-verify dist/kb-v1.0.0.zip --json
```

**Complete Distribution Workflow:**

```bash
# 1. Validate KB structure
pair kb validate

# 2. Package KB with metadata
pair package \
  --name "Production KB" \
  --version "2.1.0" \
  --author "DevOps Team" \
  -o dist/kb-prod-v2.1.0.zip

# 3. Verify package integrity
pair kb-verify dist/kb-prod-v2.1.0.zip

# 4. Distribute package (upload to release, internal server, etc.)
# ... distribution steps ...
```

**Verification Before Installation:**

```bash
# Download package
wget https://releases.example.com/kb-v1.0.0.zip

# Verify integrity before installing
pair kb-verify kb-v1.0.0.zip

# If verification passes, install
pair install --source kb-v1.0.0.zip
```

**Common Scenarios:**

- **Pre-distribution check**: Always run `pair kb-verify` before publishing packages
- **Post-download validation**: Verify downloaded packages with `kb-verify` before installation
- **CI/CD integration**: Use `--json` flag for automated verification in pipelines
- **Security audit**: Checksum verification detects tampering or corruption

---

## Quick Command Reference

For complete documentation, see [CLI Commands Reference](../cli/commands.md).

### Most Common Commands

```bash
# Install all assets with defaults
pair install

# Update existing assets
pair update

# Validate and fix KB links
pair update-link

# List available registries
pair install --list-targets

# Validate KB structure and links
pair kb validate

# Validate configuration
pair validate-config

# Package KB for distribution
pair package -o dist/kb.zip

# Verify KB package integrity
pair kb-verify kb-package.zip

# Get help for any command
pair <command> --help
```

For 20+ complete examples, see [CLI Help Examples](../cli/help-examples.md).

---

## Monorepo Usage

When pair-cli is a dependency of a package inside a monorepo, use `pnpm --filter` from the monorepo root:

```bash
# From monorepo root — output lands here, not in apps/pair-cli/
pnpm --filter pair-cli dev update .
```

The CLI reads `INIT_CWD` (set by pnpm to the invoking directory) so registry output targets the monorepo root, not the filtered package directory.

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
