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

```
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
| `@pair/knowledge-hub` | Knowledge Base dataset (guidelines, how-to, templates) ([README](packages/knowledge-hub/README.md)) |
| `@pair/content-ops` | File operations, markdown link processing, backup service ([README](packages/content-ops/README.md)) |
| `@pair/website` | Documentation site (Fumadocs, Next.js 15, Orama search) |
| `@pair/brand` | Brand identity assets (logo, colors, fonts) ([BRAND.md](packages/brand/BRAND.md)) |

## Available Scripts

### Root-Level Commands

```bash
pnpm install              # Install all dependencies
pnpm quality-gate         # Full quality check (ts:check + test + lint + prettier + mdlint + hygiene)
pnpm test                 # Run all tests (Turbo)
pnpm build                # Build all packages (Turbo)
pnpm lint                 # Lint all packages (Turbo)
pnpm lint:fix             # Auto-fix linting issues (Turbo)
pnpm ts:check             # Type-check all TypeScript (Turbo)
pnpm test:coverage        # Tests with coverage report
pnpm prettier:check       # Check formatting
pnpm prettier:fix         # Auto-format code
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

This runs (in order): `ts:check`, `test`, `lint`, `prettier:fix`, `mdlint:fix`, `hygiene:check`, `docs:staleness`.

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
| `pair kb validate` | Validate KB structure, links, and metadata |
| `pair package` | Package .pair/ into distributable ZIP (`--interactive`, `--org`) |
| `pair kb-info` | Display metadata from a KB package ZIP |
| `pair kb-verify` | Verify KB package integrity (checksum, structure, manifest) |

See [apps/pair-cli/README.md](apps/pair-cli/README.md) for complete reference.

### CLI Architecture (CommandConfig Pattern)

The CLI uses a discriminated union pattern for type-safe command parsing:

```
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

## GitHub Packages (Private Registry)

`@foomakers/pair-cli` is published on GitHub Packages. To install:

**User-level `~/.npmrc`:**

```ini
//npm.pkg.github.com/:_authToken=PERSONAL_TOKEN
@foomakers:registry=https://npm.pkg.github.com/
```

**Project-level `.npmrc` (with env var):**

```ini
@foomakers:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

**CI (GitHub Actions):**

```yaml
- name: Setup npm auth
  run: |
    echo "@foomakers:registry=https://npm.pkg.github.com/" >> ~/.npmrc
    echo "//npm.pkg.github.com/:_authToken=${{ secrets.NPM_TOKEN }}" >> ~/.npmrc
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Required token scopes: `read:packages` (+ `repo` for private repo packages).

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
