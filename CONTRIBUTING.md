# Contributing to Pair

Thank you for your interest in contributing to Pair!

## Code Style

- All code must follow the ESLint and Prettier rules defined in the monorepo.
- Run `pnpm lint` to check for lint errors before committing.
- Run `pnpm prettier:check` to ensure code formatting is correct.
- Use the provided configs in `tools/eslint-config` and `tools/prettier-config` for reference.

## Git Hooks (Husky)

- Husky is configured to run lint and format checks on pre-commit, and tests on pre-push.
- Do not bypass hooks unless absolutely necessary (`git commit --no-verify`).
- If hooks are not running, see the troubleshooting section in the README.md.
- Make sure to run `pnpm install` after cloning to enable hooks.

## Workflow

- All changes must pass lint, format, and test checks locally and in CI/CD.
- Follow the guidelines in `.pair/tech/knowledge-base/` for architecture and code design.
- For process and collaboration, see `.pair/way-of-working.md`.

## Operational Activities

- For step-by-step instructions on common operational tasks (setup, branching, PRs, releases, troubleshooting), see the guides in `.pair/how-to/`.
- Key guides include:
  - **How to create tasks:** `.pair/how-to/09-how-to-create-tasks.md`
  - **How to implement a task:** `.pair/how-to/10-how-to-implement-a-task.md`
  - **How to commit and push:** `.pair/how-to/11-how-to-commit-and-push.md`
  - **How to create a PR:** `.pair/how-to/12-how-to-create-a-pr.md`
  - **Definition of Done:** `.pair/tech/knowledge-base/06-definition-of-done.md`
  - **Testing strategy:** `.pair/tech/knowledge-base/07-testing-strategy.md`
- Always follow the documented process for operational activities to ensure consistency and quality.

## Questions & Support

- For any issues, open a GitHub issue or ask in the team channel.
- Refer to the documentation in `.pair/how-to/` and `.pair/tech/knowledge-base/` for more details.
