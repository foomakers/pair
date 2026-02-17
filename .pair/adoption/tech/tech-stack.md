# Tech Stack

## Core languages and scripting

- TypeScript is adopted for all application logic and development.
- TypeScript v5.x is the adopted major version.
- Markdown (CommonMark, .md files) is adopted for documentation and knowledge base files.
- Bash is adopted for scripting and coordination of AI assistant processes (Bash v5.x adopted).

## Platform and models

- Supabase is adopted for database and vector storage in Retrieval-Augmented Generation (RAG) workflows (Supabase v2.x).
- Ollama is adopted for local LLM model execution in RAG workflows (Ollama v0.1.34+).
- For RAG tokenization and embedding we recommend these Ollama models:
  - `llama3` (recommended for general RAG tasks)
  - `phi3` (efficient for embedding and fast inference)
  - `mistral` (compact, efficient for tokenization)

## Monorepo & package management

- pnpm is adopted as the package manager for all workspaces and monorepo management.
- pnpm v10.15.0 is the adopted version for deterministic dependency management.
- Turborepo (`turbo`) is adopted for monorepo task orchestration and caching (turbo v2.5.6).

Use `turbo` from the repository root to run cross-workspace tasks (e.g. `turbo build`, `turbo test`, `turbo lint`).

## Testing

- vitest is adopted as the testing framework for TypeScript and JavaScript codebases (vitest v3.2.4).
- @vitest/coverage-v8 v3.2.4 is adopted for coverage reporting.
- vite-tsconfig-paths v5.1.4 is adopted to enable TypeScript `paths` resolution for Vite and Vitest.

## Runtime & CLI tooling

- commander v11.0.0 is adopted for CLI command parsing and argument management.
- chalk v4.1.2 is adopted for terminal output colorization.
- @inquirer/prompts v7.5.0 is adopted for interactive CLI prompts in package creation workflows (TypeScript-native, tree-shakeable individual imports).
- ts-node v10.9.2 is adopted for TypeScript execution in scripts.

## Markdown & docs processing

- markdown-it v14.1.0 is adopted for Markdown parsing.
- mdast v3.0.0 and @types/mdast v3.0.15 are adopted for Markdown AST types.
- remark-parse v11.0.0 and unified v11.0.5 are adopted for the unified ecosystem.
- @types/markdown-it v14.1.2 is adopted for TypeScript types for markdown-it.

## Linting & formatting

- ESLint and related tooling are adopted for linting and style enforcement:
  - @typescript-eslint/eslint-plugin v8.41.0
  - @typescript-eslint/parser v8.41.0
  - eslint v9.34.0 and @eslint/js v9.34.0
  - globals v15.0.0
  - prettier v3.6.2 (configured via workspace `tools/prettier-config`)

## Git hooks

- husky v8.0.0 is adopted for managing Git hooks and automation.

## Bundling & packaging

- ncc (`@vercel/ncc`) is adopted for creating self-contained Node.js bundles.
- dts-bundle-generator is adopted to generate TypeScript definition files for bundles.
- zip is adopted as the archive creation utility for packaging release artifacts.
- sha256sum / shasum are adopted for checksum generation and verification.
- adm-zip v0.5.16 is adopted for ZIP archive extraction in Node.js runtime (CLI KB installation).

## Release & versioning

- changesets (`@changesets/cli`) is adopted for version management, changelog generation, and CI-driven release automation.
- changesets v2.29.7 is the adopted version for workspace release workflows and CI pipelines.

---

- Prettier and ESLint must be used via the respective workspace packages in [tools/prettier-config](../../tools/prettier-config) and [tools/eslint-config](../../tools/eslint-config).
- Do **not** install Prettier o ESLint direttamente nei workspace applicativi: la configurazione e gli script devono seguire le istruzioni nei README dei workspace tools.

All technology choices must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
