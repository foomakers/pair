# Decision: the final reviewer of a cycle concludes the required `pair-review` check and the `pr-state:*` label — merge stays outside the engine

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

`/pair-capability-publish-pr` registers `pair-review` as **pending** on the head and labels the PR
`pr-state:to-be-reviewed`, deferring the verdict to the review. In the delivery workflow the
review is `/pair-workflow-review-phase`, which ran `/pair-process-review` phases 1–4 only and was
forbidden to label — so no participant ever concluded the required check or synthesized the state
(T-9 fourth round, t9d-24). The engine converged to `ready-for-merge` with the check still pending:
advisory on this repository (`Review enforcement: disabled`), unmergeable for an adopter with
enforcement on, and documented nowhere as a deliberate limit.

## Decision

1. **The final non-partial reviewer concludes.** After its converging publish it runs
   `pr-state.mjs conclude --pr --sha <reviewedHead> --verdict approved|changes-requested`:
   `approved` only with `readiness.ready` true and zero blocking findings ⇒ `pair-review` `success`
   + `pr-state:ready-to-merge`; `changes-requested` with any blocking finding ⇒ `failure` +
   `pr-state:not-approved`. A non-decision (partial review, unproven readiness,
   `awaiting-scope-decision`) publishes **nothing** — the pending status keeps the merge blocked.
2. **One mapping, the KB's.** The script mirrors `pr-state.sh` (`review_check_conclusion`,
   `resolve_pr_state`'s label view); it removes every other `pr-state:*` label and reads the labels
   back before claiming the state. A status POST the token cannot make is reported as advisory,
   never faked; the same conclusion already on the head is `unchanged` (idempotent).
3. **Merge stays outside the engine.** The reviewer never merges; `pair-explicit-approval` remains
   the host's deterministic job; a human presses merge. The coordinator's result carries
   `published.reviewCheck` / `published.prState` as evidence (VERIFY_SCHEMA declares them).

## Alternatives Considered

+ **Leave the conclusion to a later `/pair-process-review` run**: rejected — nothing in the
  unattended path invokes it; the pending check would outlive every converged cycle.
+ **Record the limit only (ADR/ADL)**: rejected by the maintainer — the required check exists to be
  concluded by the review that produced the verdict.
+ **A GitHub check run instead of a commit status**: not writable by an ordinary token
  (github-implementation.md); the commit status is the mechanism publish-pr already uses.

## Consequences

+ `review-phase` gains Step 5.7 and the `scripts/pr-state.mjs` helper (installed + dataset);
  its "never label" prohibition is narrowed to this one deterministic write.
+ publish-pr Phase 5 and pr-states.md name who concludes; batch-engine.mdx stage 4 states it.
+ Tests: `pr-state.test.mjs` (mapping, status POST + label swap + read-back, degradation, idempotency,
  usage errors) and the coordinator schema/log.

## References

+ `.claude/skills/pair-workflow-review-phase/scripts/pr-state.mjs`; `.pair/knowledge/assets/pr-state.sh`
+ pr-states.md § Who does what; github-implementation.md § Publish the `pair-review` status
+ ADR-024 amendment (w)
