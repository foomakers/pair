# pair-cli

CLI for installing, managing, and processing documentation, knowledge base assets, and configuration files for pair assistant.

## Features

- Recursively process markdown files to update internal links after installation
- Overwrite and update existing files safely, ensuring latest version and correct links
- Manage pairing session files and AI assistant config files as assets, with default and configurable folders
- Validate target folder paths and provide clear error messages
- **Discover available installation targets** with `--list-targets` flag for easy setup guidance
- **Automatic KB download** from GitHub releases with progress tracking and resume support
- **Custom KB sources** via `--url` flag for air-gapped or custom installations
- **Skip KB download** with `--no-kb` flag when KB is already available locally
- **Integrity verification** with SHA256 checksum validation
- **User-friendly errors** with actionable suggestions for common failures

## Installation

### Global Install (recommended)

Makes `pair-cli` available on your PATH:

```bash
# npm
npm install -g @foomakers/pair-cli

# pnpm
pnpm add -g @foomakers/pair-cli
```

### Local Install (project scope)

Useful for CI or when you want the tool locked to a project:

```bash
pnpm add -D @foomakers/pair-cli
# run with npx or pnpm dlx
npx pair-cli install ./dataset
```

### Manual Install (offline/air-gapped)

For environments without internet access or when you need a self-contained version:

1. **Download** the latest `pair-cli-manual-vX.Y.Z.zip` from [GitHub Releases](https://github.com/foomakers/pair/releases)
2. **Extract** to your desired location
3. **Execute** directly (no installation required):

   ```bash
   # Unix/Linux/macOS
   ./pair-cli --help

   # Windows
   pair-cli.cmd --help
   ```

   The manual artifact is completely self-contained and includes:
   - All dependencies bundled in a single JavaScript file
   - Cross-platform executables
   - TypeScript definitions
   - Knowledge base dataset
   - Configuration files

## Quick Start

Get started quickly: [Quick Start Guide](../../docs/getting-started/01-quickstart.md)

### List available asset registries

```bash
pair-cli install --list-targets
```

Sample output:

```
📁 Available asset registries:

  github     🔄🎯 .github              GitHub workflows and configuration files
  knowledge  🔄 .pair/knowledge         Knowledge base and documentation
  adoption   ➕ .pair/adoption           Adoption guides and onboarding materials
  skills     🔄 .claude/skills/ (+2)    Agent skills distributed to AI tool directories
```

### Install using defaults

```bash
pair-cli install
```

This will populate the configured target folders (e.g., `.github`, `.pair`, etc.).

### Install to custom location

```bash
pair-cli install ./.pair_custom
```

### Update existing installation

```bash
pair-cli update
```

## Commands

| Command                 | Description                                       | Reference                                                   |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `install [target]`      | Install documentation and assets to target folder | [CLI Reference](../../docs/cli/commands.md#install)         |
| `update [target]`       | Update existing documentation and assets          | [CLI Reference](../../docs/cli/commands.md#update)          |
| `update-link [options]` | Validate and update links in installed KB content | [CLI Reference](../../docs/cli/commands.md#update-link)     |
| `package [options]`     | Package KB content into distributable ZIP file    | [CLI Reference](../../docs/cli/commands.md#package)         |
| `validate-config`       | Validate asset registry configuration             | [CLI Reference](../../docs/cli/commands.md#validate-config) |

**Quick Help**: Run `pair-cli <command> --help` for detailed syntax, options, and examples.

**Full Documentation**: See [CLI Commands Reference](../../docs/cli/commands.md) for complete usage guide with examples.

## KB Installation Features

The CLI automatically downloads and installs the Knowledge Base from GitHub releases when needed. Key features include:

### Automatic Download with Progress

- Downloads latest KB version automatically on first use
- Shows real-time progress bar with speed (TTY mode)
- Falls back to simple progress updates (non-TTY environments)
- Caches downloads in `~/.pair/kb/{version}/` for reuse

### Custom KB Sources

Use the `--url` flag to download KB from custom sources:

```bash
# Use custom mirror or internal server
pair install --url https://internal-mirror.company.com/kb.zip

# Use specific GitHub release
pair install --url https://github.com/org/repo/releases/download/v1.0.0/kb.zip
```

### Skip KB Download

When KB is already available locally (e.g., from manual install):

```bash
pair install --no-kb
```

**Note**: Cannot combine `--url` and `--no-kb` - use one or the other.

### Resume Support

Interrupted downloads automatically resume from where they left off:

- Partial downloads saved with `.partial` extension
- HTTP Range requests used to continue download
- Automatic cleanup on successful completion

### Integrity Verification

Downloads are verified using SHA256 checksums when available:

- Fetches `.sha256` file from same location as KB
- Validates file integrity before extraction
- Clear error messages if checksum mismatch detected
- Gracefully skips validation if checksum file not found (404)

### Enhanced Error Messages

All download and installation errors include:

- **Clear problem description** (network timeout, disk full, etc.)
- **Actionable suggestions** (check internet, free disk space, etc.)
- **Diagnostic hints** (use `PAIR_DIAG=1` for detailed logs)

Common error scenarios covered:

- Network failures (connection refused, timeout, DNS errors)
- File system errors (permissions, disk space)
- Download errors (404, 403, checksum mismatch)
- Extraction errors (corrupted files)

## Internal module responsibilities (KB installation)

The KB installation logic is split across small focused modules to improve testability and maintenance:

- `kb-availability` (orchestration): decides when to download, validates cache, and delegates install/extract to the installer. The public API for callers is exported from the `kb-manager` index (which re-exports cache helpers from `cache-manager`).
- `download-manager` (HTTP + streaming): low-level download implementation handling redirects, progress reporting, streaming writes, and retry/error translation.
- `resume-manager` (resume support): manages partial download files, HTTP Range logic, and finalization of resumed downloads.

This separation lets the CLI orchestrator remain simple while HTTP and resume logic are unit-tested independently.

## Asset Registry Behaviors

The CLI supports different behaviors for how files are copied:

- 🔄 **Mirror**: Synchronizes the entire folder (copies everything, overwrites existing files)
- ➕ **Add**: Adds files without overwriting existing ones
- 🎯 **Selective**: Mirror only specific folders (when configured with `include`)

## Configuration Structure

The CLI uses a JSON configuration file to define asset registries. Here's the structure:

```json
{
  "asset_registries": {
    "registry-name": {
      "source": "source/path",
      "behavior": "mirror|add|overwrite|skip",
      "description": "Description of the registry",
      "include": ["optional", "include", "patterns"],
      "flatten": false,
      "prefix": "optional-prefix",
      "targets": [
        { "path": "target/directory", "mode": "canonical" },
        { "path": "secondary/directory", "mode": "symlink" }
      ]
    }
  }
}
```

Each registry declares one or more **targets**. Exactly one target must have `mode: "canonical"` (the primary copy destination). Additional targets can use `mode: "symlink"` or `mode: "copy"` to distribute content to multiple locations after the canonical copy completes.

When `flatten` is `true`, directory hierarchies are collapsed into hyphen-separated names (e.g., `navigator/next` → `navigator-next`). When `prefix` is set, it is prepended to top-level directory names (e.g., `navigator-next` → `pair-navigator-next`).

### Validation Criteria

The `validate-config` command checks:

- **Asset Registry Structure**: Each registry must have required fields (`source`, `behavior`, `description`, `targets`)
- **Behavior Values**: Must be one of: `mirror`, `add`, `overwrite`, `skip`
- **Target Configuration**: Exactly one target with `mode: "canonical"`; no duplicate canonical paths across registries
- **Symlink Restrictions**: Symlink targets are rejected on Windows
- **Source Availability**: Source paths must exist in the dataset
- **Include Patterns**: If specified, must be valid folder paths

## Usage Examples

### Install specific registries to custom targets

```bash
pair-cli install github:./dataset knowledge:./dataset
```

### Update only GitHub assets

```bash
pair-cli update github:.github
```

### Use custom configuration

```bash
pair-cli install --config ./my-config.json
```

### Validate configuration

```bash
pair-cli validate-config
```

### Package KB content

Create a validated ZIP package of your KB content for distribution:

```bash
# Package with defaults (output to ./dist/kb-package-{timestamp}.zip)
pair package

# Package to custom location
pair package --output custom/path/output.zip

# Package with metadata
pair package --name "My KB" --version "1.0.0" --author "Team Name"

# Package with debug-level progress output
pair package --log-level debug
```

The `package` command:

- Validates `.pair/` structure against `config.json` registries
- Creates ZIP archive with `manifest.json` metadata
- Displays file size and warns if >100MB
- Exit codes: 0 (success), 1 (validation error), 2 (packaging error)

- **Common Options** - Shared flags across commands
- **Help and Examples** - Built-in usage documentation

For detailed usage of the link update command, see [CLI Update Link Guide](../../docs/getting-started/05-cli-update-link.md).

## Troubleshooting

- **"Unable to resolve @pair/knowledge-hub"**: Run `pnpm install` from the repo root and confirm `packages/knowledge-hub/package.json` exists
- **`install` reports `target-not-empty`**: Use `update` for merges or clear the target folder before running `install`
- **Configuration errors**: Run `pair-cli validate-config` to check your configuration file

## Support & FAQ

Having installation or setup issues? We have comprehensive support resources:

- **[Installation FAQ](../../docs/support/installation-faq.md)** - Solutions for common install problems (permissions, Node version conflicts, pnpm issues, offline installs)
- **[Support Resources](../../docs/support/index.md)** - Complete support guide with escalation paths and contact information
- **[Diagnostic Script](../../scripts/diagnose-install.sh)** - Automated environment diagnostics (`bash scripts/diagnose-install.sh`)

**Quick diagnostic check:**

```bash
# Get your environment info for troubleshooting
bash scripts/diagnose-install.sh
```

The FAQ covers 80%+ of installation issues including permission errors, Node.js version conflicts, network restrictions, and corrupted installs.

## For Developers

### Codebase Structure

The CLI is organized as a monorepo with the following structure:

```
apps/pair-cli/           # Main CLI application
├── src/
│   ├── cli.ts          # Main CLI entry point using Commander.js
│   ├── index.ts        # Package exports (currently only version)
│   ├── config-utils.ts # Configuration loading and validation
│   └── commands/       # Command implementations
│       ├── install.ts  # Install command logic
│       ├── update.ts   # Update command logic
│       └── command-utils.ts # Shared utilities
├── test-utils/         # Testing helpers
├── config.json         # Default configuration
└── package.json        # Package configuration

packages/
├── knowledge-hub/      # Asset source package
├── content-ops/        # File system operations library
```

### Development Setup

1. **Install dependencies** from repo root:

   ```bash
   pnpm install
   ```

2. **Run CLI in development mode**:

   ```bash
   pnpm --filter @pair/pair-cli dev install ./dataset
   ```

3. **Run tests**:

   ```bash
   pnpm -w test
   ```

4. **Lint and format**:
   ```bash
   pnpm -w lint
   pnpm -w format
   ```

### Key Concepts

- **Asset Registries**: Named collections of files with specific copy behaviors
- **Behaviors**: How files are copied (`mirror`, `add`, `overwrite`, `skip`)
- **File System Service**: Abstract interface for file operations (allows in-memory testing)
- **Configuration**: JSON-based configuration for registries and targets
- **Validation**: Runtime checks for configuration and target validity

### Architecture Notes

**Command Flow (Parser → Dispatcher → Handler)**:

```
CLI Options → Parser → CommandConfig → Dispatcher → Handler → Actions
```

1. **Parser**: Validates and transforms CLI options into typed `CommandConfig`
2. **Dispatcher**: Routes `CommandConfig` to appropriate handler (type-safe switch)
3. **Handler**: Orchestrates command execution logic
4. **Actions**: Performs actual file operations

**Adding New Commands**:

1. Create `commands/<command-name>/` folder
2. Add `parser.ts` with `parse<Command>Command()` and types
3. Add `handler.ts` with `handle<Command>Command()`
4. Add `metadata.ts` with Commander.js help text
5. Register in `commands/index.ts` commandRegistry
6. Tests auto-discovered, metadata drives CLI setup

**Key Design Principles**:

- **Type Safety**: Discriminated unions for CommandConfig prevent runtime errors
- **Single Source of Truth**: commandRegistry centralizes parse/handle/metadata
- **Testability**: In-memory FileSystemService, pure parser functions
- **DRY**: Metadata-driven CLI setup eliminates duplication
- Abstract FileSystemService enables testing with in-memory filesystem
- Structured logging with LogEntry objects
- TypeScript throughout for type safety
- Modular command structure for maintainability

### Contributing

When contributing:

1. Add unit tests for new behaviors
2. Update configuration validation if adding new fields
3. Follow existing patterns for error handling and logging
4. Test both success and failure scenarios
5. Update this README if adding new commands or features

The CLI is designed to be extensible - new commands can be added by creating new files in the `commands/` directory and registering them in `cli.ts`.
