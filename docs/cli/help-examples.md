# CLI Help Examples

Copy-paste ready examples for common `pair-cli` workflows. All examples include expected output as comments.

**Quick Navigation:**

- [Installation Workflows](#installation-workflows)
- [Update Workflows](#update-workflows)
- [Validation Workflows](#validation-workflows)
- [Link Management Workflows](#link-management-workflows)
- [Packaging Workflows](#packaging-workflows)
- [Advanced Workflows](#advanced-workflows)

---

## Installation Workflows

### 1. First-time Setup (Discover and Install)

```bash
# Step 1: Discover available registries
pair install --list-targets

# Output:
# 📁 Available asset registries:
#   github     🔄🎯 .github         GitHub workflows and configuration files
#   knowledge  🔄 .pair            Knowledge base and documentation
#   adoption   ➕ .pair/product/adopted  Adoption guides and onboarding materials

# Step 2: Install with defaults
pair install

# Output:
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)
# ✅ Installed adoption → .pair/product/adopted (8 files)
```

### 2. Install to Custom Directory

```bash
# Install all registries to custom location
pair install ./custom-docs

# Output:
# ✅ Installed github → ./custom-docs/.github (12 files)
# ✅ Installed knowledge → ./custom-docs/.pair (156 files)
```

### 3. Install Specific Registries Only

```bash
# Install only GitHub workflows
pair install github:.github

# Output:
# ✅ Installed github → .github (12 files)

# Install multiple specific registries
pair install github:.github knowledge:.pair

# Output:
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)
```

### 4. Install from Custom KB Source (Remote)

```bash
# Use internal mirror instead of GitHub releases
pair install --source https://internal-mirror.company.com/kb-v1.2.0.zip

# Output:
# 📥 Downloading KB from https://internal-mirror.company.com/kb-v1.2.0.zip
# ⏬ [████████████████████████████████] 100% | 15.2 MB/s
# ✅ KB downloaded and validated
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)
```

### 5. Install from Local KB Source

```bash
# Use absolute path to local KB
pair install --source /home/user/kb-content

# Output:
# ✅ Using local KB source: /home/user/kb-content
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)

# Use relative path to local KB
pair install --source ./local-kb

# Output:
# ✅ Using local KB source: /Users/dev/project/local-kb
# ✅ Installed github → .github (12 files)
```

### 6. Offline Installation (Air-Gapped Environment)

```bash
# Offline mode requires --source with local path
pair install --offline --source ./kb-content

# Output:
# ✅ Offline mode: using local KB at ./kb-content
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)

# Error if --offline without --source
pair install --offline
# ❌ Error: --offline requires --source with local filesystem path
```

---

## Update Workflows

### 7. Update Existing Installation

```bash
# Update all registries with defaults
pair update

# Output:
# ✅ Updated github → .github (3 files changed, 9 unchanged)
# ✅ Updated knowledge → .pair (42 files changed, 114 unchanged)
# ✅ Updated adoption → .pair/product/adopted (1 file changed, 7 unchanged)
```

### 8. Update Specific Registry

```bash
# Update only knowledge base
pair update knowledge:.pair

# Output:
# ✅ Updated knowledge → .pair (42 files changed, 114 unchanged)
```

### 9. Update from Custom Source

```bash
# Update from specific GitHub release
pair update --source https://github.com/org/repo/releases/download/v2.0.0/kb.zip

# Output:
# 📥 Downloading KB from GitHub release v2.0.0
# ✅ KB downloaded and validated
# ✅ Updated github → .github (5 files changed)
# ✅ Updated knowledge → .pair (28 files changed)
```

---

## Validation Workflows

### 10. Validate Default Configuration

```bash
# Validate config.json in current directory
pair validate-config

# Output:
# ✅ Configuration is valid!
# Found 3 asset registries
```

### 11. Validate Custom Configuration

```bash
# Validate custom config file
pair validate-config --config ./custom-config.json

# Output:
# ✅ Configuration is valid!
# Found 5 asset registries

# Example validation error output
pair validate-config --config ./broken-config.json

# Output:
# ❌ Configuration has errors:
#   • Asset registry 'github': missing required field 'behavior'
#   • Asset registry 'knowledge': invalid behavior value 'sync' (must be: mirror, add, overwrite, skip)
#   • Asset registry 'docs': target_path '/invalid/path' is not accessible
```

---

## Link Management Workflows

### 12. Validate and Fix Links

```bash
# Update links in current directory
pair update-link

# Output:
# 🔍 Scanning .pair for markdown files...
# ✅ Validated 156 files, 1,243 links
# ✅ Fixed 12 broken links
# ⚠️  3 broken links remaining (targets not found)
```

### 13. Preview Link Updates (Dry Run)

```bash
# Preview changes without writing
pair update-link --dry-run

# Output:
# 🔍 Scanning .pair for markdown files...
# 📝 DRY RUN - No files will be modified
#
# Would fix:
#   .pair/tech/architecture.md
#     - ../old-path/doc.md → ../knowledge-base/doc.md
#   .pair/how-to/guide.md
#     - ./missing.md → ./guides/missing.md
#
# ✅ 2 links would be fixed
```

### 14. Update Links with Verbose Output

```bash
# Show detailed processing information
pair update-link --verbose

# Output:
# 🔍 Scanning .pair for markdown files...
# Processing: .pair/tech/architecture.md
#   - Found 23 links
#   - Fixed: ../old-path/doc.md → ../knowledge-base/doc.md
# Processing: .pair/how-to/guide.md
#   - Found 15 links
#   - All links valid
# ...
# ✅ Validated 156 files, 1,243 links
# ✅ Fixed 12 broken links
```

---

## Packaging Workflows

### 15. Package KB for Distribution

```bash
# Package current directory with defaults
pair package

# Output:
# 📦 Validating KB structure...
# ✅ Validation passed
# 📦 Creating package...
# ✅ Package created: kb-package.zip (24.5 MB)
```

### 16. Package with Custom Output Path

```bash
# Package to specific location with version in filename
pair package -o dist/kb-v1.2.0.zip

# Output:
# 📦 Validating KB structure...
# ✅ Validation passed
# 📦 Creating package...
# ✅ Package created: dist/kb-v1.2.0.zip (24.5 MB)
```

### 17. Package with Metadata

```bash
# Package with complete metadata
pair package \
  --name "Company Knowledge Base" \
  --version "1.2.0" \
  --description "Internal documentation and guides" \
  --author "DevOps Team" \
  -o dist/company-kb-v1.2.0.zip

# Output:
# 📦 Validating KB structure...
# ✅ Validation passed
# 📦 Creating package: Company Knowledge Base v1.2.0
# 📦 Author: DevOps Team
# ✅ Package created: dist/company-kb-v1.2.0.zip (24.5 MB)
```

### 18. Package Specific Source Directory

```bash
# Package KB from different location
pair package -s ./kb-content -o kb.zip --log-level debug

# Output:
# 📦 Source directory: ./kb-content
# 📦 Validating KB structure...
# ✅ Found .pair directory
# ✅ Found config.json
# ✅ Validation passed
# 📦 Creating package...
#   - Adding: .pair/tech/architecture.md
#   - Adding: .pair/how-to/guide.md
#   - ... (156 files total)
# ✅ Package created: dist/kb.zip (24.5 MB)
```

---

## Advanced Workflows

### 19. Complete CI/CD Pipeline Example

```bash
#!/bin/bash
# CI/CD script for KB installation and validation

# Step 1: Validate configuration
echo "Validating configuration..."
pair validate-config || exit 1

# Step 2: Install KB from specific release
echo "Installing KB v1.2.0..."
pair install --source https://github.com/org/repo/releases/download/v1.2.0/kb.zip || exit 1

# Step 3: Validate and fix links
echo "Validating links..."
pair update-link || exit 1

# Step 4: Package for distribution
echo "Creating distribution package..."
pair package \
  --name "Production KB" \
  --version "1.2.0" \
  --author "CI/CD Pipeline" \
  -o dist/kb-production-v1.2.0.zip || exit 1

echo "✅ Pipeline complete!"

# Expected output:
# Validating configuration...
# ✅ Configuration is valid!
# Installing KB v1.2.0...
# 📥 Downloading KB from GitHub release v1.2.0
# ✅ KB downloaded and validated
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)
# Validating links...
# ✅ Validated 156 files, 1,243 links
# Creating distribution package...
# ✅ Package created: dist/kb-production-v1.2.0.zip (24.5 MB)
# ✅ Pipeline complete!
```

### 20. Air-Gapped Environment Workflow

```bash
# Step 1: On internet-connected machine
# Download KB manually from GitHub releases
wget https://github.com/org/repo/releases/download/v1.2.0/kb.zip

# Step 2: Transfer kb.zip to air-gapped machine
# (via USB, secure file transfer, etc.)

# Step 3: On air-gapped machine
# Extract KB
unzip kb.zip -d ./kb-content

# Install from local source in offline mode
pair install --offline --source ./kb-content

# Expected output:
# ✅ Offline mode: using local KB at ./kb-content
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)
```

### 21. Multi-Environment Setup

```bash
# Development environment (use latest from main)
pair install --source https://github.com/org/repo/archive/main.zip

# Staging environment (use release candidate)
pair install --source https://github.com/org/repo/releases/download/v1.3.0-rc.1/kb.zip

# Production environment (use stable release)
pair install --source https://github.com/org/repo/releases/download/v1.2.0/kb.zip
```

---

## Troubleshooting Examples

### Common Error Scenarios

**Network timeout:**

```bash
pair install --source https://slow-mirror.example.com/kb.zip

# Output:
# 📥 Downloading KB from https://slow-mirror.example.com/kb.zip
# ❌ Download failed: Network timeout after 30s
# 💡 Suggestion: Check internet connection or try different mirror
# 💡 Use PAIR_DIAG=1 for detailed logs
```

**Checksum mismatch:**

```bash
pair install --source https://example.com/corrupted-kb.zip

# Output:
# 📥 Downloading KB from https://example.com/corrupted-kb.zip
# ⏬ [████████████████████████████████] 100%
# ❌ Checksum validation failed
# 💡 Downloaded file may be corrupted - please retry download
```

**Invalid --offline usage:**

```bash
pair install --offline --source https://example.com/kb.zip

# Output:
# ❌ Error: Cannot use --offline with remote URL
# 💡 --offline requires --source with local filesystem path
# Example: pair install --offline --source ./local-kb
```

---

## Related Documentation

- [CLI Commands Reference](./commands.md) - Complete command documentation
- [Quick Start Guide](../getting-started/01-quickstart.md) - Get started with pair-cli
- [CLI Update Link Guide](../getting-started/05-cli-update-link.md) - Detailed link update workflow
- [KB Source Resolution Spec](../specs/kb-source-resolution.md) - Technical specification
