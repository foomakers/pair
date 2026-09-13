# Decision: when no host runtime is present, the final reviewer runs `finalize` — the synthesis is still the script's, never the reviewer's prose

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

ADR-024 T-25/T-26 assigned `metrics.json` and the ONE final synthesis comment to
`cycle-runtime.mjs entry/observe/finalize`, "run by the coordinator's launch recipe". The recipe
exists as a documented bash block (and `recipe.test.mjs` runs it line by line), but nothing in the
repository executes it during a real run: the Workflow sandbox has no shell, and the review-phase
skill was told the synthesis was "never yours to publish". Canary v9 therefore ended with the r1
APPROVED verdict in `.pair/working/runs/…/r1-review-phase.json`, the PR showing only the r0
CHANGES-REQUESTED review, `published.synthesis: false`, and a coordinator `metricsRef` pointing at
a `metrics.json` nobody had written.

## Decision

1. **`finalize` has two legitimate callers, decided by evidence on disk.** If the run directory
   holds `.runtime-checkpoint.json` or `.run-terminal.json`, a host runtime is present and owns
   `finalize` (the recipe, unchanged). If neither exists, the final reviewer — the one whose
   converging publish makes `resolve` answer `done`, non-partial — runs
   `cycle-runtime.mjs finalize --dir $RUN_DIR --repo … --story … --branch … --pr … --runId $run`
   itself, after its publish. It is the same script, the same run-scoped marker, the same
   read-back confirmation; metrics are reduced from the handoffs alone and report `completeness:
   partial` honestly. The reviewer never writes the synthesis text.
2. **The reviewer reports what it did, and the coordinator treats it as evidence.** The returned
   result carries `metrics: { owner: review-phase | host, written, revision, completeness }` and
   `published.synthesis`. `metricsRef` in the engine result names `metrics.json` only when a
   reviewer reported it written or a host runtime present; otherwise it is `absent`. A reviewer
   that owned the synthesis and could not confirm it ends the story `failed-publication`, with
   the quality evidence intact and the retry being publication only.

## Alternatives Considered

- **A dedicated "finalize" dispatch from the coordinator**: rejected — one more agent for a
  deterministic script contradicts ADR-024 §8 (agent budget is an acceptance criterion); the
  reviewer already holds the shell and the run directory.
- **Let the reviewer `pr-comment.mjs upsert` a hand-written synthesis**: rejected — T-26 made the
  synthesis a deterministic view of the handoffs precisely so no second judgment is published;
  the fallback keeps that by running the reducer, not by prose.
- **Keep the recipe as the only publisher and document the gap**: rejected — the PR is the
  maintainer's surface; a verdict that exists only in a gitignored directory did not happen.

## Consequences

- With a host runtime the behaviour is unchanged; without one, a converged cycle now ends with the
  synthesis on the PR and a partial `metrics.json` in the run directory.
- The reviewer's Step 5 gains one conditional command and two result fields; `VERIFY_SCHEMA`
  declares them so the harness does not drop them.
- Tests: coordinator (metricsRef as evidence, `absent`, `failed-publication`), runtime CLI
  (`finalize` on a run directory holding only handoffs publishes and confirms).

## References

- [ADR-024](../tech/adr/adr-024-delivery-phases-are-skills.md), amendments (b) T-25/T-26 and (v)
- `.claude/skills/pair-workflow-review-phase/SKILL.md` Step 5.3; `cycle-runtime.mjs finalizeMetrics`

## Addendum 2026-09-13 — t9d-1: where the host recipe can and cannot be wired

Verified on `d8646222` and after: on the workflow path (the Workflow sandbox, which is where
`/pair-loop` and `pair-implement-batch` run) there is **no shell**, so neither `pair-loop.js` nor
the coordinator can invoke `cycle-runtime.mjs entry/observe/finalize`; the decision above is what
closes the delivery gap there — the final reviewer runs `finalize`, and the coordinator turns an
unconfirmed synthesis into `failed-publication`. No cheap hook exists in `pair-loop.js` (it calls
`workflow('pair-implement-batch', …)` and nothing else can execute a process). The natural host for
the full recipe is the pair CLI's `pair run` (`apps/pair-cli/src/commands/run/spawn.ts` spawns the
engine per iteration and owns a shell): wiring `entry` before the spawn and `observe`/`finalize`
around it is a follow-up in that package, not an engine change. Until then `entry` is
documentation plus `recipe.test.mjs`, and the reviewer fallback is the path that runs.
