# Decision: Implementation never files a new card; a debt found while implementing extends the story that surfaced it

## Date

2026-08-12

## Status

Active

## Category

Process Decision

## Context

While driving six stories through the `implement-batch` orchestrator (implement → PR → independent review → fix), the review step opened **five new tech-debt issues in twenty-two minutes**: #426, #427, #428, #429, #430, all created between 07:11 and 07:33 on 2026-08-11 while the reviewers were reading PRs #420, #421 and #423. A sixth, #431, followed from PR #424.

They were not a slip. The reviewer prompt instructed it explicitly — _"write exactly `Deferred to #<number>` when the finding belongs to a separate tracked story (**file one via `/pair-capability-write-issue` if none exists yet**)"_ — so a reviewer that found a real defect and understood it was told to record it and move on rather than fix it.

The result is a review that converts itself into backlog. Each of those issues describes a defect that was **found, understood and diagnosed to the file and line** by an agent that had the code in front of it, and then left unfixed. Concretely:

- **#426** — `handleMirrorCleanup` compares only the top level of a mirror registry, so a stale nested file survives every `pair update`. Two orphaned how-to files had been shipping for ~5 months and were listed in `.pair/llms.txt`; PR #421 deleted those two **by hand** and filed the class as a card.
- **#428** — the same-source install race left by the cache-slot keying that PR #423 introduces: the residual defect of the very mechanism being built.
- **#431** — `release.yml` `chmod +x`-es its scripts before running them, masking committed modes. Story #400 exists precisely to stop modes being masked, and its own guard covered only `scripts/smoke-tests/`.

In each case the debt belongs to the story that created or touched that surface. Filing it separately splits one piece of work across two cards, hides the second behind a backlog nobody prioritises, and leaves the first looking complete while the defect it introduced ships.

Three of the six were additionally never added to the project board, so they were invisible to every count of the backlog — the same condition #291 has been in since July.

## Decision

**An agent implementing or reviewing a story never creates a new work item.**

When implementation or review surfaces a defect, gap or debt:

1. **Fix it in the same pull request**, within the story's scope, as the first option.
2. **If it does not fit the story's stated scope, extend the story** — widen the card's scope section and its acceptance criteria to cover it, then fix it in the same PR. The story grows to match the work its own implementation revealed.
3. **If the finding is so large that absorbing it would swamp the story**, leave it as an _actionable_ finding on the PR and say so plainly. The human decides at the merge gate whether to accept a bigger PR or carve the work out. That decision belongs to the maintainer, not to the agent.

Referencing an **already-existing** card stays allowed — the ban is on creating, not on citing.

This binds the `implement-batch` reviewer and fixer prompts, `/pair-process-review`, and any orchestrator composing them.

## Alternatives Considered

- **Keep filing cards, but always add them to the board**: rejected — it fixes the visibility symptom and keeps the split. The defect still ships while its own PR is marked complete.
- **Let the reviewer decide case by case**: rejected — that is what produced the six. Given a legitimate escape hatch, an agent optimising for a clean, tightly-scoped PR will take it every time, because filing a card always looks tidier than widening a story.
- **Fix silently without touching the card**: rejected — the PR would then implement work its story does not describe, and the review has no acceptance criterion to judge it against.

## Consequences

- Stories get larger and PRs get wider. That is the intended trade: a wider PR that closes a defect beats a narrow one plus a card that ages.
- The backlog stops growing as a side effect of doing the work. New items enter it deliberately, from refinement or from the maintainer — never as review exhaust.
- A story's scope becomes a living statement rather than a contract frozen at refinement. The scope section records what was absorbed and why.
- The merge gate carries more judgment: the human sees "this PR grew to include X" instead of "this PR is done, and here are three new cards".
- Existing cards that were filed this way are resolved by **extending the story that produced them** and closing them as absorbed, not by implementing them separately. #431 → story #400 / PR #424 is the first application.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md) — a policy bullet next to "PR granularity — one PR per story (default)" states the ban and points here. Done in the same change as this record.
- `.claude/workflows/implement-batch.js` — the reviewer and fixer prompts carry the ban ("DO NOT FILE NEW ISSUES", no `/pair-capability-write-issue`, no "tracked separately"), pinned by tests in `implement-batch.test.mjs`. That prompt change is the orchestrator's own change and lands with it, **not** in PR #424 — this record is the decision, not its enforcement point.
- `/pair-process-review` — the deferral instruction stops offering to file the card it defers to; only an existing number may be cited. Its enforcement point is Phase 4.2 Step 5 (the tech-debt promotion step), rewritten in **both** copies — dataset source and installed mirror — and pinned by `implementation-never-files-a-card.test.ts`. Done in the same change as this record: an Active policy may not ship next to the instruction that violates it.

## References

- Issues created by this failure mode: #426, #427, #428, #429, #430, #431
- First application: story #400 / PR #424 — #431 absorbed as a scope extension and closed, not implemented separately
- Related: ADL [2026-07-11-agent-execution-layer.md](2026-07-11-agent-execution-layer.md) (amended 2026-07-18) — "outside the story's originally stated scope" was already rejected as a reason to mark a finding non-actionable; this decision closes the remaining escape route
- Related: ADL [2026-07-12-one-pr-per-story-default.md](2026-07-12-one-pr-per-story-default.md) — one PR per story; this decision is what keeps that PR from shedding its findings into new cards
