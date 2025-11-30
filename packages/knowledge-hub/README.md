## Purpose

This package is the "Knowledge Hub" for the monorepo: it holds documentation, operational guidelines, templates, adoption notes, and other static assets used by the team and by CLI tools in the project.

For details about the documentation layout and how to get started, see [dataset/knowledge/getting-started.md](dataset/knowledge/getting-started.md).

## Contents

- [dataset/](dataset/) — All repository documentation (.pair, knowledge, how-to, guidelines, etc.)
- [src/](src/) — Utility scripts used to manage documentation (e.g. link checks, move dataset) and unit tests
- [src/test-utils/](src/test-utils/) — Mocks and helpers used in tests (in-memory FS, etc.)

## Primary use cases

- Validate and normalize Markdown links across the documentation
- Move/rename documentation pages or folders while updating internal links
- Package .pair/ folder into distributable ZIP with manifest (via CLI)
- Provide a shared set of assets and templates for the repository

## Scripts / Commands

Scripts defined in [package.json](package.json) are intended for local operations on this package:

- `pnpm --filter @pair/knowledge-hub test` — run package tests (Vitest)
- `pnpm --filter @pair/knowledge-hub test:coverage` — run tests with coverage report
- `pnpm --filter @pair/knowledge-hub prettier:fix` — format files using the shared Prettier config
- `pnpm --filter @pair/knowledge-hub prettier:check` — check formatting
- `pnpm --filter @pair/knowledge-hub lint` — run linter (shared ESLint config)
- `pnpm --filter @pair/knowledge-hub lint:fix` — attempt to auto-fix lint issues

Package-specific helper scripts:

- `pnpm --filter @pair/knowledge-hub run check:links` — runs [src/check-broken-links.ts](src/check-broken-links.ts):

  - scans Markdown files under `dataset/`
  - normalizes relative and top-folder links when possible
  - attempts to auto-correct some broken references
  - writes an `errors.txt` file when unresolved problems are found

-- `pnpm --filter @pair/knowledge-hub run transfer:dataset` — runs [src/transfer-dataset.ts](src/transfer-dataset.ts):

- move folders or files inside `dataset/`
- update Markdown links that point to moved resources
- useful for manual refactors of the documentation tree

**CLI Commands** (via @pair/pair-cli):

- `pair kb package` — package .pair/ folder into ZIP with manifest:
  - Creates distributable knowledge base package
  - Generates manifest.json with version, file list, checksums
  - Validates .pair/ structure and config.json
  - Displays package size and file count
  - Exit codes: 0 (success), 1 (validation error), 2 (packaging error)
  - See [CLI documentation](../../apps/pair-cli/README.md#kb-package-options) for details

## Quick examples

Run the link checker locally:

```bash
pnpm --filter @pair/knowledge-hub run check:links
```

Move a folder `foo` into `bar/baz` (example usage of the move script):

```bash
pnpm --filter @pair/knowledge-hub run transfer:dataset -- foo bar/baz
```

Package the knowledge base (from a repo with .pair/ installed):

```bash
pair kb package
pair kb package --output custom-package.zip
pair kb package --verbose
```

Note: `check:links` and `transfer:dataset` are TypeScript scripts invoked with `ts-node` in the package context.

## Move/Copy options and behaviors

The move script accepts an optional `options` argument (JSON string or path to JSON file) which allows configuring per-folder behavior. The options object follows the `MoveOptions` shape:

{
"defaultBehavior": "overwrite" | "add" | "mirror",
"folderBehavior": { "path": "overwrite" | "add" | "mirror" }
}

Key behaviors:

- `overwrite`: destination files will be replaced by source files.
- `add`: existing destination files are preserved (source files are skipped when destination exists).
- `mirror`: destination folder is synchronized with the source (extraneous files in destination are removed).

Examples:

1. Pass options as a JSON string:

```bash
pnpm --filter @pair/knowledge-hub run transfer:dataset -- foo bar '{"defaultBehavior":"add","folderBehavior":{"" : "add"}}'
```

2. Pass options from a file:

```bash
pnpm --filter @pair/knowledge-hub run transfer:dataset -- foo bar ./scripts/move-options.json
```

When using `mirror`, ensure that any declared `mirror` parent folders have all descendants also set to `mirror` — otherwise validation will throw.

## For Developers

### Package Structure

```
src/
├── check-broken-links.ts    # Link validation script
├── transfer-dataset.ts      # Dataset transfer/move script
└── test-utils/              # Testing utilities (shared with content-ops)

dataset/                     # Documentation and assets
├── knowledge/               # Knowledge base content
├── adoption/                # Adoption guides
└── ...                      # Other documentation folders
```

### Development Setup

1. **Run tests**:

   ```bash
   pnpm --filter @pair/knowledge-hub test
   ```

2. **Run with coverage**:

   ```bash
   pnpm --filter @pair/knowledge-hub test:coverage
   ```

3. **Check links**:

   ```bash
   pnpm --filter @pair/knowledge-hub run check:links
   ```

4. **Transfer dataset**:
   ```bash
   pnpm --filter @pair/knowledge-hub run transfer:dataset -- source target
   ```

### Key Scripts

- **check-broken-links.ts**: Validates and normalizes Markdown links across the dataset
- **transfer-dataset.ts**: Moves/renames folders while updating internal links

Both scripts use the `FileSystemService` abstraction from `@pair/content-ops` for consistent file operations.

## Notes for maintainers

- Prefer the `FileSystemService` abstraction and the mocks in [src/test-utils](src/test-utils/) when writing tests.
- If you change script behavior or signatures, update the unit tests under [src/](src/) accordingly.
- Refer to [dataset/knowledge/getting-started.md](dataset/knowledge/getting-started.md) for operational conventions and onboarding steps.
