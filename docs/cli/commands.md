# CLI Commands Reference

Complete reference for all `pair-cli` commands with syntax, options, and examples.

**Quick Navigation:**

- [install](#install) - Install documentation and assets
- [update](#update) - Update existing documentation
- [update-link](#update-link) - Validate and update links
- [package](#package) - Package KB content into ZIP
- [validate-config](#validate-config) - Validate configuration

---

## install

Install documentation and assets from KB source to target folder.

### Usage

```bash
pair install [target]
pair install [registry:target ...]
```

### Arguments

- `[target]` - Optional target directory path (default: current working directory)
- `[registry:target ...]` - Install specific registries to custom targets

### Options

| Option                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `--list-targets`       | List all available asset registries with descriptions  |
| `--config <file>`      | Use custom configuration file (default: `config.json`) |
| `--source <url\|path>` | KB source URL or local path (overrides auto-download)  |
| `--offline`            | Skip KB download, use local source only                |

**KB Source Options:**

- `--source <url>` - Download KB from custom HTTP/HTTPS URL or use local path
- `--offline` - Skip automatic KB download (requires `--source` with local path)

**Note:** Cannot combine `--source <url>` with `--offline`. The `--offline` flag requires `--source` with a local filesystem path.

**Target Resolution:** Registry output is written relative to the current working directory. When running via `pnpm --filter`, the CLI reads `INIT_CWD` (set by pnpm to the original invoking directory) so output lands at the monorepo root, not inside the filtered package directory.

### Examples

**List available registries:**

```bash
pair install --list-targets
```

**Install with defaults:**

```bash
pair install
```

**Install to custom directory:**

```bash
pair install ./my-custom-path
```

**Install specific registries:**

```bash
pair install github:.github knowledge:.pair
```

**Use custom KB source (remote URL):**

```bash
pair install --source https://internal-mirror.company.com/kb.zip
```

**Use custom KB source (local path):**

```bash
pair install --source /absolute/path/to/kb-content
pair install --source ./relative/path/to/kb-content
```

**Offline mode (no KB download):**

```bash
pair install --offline --source ./local-kb-content
```

### Usage Notes

- **KB Source Resolution:** In monorepo mode, uses `packages/knowledge-hub/dataset` by default. In release mode, auto-downloads from GitHub releases unless `--source` or `--offline` specified.
- **Target resolution order:** `INIT_CWD` (pnpm) > `[target]` argument > current working directory.
- **Target validation:** CLI validates target directories before installation and provides clear error messages for common issues.
- **Overwrites existing files:** Use `update` command instead if you want to merge with existing content.

---

## update

Update existing documentation and assets from KB source.

### Usage

```bash
pair update [target]
pair update [registry:target ...]
```

### Arguments

- `[target]` - Optional target directory path (default: current working directory)
- `[registry:target ...]` - Update specific registries in custom targets

### Options

| Option                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `--config <file>`      | Use custom configuration file (default: `config.json`) |
| `--source <url\|path>` | KB source URL or local path (overrides auto-download)  |
| `--offline`            | Skip KB download, use local source only                |

**KB Source Options:**

- `--source <url>` - Download KB from custom HTTP/HTTPS URL or use local path
- `--offline` - Skip automatic KB download (requires `--source` with local path)

**Note:** Cannot combine `--source <url>` with `--offline`. The `--offline` flag requires `--source` with a local filesystem path.

### Examples

**Update with defaults:**

```bash
pair update
```

**Update to custom directory:**

```bash
pair update ./my-custom-path
```

**Update specific registries:**

```bash
pair update github:.github knowledge:.pair
```

**Update from custom KB source (remote URL):**

```bash
pair update --source https://internal-mirror.company.com/kb.zip
```

**Update from local KB source:**

```bash
pair update --source /absolute/path/to/kb-content
```

**Offline update:**

```bash
pair update --offline --source ./local-kb-content
```

### Usage Notes

- **KB Source Resolution:** Same as `install` command - monorepo default or GitHub release auto-download.
- **Target resolution order:** `INIT_CWD` (pnpm) > `[target]` argument > current working directory.
- **Merge behavior:** Updates merge with existing content based on registry behavior configuration (mirror, add, overwrite, skip).
- **Link updates:** Automatically updates internal markdown links after file updates.

---

## update-link

Validate and update internal links in installed KB content.

### Usage

```bash
pair update-link [target]
```

### Arguments

- `[target]` - Target directory to process (default: current directory)

### Options

| Option                | Description                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--url <url\|path>`   | KB source URL or local filesystem path                                                                           |
| `--dry-run`           | Preview changes without writing to files                                                                         |
| `--log-level <level>` | Set logging level for the command (trace, debug, info, warn, error). Use `--log-level debug` for detailed output |

### Examples

**Update links in current directory:**

```bash
pair update-link
```

**Update links in specific directory:**

```bash
pair update-link ./docs
```

**Preview link updates (dry-run):**

```bash
pair update-link --dry-run
```

**Update links with verbose output:**

```bash
pair update-link --verbose
```

**Update links from custom KB source:**

```bash
pair update-link --url https://github.com/org/repo/releases/download/v1.0/kb.zip
pair update-link --url /absolute/path/to/kb
pair update-link --url ./relative/path/to/kb
```

### Usage Notes

- **Link validation:** Validates all markdown internal links and detects broken references.
- **Automatic fix:** Attempts to resolve broken links by searching for target files in the KB.
- **Safe operation:** Dry-run mode allows preview before making changes.
- **Detailed reporting:** Shows statistics on links validated, fixed, and broken.

For detailed usage guide, see [CLI Update Link Guide](../getting-started/05-cli-update-link.md).

---

## package

Package KB content into validated ZIP file for distribution.

### Usage

```bash
pair package [options]
```

### Options

| Option                        | Short             | Description                                                                                                       |
| ----------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--output <path>`             | `-o`              | Output ZIP file path (default: `kb-package.zip`)                                                                  |
| `--source-dir <path>`         | `-s`              | Source directory to package (default: current directory)                                                          |
| `--config <path>`             | `-c`              | Path to config.json file                                                                                          |
| `--name <name>`               |                   | Package name for manifest                                                                                         |
| `--version <version>`         |                   | Package version for manifest                                                                                      |
| `--description <description>` |                   | Package description for manifest                                                                                  |
| `--author <author>`           |                   | Package author for manifest                                                                                       |
| `--log-level <level>`         | `-l, --log-level` | Set logging level for this command (trace, debug, info, warn, error). Use `--log-level debug` for detailed output |

### Examples

**Package current directory:**

```bash
pair package
```

**Package with custom output path:**

```bash
pair package -o dist/kb-v1.0.0.zip
```

**Package specific source directory:**

```bash
pair package -s ./kb-content -o kb.zip
```

**Package with metadata:**

```bash
pair package --name "My KB" --version 1.0.0
```

**Package with all metadata:**

```bash
pair package \
  --name "Company KB" \
  --version "2.1.0" \
  --description "Internal knowledge base" \
  --author "DevOps Team" \
  -o dist/company-kb-v2.1.0.zip
```

**Package with verbose logging:**

```bash
pair package --verbose
```

### Usage Notes

- **Validation:** Validates KB structure before packaging (`.pair` directory required).
- **Manifest:** Creates `manifest.json` with package metadata and timestamp.
- **Output structure:** ZIP includes all KB content, assets, and manifest.
- **Size warnings:** Displays warning if package exceeds 100MB.
- **Exit codes:**
  - `0` - Success
  - `1` - Validation error
  - `2` - Packaging error

---

## validate-config

Validate asset registry configuration file.

### Usage

```bash
pair validate-config [options]
```

### Options

| Option            | Short | Description                                                   |
| ----------------- | ----- | ------------------------------------------------------------- |
| `--config <file>` | `-c`  | Path to config.json file to validate (default: `config.json`) |

### Examples

**Validate default config.json:**

```bash
pair validate-config
```

**Validate custom config file:**

```bash
pair validate-config --config ./my-config.json
```

### Usage Notes

- **Structure validation:** Validates config.json structure and required fields.
- **Registry checks:** Checks asset registry definitions for correctness.
- **Exit codes:**
  - `0` - Configuration valid
  - `1` - Validation errors found
- **Error reporting:** Displays detailed error messages for failed validations.

### What Gets Validated

- Asset registry structure (required fields: `behavior`, `target_path`, `description`)
- Behavior values (must be: `mirror`, `add`, `overwrite`, `skip`)
- Target path validity
- Transform configuration: must be an object with non-empty `prefix` string; incompatible with `symlink` mode
- Source path existence (if specified)
- Include pattern validity (if specified)

---

## Global Options

Options available for all commands:

| Option                | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `--help`              | Display help for command                                                                                |
| `--version`           | Display CLI version                                                                                     |
| `--log-level <level>` | Set global logging level (trace, debug, info, warn, error). Use `--log-level debug` for detailed output |

### Quick Help

Run any command with `--help` to see detailed usage:

```bash
pair install --help
pair update --help
pair package --help
```

---

## Exit Codes

Standard exit codes across all commands:

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| `0`  | Success                                         |
| `1`  | Validation error or command failure             |
| `2`  | Packaging-specific error (package command only) |

---

## Related Documentation

- [Quick Start Guide](../getting-started/01-quickstart.md) - Get started with pair-cli
- [CLI Help Examples](./help-examples.md) - Copy-paste ready command examples
- [KB Source Resolution Spec](../specs/kb-source-resolution.md) - Technical specification for KB source resolution
- [CLI Contracts Spec](../specs/cli-contracts.md) - Technical contracts and validation rules
