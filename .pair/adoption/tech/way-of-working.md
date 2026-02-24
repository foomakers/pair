# Way of Working

- Rapid, iterative development cycles with releases as needed.
- Lightweight code review and testing practices focused on speed and learning.
- Minimal documentation: key decisions and usage documented in markdown files.
- Collaboration and process guidelines follow the standards in `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md`.
- Github Projects is adopted for project management, using Kanban as the workflow methodology. The project is pair under the github organization foomakers. See `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` for usage. use #github MCP to access Github Projects, boards and issues.
- High risk tolerance: quick rollbacks and fast recovery from errors.
- Team communication is informal and direct, with decisions validated collaboratively.
- **Commit History Policy:**: All feature branches must be squashed into a single commit during the PR merge, unless otherwise specified by the story or epic. See [commit template](../../knowledge/guidelines/collaboration/templates/commit-template.md) for details. Unless specified, prefer commit per task (mark the commit title with the task number other than the user story number) where complete all tasks of the story without confirmation and update the body of the story at each commit without confirmation. At the end of the story raise a draft PR following the PR template.
- Ensure use proper template for commit messages and PRs, see [commit template](../../knowledge/guidelines/collaboration/templates/commit-template.md) and [PR template](../../knowledge/guidelines/collaboration/templates/pr-template.md) for details.

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting (`prettier:fix`), markdown lint (`mdlint:fix`).

### Custom Gate Registry

| Order | Gate         | Command                           | Scope Key | Required | Description                                     |
| ----- | ------------ | --------------------------------- | --------- | -------- | ----------------------------------------------- |
| 1     | Quality Gate | `pnpm quality-gate`               | quality   | Yes      | build test and formatting check&fix             |
| 2     | Smoke tests  | `pnpm smoke-tests`                | testing   | Yes      | smoke test to check all e2e cli release process |
| 3     | E2E tests    | `pnpm --filter @pair/website e2e` | testing   | Yes      | Playwright E2E tests (builds + starts Next.js)  |

---

All development activities must follow these adopted practices. For process and rationale, see [way-of-working.md](../../way-of-working.md).
