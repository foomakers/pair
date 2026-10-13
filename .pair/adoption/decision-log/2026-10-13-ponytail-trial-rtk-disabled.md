# Decision: ponytail enabled as a repo-level trial; rtk disabled

## Date

2026-10-13

## Status

Active (trial — ponytail)

## Category

Process Decision

## Context

Story #433 evaluated three third-party token-reduction tools for this repo only (never framework features): rtk (shell-output proxy), caveman (terse output), ponytail (least-code ruleset). Measured A/B: the same `pair-cli tokens` feature implemented 3× per arm, fixed acceptance tests, model sonnet.

| Arm | Tests | Prod lines added | Output tokens | Cost |
| --- | --- | --- | --- | --- |
| baseline | 9/9 | 220 | 17.8k | $0.70 |
| rtk | 9/9 | 237 | 21.3k | $0.75 |
| ponytail | 9/9 | 184 | 15.7k | $0.64 |

rtk cut command output ~70% but saved nothing overall (context dominated by cache), and truncates large `git diff` output (−71% on a 20k-word diff, content dropped).

## Decision

- **ponytail**: enabled for this repo via `.claude/settings.json` (`enabledPlugins`, marketplace pinned to `v5.2.0`). Trial; per-session opt-out `/ponytail off`.
- **rtk**: disabled — no hook, not installed by `pnpm install`. `scripts/dev/install-rtk.sh` (pinned, checksum-verified) stays only for the review A/B (#433 T-12).
- **caveman**: not installed; its effect is pursued by the shrink-discipline guideline.

## Alternatives Considered

- rtk hook by default: no measured gain, lossy on review-sized diffs.
- ponytail at user level only: leaves the repo's agents unconfigured.

## Consequences

Every Claude Code session and subagent in this repo receives the ponytail ruleset. Exit criterion: ponytail is removed if a later measurement shows lower correctness or no cost/line reduction; rtk is reconsidered only if T-12 shows identical findings at lower cost.

## Related

Story #433, `.pair/knowledge/guidelines/technical-standards/ai-development/shrink-discipline.md`, `CONTRIBUTING.md`.
