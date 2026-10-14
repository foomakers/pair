# Decision: ponytail enabled for this repo; rtk enabled for the review stage only

## Date

2026-10-13

## Status

Active (ponytail adopted 2026-10-14, was trial; rtk scoped to review)

## Category

Process Decision

## Context

Story #433 evaluated three third-party token-reduction tools for this repo only (never framework features): rtk (shell-output proxy), caveman (terse output), ponytail (least-code ruleset). rtk and ponytail were measured (A/B below); caveman was not (see Decision). Implementation A/B: the same `pair-cli tokens` feature implemented 3× per arm, fixed acceptance tests, model sonnet.

| Arm | Tests | Prod lines added | Output tokens | Cost |
| --- | --- | --- | --- | --- |
| baseline | 9/9 | 220 | 17.8k | $0.70 |
| rtk | 9/9 | 237 | 21.3k | $0.75 |
| ponytail | 9/9 | 184 | 15.7k | $0.64 |

rtk cut command output ~70% but saved nothing overall (context dominated by cache), and truncates large `git diff` output (−71% on a 20k-word diff, content dropped).

## Decision

- **ponytail**: enabled for this repo via `.claude/settings.json` (`enabledPlugins`, marketplace pinned to `v5.2.0`). Per-session opt-out `/ponytail off`. Trial closed 2026-10-14 (maintainer): adopted — measured −16% prod lines, −9% cost, same correctness (table above).
- **rtk**: enabled ONLY for the review stage. A `PreToolUse` Bash hook (`.claude/settings.json` → `scripts/dev/rtk-review-hook.mjs`) runs `rtk hook claude` only when the hook input's `agent_type` is `pair-reviewer`, is a no-op when `.tools/bin/rtk` is absent, and forwards only rtk's `updatedInput` (command text never rewritten; `permissionDecision` dropped, so the normal permission flow applies). A `SessionStart` hook (`scripts/dev/rtk-session-path.mjs`) prepends `$CLAUDE_PROJECT_DIR/.tools/bin` to PATH via `$CLAUDE_ENV_FILE` (created if missing) when the binary exists. Maintainer design decision 2026-10-13. Still opt-in: `scripts/dev/install-rtk.sh` (pinned, checksum-verified); not installed by `pnpm install`.
- **Scope**: `agent_type` is set in hook input for subagents and `claude --agent`. `pair-cli` run stages carry no `agent_type`, so they are NOT covered; implementation and main sessions are never rewritten.
- **caveman**: not installed and not measured. Maintainer exception to AC6 (2026-10-13): its technique (terse output) is the same as the guideline's default agent style, so it is covered by the shrink-discipline guideline.

Review A/B (T-12; Opus reviewer, 3 runs/arm, 2 seeded defects S1/S2):

| Arm | S1 found | S2 found | Cost/run |
| --- | --- | --- | --- |
| without rtk | 2/3 | 3/3 | $0.93 |
| with rtk | 3/3 | 3/3 | $0.82 (−12%; context −16%) |

Identical-or-better findings at lower cost: the condition set for reconsidering rtk is met for review only.

## Alternatives Considered

- rtk hook everywhere: no gain on implementation, lossy on large diffs; only review showed a gain.
- ponytail at user level only: leaves the repo's agents unconfigured.

## Consequences

Every Claude Code session and subagent in this repo receives the ponytail ruleset. Exit criterion: ponytail is removed if a later measurement shows lower correctness or no cost/line reduction; rtk review scoping is removed if a later review A/B shows fewer findings.

## Related

Story #433, `.pair/knowledge/guidelines/technical-standards/ai-development/shrink-discipline.md`, `CONTRIBUTING.md`.
