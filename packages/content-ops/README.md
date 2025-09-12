## @pair/content-ops

Shared utilities for document operations used across the monorepo. This package contains helpers to copy/move files and folders and to update internal Markdown links.

Use this package from other workspaces (for example `@pair/knowledge-hub` and `@pair/pair-cli`) to avoid duplication of file/link primitives.

Scripts are aligned with other packages in the monorepo (prettier, lint, vitest).

See `src/` for implementation and tests.

## Usage & API notes

Important helpers exported from this package:

- `movePathOps(fileService, source, target, datasetRoot, options?)`
- `copyPathOps(fileService, source, target, datasetRoot, options?)`
- `validatePathOps(fileService, config)`

Move/Copy options shape (`SyncOptions`):

{
defaultBehavior?: 'overwrite' | 'add' | 'mirror',
folderBehavior?: Record<string, 'overwrite' | 'add' | 'mirror'>
}

Behavior semantics:

- `overwrite` (default): copied/moved files replace existing targets.
- `add`: existing files in destination are preserved (skipped).
- `mirror`: destination folder is synchronized to match the source (extraneous files removed).

Folder behavior rules are resolved by path (exact match or ancestor match). If a folder is declared `mirror`, all its descendants must also be `mirror` (validation will throw otherwise).

## Package Structure

```
src/
├── index.ts                 # Main exports
├── observability.ts         # Logging and monitoring utilities
├── file-system/             # File system abstractions
│   ├── index.ts
│   ├── file-operations.ts   # Basic file operations
│   ├── file-system-service.ts # Service interface
│   ├── file-system-utils.ts # Utility functions
│   └── file-validations.ts  # Path validation helpers
├── markdown/                # Markdown processing
│   ├── index.ts
│   ├── link-processor.ts    # Link processing logic
│   ├── markdown-parser.ts   # Markdown parsing
│   ├── path-resolution.ts   # Path resolution utilities
│   └── replacement-applier.ts # Link replacement logic
├── ops/                     # Core operations
│   ├── SyncOptions.ts       # Options type definitions
│   ├── behavior.ts          # Behavior logic
│   ├── copyPathOps.ts       # Copy operations
│   ├── movePathOps.ts       # Move operations
│   ├── validatePathOps.ts   # Validation operations
│   └── link-batch-processor.ts # Batch link processing
└── test-utils/              # Testing utilities
    └── in-memory-fs.ts      # In-memory filesystem for tests
```

## Testing

Tests use a `FileSystemService` abstraction and an in-memory implementation at `src/test-utils/in-memory-fs.ts` to run file operations without touching disk. Import path for tests: `@pair/content-ops/test-utils/in-memory-fs`.
