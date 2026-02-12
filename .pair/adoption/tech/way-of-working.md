# Way of Working

- Rapid, iterative development cycles with releases as needed.
- Lightweight code review and testing practices focused on speed and learning.
- Minimal documentation: key decisions and usage documented in markdown files.
- Collaboration and process guidelines follow the standards in `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md`.
- Github Projects is adopted for project management, using Kanban as the workflow methodology. The project is pair under the github organization foomakers. See `/.pair/tech/knowledge-base/12-collaboration-and-process-guidelines/project-management-framework.md` for usage. use #github MCP to access Github Projects, boards and issues.
- High risk tolerance: quick rollbacks and fast recovery from errors.
- Team communication is informal and direct, with decisions validated collaboratively.
- **Commit History Policy:**: All feature branches must be squashed into a single commit before opening a pull request, unless otherwise specified by the story or epic. See [commit template](/.pair/knowledge/guidelines/collaboration/templates/commit-template.md) for details.

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting (`prettier:fix`), markdown lint (`mdlint:fix`).

### Custom Gate Registry

| Order | Gate          | Command            | Scope Key  | Required | Description                      |
| ----- | ------------- | ------------------ | ---------- | -------- | -------------------------------- |
| 1     | Formatting    | `pnpm prettier:fix` | formatting | No       | Prettier auto-fix and verify     |
| 2     | Markdown Lint | `pnpm mdlint:fix`   | mdlint     | No       | Markdownlint auto-fix and verify |

---

All development activities must follow these adopted practices. For process and rationale, see [way-of-working.md](../../way-of-working.md).
