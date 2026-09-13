# Decision: rollback takes a head, its notes live in the handoff, and nobody deletes them

## Date

2026-09-12

## Status

Active

## Category

Process Decision

## Context

AC-32 lets a maintainer restore a group's files to an earlier state and rebuild from there instead
of patching a base that a guard has just proven wrong. Four independent reviews of the surrounding
work found the same defect class every time — a rule closed for the shape its author imagined and
open for the neighbouring shape from the same producer — and the reconstruction's own machinery
accounted for most of it.

Two causes, both now addressed here rather than patched again.

**A parser stood between the maintainer and the head.** `rollbackTo` accepted a round name (`a0`,
`r2`, `r1-g1`) and resolved it against persisted history. That resolution matched a non-revision
name against all of its own revisions and kept the last, so `a0` could resolve to `a0-rev2`'s head:
the very thing ADR-024 (r) promised would never happen. Half the accepted alphabet — every
`-rev<n>` spelling the validator admits — could not be resolved at all.

**The notes a rebuild needs had no home.** The corrective contract carries the obligations (what
must work again) and the guards (what must not break). Neither says *which decisions were already
right* in the work being discarded, so a rebuild repeats the discarded round's mistakes. And a
reconstruction directive that nothing consumed or cleared re-fired on every later rewind of the
card, restoring over the fix that had just been rebuilt.

## Decision

**1. `rollbackTo` is a 40-hex head, not a round name.** The maintainer reads `git log` and names the
commit. There is no resolution step, therefore no heuristic and nothing to guess. Validation is an
existence check against persisted history — that sha appears as an `outputHead` or `reviewedHead` of
this cycle, or the directive is refused — and the refusal reaches the maintainer instead of being
dropped silently. The fixer restores with `git checkout <head> -- <paths>`, which is deterministic
by construction, and still commits FORWARD.

**2. The notes are a structured field of the review handoff, and the rest is derived.** The handoff
is the storage authority; a second file would drift from it. The review that observes the failure
emits `worked[]` — the decisions it verified correct — alongside its findings. Everything else a
rebuild needs is already recorded: the obligations are the round's findings with their transitions,
the regressions are the ledger entries that batch introduced.

`worked[]` reuses the grammars the handoff already has, so it introduces no new vocabulary:

```text
worked: [{
  id,                        // stable across rounds, like a finding id
  claim,                     // the decision that was right — one sentence
  appliesTo: [ ... ],        // paths or obligation ids: where that decision lives
  evidence: [{ id, command | testRef, expected }],   // exactly `closureAssertions`
  notVerifiable, rationale   // together only, when no command can demonstrate it
}]
```

Validated in `envelopeErrors` before the atomic write, like every other schema-3 field: `id`,
`claim` and a non-empty `appliesTo` are required (an appunto that applies to nothing cannot reach
any rebuild); then either non-empty `evidence` whose entries satisfy the `closureAssertions` shape,
or `notVerifiable: true` **with** `rationale` — the same bargain `nonActionable`/`disposition` and
`applicability`/`applicabilityRationale` already strike. A `command` passes the shell-metacharacter
filter that reproducers and counterexamples pass.

**3. Nothing deletes the notes, because they are a view.** `rollbackNotes` is computed from the
handoffs like `activeRegressionRisks` is, and it is ACTIVE while any obligation of the round is open
or any regression it introduced is still active. A finding that closes leaves the obligations; a new
regression enters the ledger and keeps the view populated. So "the implementation made progress —
it fixed findings of the target round without adding regressions" is not a condition anyone codes:
it is the same read. When the last one closes the view is empty, and an empty view emits no
directive.

**Amended 2026-09-12, twice (DR4-01, then withdrawn by ADR-024 (u)).** This section originally
claimed the empty view was also what stopped a directive from re-firing, "with no separate
mechanism". That was wrong: the emptiness test was evaluated inside `if (activeRisks.length)`, where
the view's own `regressions` IS that set, so it could never be true. Three further mechanisms were
then built to replace it — keyed on the batch, on the echo plus any later fix, on two attempt
counters — and an independent review found a blocking defect in each. The rule is gone: the workflow
no longer infers that the decision was carried out, the directive stands while the maintainer's
policy names the head, and they clear it. See ADR-024 (u) for why the shape kept failing.

What this ADL established and what still stands: the notes are a DERIVED VIEW over the handoffs,
computed like `activeRegressionRisks`, carrying the obligations still open, the regressions still
live and the `worked` claims a review verified were right. Nobody writes them to a second place and
nobody deletes them. They never governed spending — that was the error corrected here.

## Consequences

- `worked[]` is the only new datum, and the only one nobody can currently state. It costs the review
  a field it is already positioned to fill, and the run a line in `VERIFY_SCHEMA` — without which
  the harness drops it, as happened to `regressionGuards`.
- Naming a head instead of a round moves one judgement to the maintainer: *which* commit. They have
  `git log` and the cycle's evidence; the parser had neither.
- The engine loses the ability to pick a rollback point on its own. That is the point: four reviews
  established it is not good at it, and the failure mode is deleting work.
- AC-32 and DT-41 on the card, and the `way-of-working.md` paragraph citing ADR-024 (p), still
  describe the deleted overlap guard. They are amended with this decision, not left standing.
