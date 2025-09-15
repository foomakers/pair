# @pair/monorepo-tests

Monorepo-wide testing utilities and helpers for the pair project.

## Purpose

This package provides shared testing utilities, mocks, and helpers used across the monorepo for consistent testing practices.

## Contents

- Testing utilities for environment variable loading
- Repository setup validation helpers
- Shared test configurations

## Usage

This package is used internally by other packages in the monorepo and contains utilities for:

- Loading and validating environment variables in tests
- Repository secrets management testing
- Monorepo-wide test configurations

## Scripts

- `pnpm test` — run package tests
- `pnpm lint` — run linter
- `pnpm lint:fix` — auto-fix linting issues
- `pnpm prettier:check` — check code formatting
- `pnpm prettier:fix` — auto-format code
