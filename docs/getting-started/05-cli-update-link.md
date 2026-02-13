# Link Update & Validation Command

Automatically validate, fix, and update links in your installed Knowledge Base content when your project structure changes or links become broken.

## Quick Start

```bash
# Validate and convert all links to relative paths (default)
pair update-link

# Preview changes without modifying files
pair update-link --dry-run

# Convert all links to absolute paths
pair update-link --absolute

# Get detailed logging
pair update-link --log-level debug
```

## Use Cases

### 1. Project Structure Changes

When you move or rename directories:

```bash
# Update KB links after restructuring project
pair update-link

# Check what would change first
pair update-link --dry-run
```

### 2. Repository Migration

After moving your project to a different location:

```bash
# Convert to absolute paths for new location
pair update-link --absolute

# Or normalize to relative paths
pair update-link --relative
```

### 3. Link Validation

Check for broken links in installed KB:

```bash
# Validate and fix broken links
pair update-link --verbose
```

### 4. Path Normalization

Standardize link formats across KB:

```bash
# Convert all to relative paths (default)
pair update-link

# Convert all to absolute paths
pair update-link --absolute
```

## Command Reference

### Basic Syntax

```bash
pair update-link [options]
```

### Options

| Option                | Description                                                                                    | Default          |
| --------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| `--relative`          | Convert all links to relative paths                                                            | Implicit default |
| `--absolute`          | Convert all links to absolute paths                                                            | -                |
| `--dry-run`           | Preview changes without modifying files                                                        | `false`          |
| `--log-level <level>` | Set logging level (trace, debug, info, warn, error). Use `--log-level debug` for detailed logs | `info`           |

### Examples

**Default behavior (relative paths):**

```bash
pair update-link
```

**Explicit relative conversion:**

```bash
pair update-link --relative
```

**Convert to absolute paths:**

```bash
pair update-link --absolute
```

**Preview without changes:**

```bash
pair update-link --dry-run
# or combine with path mode
pair update-link --absolute --dry-run
```

**Detailed logging:**

```bash
pair update-link --verbose
```

## How It Works

### Processing Workflow

1. **Detection**: Locates installed KB content in `.pair/` directory
2. **Validation**: Checks all markdown links against current file system
3. **Fixing**: Repairs broken links where possible
4. **Adjustment**: Updates paths for moved projects
5. **Conversion**: Applies relative/absolute path transformation
6. **Summary**: Reports all changes and remaining issues

### Link Types Supported

- ✅ **Relative paths**: `./docs/file.md`, `../guide.md`
- ✅ **Absolute paths**: `/absolute/path/to/file.md`
- ✅ **External URLs**: `https://example.com` (skipped)
- ✅ **Mailto links**: `mailto:email@example.com` (skipped)
- ✅ **Anchors**: `#section-title` (preserved)

### File Safety

- **Backup**: Automatic backup before modifications (`.pair/backups/`)
- **Atomic writes**: Prevents partial updates
- **Rollback**: Automatic restore on critical errors
- **Dry-run**: Preview changes safely

## Output Format

### Summary Report

```text
📊 Link Update Summary:

✅ Total links processed: 127
📝 Files modified: 23

📂 Links by category:
  • broken → fixed: 5
  • relative → absolute: 45
  • absolute → relative: 67
  • path adjusted: 10

⚠️  Remaining issues:
  File: docs/guide.md (line 42)
  Error: Target file not found: /missing/file.md
```

### Dry-Run Output

```text
🔍 DRY RUN MODE - No files will be modified

[... processing summary ...]

💡 Tip: Remove --dry-run to apply changes
```

## Common Scenarios

### After Installing KB Content

```bash
# Install KB first
pair install

# Then update links for your project structure
pair update-link
```

### Moving Project Directory

```bash
# Project moved from /old/path to /new/path
cd /new/path/to/project

# Update links for new location
pair update-link
```

### Checking Link Health

```bash
# Run dry-run with debug-level logging
pair update-link --dry-run --log-level debug

# Review output for broken links
# Fix issues manually if needed
# Run actual update
pair update-link
```

### Standardizing Link Format

```bash
# Convert mixed link formats to relative
pair update-link --relative

# Or convert to absolute for portability
pair update-link --absolute
```

## Troubleshooting

### "No KB installed" Error

**Problem**: Command reports no Knowledge Base found.

**Solution**:

```bash
# Install KB first
pair install

# Then run update-link
pair update-link
```

### Permission Errors

**Problem**: Cannot write to files.

**Solution**:

```bash
# Check file permissions
ls -la .pair/

# Fix permissions if needed
chmod -R u+w .pair/

# Run command again
pair update-link
```

### Broken Links Remain

**Problem**: Some links still broken after update.

**Solution**:

```bash
# Use verbose mode to see details
pair update-link --verbose

# Check reported errors in output
# Manually fix links that cannot be auto-resolved
# Re-run command
pair update-link
```

### Root Detection Fails

**Problem**: Cannot determine project root.

**Solution**:

```bash
# Ensure you're in a git repository
git rev-parse --show-toplevel

# Or have package.json in root
ls -la package.json

# Or have .pair directory
ls -la .pair/

# Run from project root
cd /path/to/project-root
pair update-link
```

## Integration with Other Commands

### Complete Workflow

```bash
# 1. Install KB content
pair install

# 2. Validate and update links
pair update-link --dry-run

# 3. Apply link updates
pair update-link

# 4. Update KB content to latest version
pair update

# 5. Re-validate links after update
pair update-link
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
- name: Install pair CLI
  run: npm install -g @foomakers/pair-cli

- name: Install KB
  run: pair install

- name: Validate links
  run: pair update-link --dry-run

- name: Update links
  run: pair update-link
```

## Best Practices

1. **Use dry-run first**: Always preview changes with `--dry-run`
2. **Commit before updating**: Create a checkpoint before running
3. **Choose consistent format**: Stick to relative or absolute across project
4. **Run after structural changes**: Update links when moving files/folders
5. **Check verbose output**: Use `--verbose` to understand changes
6. **Validate in CI**: Add link validation to your CI pipeline

## Performance

- **Speed**: Processes 1000+ links in ~30 seconds
- **Memory**: Efficient streaming for large KB installations
- **Safety**: Atomic operations prevent partial updates
- **Scalability**: Handles typical KB installations with 100+ files

## See Also

- [CLI Workflows](./02-cli-workflows.md) - General CLI usage patterns
- [Quickstart Guide](./01-quickstart.md) - Getting started with pair-cli
- [Troubleshooting](./03-troubleshooting.md) - Common issues and solutions
