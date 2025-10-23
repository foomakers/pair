# pair-cli

CLI for installing, managing, and processing documentation, knowledge base assets, and configuration files for pair assistant.

## Features

- Recursively process markdown files to update internal links after installation
- Overwrite and update existing files safely, ensuring latest version and correct links
- Manage pairing session files and AI assistant config files as assets, with default and configurable folders
- Validate target folder paths and provide clear error messages
- **Discover available installation targets** with `--list-targets` flag for easy setup guidance

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

  github     🔄🎯 .github         GitHub workflows and configuration files
  knowledge  🔄 .pair            Knowledge base and documentation
  adoption   ➕ .pair/product/adopted  Adoption guides and onboarding materials
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

### Main Commands

- `install [target]` - Install documentation and assets
- `update [target]` - Update existing documentation and assets

### Utility Commands

- `validate-config` - Validate asset registry configuration

### Common Options

- `--list-targets` - List available target folders and their descriptions
- `--config <file>` - Use a custom configuration file
- `--help` - Show help for a command

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
      "source": "optional/source/path",
      "behavior": "mirror|add|overwrite|skip",
      "target_path": "target/directory",
      "description": "Description of the registry",
      "include": ["optional", "include", "patterns"]
    }
  },
  "default_target_folders": {
    "registry-name": "default/target/path"
  },
  "folders_to_include": {
    "registry-name": ["folder1", "folder2"]
  }
}
```

### Validation Criteria

The `validate-config` command checks:

- **Asset Registry Structure**: Each registry must have required fields (`behavior`, `target_path`, `description`)
- **Behavior Values**: Must be one of: `mirror`, `add`, `overwrite`, `skip`
- **Path Resolution**: Target paths must be valid and accessible
- **Source Availability**: If specified, source paths must exist
- **Include Patterns**: If specified, must be valid glob patterns

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

- Uses Commander.js for CLI parsing
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
