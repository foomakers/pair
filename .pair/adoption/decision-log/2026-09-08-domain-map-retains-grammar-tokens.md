# Decision: Domain maps retain literal grammar tokens

## Date

2026-09-08

## Status

Active

## Category

Process Decision

## Context

The first PR #471 run with the RED domain mapper produced complete maps twice, but
`hasRedDomainEvidence` rejected every token containing backticks. It had reused `isProse`, whose
backtick and `$(` ban protects values later rendered into shell commands. Domain maps are only
serialized with `JSON.stringify` into agent prompts; rejecting `` `*/}` `` made an MDX grammar map
impossible before its contents could be verified.

## Decision

Validate domain-map text as non-empty, single-line strings without control characters. Preserve
the existing structural requirements: typed fields, at least two rows and unique conditions.
Do not apply shell-value prose restrictions to the map. The independent verifier still re-derives
the domain and rejects missing forms.

## Alternatives Considered

- **Tell the mapper to avoid syntax tokens**: rejected; prose aliases lose the exact discriminator
  being tested.
- **Relax all prompt-field validation**: rejected; values interpolated into commands retain the
  shell-oriented predicate.

## Consequences

- Grammar maps can represent real delimiters and remain fail-closed on malformed structure.
- The mapper remains read-only; this changes no source-fix authority or retry budget.

## Adoption Impact

- `.claude/workflows/pair-implement-batch.js` and dataset mirror: use domain-specific text checks.
- `.pair/adoption/tech/way-of-working.md` and batch-engine reference: distinguish JSON map data
  from shell-bound prose.
