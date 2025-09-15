# Tech Stack

- TypeScript is adopted for all application logic and development.
- TypeScript v5.x is adopted for all application logic and development.
- Markdown is adopted for documentation and knowledge base files.
- Markdown (CommonMark, .md files) is adopted for documentation and knowledge base files.
- Bash is adopted for scripting and coordination of AI assistant processes.
- Bash v5.x is adopted for scripting and coordination of AI assistant processes.
- Supabase is adopted for database and vector storage in Retrieval-Augmented Generation (RAG) workflows.
- Supabase v2.x is adopted for database and vector storage in Retrieval-Augmented Generation (RAG) workflows.
- Ollama is adopted for local LLM model execution in RAG workflows.
- Ollama v0.1.34+ is adopted for local LLM model execution in RAG workflows.
- For RAG tokenization and embedding, the following Ollama models are adopted for efficiency:
  - `llama3` (recommended for general RAG tasks)
  - `phi3` (efficient for embedding and fast inference)
  - `mistral` (compact, efficient for tokenization)
- All components are self-hosted unless external services are required for LLM or vector database functionality.
- External services may be used for LLM models or vector database if required for RAG.
- Next.js v14.x is adopted for the user interface for RAG management.
- shadcn/ui v1.x is adopted as the visual framework for the application UI.
- pnpm is adopted as the package manager for all workspaces and monorepo management.
- pnpm v10.15.0 is adopted for fast, efficient, and deterministic dependency management, ideal for monorepo setups and strict workspace isolation.
- Turborepo (turbo) is adopted for monorepo task orchestration and caching.
- turbo v2.5.6 is included in the workspace catalog (`pnpm-workspace.yaml`).
- Use `turbo` from the repository root to orchestrate cross-workspace tasks (e.g. `turbo build`, `turbo test`, `turbo lint`).

vitest is adopted as the testing framework for all TypeScript and JavaScript codebases.
vitest v3.2.4 is adopted for fast, Vite-native, TypeScript-friendly testing in modern monorepo and workspace setups.
@vitest/coverage-v8 v3.2.4 is adopted for code coverage reporting in Vitest-based test suites.
vite-tsconfig-paths is adopted to enable TypeScript `paths`/alias resolution for Vite and Vitest during development and testing.
vite-tsconfig-paths v5.1.4 is adopted for consistent path-alias behavior across the monorepo's test and build tooling.
dotenv v17.2.x is adopted for environment variable management in Node.js workspaces and CI/CD workflows.
commander v11.0.0 is adopted for CLI command parsing and argument management.
chalk v4.1.2 is adopted for terminal output colorization in CLI tools.
fs-extra v11.2.0 is adopted for advanced filesystem operations in Node.js CLI workspaces.
markdown-it v14.1.0 is adopted for markdown parsing and link rewriting in CLI and documentation tools.
mdast v3.0.0 is adopted for markdown Abstract Syntax Tree (AST) types and structures.
@types/mdast v3.0.15 is adopted for TypeScript type definitions for mdast.
remark-parse v11.0.0 is adopted for parsing markdown to mdast using remark.
unified v11.0.5 is adopted for interfacing with the unified ecosystem for markdown processing.
ts-node v10.9.2 is adopted for TypeScript execution and scripting in Node.js workspaces.
@types/node v24.3.0 is adopted for Node.js type definitions.
@types/markdown-it v14.1.2 is adopted for TypeScript type definitions for markdown-it.
@typescript-eslint/eslint-plugin v8.41.0 is adopted for ESLint rules specific to TypeScript.
@typescript-eslint/parser v8.41.0 is adopted for parsing TypeScript code in ESLint.
eslint v9.34.0 is adopted for code linting and style enforcement.
@eslint/js v9.34.0 is adopted for ESLint's JavaScript configuration.
globals v15.0.0 is adopted for defining global variables in ESLint configurations.
prettier v3.6.2 is adopted for code formatting and style consistency.
husky v8.0.0 is adopted for Git hooks management and automation.
ncc (`@vercel/ncc`) is adopted for Node.js bundling to create self-contained artifacts.
dts-bundle-generator is adopted for generating TypeScript definition files from bundled code.
zip is adopted as the archive creation utility for packaging release artifacts.
sha256sum/shasum is adopted for checksum generation and verification of release artifacts.

---

- Prettier and ESLint must be used via the respective workspace packages in [tools/prettier-config](../../tools/prettier-config) and [tools/eslint-config](../../tools/eslint-config).
- Do **not** install Prettier o ESLint direttamente nei workspace applicativi: la configurazione e gli script devono seguire le istruzioni nei README dei workspace tools.

All technology choices must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).

---

All technology choices must follow these adopted standards. For process and rationale, see [way-of-working.md](../../way-of-working.md).
