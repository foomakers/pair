# Decision: Review contract inventory prevents serial findings

## Date

2026-09-01

## Status

Active

## Category

Process Decision

## Context

The bounded delta re-review correctly exposed defects introduced by fixes, but it found them one
ordinary state at a time. On #419, fixes moved from an already-dirty path, to an unsupported
`git status --porcelain` shape, to a silent skip of another normal shape. The reviewer had one
concrete failure case per round and the fixer repaired that example, not the finite input domain.
Stopping on a count increase is therefore useful evidence for human investigation, not a reason
to hide the increase.

## Decision

Before reporting or fixing a changed observable contract, the reviewer/fixer maps its authoritative
producer, inputs, consumers and distributed representations. For a finite protocol, parser,
configuration, state transition or command-output domain, it builds a decision table containing
every supported state and invalid/boundary pair, and probes/tests each row against real behavior.
The first review inventories the full PR surface; a re-review inventories only its fix delta and
directly changed boundary. A fixer may not implement one newly found normal row and wait for a
later re-review to reveal the next one.

## Alternatives Considered

- **Keep only the generic convergence sweep**: rejected — it names paired paths but did not make
  a finite protocol domain explicit, so a scalar repro still drove a scalar fix.
- **Rescan the full PR on every re-review**: rejected — it reopens unchanged scope; the immutable
  baseline/delta rule remains in force.
- **Ignore a rise in findings**: rejected — the monitor's stop is the deliberate signal that a
  fix may have introduced a defect and requires investigation.

## Consequences

- The initial review may front-load more findings, but ordinary variants are no longer deferred to
  later rounds.
- Fixes touching finite state domains carry a complete test matrix before code changes.
- A count increase remains a valid human stop condition; it now points to a specific missing
  inventory rather than being treated as the convergence mechanism itself.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records the inventory requirement under Review
  Convergence.
- `packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js` and its installed mirror:
  require the inventory in reviewer/fixer prompts.
- Both dry-run copies of `pair-implement-batch.test.mjs`: pin the prompt path and finite-state
  rule.
