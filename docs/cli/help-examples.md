# CLI Help Examples

Copy-paste ready examples for common `pair-cli` workflows. All examples include expected output as comments.

**Quick Navigation:**

- [Installation Workflows](#installation-workflows)
- [Update Workflows](#update-workflows)
- [Validation Workflows](#validation-workflows)
- [Link Management Workflows](#link-management-workflows)
- [Packaging Workflows](#packaging-workflows)
- [Package Verification Workflows](#package-verification-workflows)
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

### 10. Validate KB Structure and Links

```bash
# Validate KB in current directory
pair kb validate

# Output:
# ✅ KB validation passed
#   Structure: ✓ (3 registries)
#   Links: ✓ (0 broken)
#   Metadata: ✓ (15 skills, 8 adoption files)
```

### 11. Validate with External Link Checking

```bash
# Validate with strict mode (checks external links via HTTP)
pair kb validate --strict

# Output:
# ⚠️  KB validation warnings
#   Structure: ✓
#   Links: 2 warnings (external unreachable)
#   Metadata: ✓
```

### 12. Validate Source Layout

```bash
# Validate KB source layout before install
pair kb validate --layout source

# Useful for validating monorepo dataset before distribution
```

### 13. Validate Excluding Registries

```bash
# Skip specific registries during validation
pair kb validate --skip-registries github,adoption

# Only validates skills registry
```

### 14. Validate Without Config

```bash
# Validate only links and metadata, skip structure checks
pair kb validate --ignore-config

# Useful when config.json is not available
```

### 15. Validate Default Configuration

```bash
# Validate config.json in current directory
pair validate-config

# Output:
# ✅ Configuration is valid!
# Found 3 asset registries
```

### 16. Validate Custom Configuration

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

### 17. Validate and Fix Links

```bash
# Update links in current directory
pair update-link

# Output:
# 🔍 Scanning .pair for markdown files...
# ✅ Validated 156 files, 1,243 links
# ✅ Fixed 12 broken links
# ⚠️  3 broken links remaining (targets not found)
```

### 18. Preview Link Updates (Dry Run)

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

### 19. Update Links with Verbose Output

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

### 20. Package KB for Distribution

```bash
# Package current directory with defaults
pair package

# Output:
# 📦 Validating KB structure...
# ✅ Validation passed
# 📦 Creating package...
# ✅ Package created: kb-package.zip (24.5 MB)
```

### 21. Package with Custom Output Path

```bash
# Package to specific location with version in filename
pair package -o dist/kb-v1.2.0.zip

# Output:
# 📦 Validating KB structure...
# ✅ Validation passed
# 📦 Creating package...
# ✅ Package created: dist/kb-v1.2.0.zip (24.5 MB)
```

### 22. Package with Metadata

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

### 23. Package Specific Source Directory

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

### 24. Package Excluding Registries

```bash
# Package only skills registry, exclude others
pair package --skip-registries adoption,github

# Output:
# 📦 Validating KB structure...
# ⚠️  Skipping registries: adoption, github
# ✅ Validation passed (1 registry)
# 📦 Creating package...
# ✅ Package created: kb-package.zip (8.2 MB)
```

### 25. Package with Custom Link Root

```bash
# Package with custom root for link relativization
pair package --root .custom/root/ -o custom-kb.zip

# Links will be relativized from .custom/root/ instead of .pair/
```

---

## Package Verification Workflows

### 26. Verify Package Integrity

```bash
# Verify package with human-readable output
pair kb-verify kb-package.zip

# Output:
# ✅ Package verification passed
#   Checksum: ✓ (SHA-256 valid)
#   Structure: ✓ (3 registries found)
#   Manifest: ✓ (all required fields present)
#   Size: 24.5 MB
```

### 27. Verify Package with JSON Output

```bash
# Verify with JSON output for CI/CD integration
pair kb-verify dist/kb-v1.2.0.zip --json

# Output:
# {
#   "valid": true,
#   "checks": {
#     "checksum": { "passed": true, "value": "10440ed8..." },
#     "structure": { "passed": true, "registries": ["github", "knowledge", "adoption"] },
#     "manifest": { "passed": true, "name": "Knowledge Base", "version": "1.2.0" }
#   },
#   "size": 25690112,
#   "timestamp": "2026-02-16T19:15:30.123Z"
# }
```

### 28. Verify Before Installation

```bash
# Complete workflow: verify then install
pair kb-verify downloaded-kb.zip && pair install --source downloaded-kb.zip

# Output:
# ✅ Package verification passed
#   Checksum: ✓
#   Structure: ✓
#   Manifest: ✓
# ✅ Using local KB source: downloaded-kb.zip
# ✅ Installed github → .github (12 files)
# ✅ Installed knowledge → .pair (156 files)
```

### 29. Verify with Debug Logging

```bash
# Verify with detailed debug information
pair kb-verify kb-package.zip --log-level debug

# Output:
# [DEBUG] Extracting package manifest...
# [DEBUG] Reading manifest.json
# [DEBUG] Calculating content checksum...
# [DEBUG] Validating registry structure...
# [DEBUG] Checking registry: github
# [DEBUG] Checking registry: knowledge
# [DEBUG] Checking registry: adoption
# ✅ Package verification passed
#   Checksum: ✓ (10440ed8...)
#   Structure: ✓ (3 registries found)
#   Manifest: ✓ (all required fields present)
```

### 30. Detect Corrupted Package

```bash
# Attempt to verify corrupted package
pair kb-verify corrupted-kb.zip

# Output:
# ❌ Package verification failed
#   Checksum: ✗ (mismatch detected)
#     Expected: 10440ed8ddbad6211ef9063c85529dbefe191eb7757669c9777b35e13a1ad6db
#     Got:      944a04fea544f005b2f1060d5d9d78beb8808d53d609a20bbed148ae84ae1ee2
#   Structure: not checked (checksum failed)
#   Manifest: not checked (checksum failed)
#
# Exit code: 1
# 💡 Package may be corrupted or tampered with - do not install
```

---

## Advanced Workflows

### 31. Complete CI/CD Pipeline Example

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

# Step 5: Verify package integrity
echo "Verifying package integrity..."
pair kb-verify dist/kb-production-v1.2.0.zip || exit 1

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
# Verifying package integrity...
# ✅ Package verification passed
#   Checksum: ✓
#   Structure: ✓
#   Manifest: ✓
# ✅ Pipeline complete!
```

### 32. Air-Gapped Environment Workflow

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

### 33. Multi-Environment Setup

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
