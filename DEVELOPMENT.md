# Development Guide

Complete setup and development instructions for contributors working on the pair monorepo.

For project overview, see [README.md](README.md). For release process, see [RELEASE.md](RELEASE.md). For contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **pnpm** 10+ (`npm install -g pnpm`)
- **Git** with Husky hooks support

## Install

```bash
git clone https://github.com/foomakers/pair.git
cd pair
pnpm install
```

## Workspace Structure

This is a **pnpm monorepo** using **Turbo** for task orchestration and build caching.

```text
├── apps/
│   ├── pair-cli/              # CLI tool (@pair/pair-cli)
│   └── website/               # Docs site (@pair/website) — Fumadocs + Next.js
├── packages/
│   ├── knowledge-hub/         # KB dataset (@pair/knowledge-hub)
│   ├── content-ops/           # File ops + link processing (@pair/content-ops)
│   └── brand/                 # Brand assets (@pair/brand)
├── tools/
│   ├── eslint-config/         # Shared ESLint config
│   ├── prettier-config/       # Shared Prettier config
│   ├── markdownlint-config/   # Shared markdownlint config
│   └── ts-config/             # Shared TypeScript config
├── .pair/                     # AI-specific files and configurations
├── .claude/skills/            # Agent Skills (agentskills.io standard)
├── turbo.json                 # Turbo pipeline config
├── pnpm-workspace.yaml        # pnpm workspace config
└── package.json               # Root config + scripts
```

### Key Packages

| Package | Description |
|---------|-------------|
| `@pair/pair-cli` | CLI tool for KB installation, update, packaging, and validation ([README](apps/pair-cli/README.md)) |
| `@pair/website` | Documentation site — Fumadocs, Next.js 15, Orama search ([README](apps/website/README.md)) |
| `@pair/knowledge-hub` | Knowledge Base dataset (guidelines, how-to, templates) ([README](packages/knowledge-hub/README.md)) |
| `@pair/content-ops` | File operations, markdown link processing ([README](packages/content-ops/README.md)) |
| `@pair/brand` | Brand identity — design tokens, React components, Tailwind preset ([README](packages/brand/README.md), [BRAND.md](packages/brand/BRAND.md)) |
| `@pair/eslint-config` | Shared ESLint configuration ([README](tools/eslint-config/README.md)) |
| `@pair/prettier-config` | Shared Prettier configuration ([README](tools/prettier-config/README.md)) |
| `@pair/ts-config` | Shared TypeScript presets ([README](tools/ts-config/README.md)) |
| `@pair/markdownlint-config` | Shared markdownlint configuration ([README](tools/markdownlint-config/README.md)) |

## Available Scripts

### Root-Level Commands

```bash
pnpm install              # Install all dependencies
pnpm quality-gate         # Full quality check (ts:check + test + lint + format check + hygiene)
pnpm format               # Apply formatting (prettier + markdownlint, write mode)
pnpm format:check         # Check formatting only — what the gate runs; never writes
pnpm mirrors:regenerate   # Realign the generated mirrors with the LOCAL dataset (offline)
pnpm test                 # Run all tests (Turbo)
pnpm build                # Build all packages (Turbo)
pnpm lint                 # Lint all packages (Turbo)
pnpm lint:fix             # Auto-fix linting issues (Turbo)
pnpm ts:check             # Type-check all TypeScript (Turbo)
pnpm test:coverage        # Tests with coverage report
pnpm prettier:check       # Check formatting (prettier only)
pnpm prettier:fix         # Auto-format code (prettier only)
pnpm mdlint:check         # Check markdown only (markdownlint)
pnpm clean                # Clean build artifacts and caches
pnpm sync-deps            # Update all dependencies recursively
pnpm deps:outdated        # Show outdated dependencies
pnpm catalog:update       # Update pnpm catalog
pnpm catalog:check        # Show catalog contents
```

### Per-Package Commands

```bash
# Filter to a specific package
pnpm --filter @pair/pair-cli test
pnpm --filter @pair/pair-cli dev
pnpm --filter @pair/knowledge-hub build
pnpm --filter @pair/content-ops lint
pnpm --filter @pair/website dev
pnpm --filter @pair/website build
pnpm --filter @pair/website e2e        # Playwright E2E tests
```

## Testing

Tests use **Vitest** as the test runner, orchestrated by **Turbo**. Test files are in each package's `src/` directory with `.test.ts` extensions.

```bash
pnpm test                              # All tests
pnpm test:coverage                     # With coverage
pnpm --filter @pair/pair-cli test      # Single package
pnpm vitest run -t "test name"         # Single test by name
pnpm smoke-tests                       # CLI smoke tests (e2e release process)
pnpm --filter @pair/website e2e        # Playwright E2E (builds + starts Next.js)
```

### Testing Conventions

- In-memory test doubles over mocks (e.g., `InMemoryFileSystemService` instead of mocking `fs`)
- 1:1 mapping between source modules and test files
- TDD discipline: RED → GREEN → REFACTOR

## Quality Gates

Before committing, always run:

```bash
pnpm quality-gate
```

This runs (in order): `ts:check`, `test`, `lint`, `format:check` (prettier + markdownlint, **check mode**), `gate:composition`, `hygiene:check`, `docs:staleness`, `skills:conformance`, `dup:check`.

The gate never formats. It is the pre-push hook, where the commits already exist: a write-mode
formatter would rewrite the working tree without touching what is being pushed, so it only pollutes
the next diff. On a `format:check` failure, run `pnpm format` and commit the result. Exit **2**
instead of 1 means a formatter wrapper itself failed (a broken install, not drift) — read its output
rather than running `pnpm format`. **Two-step remedy:** if `pnpm format` touched
`packages/knowledge-hub/dataset/**`, re-sync the generated `.claude/skills/**` and
`.pair/knowledge/**` copies (`pnpm mirrors:regenerate`) in the same commit, or a mirror guard fails
later in the same gate — the dataset copy is inside format scope, its generated twin is not
(`.claude/` and root `.pair/` are not workspace members), and the mirror guards assert each twin
equals the OUTPUT of the real `pair update` transform — never the dataset source itself, which the
corpus is transformed away from. `gate:composition` guards the gate against a write-mode step
(formatter or eslint autofix) creeping back in. `pnpm mirrors:regenerate` regenerates from the
working tree's own dataset, offline; `pair update` installs the latest PUBLISHED knowledge base and
is not the remedy for local drift. See ADL
[2026-07-31-pre-push-gate-is-check-only.md](.pair/adoption/decision-log/2026-07-31-pre-push-gate-is-check-only.md).

### Custom Gate Registry

| Order | Gate | Command | Required |
|-------|------|---------|----------|
| 1 | Quality Gate | `pnpm quality-gate` | Yes |
| 2 | Smoke Tests | `pnpm smoke-tests` | Yes |
| 3 | E2E Tests | `pnpm --filter @pair/website e2e` | Yes |

## CLI Commands

The pair CLI (`@pair/pair-cli`) provides:

| Command | Description |
|---------|-------------|
| `pair install` | Install knowledge base documentation |
| `pair update` | Update knowledge base to latest version |
| `pair update-link` | Normalize markdown links (relative/absolute) |
| `pair kb-validate` | Validate KB structure, links, and metadata |
| `pair package` | Package .pair/ into distributable ZIP (`--interactive`, `--org`) |
| `pair kb-info` | Display metadata from a KB package ZIP |
| `pair kb-verify` | Verify KB package integrity (checksum, structure, manifest) |

See [apps/pair-cli/README.md](apps/pair-cli/README.md) for complete reference.

### CLI Architecture (CommandConfig Pattern)

The CLI uses a discriminated union pattern for type-safe command parsing:

```text
apps/pair-cli/src/commands/
├── {command}/
│   ├── parser.ts         # Pure parser + CommandConfig type
│   ├── handler.ts        # Execution logic
│   ├── metadata.ts       # Help text, options, examples
│   └── index.ts          # Public exports
├── dispatcher.ts         # Routes CommandConfig → handler
└── index.ts              # Root exports (union type, registry)
```

## Changesets

We use `@changesets/cli` for version management:

```bash
pnpm exec changeset add       # Create a changeset (interactive)
pnpm exec changeset version    # Generate version bumps + changelogs
```

## Dependency Management

- Use the **pnpm catalog** (`pnpm-workspace.yaml`) for shared dependency versions
- Add new shared dependencies to the catalog
- `pnpm catalog:update` to update, `pnpm catalog:check` to inspect
- `pnpm sync-deps` to update all dependencies recursively
- `pnpm deps:outdated` to check for outdated packages

### Adding New Packages

1. Create directory under `packages/`, `apps/`, or `tools/`
2. Add `package.json` with proper config
3. Update `pnpm-workspace.yaml` if needed
4. Add to `turbo.json` tasks if custom build steps required

## Turbo Caching

- Builds and tests are cached automatically by Turbo
- Cache stored in `node_modules/.cache/turbo`
- `turbo clean` to clear cache if needed
- **Fresh checkout/worktree gotcha**: `pnpm --filter <pkg> <script>` runs that package's own script directly — it does not follow turbo's `dependsOn` graph the way root `pnpm build`/`pnpm test` (via `turbo build`/`turbo test`) do. Any package that depends on a workspace package with its own build step (e.g. `@pair/content-ops`, whose `main`/`exports` point at `dist/`) will fail to resolve that import on a fresh checkout/worktree until the dependency is built once: `pnpm --filter <dependency> build`. Not needed after a root `pnpm build`/`turbo build`, which already builds dependencies first — **and that is the whole exemption**: a CI job is only covered when it runs the ROOT build. A job that builds a single package hits this exactly like a fresh worktree does, so it must build dependency-aware: `pnpm turbo build --filter=<pkg>...` (the trailing `...` = the package **and** its workspace dependencies). Live example: the `smoke` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which failed with ~45 `TS2307: Cannot find module '@pair/content-ops'` until it did. Affects `@pair/knowledge-hub` and `apps/pair-cli` today (both depend on `@pair/content-ops`); applies to any future workspace package with the same shape — this is the one canonical place to document it (see ADL [2026-07-18-workspace-gotcha-doc-placement.md](.pair/adoption/decision-log/2026-07-18-workspace-gotcha-doc-placement.md)).

## npmjs.org

`@foomakers/pair-cli` is published on npmjs.org as a public package. No `.npmrc` or token needed to install:

```bash
npx @foomakers/pair-cli install
```

**CI (GitHub Actions) — publishing only:**

Publishing requires `NPM_TOKEN` secret (granular access token from npmjs.org scoped to `@foomakers`).

## Environment Variables

### Global vs Workspace

- **Root `.env.example`**: Variables shared across all workspaces
- **Workspace `.env.example`**: Variables specific to a package

Loading order: workspace `.env` → root `.env` fallback.

### Secret Management

- Never commit `.env` files — only `.env.example` templates
- CI/CD secrets via GitHub Secrets (repository settings)
- Local: copy `.env.example` → `.env` and set values

## Husky (Git Hooks)

### Common Issues

- **Hooks not running**: Run `pnpm install` after cloning. Verify `.husky/` exists. Run `pnpm husky install` if needed.
- **Permission errors**: `chmod +x .husky/*`
- **Pre-commit fails**: Run hook commands manually (`pnpm lint`, `pnpm test`) to debug.
- **Monorepo issues**: Hooks use workspace scripts (e.g., `pnpm lint` for recursive linting).

### Reset Husky

```bash
rm -rf .husky/
npx husky-init && pnpm install
```

## CI/CD

```yaml
- name: Quality Gate
  run: pnpm quality-gate

- name: Build
  run: pnpm build

- name: Test with Coverage
  run: pnpm test:coverage
```

Turbo caches build/test results between CI runs for faster pipelines.
