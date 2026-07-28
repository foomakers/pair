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
- **Assignment — everything worked on carries an assignee:** every item an agent or a human touches (story, tech-debt, epic, PR) is **assigned to the person the work is done for** — on this project, the maintainer. This is not bookkeeping: the board is read filtered by assignee, so an unassigned item is invisible there even when it is open, has a PR and is green. It applies at the moment the work starts, to the follow-ups filed *during* the work (they are the ones most often left orphaned), and to the PR as well as the story — a PR whose `author` is set but whose `assignees` is empty does not appear in an assignee-filtered view. Skills that create or update items (`/pair-capability-write-issue`, `/pair-capability-publish-pr`) set the assignee as part of the write, never as a follow-up step.
- **PR granularity — one PR per story (default):** A story's work lands in a single PR by default, even when the story is broken into multiple inline tasks/findings. Splitting into multiple PRs per story requires an explicit reason (e.g. unusually large story, or independently shippable/needed-sooner parts) — it is not the default. Per-task granularity within that one PR is expressed as commit-per-task (see Commit History Policy above), not as separate PRs. See ADL [2026-07-12-one-pr-per-story-default.md](../decision-log/2026-07-12-one-pr-per-story-default.md) for rationale.

## Git Workflow

**Nothing declared here — both keys are at their defaults**, and `.pair/adoption/` is delta-only (D21, ADR-018): a key belongs in this section only when it differs from the default. `code-host` omitted ⇒ the code host **is** the PM tool (GitHub Projects hosts the repo), so this is the zero-configuration single-tool path — no dual-write, no cross-link comment, every PR/review operation on GitHub; `base-branch` omitted ⇒ `main`. A split setup (e.g. Linear for the backlog + GitHub for the code) is what makes `code-host` load-bearing. Schema and resolution rule: [way-of-working / PM-tool + code-host resolution](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).

## State Mapping

Maps this project's GitHub Projects board columns to the 5 canonical macrostates (see [canonical-states.md](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)). Skills read and write item state through this map, never the raw board labels.

| Board State | Macrostate  |
| ----------- | ----------- |
| Todo        | Draft       |
| Refined     | Ready       |
| In Progress | In Progress |
| Done        | Done        |

- `Refined` (legacy board column) maps to the canonical `Ready` — the column keeps its name, skills treat it as `Ready` (migration note #243). This is what lets `/pair-process-refine-story` complete its Draft→Ready transition on this board.
- No board column maps to `Review`: this project reviews on the PR and merges straight to `Done`. A skill asked to write `Review` will HALT and report the gap rather than guess.

## Manual Testing

- Manual test suites live in `qa/` at the repository root.
- `qa/release-validation/` contains critical path test cases (CP1–CP8) for release validation.
- Test cases follow the template in `.pair/knowledge/guidelines/collaboration/templates/manual-test-case-template.md`.
- When a bug fix or feature changes behavior covered by an existing CP, the corresponding test case MUST be updated.

## Quality Gates

- `pnpm quality-gate` is the adopted project-level quality gate command.
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting (`prettier:fix`), markdown lint (`mdlint:fix`).
- **Pre-merge tiering**: `disabled` (default) — every PR runs the full pre-merge check suite. Set to `enabled` to opt into risk-tier-scoped pre-merge checks (lighter checks on lower-risk PRs) per [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline.
- **Coverage guardrail**: `enabled` — pair dogfoods its own capability: the [`Coverage guardrail` step](../../../.github/workflows/ci.yml) in CI sources [`coverage-gate.sh`](../../knowledge/assets/coverage-gate.sh), extracts the line-coverage % from each package's istanbul `coverage-summary.json`, and blocks a PR whose coverage drops below the human-committed baseline in [`tech/coverage-baseline.md`](./coverage-baseline.md) (maintaining/improving passes — not an absolute wall). The framework **default remains `disabled`** (the dataset template ships off); this line is pair's project-level opt-in only. See [coverage guardrail](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) + [config format](../../knowledge/assets/coverage-config-example.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline. **Coverage baseline commit-back**: `disabled` — the separate, nested opt-in ratchet (#372, framework default also `disabled`): when `enabled`, a **push to the base branch** (never a PR run, never a fork) proposes a raised `baseline.<type>` as a **bot pull request** from `chore/coverage-baseline-ratchet`, never a push to `main`, and requires a repo-scoped `COVERAGE_RATCHET_TOKEN` (`contents: write` + `pull requests: write`, no protection bypass) — without it the step warns and the gate's verdict is unchanged. It stays `disabled` here until story #234's branch protection is applied and that secret is provisioned (ADR-018 lands with that story, so it is not linked from here yet); see ADL [2026-07-30-coverage-ratchet-pr-not-push.md](../decision-log/2026-07-30-coverage-ratchet-pr-not-push.md).
- **Pair review required checks**: `pair-review` + `pair-explicit-approval` are the required status checks that make the judgment review unskippable (R5.7) and enforce the 🔴 explicit-human-approval rule (D10) — see [pr-states.md](../../knowledge/guidelines/collaboration/project-management-tool/pr-states.md) and [ADR-018](adr/adr-018-pr-state-flow-required-checks.md). Status on this repo: **not yet applied** — writing branch protection needs admin scope, so it is a deliberate human step; until applied, enforcement here is advisory (the documented degraded mode).
- **Gate & tooling code:** a gate's logic lives in a tested module in its owning package (white-box unit tests); scripts/CLIs are thin entrypoints and a root gate delegates (`pnpm --filter <pkg> <gate>`). Scripts are never unit-tested — CLI-level checks go to smoke tests. See ADL [2026-07-13-gate-tooling-code-in-tested-modules.md](../decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md). Gate/tooling packages are organized by bounded context, not one package per tool family — a new tool family sharing an existing package's bounded context is a new folder there, not a new package. See [ADR-014](adr/adr-014-tool-package-boundary-by-bounded-context.md).
- **Conformance tests** (`packages/knowledge-hub/src/conformance/`): one test file per target KB artifact (a `SKILL.md`, guideline, or template), not per introducing story — a new story extends the matching file's `describe` block instead of adding a new story-named file. See ADL [2026-07-18-conformance-test-per-file-not-per-story.md](../decision-log/2026-07-18-conformance-test-per-file-not-per-story.md).
- **Monorepo tooling gotchas** (e.g. `pnpm --filter` bypassing turbo's `dependsOn` graph on a fresh checkout): documented once, centrally, in `DEVELOPMENT.md`'s `Turbo Caching` section — affected packages' READMEs carry only a short pointer, not a full copy. See ADL [2026-07-18-workspace-gotcha-doc-placement.md](../decision-log/2026-07-18-workspace-gotcha-doc-placement.md).

### Custom Gate Registry

| Order | Gate         | Command                           | Scope Key | Required | Description                                     |
| ----- | ------------ | --------------------------------- | --------- | -------- | ----------------------------------------------- |
| 1     | Quality Gate | `pnpm quality-gate`               | quality   | Yes      | build test and formatting check&fix             |
| 2     | Smoke tests  | `pnpm smoke-tests`                | testing   | Yes      | smoke test to check all e2e cli release process |
| 3     | E2E tests    | `pnpm --filter @pair/website e2e` | testing   | Yes      | Playwright E2E tests (builds + starts Next.js)  |

---

All development activities must follow these adopted practices. For process and rationale, see [way-of-working.md](../../way-of-working.md).
