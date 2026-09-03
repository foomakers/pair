# Decision: Evidence ledger and interaction matrix prevent serial findings

## Date

2026-09-03

## Status

Active

## Category

Process Decision

## Context

The external-boundary proof correctly requires a real oracle, but its wording did not cover every
observable assertion made while fixing a contract. On PR #471 / story #434, a re-review of head
`117ff2f5c319aadba7cd2fea924b36b0c2ef35c8` found four Minor defects in one anchor-staleness
change: unproven explanatory text, a repeated measured count with no reproducible source, a
collision missed by independent duplicate-heading rows, and a diagnostic that erased decisive
invisible-character differences. These are real defects, not monitor noise. A finding-count rise
therefore remains a stop signal: it exposes an omitted proof or state interaction.

## Decision

For every changed empirical or externally-defined claim, reviewer and fixer record an evidence
ledger: claim, authoritative oracle, exact command/fixture/revision, and observed output. The same
measured output is the source for all comments, test names, decision records, PR text and
diagnostics; an unsupported claim is removed or explicitly qualified.

A decision table also includes the minimal interaction/collision rows whenever a rule’s output can
be another rule’s valid input, state, name or reservation. Diagnostics that display user input or
derived identifiers must be losslessly distinguishable: invisible, normalized or confusable
characters are represented unambiguously and tested against the expected/candidate values.

The fixer returns this ledger in structured output and appends it to the round’s working log. An
empty ledger is valid only when the fix makes no empirical or boundary claim.

## Alternatives Considered

- **Treat prose and diagnostics as non-contractual**: rejected — they direct users and reviewers,
  so a false explanation or ambiguous error is externally observable behavior.
- **Test independent rule rows only**: rejected — it misses collisions where generated output
  becomes a subsequent input.
- **Ignore a rise of Minor findings**: rejected — severity does not make an inaccurate claim or
  a hidden collision harmless; the rise is diagnostic evidence.

## Consequences

- Fix rounds carry a compact, reproducible proof for factual assertions instead of copying a
  plausible number or explanation across representations.
- Finite matrices may add a small number of cross-product rows and diagnostic assertions.
- A missing ledger or a rising finding count remains a fail-closed investigation point; this
  decision improves coverage but does not claim that an LLM can never make a new mistake.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: adds evidence-ledger, interaction and lossless-
  diagnostic requirements under Review Convergence.
- `.claude/workflows/pair-implement-batch.js` and
  `packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js`: require those proofs and
  structured fix output.
- `.claude/workflows/pair-implement-batch.test.mjs`: guards the prompt and schema path.
