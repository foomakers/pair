# Contributing to Pair

Thank you for your interest in contributing to Pair!

> **Full contributing docs**: [pair.foomakers.com/docs/contributing](https://pair.foomakers.com/docs/contributing) — development setup, architecture, writing skills, writing guidelines, and release process.

## Code Style

- All code must follow the ESLint and Prettier rules defined in the monorepo.
- Run `pnpm lint` to check for lint errors before committing.
- Run `pnpm prettier:check` to ensure code formatting is correct.
- Use the provided configs in `tools/eslint-config` and `tools/prettier-config` for reference.

## Git Hooks (Husky)

- Husky is configured to run lint and format checks on pre-commit, and tests on pre-push.
- Do not bypass hooks unless absolutely necessary (`git commit --no-verify`).
- If hooks are not running, see [DEVELOPMENT.md](DEVELOPMENT.md#husky-git-hooks) for troubleshooting.
- Make sure to run `pnpm install` after cloning to enable hooks.

## Workflow

- All changes must pass `pnpm quality-gate` locally and in CI/CD.
- Follow the guidelines in `.pair/knowledge/guidelines/` for architecture and code design.
- For process and collaboration, see `.pair/adoption/tech/way-of-working.md`.

## Operational Activities

- For step-by-step instructions on common tasks, see `.pair/knowledge/how-to/`.
- Key guides:
  - **Create tasks:** `.pair/knowledge/how-to/09-how-to-create-tasks.md`
  - **Implement a task:** `.pair/knowledge/how-to/10-how-to-implement-a-task.md`
  - **Code review:** `.pair/knowledge/how-to/11-how-to-code-review.md`
- For testing strategy, see `.pair/knowledge/guidelines/testing/`.
- Always follow the documented process for operational activities to ensure consistency and quality.

## Questions & Support

- For any issues, open a [GitHub issue](https://github.com/foomakers/pair/issues) or ask in [Discussions](https://github.com/foomakers/pair/discussions).
- Refer to the [documentation site](https://pair.foomakers.com/docs) for detailed guides.
