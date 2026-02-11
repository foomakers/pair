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

```typescript
type SyncOptions = {
  defaultBehavior: Behavior           // 'overwrite' | 'add' | 'mirror' | 'skip'
  folderBehavior?: Record<string, Behavior>
  concurrencyLimit: number            // default: 10
  retryAttempts: number               // default: 3
  retryDelay: number                  // default: 100ms
  include: string[]                   // folders to include (empty = all)
  flatten: boolean                    // flatten directory hierarchy into hyphen-separated names
  prefix?: string                     // prepend prefix to top-level directory names
  targets: TargetConfig[]             // multi-target distribution
}
```

Use `defaultSyncOptions()` to get a pre-filled instance with sensible defaults.

### Behavior semantics

- `overwrite` (default): copied/moved files replace existing targets.
- `add`: existing files in destination are preserved (skipped).
- `mirror`: destination folder is synchronized to match the source (extraneous files removed).
- `skip`: entry is skipped entirely.

Folder behavior rules are resolved by path (exact match or ancestor match). If a folder is declared `mirror`, all its descendants must also be `mirror` (validation will throw otherwise).

### TargetConfig and multi-target distribution

```typescript
type TransformConfig = { prefix: string }
type TargetConfig = { path: string; mode: 'canonical' | 'symlink' | 'copy'; transform?: TransformConfig }
```

A registry can declare multiple targets. Exactly one must have `mode: 'canonical'` (the primary copy destination). Additional targets are created as symlinks or copies after the canonical copy completes. Use `validateTargets(targets)` to enforce these constraints.

When a target includes a `transform` property, content transformations are applied during distribution. The transform uses marker comments in source files (`<!-- @{prefix}-skip-start -->` / `<!-- @{prefix}-skip-end -->`) to control which sections are included per target. The `transform` property is incompatible with `mode: 'symlink'` (validation will reject this combination).

Content-transform helpers:
- `stripAllMarkers(content)` -- removes all marker comments (`<!-- @*-*-start -->` / `<!-- @*-*-end -->`) from content, regardless of prefix
- `applyTransformCommands(content, prefix)` -- applies transform commands for the given prefix (e.g., removes sections enclosed in `<!-- @{prefix}-skip-start -->` / `<!-- @{prefix}-skip-end -->`) and then strips all remaining markers

Windows note: symlink targets are rejected on Windows (`process.platform === 'win32'`) to avoid permission issues.

### Flatten and prefix transforms

When `flatten: true`, directory paths like `process/implement` become `process-implement`. When `prefix` is set (e.g., `'pair'`), the top-level directory is prefixed: `process-implement` → `pair-process-implement`. Order: flatten first, then prefix.

Naming transform helpers:
- `flattenPath(dirName)` — replaces `/` with `-`
- `prefixPath(dirName, prefix)` — prepends prefix to top-level segment
- `transformPath(dirName, { flatten, prefix })` — applies both
- `detectCollisions(paths)` — finds duplicates after transforms

After transform-aware copies, markdown links are automatically rewritten to match the new directory structure via `rewriteLinksAfterTransform()`.

### Copy pipeline order

1. Validate source exists
2. If flatten/prefix active → `copyDirectoryWithTransforms` (collect files, validate no collisions, copy with transforms, rewrite links)
3. If standard copy → `copyDirHelper` with behavior resolution
4. If multi-target → `distributeToSecondaryTargets` creates symlinks/copies

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
│   ├── behavior.ts          # Behavior logic and target validation
│   ├── copyPathOps.ts       # Copy operations (including transform-aware copy)
│   ├── movePathOps.ts       # Move operations
│   ├── validatePathOps.ts   # Validation operations
│   ├── naming-transforms.ts # Flatten/prefix path transforms and collision detection
│   ├── link-rewriter.ts     # Post-transform markdown link rewriting
│   └── link-batch-processor.ts # Batch link processing
└── test-utils/              # Testing utilities
    └── in-memory-fs.ts      # In-memory filesystem for tests
```

## Testing

Tests use a `FileSystemService` abstraction and an in-memory implementation at `src/test-utils/in-memory-fs.ts` to run file operations without touching disk. Import path for tests: `@pair/content-ops/test-utils/in-memory-fs`.
