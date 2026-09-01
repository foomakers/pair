# Decision: External boundary proof prevents false equivalence

## Date

2026-09-01

## Status

Active

## Category

Process Decision

## Context

The finite-state inventory rule exposed #416's CRLF problem, but the fixer extended the repair to
bare CR by treating all carriage-return forms as equivalent. Its unit tests proved only the drift
checker’s classification. A minimal real Git probe showed the promised remedy was false: Git
normalizes CRLF to LF, but preserves a lone CR blob through checkout. The next review therefore
found a major regression: its advice forbade the only repair that actually worked.

## Decision

Whenever a decision-table row, equivalence, normalization or user-facing repair depends on an
external command, service, file format or runtime, identify its authoritative producer/consumer
and prove the claim with a minimal isolated end-to-end probe. Keep variants distinct until that
boundary demonstrates equivalence. Apply any proposed repair in the probe and verify its stated
postcondition. Unit tests of the changed function remain required but cannot substitute for this
boundary evidence.

## Alternatives Considered

- **Trust the implementation unit tests**: rejected — they cannot establish Git’s checkout
  semantics or prove user guidance outside the function’s process.
- **Treat all syntactically similar inputs as one state**: rejected — the external producer can
  distinguish them, as CRLF and lone CR demonstrate.
- **Defer external proof to re-review**: rejected — that makes the reviewer discover a repair
  regression after the fixer has already committed it.

## Consequences

- A finite-state table may contain an external-boundary probe per row or equivalence class.
- Fix reports include command, observed result and postcondition for external repair claims.
- Re-review may still stop on increased findings; it remains the signal that the required proof
  was absent or incorrect.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: extends Review Convergence with the boundary-proof
  requirement.
- `packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js` and installed mirror:
  require reviewers and fixers to prove externally-defined semantics and repair advice.
- Both workflow test copies: pin the prompt requirement so it cannot silently disappear.
