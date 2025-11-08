# Pair - your AI-Assisted peer [![CI](https://github.com/foomakers/pair/actions/workflows/ci.yml/badge.svg)](https://github.com/foomakers/pair/actions/workflows/ci.yml) [![Release](https://github.com/foomakers/pair/actions/workflows/release.yml/badge.svg)](https://github.com/foomakers/pair/actions/workflows/release.yml)

## 🌟 Product Context

**Product Name:** pair
**Version:** 0.2.0
**Owner:** Foomakers

### Vision

Enable professionals worldwide to collaborate and achieve their goals seamlessly.

### Mission

Deliver an integrated workspace that connects teams, streamlines workflows, and drives productivity.

### Problem Statement

Development teams and AI assistants often operate in fragmented workflows, lacking unified, actionable resources for collaborative product development. This leads to inefficiencies and misalignment throughout the development process.

**Pain Points:**

- Generated code is inconsistent and not homogeneous across different coding sessions
- AI hallucinations occur due to lack of context or insufficient information
- AI decisions are not aligned with project or team choices, leading to confusion and rework

### Goals

1. Guide teams through all phases of development with AI, from requirements definition to delivery
2. Improve alignment and communication between developers and AI assistants
3. Increase delivery quality and reduce rework by providing structured, context-rich workflows

For more details, see the full PRD in `.pair/product/adopted/PRD.md`.

## 📝 Setup & Usage

### Install dependencies

```bash
pnpm install
```

### Available scripts

- `pnpm test` — runs all tests across the monorepo (Turbo)
- `pnpm build` — builds all packages and apps (Turbo)
- `pnpm lint` — lints all code (Turbo)
- `pnpm lint:fix` — auto-fixes linting issues (Turbo)
- `pnpm ts:check` — type-checks all TypeScript code (Turbo)
- `pnpm quality-gate` — runs full quality checks (type-check, test, lint)
- `pnpm clean` — cleans build artifacts and caches
- `pnpm sync-deps` — updates all dependencies recursively
- `pnpm deps:outdated` — shows outdated dependencies
- `pnpm catalog:update` — updates the pnpm catalog
- `pnpm catalog:check` — shows catalog contents
- `pnpm exec changeset` — run the workspace Changesets CLI (adopted version: 2.29.7)

### Running tests

```bash
# Run all tests across the monorepo
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests for specific packages
pnpm --filter @pair/pair-cli test
pnpm --filter @pair/knowledge-hub test
```

Tests are orchestrated by **Turbo** and use **Vitest** as the test runner. Test files are located in each package's `src/` directory with `.test.ts` or `.spec.ts` extensions.

### Quality Gates

Before committing, always run:

```bash
pnpm quality-gate
```

This runs type checking, tests, and linting across all packages using Turbo for optimal performance.

### Workspace structure

This is a **pnpm monorepo** using **Turbo** for task orchestration and build caching.

```
├── apps/                          # Applications
│   └── pair-cli/                  # CLI tool for managing documentation
├── packages/                      # Shared packages
│   ├── knowledge-hub/             # Documentation and assets package
│   └── content-ops/               # File operations and link processing
├── libs/                          # Additional libraries (symlinked)
├── tools/                         # Development tools and configs
│   ├── eslint-config/             # Shared ESLint configuration
│   ├── prettier-config/           # Shared Prettier configuration
│   └── content-ops/               # File operations and link processing
├── .pair/                         # AI-specific files and configurations
│   ├── how-to/                    # Development process documentation
│   ├── product/                   # Product requirements and PRD
│   ├── tech/                      # Technical guidelines and standards
│   ├── assets/                    # Document templates and examples
│   └── way-of-working.md         # Process and collaboration guidelines
├── turbo.json                     # Turbo configuration
├── pnpm-workspace.yaml           # pnpm workspace configuration
└── package.json                  # Root package configuration
```

### Documentation & Getting Started

- **Quick Start**: [Quick Start Guide](docs/getting-started/01-quickstart.md) - Get up and running in minutes
- **Support Resources**: [Support & FAQ](docs/support/index.md) - Installation help, troubleshooting, and support contacts
- **Development Process**: All guides and standards are available in `.pair/how-to/` and `.pair/tech/knowledge-base/`
- **Team Process**: For process and collaboration rules, see `.pair/way-of-working.md`

**Having issues?** Check our [Installation FAQ](docs/support/installation-faq.md) - it covers 80%+ of common problems and includes support resources that are updated with each release.

## 🚀 Quick Start

1. **Clone this repository**

   ```bash
   git clone <repository-url>
   cd <project-name>
   ```

2. **Review the AI development process**

   - Check out the comprehensive guides in `.pair/how-to/`
   - Understand the way of working in `.pair/way-of-working.md`

3. **Define your project**
   - Start with the getting started guide in `.pair/getting-started.md`

## 🏗️ Monorepo Architecture

### Package Management

- **pnpm** with workspace configuration (`pnpm-workspace.yaml`)
- **Catalog** for centralized dependency management
- **Turbo** for task orchestration and build caching

### Development Tools

- **TypeScript** for type safety across all packages
- **Vitest** for testing with coverage reporting
- **ESLint** with shared configuration (`@pair/eslint-config`)
- **Prettier** with shared configuration (`@pair/prettier-config`)
- **Husky** for git hooks

### Key Packages

- **@pair/pair-cli**: CLI tool for documentation management
- **@pair/knowledge-hub**: Centralized documentation and assets
- **@pair/content-ops**: File operations and markdown link processing
- **@pair/eslint-config**: Shared linting rules
- **@pair/prettier-config**: Shared code formatting rules

## GitHub Packages (private) — installation and auth

The `@foomakers/pair-cli` package is published privately on GitHub Packages. To install it you must create a personal access token (PAT) with the minimal scopes required and configure your npm client to use GitHub Packages.

Recommended scopes for a read-only install token:

- read:packages
- repo (only if you need access to private repo packages tied to repository permissions)

User-level `~/.npmrc` example:

```ini
//npm.pkg.github.com/:_authToken=PERSONAL_TOKEN
@foomakers:registry=https://npm.pkg.github.com/
```

Project-level `.npmrc` (safer to use with environment variable and avoid committing tokens directly):

```ini
@foomakers:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

CI usage (GitHub Actions example):

```yaml
- name: Setup npm auth
  run: |
    echo "@foomakers:registry=https://npm.pkg.github.com/" >> ~/.npmrc
    echo "//npm.pkg.github.com/:_authToken=${{ secrets.NPM_TOKEN }}" >> ~/.npmrc
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

- name: Install dev dependency
  run: pnpm add -D @foomakers/pair-cli
```

Notes:

- Do not commit plain tokens into source control. Use repository or organization secret stores.
- If you encounter permission errors, check the token scopes and whether the package is scoped to an organization or repository.
- See `docs/RELEASE.md` for details about TGZ artifacts and publishing.

## 🤖 AI Integration

This template is designed to work seamlessly with:

- **Claude** (Anthropic)
- **Cursor** IDE
- **GitHub Copilot**
- **VS Code with Copilot**

All AI tools can reference the comprehensive documentation in `.pair/how-to/` and technical guidelines in `.pair/tech/` to understand your project's specific requirements and constraints.

## 📋 Development Process

1. **Induction** → Define PRD and architecture in `.pair/product/` and `.pair/tech/`
2. **Initiative Planning** → Break down using guides in `.pair/how-to/`
3. **AI-Assisted Development** → Collaborate with AI tools using established patterns
4. **Quality Assurance** → Follow definition of done in `.pair/tech/knowledge-base/06-definition-of-done.md`

See `.pair/way-of-working.md` for detailed process guidelines.

## 🛠 Getting Started with Development

### 1. Setup Development Environment

```bash
# Install dependencies
pnpm install

# Run quality checks
pnpm quality-gate

# Run tests
pnpm test

# Build all packages
pnpm build
```

### 2. Understand the Monorepo Structure

- **apps/**: Executable applications (pair-cli)
- **packages/**: Shared libraries and tools
- **tools/**: Development configurations and utilities
- **libs/**: Additional shared code (symlinked)

### 3. Development Workflow

````bash
# Work on a specific package
cd packages/knowledge-hub
pnpm test                    # Run tests for this package
pnpm --filter @pair/knowledge-hub build  # Build this package

# Work on the CLI
cd apps/pair-cli
pnpm --filter @pair/pair-cli dev  # Run in development mode

# Run monorepo-wide commands
pnpm lint                    # Lint all packages
pnpm ts:check               # Type-check all packages
pnpm test:coverage          # Run tests with coverage

### Working with Changesets

Changesets are used to manage version bumps and changelogs for releases. Recommended workflow:

```bash
# create an interactive changeset
pnpm exec changeset add

# generate version bumps/changelogs locally
pnpm exec changeset version
````

We adopt `@changesets/cli` v2.29.7 in this workspace; use `pnpm exec changeset` to run the workspace-installed CLI.

````

### 4. Adding New Packages

1. Create the package directory under `packages/`, `apps/`, or `tools/`
2. Add `package.json` with proper configuration
3. Update `pnpm-workspace.yaml` if needed
4. Add to `turbo.json` tasks if custom build steps are required

### 5. Dependency Management

- Use the **pnpm catalog** for shared dependencies
- Add new dependencies to the catalog in `pnpm-workspace.yaml`
- Update with `pnpm catalog:update`

## 👨‍💻 For Developers

### Monorepo Best Practices

- **Use Turbo tasks** for all build/test operations
- **Run quality-gate** before committing
- **Keep packages focused** on single responsibilities
- **Use workspace dependencies** for internal packages
- **Follow conventional commits** for clear change history

### Development Scripts Reference

```bash
# Quality assurance
pnpm quality-gate          # Full quality check (types, tests, lint)
pnpm ts:check             # TypeScript type checking only
pnpm test                 # Run all tests
pnpm test:coverage       # Tests with coverage report

# Code quality
pnpm lint                 # Lint all packages
pnpm lint:fix            # Auto-fix linting issues
pnpm prettier:check      # Check code formatting
pnpm prettier:fix        # Auto-format code

# Build & clean
pnpm build                # Build all packages
pnpm clean                # Clean build artifacts

# Dependencies
pnpm sync-deps           # Update all dependencies
pnpm deps:outdated       # Check for outdated packages
pnpm catalog:update      # Update pnpm catalog
````

### Working with Individual Packages

```bash
# Filter commands to specific packages
pnpm --filter @pair/pair-cli test
pnpm --filter @pair/knowledge-hub build
pnpm --filter @pair/content-ops lint

# Development mode for apps
pnpm --filter @pair/pair-cli dev
```

### Turbo Caching

- Builds and tests are cached automatically
- Use `turbo clean` to clear cache if needed
- Cache is stored in `node_modules/.cache/turbo`

## 🔒 Repository Secrets & Environment Configuration

This project uses environment variables to securely manage secrets and configuration for CI/CD and development workflows.

### Global vs Workspace Environment Files

- **Global `.env.example` (at repository root):**
  - Contains variables shared across all workspaces/packages
  - Use this as a template to create your own `.env` at the root for global config
- **Workspace `.env.example` (in workspace/package folders):**
  - For secrets/config unique to a specific workspace/package
  - Use as a template for workspace-specific `.env` files

**Loading order (pnpm workspaces):**

1. Each workspace loads its own `.env` (if present)
2. If a variable is not set, it falls back to the global `.env` at the root
3. Environment variables are loaded automatically by pnpm for each workspace

### Example Variable

```
PAIR_ADOPTION_FOLDER=.pair
```

### Secret Management Process

- **Never commit actual `.env` files**—only `.env.example` templates
- Add secrets for CI/CD using GitHub Secrets (see GitHub repository settings)
- For local development, copy `.env.example` to `.env` and set your values
- Document any workspace-specific variables in the corresponding `.env.example`

### CI/CD Integration

- **Turbo** orchestrates build and test tasks across all packages
- CI/CD workflows use `pnpm quality-gate` for comprehensive validation
- Build artifacts are cached between runs for faster CI/CD
- Each package can have its own build/test configuration via `turbo.json`

### Example CI Workflow

```yaml
- name: Quality Gate
  run: pnpm quality-gate

- name: Build
  run: pnpm build

- name: Test with Coverage
  run: pnpm test:coverage
```

### Secret Rotation & Troubleshooting

- **Secret Rotation:**

  - For GitHub Secrets: Go to repository settings → Secrets → Actions, update the value, and save. All workflows will use the new value on next run.
  - For local `.env` files: Update the value in your `.env` or workspace `.env` and restart your application. Never commit real secrets.
  - For workspace overrides: Update the workspace `.env` and ensure it is not tracked by git.
  - After rotation, verify workflows and local runs pick up the new value.

- **Troubleshooting:**
  - If a secret is missing, check both workspace and root `.env.example` for required variables.
  - For CI/CD failures, verify secrets are set in GitHub repository settings and that `.env` files are present locally.
  - Use `pnpm test` to validate local setup; check logs for missing env variables.
  - Ensure `.env` files are excluded by `.gitignore` and only `.env.example` is tracked.
  - For workspace-specific issues, check the workspace `.env` and override logic.

For more details, see `.pair/how-to/` and `.pair/tech/knowledge-base/`.

## 🐾 Husky Troubleshooting

### Common Issues

- **Hooks not running:**

  - Ensure you have run `pnpm install` after cloning the repo.
  - Make sure Husky is installed as a devDependency and `.husky/` directory exists in the repo root.
  - If hooks are not triggered, run `pnpm husky install` or `npx husky install` to reinitialize.
  - Check that your git client is not bypassing hooks (e.g., using `--no-verify`).

- **Permission errors:**

  - Make sure hook scripts in `.husky/` are executable (`chmod +x .husky/*`).

- **Pre-commit/pre-push fails unexpectedly:**

  - Run the hook commands manually to debug (e.g., `pnpm lint`, `pnpm test`).
  - Check for missing dependencies or misconfigured scripts in `package.json`.

- **Monorepo issues:**
  - Ensure hooks reference workspace scripts correctly (e.g., use `pnpm lint` for recursive linting).

### Resetting Husky

If you need to reset Husky hooks:

```bash
rm -rf .husky/
npx husky-init && pnpm install
```

For more details, see the [Husky documentation](https://typicode.github.io/husky/#/).

## 📚 Documentation

### Development & Process

- [Development Process Guides](.pair/how-to/) – Step-by-step guides for breaking down work
- [Way of Working](.pair/way-of-working.md) – Process and collaboration guidelines
- [Definition of Done](.pair/tech/knowledge-base/06-definition-of-done.md) – Quality criteria

### Technical Documentation

- [Product Requirements](.pair/product/PRD.md) – Template for defining product requirements
- [Technical Guidelines](.pair/tech/knowledge-base/) – Comprehensive technical standards
- [Architecture Documentation](.pair/tech/) – System design and decisions

### Package Documentation

- [Pair CLI](apps/pair-cli/README.md) – CLI tool documentation
- [Knowledge Hub](packages/knowledge-hub/README.md) – Documentation package guide
- [Content Ops](packages/content-ops/README.md) – File operations library

### Development Tools

- [ESLint Config](tools/eslint-config/README.md) – Shared linting configuration
- [Prettier Config](tools/prettier-config/README.md) – Shared formatting configuration

## 🆘 Support & Help

### Community Resources

- **GitHub Discussions**: [Ask questions](https://github.com/foomakers/pair/discussions) for community support
- **GitHub Issues**: [Report bugs](https://github.com/foomakers/pair/issues) or request features

### Documentation & Guides

- **Quick Start**: Follow the [Getting Started Guide](.pair/how-to/01-how-to-get-started.md)
- **Common Issues**: Check the [Troubleshooting Section](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md#emergency-procedures)
- **Best Practices**: Review [Technical Guidelines](.pair/tech/knowledge-base/) for comprehensive standards

### Direct Support

- **Email**: support@foomakers.com for urgent issues
- **Priority Support**: Available for enterprise customers

### Response Times

| Support Type     | Response Time     | Channels                    |
| ---------------- | ----------------- | --------------------------- |
| Community        | Best effort       | Discord, GitHub Discussions |
| Bug Reports      | 1-2 business days | GitHub Issues               |
| Feature Requests | 3-5 business days | GitHub Issues               |
| Direct Support   | 4-24 hours        | Email                       |

### Self-Help Resources

Before reaching out, try these resources:

1. Search existing [GitHub Issues](https://github.com/foomakers/pair/issues)
2. Check the [FAQ section](.pair/how-to/README.md#frequently-asked-questions)
3. Review [project management integration guides](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/)
4. Consult the [troubleshooting documentation](.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md#emergency-procedures)
