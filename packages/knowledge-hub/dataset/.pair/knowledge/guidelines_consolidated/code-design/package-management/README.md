````markdown
# Package Management

## Introduction

Guidance for package management in monorepos and multi-package workspaces. Covers pnpm workspace configuration, shared dependency patterns, version catalog approaches and workspace config best practices.

## In Scope

- PNPM workspace setup and conventions
- Shared dependencies and strategies for hoisting
- Version catalog approaches and maintenance
- Workspace-level tooling and scripts

## Out of Scope

- Package-specific implementation examples (refer to package READMEs)
- Release automation pipelines (see `infrastructure/` and CI docs)

## Files (this directory)

- `pnpm.md` (pnpm workspace patterns)
- `shared-dependencies.md` (how to manage shared deps)

```markdown
# Package Management

## Introduction

Guidance on package managers and workspace configuration for monorepos. Focus on pnpm, shared dependencies and version catalogs.

## In Scope

- pnpm workspaces and configuration
- version catalog strategies
- managing shared dependencies across packages

## Out of Scope

- CI/CD pipeline or deployment tooling specifics

## Files (this directory)

- `pnpm.md`
- `shared-dependencies.md`
- `version-catalog.md`
- `workspace-config.md`

## How to use

Open the topic pages for concrete examples, recommended settings and migration notes.
```
````

- Infrastructure deployment package management (covered in Infrastructure)
