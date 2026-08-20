# Decision: automation eligibility is ONE literal label — no boolean grammar until `pair-next --filter` widens first

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

Story #216's open question (A1) asked whether the product wants a boolean / multi-label eligibility grammar (`risk:green AND team:ui`). `pair-next --filter` — the query every eligibility consumer ultimately runs — takes ONE label string and matches it with plain string equality; there is no AND/OR/NOT grammar (#249, merged), and the argument surface is frozen (ADR-017 §1). Shipping a richer grammar in the adoption schema than the query can execute would produce a declaration that reads as a policy and silently selects nothing. The review of PR #443 asked for the answer to be recorded rather than left open, because the guideline's HALT-on-operator rule and its conformance guard both encode it.

## Decision

Eligibility is **exactly one literal label**, matched by string equality against the emitted labels. A comma, a second non-empty line, a standalone `AND` / `OR` / `NOT` token, or a second whitespace-separated colon-carrying token on the same line (`risk:green risk:yellow`, `risk:green or risk:yellow`) is a broken adoption file and HALTs the consumer — it is never partially honoured. Juxtaposition is a grammar too: accepting it would ship the multi-label declaration this decision rejects, minus the HALT. Widening this is a **separate story that widens `pair-next --filter` first**; this schema follows it, never leads it.

## Alternatives Considered

- **Ship a boolean grammar in the schema now, degrade at match time**: rejected — the declaration would promise selection behaviour no consumer can perform, and the degradation would either widen (unsafe) or silently match nothing (the failure mode the fail-safes exist to prevent).
- **Leave it undecided in the guideline ("today one label")**: rejected — the HALT rule and the conformance guard already encode "no grammar"; an undecided document plus a decided guard is drift by construction.
- **Comma-separated list as an OR**: rejected — it is a grammar with extra steps, and `--filter` cannot execute it.

## Consequences

- `automation-policy.md` defines malformed operationally (empty / more than one non-empty line / comma or operator / markdown block marker / over the 50-char label cap / more than one colon-carrying token) and HALTs on it; `automation-eligibility.test.ts` pins the rule and forbids any example filter carrying an operator.
- The day the product wants multi-label eligibility, the order of work is fixed: widen `--filter` (new story, ADR-017 §1 amendment), then this schema and its guard.
- A project needing "green OR my-team" today expresses it upstream — in what `classify` projects onto labels (`tech/risk-matrix.md` Tag Projection) — not in the eligibility declaration.

## Adoption Impact

None beyond this log — the rule lives in the KB guideline and its conformance guard; `tech/automation.md` stays optional and absent in this repo.
