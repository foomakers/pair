# pair-cli

CLI for installing, managing, and processing pair knowledge base assets. User-facing docs live on the [documentation site](https://pair.foomakers.com/docs/reference/cli/commands).

## For Developers

### Codebase Structure

```text
apps/pair-cli/
├── src/
│   ├── cli.ts              # Entry point (Commander.js)
│   ├── index.ts             # Package exports
│   ├── config-utils.ts      # Configuration loading/validation
│   └── commands/            # Command implementations
│       ├── {command}/
│       │   ├── parser.ts    # Pure parser + CommandConfig type
│       │   ├── handler.ts   # Execution logic
│       │   ├── metadata.ts  # Help text, options, examples
│       │   └── index.ts     # Public exports
│       ├── dispatcher.ts    # Routes CommandConfig → handler
│       └── index.ts         # Root exports (union type, registry)
├── test-utils/              # Testing helpers
├── config.json              # Default asset registry configuration
└── package.json
```

Dependencies: [`@pair/knowledge-hub`](../../packages/knowledge-hub/README.md) (asset source), [`@pair/content-ops`](../../packages/content-ops/README.md) (file/link operations).

### Architecture (CommandConfig Pattern)

```text
CLI Options → Parser → CommandConfig → Dispatcher → Handler → Actions
```

1. **Parser** — validates CLI options into typed `CommandConfig` (discriminated union)
2. **Dispatcher** — type-safe switch routing `CommandConfig` → handler
3. **Handler** — orchestrates command execution
4. **Actions** — file operations via `FileSystemService` abstraction

Adding a new command:

1. Create `commands/<name>/` with `parser.ts`, `handler.ts`, `metadata.ts`
2. Register in `commands/index.ts` commandRegistry
3. Tests auto-discovered, metadata drives CLI setup

### Development

```bash
pnpm --filter @pair/pair-cli dev install ./dataset  # run in dev mode
pnpm --filter @pair/pair-cli test                    # unit tests
pnpm --filter @pair/pair-cli lint                    # lint
```

### Troubleshooting

- **"Unable to resolve @pair/knowledge-hub"**: `pnpm install` from repo root
- **`install` reports `target-not-empty`**: use `update` or clear target folder
- **Configuration errors**: `pair-cli validate-config`
