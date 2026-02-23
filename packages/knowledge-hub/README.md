# @pair/knowledge-hub

Knowledge Base dataset for the pair monorepo: guidelines, how-to guides, templates, adoption notes, and agent skills. This is the source of truth for all distributed documentation.

## Contents

```text
dataset/
├── .pair/              # Project context (adoption, knowledge, guidelines)
│   ├── adoption/       # Project-specific decisions and standards
│   └── knowledge/      # Guidelines, how-to, templates
├── .skills/            # Agent Skills (process + capability)
├── .github/            # GitHub-specific agent config
└── AGENTS.md           # Universal agent entry point
```

## Development

```bash
pnpm --filter @pair/knowledge-hub test           # vitest
pnpm --filter @pair/knowledge-hub test:coverage   # with coverage
pnpm --filter @pair/knowledge-hub run check:links # validate markdown links
pnpm --filter @pair/knowledge-hub lint            # eslint
```

### Helper Scripts

| Script | Description |
|--------|-------------|
| `check:links` | Scans `dataset/` markdown files, normalizes links, reports broken references |
| `transfer:dataset` | Moves/renames folders inside `dataset/` while updating internal links |

Both scripts use `FileSystemService` from [`@pair/content-ops`](../content-ops/README.md).

### Package Structure

```text
src/
├── check-broken-links.ts    # Link validation script
├── transfer-dataset.ts      # Dataset transfer/move script
└── test-utils/              # Testing utilities
```

Tests use in-memory FS — no disk I/O in unit tests.
