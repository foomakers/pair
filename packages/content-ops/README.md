# @pair/content-ops

Shared utilities for document file operations: copy/move with configurable behaviors, markdown link processing, and multi-target distribution. Used by [`@pair/pair-cli`](../../apps/pair-cli/README.md) and [`@pair/knowledge-hub`](../knowledge-hub/README.md).

## Exports

| Export | Import | Content |
|--------|--------|---------|
| Main | `@pair/content-ops` | `movePathOps`, `copyPathOps`, `validatePathOps`, link processing |
| File System | `@pair/content-ops/file-system` | `FileSystemService` interface + utilities |
| HTTP | `@pair/content-ops/http` | HTTP client abstractions |
| SyncOptions | `@pair/content-ops/ops/SyncOptions` | Options type definitions |
| Test Utils | `@pair/content-ops/test-utils/in-memory-fs` | `InMemoryFileSystemService` for tests |

## Key Concepts

### Behaviors

- **overwrite** (default): files replace existing targets
- **add**: existing destination files preserved (skipped)
- **mirror**: destination synchronized to match source (extraneous files removed)
- **skip**: entry skipped entirely

### Multi-Target Distribution

Registries declare one or more targets. Exactly one must be `mode: 'canonical'` (primary copy). Additional targets use `mode: 'symlink'` or `mode: 'copy'`.

### Naming Transforms

- **flatten**: `process/implement` → `process-implement`
- **prefix**: `process-implement` → `pair-process-implement`
- **content transform**: marker comments (`<!-- @{prefix}-skip-start/end -->`) control per-target content

## Package Structure

```text
src/
├── index.ts                   # Main exports
├── observability.ts           # Logging utilities
├── file-system/               # File system abstractions
│   ├── file-system-service.ts # Service interface
│   ├── file-operations.ts     # Basic file operations
│   └── file-validations.ts    # Path validation
├── markdown/                  # Markdown processing
│   ├── link-processor.ts      # Link processing logic
│   ├── markdown-parser.ts     # Parsing (remark/unified)
│   └── path-resolution.ts     # Path resolution
├── ops/                       # Core operations
│   ├── SyncOptions.ts         # Options types
│   ├── behavior.ts            # Behavior logic + target validation
│   ├── copyPathOps.ts         # Copy (including transform-aware)
│   ├── movePathOps.ts         # Move operations
│   ├── naming-transforms.ts   # Flatten/prefix + collision detection
│   └── link-rewriter.ts       # Post-transform link rewriting
└── test-utils/
    └── in-memory-fs.ts        # In-memory FS for tests
```

## Development

```bash
pnpm --filter @pair/content-ops build          # tsc build
pnpm --filter @pair/content-ops test           # vitest
pnpm --filter @pair/content-ops test:coverage  # with coverage
pnpm --filter @pair/content-ops lint           # eslint
```

Tests use `InMemoryFileSystemService` — no disk I/O in unit tests.
