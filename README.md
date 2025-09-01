# Pair - your AI-Assisted peer [![CI](https://github.com/foomakers/pair/actions/workflows/ci.yml/badge.svg)](https://github.com/foomakers/pair/actions/workflows/ci.yml)

## 🌟 Product Context

**Product Name:** pair
**Version:** 0.1.0
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

- `pnpm run test` — runs the test suite (Vitest)
- `pnpm run build` — builds the project (if defined)
- `pnpm run lint` — lints the code (if defined)
- `pnpm sync-deps` — updates all dependencies
- `pnpm deps:outdated` — shows outdated dependencies
- `pnpm catalog:update` — updates the catalog
- `pnpm catalog:check` — shows the catalog

### Running tests

```bash
pnpm run test
```

Tests are defined in `tools/monorepo-tests` and use Vitest. All tests must pass both locally and in CI/CD.

### Workspace structure

See the "📁 Structure" section below for an overview of the main folders.

### Documentation

- All guides and standards are available in `.pair/how-to/` and `.pair/tech/knowledge-base/`
- For process and collaboration rules, see `.pair/way-of-working.md`

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

## 📁 Structure

```
├── .pair/                          # AI-specific files and configurations
│   ├── how-to/                      # Development process documentation
│   ├── product/                   # Product requirements and PRD
│   ├── tech/                      # Technical guidelines and standards
│   └── way-of-working.md         # Process and collaboration guidelines
├── package.json                   # Project configuration (supports workspaces)
└── README.md                     # This file
```

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

1. **Setup your project foundation**

   - Start with the PRD template in `.pair/product/PRD.md`
   - Review all technical guidelines in `.pair/tech/`

2. **Create your workspace structure**

   - Add an `apps/` folder for application code (monorepo structure)
   - Add a `packages/` folder for shared libraries
   - Use the examples in the `examples/` folder as reference

3. **Follow the development process**
   - Use the guides in `.pair/how-to/` for breaking down work
   - Follow the technical standards in `.pair/tech/knowledge-base/`
   - Ensure all work meets the criteria in `.pair/tech/knowledge-base/06-definition-of-done.md`

## 🔒 Repository Secrets & Environment Configuration

This project uses environment variables to securely manage secrets and configuration for CI/CD and development workflows.

### Global vs Workspace Environment Files

- **Global `.env.example` (at repository root):**
  - Contains variables shared across all workspaces/packages (e.g., `PAIR_ADOPTION_FOLDER`)
  - Use this as a template to create your own `.env` at the root for global config
- **Workspace `.env.example` (in workspace/package folders):**
  - For secrets/config unique to a specific workspace/package
  - Use as a template for workspace-specific `.env` files

**Loading order:**

1. Each workspace loads its own `.env` (if present)
2. If a variable is not set, it falls back to the global `.env` at the root

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

- CI/CD workflows load secrets from GitHub repository settings and/or the root `.env`
- Local development loads secrets using standard libraries (e.g., `dotenv` for Node.js)
- Ensure `.gitignore` excludes all `.env` files

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

- [Development Process Guides](.pair/how-to/) – Step-by-step guides for breaking down work
- [Product Requirements](.pair/product/PRD.md) – Template for defining product requirements
- [Technical Guidelines](.pair/tech/knowledge-base/) – Comprehensive technical standards and best practices
- [Way of Working](.pair/way-of-working.md) – Process and collaboration guidelines

## 🆘 Support & Help

### Community Resources

- **Discord Community**: [Join our Discord](https://discord.gg/pair-community) for real-time discussions
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
