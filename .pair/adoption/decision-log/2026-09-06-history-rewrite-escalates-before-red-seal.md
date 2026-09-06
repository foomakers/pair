# Decision: History rewrite escalates before RED sealing

## Date

2026-09-06

## Status

Active

## Category

Process Decision

## Context

On #434, a Minor correctly identified two ancestor commit subjects with an incorrect story
label. Rewording them would require rewriting history below an existing RED snapshot. The normal
`needsHumanDecision` route spends one RED → seal → GREEN round before escalating; doing that for
a history rewrite can create a newer seal and make the human choice harder or impossible without
breaking custody. The technical work in the same PR must still remain reviewable and actionable.

## Decision

The reviewer returns `needsHumanDecision: true` with
`humanDecisionKind: "history-rewrite"` when a finding can only be fixed by rewriting existing
Git history. The batch escalates immediately, before RED authoring, sealing or GREEN. A human
may pass a per-card `historyDecision` only with exact lower-case full commit SHAs and a prose
disposition. The reviewer may carry only a sole subject-line mismatch on one of those commits as
non-actionable. The decision never waives code, tests, docs, configuration, generated artifacts,
CI behavior, or any other commit; those stay actionable in the existing PR.

## Alternatives Considered

- **Use the ordinary one-fix-round escalation:** rejected; a new seal can freeze the history the
  human must decide about.
- **Rewrite or release the existing seal automatically:** rejected; it weakens the immutable RED
  custody chain and turns a review finding into destructive history mutation.

## Consequences

History-only issues stop early with visible evidence instead of generating an invalid fix loop.
The narrow typed input is validated before agents run, and the reviewer receives it as explicit
human context rather than author handoff. The workflow accepts no generic finding waiver.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records the pre-seal escalation rule.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: validate and enforce it.
- `.claude/agents/pair-reviewer.md` and dataset mirror: classify the exception consistently.
