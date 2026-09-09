# Decision: Use a deterministic code canary for delivery workflow validation

## Date

2026-09-09

## Status

Active

## Category

Process Decision

## Context

US-479 requires a live delivery-workflow canary through `ready-for-merge`. Two
runs against #321 stopped at `failed-red-contract`: its Markdown-prose regex
findings cannot produce a discriminating RED contract. The D2 verifier correctly
rejected both attempts; raising the repair budget would not make that evidence
valid. Seal, GREEN and P3 still need one live proof.

## Decision

Refine US-479 with measurable acceptance criteria, then use a new, small code
story with deterministic Vitest oracles as the canary. Stack it on
`feature/US-479-delivery-workflow-to-be`; preserve the normal RED repair budget.
Record the run/phase handoffs, first review and final synthesis on PR #480.

## Alternatives Considered

- **Retry #321 with a higher repair budget**: rejected; prose-regex assertions
  remain non-discriminating and would only spend more agents.
- **Accept the partial #321 runs**: rejected; they do not exercise Seal, GREEN
  or P3 and therefore do not meet the canary acceptance criterion.

## Consequences

The canary costs one refinement and a short deterministic implementation run.
It tests the intended A-to-D workflow path without weakening the RED-contract
policy. The two #321 runs remain useful evidence for typed refusal behavior.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records deterministic-code canary
  selection under Review Convergence.
