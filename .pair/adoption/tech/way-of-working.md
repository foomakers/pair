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
- Quality gate includes: type checking (`ts:check`), testing (`test`), linting (`lint`), formatting and markdown lint in **check mode** (`format:check`), plus a guard that the gate stays check-mode (`gate:composition`).
- **Formatters never run in write mode inside the gate**: the gate reports, `pnpm format` fixes deliberately. See ADL [2026-07-31-pre-push-gate-is-check-only.md](../decision-log/2026-07-31-pre-push-gate-is-check-only.md).
- **Pre-merge tiering**: `disabled` (default) — every PR runs the full pre-merge check suite. Set to `enabled` to opt into risk-tier-scoped pre-merge checks (lighter checks on lower-risk PRs) per [tier-aware-pipeline.md](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline.
- **Review enforcement**: `disabled` (default) — the pair review **runs and publishes its verdict**, but nothing it says blocks a merge: `pair-review` and `pair-explicit-approval` are not required status checks, and the 🔴 explicit-approval rule is advisory. Set to `enabled` to make them required and the rule binding, per [pr-states.md](../../knowledge/guidelines/collaboration/project-management-tool/pr-states.md); `/pair-capability-setup-gates` reads this flag before touching branch protection, and `/pair-process-bootstrap` asks for it when no decision exists. Disabled is the default deliberately: a review that blocks by default turns a first install into a repository nobody can merge into — on a single-maintainer repo the 🔴 non-author approval is unobtainable outright. The tier requirements themselves (reviewer count, SLA, checklist depth, whether 🔴 needs explicit approval) are redefinable in this file; that the review **runs** is not.
- **Coverage guardrail**: `enabled` — pair dogfoods its own capability: the [`Coverage guardrail` step](../../../.github/workflows/ci.yml) in CI sources [`coverage-gate.sh`](../../knowledge/assets/coverage-gate.sh), extracts the line-coverage % from each package's istanbul `coverage-summary.json`, and blocks a PR whose coverage drops below the human-committed baseline in [`tech/coverage-baseline.md`](./coverage-baseline.md) (maintaining/improving passes — not an absolute wall). The framework **default remains `disabled`** (the dataset template ships off); this line is pair's project-level opt-in only. See [coverage guardrail](../../knowledge/guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-opt-in-regression-gate-consumed-by-this-pipeline) + [config format](../../knowledge/assets/coverage-config-example.md); `/pair-capability-setup-gates` reads this flag before generating the pipeline. **Coverage baseline commit-back**: `disabled` — the separate, nested opt-in ratchet (#372, framework default also `disabled`): when `enabled`, a **push to the base branch** (never a PR run, never a fork) proposes a raised `baseline.<type>` as a **bot pull request** from `chore/coverage-baseline-ratchet`, never a push to `main`, and requires a repo-scoped `COVERAGE_RATCHET_TOKEN` (`contents: write` + `pull requests: write`, no protection bypass) — without it the step warns and the gate's verdict is unchanged. It stays `disabled` here until story #234's branch protection is applied and that secret is provisioned (ADR-018 lands with that story, so it is not linked from here yet); see ADL [2026-07-30-coverage-ratchet-pr-not-push.md](../decision-log/2026-07-30-coverage-ratchet-pr-not-push.md).
- **Pair review required checks**: `pair-review` + `pair-explicit-approval` are the required status checks that make the judgment review unskippable (R5.7) and enforce the 🔴 explicit-human-approval rule (D10) — see [pr-states.md](../../knowledge/guidelines/collaboration/project-management-tool/pr-states.md) and [ADR-018](adr/adr-018-pr-state-flow-required-checks.md). Status on this repo: **not yet applied** — writing branch protection needs admin scope, so it is a deliberate human step; until applied, enforcement here is advisory (the documented degraded mode). **Ordering constraint** (applies in this order, or every merge stops): 1. provision the `pr-state:*` labels + add the `pair-explicit-approval` workflow (neither needs admin scope — this repo has not added the workflow yet, so the context does not report today); 2. confirm on a real PR that `pair-review` and `pair-explicit-approval` both report on the head commit, **and** that the approval context re-reports on that same head SHA after a review submission; 3. only then `PUT` the branch protection, keeping `enforce_admins` off until one PR has merged through it. The whole sequence (including the merge-block outcomes per tier) was executed on a throwaway repository — see `github-implementation.md` § "Verified on a throwaway repository" — so what remains here is applying it, not discovering whether it works. **This repo is single-maintainer**, so a 🔴 PR cannot satisfy `pair-explicit-approval` (GitHub rejects a self-approval): a second human reviewer account is a prerequisite for making that context required here — otherwise leave it out of the required list and keep the 🔴 rule advisory. The solo-maintainer alternative (a verified human approval token instead of a second account) is tracked as [#398](https://github.com/foomakers/pair/issues/398). **When the protection is written here, use the `checks` form with `app_id` pinned** for `pair-explicit-approval` (an unpinned status context is satisfiable by any push-access token, including the agent's); `pair-review` stays unpinned and is an anti-accident control, not an authorization control — see `github-implementation.md` § "What each context proves".
- **Gate & tooling code:** a gate's logic lives in a tested module in its owning package (white-box unit tests); scripts/CLIs are thin entrypoints and a root gate delegates (`pnpm --filter <pkg> <gate>`). Scripts are never unit-tested — CLI-level checks go to smoke tests. See ADL [2026-07-13-gate-tooling-code-in-tested-modules.md](../decision-log/2026-07-13-gate-tooling-code-in-tested-modules.md). Gate/tooling packages are organized by bounded context, not one package per tool family — a new tool family sharing an existing package's bounded context is a new folder there, not a new package. See [ADR-014](adr/adr-014-tool-package-boundary-by-bounded-context.md).
- **Conformance tests** (`packages/knowledge-hub/src/conformance/`): one test file per target KB artifact (a `SKILL.md`, guideline, or template), not per introducing story — a new story extends the matching file's `describe` block instead of adding a new story-named file. See ADL [2026-07-18-conformance-test-per-file-not-per-story.md](../decision-log/2026-07-18-conformance-test-per-file-not-per-story.md).
- **Monorepo tooling gotchas** (e.g. `pnpm --filter` bypassing turbo's `dependsOn` graph on a fresh checkout): documented once, centrally, in `DEVELOPMENT.md`'s `Turbo Caching` section — affected packages' READMEs carry only a short pointer, not a full copy. See ADL [2026-07-18-workspace-gotcha-doc-placement.md](../decision-log/2026-07-18-workspace-gotcha-doc-placement.md).

### Review Tier Matrix — overridable here

The per-tier requirements (reviewer count, SLA, checklist depth, whether 🔴 needs explicit approval) are **KB defaults**, resolved through the `Argument > Adoption > KB default` cascade. The defaults live in `quality-model.md` § *Per-Tier Requirements`; this file is where a project changes them.

**No override in force.** Nothing is transcribed below on purpose: a copy of the defaults sitting here would be a second copy of the same truth with nothing comparing the two — and because Adoption wins over KB default, a stale copy would silently override an improved default. Absent an override, the KB defaults are what apply.

**To override**, add the keys you are changing — the shape the KB documents:

```yaml
# tier.red.reviewers: 2
# tier.red.sla_days: 3
```

**And when you do, write the effective matrix here too**, as a table: once the values diverge from the defaults, the ones in force must be visible where they are decided, not reconstructed by a reader diffing two files. The rule is deliberate in both directions — identical means absent, different means written out.

The "Merge" column only bites when `Review enforcement` is `enabled` (above). Disabled — the default — the review runs and reports, and none of these requirements block a merge.

### Custom Gate Registry

| Order | Gate         | Command                           | Scope Key | Required | Description                                     |
| ----- | ------------ | --------------------------------- | --------- | -------- | ----------------------------------------------- |
| 1     | Quality Gate | `pnpm quality-gate`               | quality   | Yes      | build, test, formatting check (never fix)       |
| 2     | Smoke tests  | `pnpm smoke-tests`                | testing   | Yes      | smoke test to check all e2e cli release process |
| 3     | E2E tests    | `pnpm --filter @pair/website e2e` | testing   | Yes      | Playwright E2E tests (builds + starts Next.js)  |

---

All development activities must follow these adopted practices. For process and rationale, see [way-of-working.md](../../way-of-working.md).
