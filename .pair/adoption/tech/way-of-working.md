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
- **PR granularity — one PR per story (default):** A story's work lands in a single PR by default, even when the story is broken into multiple inline tasks/findings. Splitting into multiple PRs per story requires an explicit reason (e.g. unusually large story, or independently shippable/needed-sooner parts) — it is not the default. Per-task granularity within that one PR is expressed as commit-per-task (see Commit History Policy above), not as separate PRs. See ADL [2026-07-12-one-pr-per-story-default.md](../decision-log/2026-07-12-one-pr-per-story-default.md) for rationale.

## Manual Testing

- Manual test suites live in `qa/` at the repository root.
- `qa/release-validation/` contains critical path test cases (CP1–CP8) for release validation.
- Test cases follow the template in `.pair/knowledge/guidelines/collaboration/templates/manual-test-case-template.md`.
- When a bug fix or feature changes behavior covered by an existing CP, the corresponding test case MUST be updated.

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting (`prettier:fix`), markdown lint (`mdlint:fix`).
- **Gate & tooling code:** a gate's logic lives in a tested module in its owning package (white-box unit tests); scripts/CLIs are thin entrypoints and a root gate delegates (`pnpm --filter <pkg> <gate>`). Scripts are never unit-tested — CLI-level checks go to smoke tests. See ADL [2026-07-13-gate-tooling-code-in-tested-modules.md](../decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md). Gate/tooling packages are organized by bounded context, not one package per tool family — a new tool family sharing an existing package's bounded context is a new folder there, not a new package. See [ADR-014](adr/adr-014-tool-package-boundary-by-bounded-context.md).
- **Conformance tests** (`packages/knowledge-hub/src/conformance/`): one test file per target KB artifact (a `SKILL.md`, guideline, or template), not per introducing story — a new story extends the matching file's `describe` block instead of adding a new story-named file. See ADL [2026-07-18-conformance-test-per-file-not-per-story.md](../decision-log/2026-07-18-conformance-test-per-file-not-per-story.md).

### Custom Gate Registry

| Order | Gate         | Command                           | Scope Key | Required | Description                                     |
| ----- | ------------ | --------------------------------- | --------- | -------- | ----------------------------------------------- |
| 1     | Quality Gate | `pnpm quality-gate`               | quality   | Yes      | build test and formatting check&fix             |
| 2     | Smoke tests  | `pnpm smoke-tests`                | testing   | Yes      | smoke test to check all e2e cli release process |
| 3     | E2E tests    | `pnpm --filter @pair/website e2e` | testing   | Yes      | Playwright E2E tests (builds + starts Next.js)  |

---

All development activities must follow these adopted practices. For process and rationale, see [way-of-working.md](../../way-of-working.md).
