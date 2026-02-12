```markdown
# Quality Standards

## Introduction

Quality standards provide guidance on linting, formatting, code metrics, coverage and automation to ensure maintainable and consistent code across teams.

## In Scope

- Linting and formatter standards (ESLint, Prettier)
- Code metrics and coverage expectations
- Automation patterns (pre-commit hooks, CI quality gates)
- Technical debt tracking and remediation workflows

## Out of Scope

- Deep configuration for specific tools (use tool-specific docs)
- Organization-wide QA processes (see `quality-assurance/`)

## Files (this directory)

- `linting-tools.md` (recommended linters and rules)
- `eslint.md` (ESLint configuration and conventions)
- `prettier-formatting.md` (formatting rules)
- `code-metrics.md` (metrics & measurement)
- `coverage.md` (coverage targets and strategies)
- `technical-debt.md` (tracking and remediation)
- `automation.md` (CI & pre-commit automation patterns)

## Decision Support

- Use ESLint + Prettier for JS/TS projects as default
- Add SonarQube or CodeClimate for enterprise-level metrics
```

# Quality Standards

Comprehensive framework for maintaining high code quality through automated tooling, metrics, and processes that ensure consistent standards and sustainable development practices.

## Purpose

Establish clear quality standards and automated enforcement mechanisms that maintain code consistency, prevent technical debt accumulation, and support long-term maintainability.

## Available Quality Standards

```markdown
# Quality Standards

## Introduction

Guidelines for linting, formatting, code metrics, test coverage and automation to ensure consistent and maintainable code across the organisation.

## In Scope

- ESLint and Prettier standard recommendations
- Code metrics and coverage guidance
- Automation: pre-commit hooks, CI quality gates and reporting
- Technical debt tracking and remediation strategies

## Out of Scope

- Deep tool configuration (see individual tool docs in this folder)

## Files (this directory)

- `linting-tools.md`
- `eslint.md`
- `prettier-formatting.md`
- `code-metrics.md`
- `coverage.md`
- `technical-debt.md`
- `automation.md`

## How to use

Start from this README for principles, then open the topic pages for concrete configs, examples and recommended rule sets.
```

#### [Coverage](coverage.md)
