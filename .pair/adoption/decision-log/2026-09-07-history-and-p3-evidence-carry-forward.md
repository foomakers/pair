# Decision: Bind history dispositions and P3 evidence to machine-verifiable inputs

## Date

2026-09-07

## Status

Active

## Category

Process Decision

## Context

PR #471 supplied a valid two-SHA history decision, but a reviewer omitted optional
`history-subject` metadata and the workflow escalated again. Separately, P3 twice measured a
false green on the current head while a later full reviewer omitted it; RED only received the
latest review findings, so the known regression could silently leave the repair perimeter.

## Decision

The workflow accepts an untyped history finding only when its own subject-only text names one or
more unambiguous prefixes of the exact authorized SHAs. It never applies that fallback to an
explicit technical finding, unknown full SHA, or finding without a subject cue.

Use card-level `requiredFindings` for verified P3 evidence. Every entry carries its exact
`observedHead`, finding, oracle, probe and observed result. The reviewer stays blind; RED receives
the evidence once only when its fresh review is on that exact SHA. A different SHA returns
`failed-required-findings` before RED rather than applying stale evidence.

## Alternatives Considered

- **Trust the reviewer metadata**: rejected; an optional field was omitted by a real run.
- **Pass free-form notes to RED**: rejected; it is untyped, has no head/oracle custody and lets
  reviewer variance silently redefine the fix perimeter.

## Consequences

- An authorized subject-only history disposition no longer depends on reviewer grouping syntax.
- A known P3 regression remains mandatory without biasing the independent review.
- Resuming after any code movement requires a fresh observation, not a reused claim.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records narrow history fallback and SHA-bound P3 carry-forward.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: validate and enforce both inputs.
- Agent definitions and batch-engine reference: describe the custody boundary.
