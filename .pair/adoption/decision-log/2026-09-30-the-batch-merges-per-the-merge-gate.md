# Decision: the batch merges per the merge gate; `pair-loop` no longer merges

## Date

2026-09-30

## Status

Active

## Category

Process Decision

## Context

Autonomy A2 (#524) on top of ADR-027 (#521). `pair-loop` merged through its own `cycle-merge.mjs` call after the batch returned (decision-log 2026-08-23: the loop's `## Auto-Advance` default is `(none)`, fail-closed), while the batch said "NEVER merges". With the autonomy model (`until`, `prepare`, `merge` gates) there must be ONE owner of merge authority, and the batch must behave like the cycle on N cards, in session or unattended.

## Decision

1. `pair-implement-batch` is `pair-workflow-cycle` on N cards: same arguments (`until` / `prepare` / `merge`, argument > adoption > KB default), a decision at every stage boundary, escalation per boundary, and it merges a review-approved card when — and only when — the merge gate allows it. Default (nothing declared, legacy `## Auto-Advance (none)`, no arguments): nothing merges; the batch still stops at PR-ready.
2. The sandbox holds no rule. The effective policy (`autonomy-policy.mjs resolve`), each stage-boundary decision (`decide`) and the merge (`cycle-merge.mjs check|run`, pinned to `reviewedHead`) are scripts an agent runs, their JSON relayed and shape-validated; unreadable or malformed output parks the card `halted` (fail-closed), never merged. No new agent type, no new LLM judgment (ADR-024 §7).
3. `pair-loop` selects (`pair-next` with the resolved `filter` / `assignee` / `status` / `root`), hands `until` / `prepare` / `merge` to the batch and repeats. `pair-loop.js` holds no `cycle-merge.mjs` call (grep-pinned); it records the batch's per-card outcome (`merged`, `awaiting-human`, `escalated`, `target-ready`, PR-ready, failed).
4. The row status `escalated` (an autonomy condition fired: conditions + stage, one idempotent card comment, not re-drivable) is distinct from the review's `escalate`. One card escalating or failing never aborts the others.
5. `policyText` is no longer a required batch argument: the resolve script reads `automation.md` itself. It stays an optional hint (`""` = no file, so a run with no autonomy argument dispatches no resolve). `pair-loop` still requires it for its own legacy knobs (`## Eligibility`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location`).
6. "Declared" is `autonomy-policy.mjs parse().declared` everywhere; an empty `## Autonomy` section is off. The A1 refusal `autonomy-not-supported-until-#524` is removed from batch and loop.
7. No Workflow tool: the documented path is `/pair-workflow-cycle` one card at a time with the same arguments.

## Alternatives Considered

- **Keep the merge in the loop, pass the policy down.** Rejected: two owners of merge authority, and a batch run outside the loop would behave differently from the cycle.
- **Evaluate the gate in the sandbox.** Rejected: re-derives the rule (D18); the 4-way parity test (cycle, batch sequential, batch parallel, `pair-cli run`) pins that nothing does.
- **Keep `policyText` required.** Rejected: it only existed because the sandbox cannot read files; the policy script now reads the adoption itself, and requiring a Read the batch no longer needs invites a stale copy.

## Consequences

- Revisits 2026-08-23 ([the loop's fail-closed Auto-Advance default](2026-08-23-pair-loop-auto-advance-fail-closed-default.md)): the default stays fail-closed (nothing merges); the owner of the merge moves from the loop to the batch.
- A legacy `## Auto-Advance <tier>` keeps today's outcomes: the same `cycle-merge.mjs` path, now run by the batch (`--autoAdvance`, not `--mergeGate`); the #490 merge canary is unchanged.
- Rollback: reverting restores the loop's own merge call; A1's path (cycle, `pair-cli run --card`) is unaffected.

## Adoption Impact

- `.pair/adoption/product/subdomain/collaborative-workflow.context.md`: `Coordinator` relays the merge gate's decision.
- `automation-policy.md` (KB), `/pair-loop` SKILL, the batch `meta`: batch = cycle, no own-merge loop.
