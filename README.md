# AI-Assisted Development Template

This repository serves as a template for AI-assisted development projects, providing a structured approach to collaboration between AI tools and human developers.

# AI-Assisted Development Template

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
├── examples/                      # Example implementations and templates
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

## 📚 Documentation

- [Development Process Guides](.pair/how-to/) – Step-by-step guides for breaking down work
- [Product Requirements](.pair/product/PRD.md) – Template for defining product requirements
- [Technical Guidelines](.pair/tech/knowledge-base/) – Comprehensive technical standards and best practices
- [Way of Working](.pair/way-of-working.md) – Process and collaboration guidelines
