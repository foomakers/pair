# Decision: the scope-baseline hash is published to the reviewer — a consumer-only hash is a question nobody can answer

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

`cycle-state.mjs` computes `scopeBaselineHashOf` over the NFC-normalized `{id, type}` of the
pending scope proposals, and `apply-scope-decisions` refuses the maintainer's decision comment
without that field (`scopeBaselineHash-missing`) or with a wrong one (`stale-baseline`). The
review-phase SKILL (Step 5.4b) instructs the reviewer to publish the packet the maintainer copies
that fenced-JSON shape from — including `scopeBaselineHash`.

The value had no producer (T-9 fourth round, t9d-8): the CLI exposed no command that prints it, and
`resolve`'s `awaiting-scope-decision` payload carried the pending proposals but not their hash. The
prose therefore asked the reviewer for a value no participant could obtain, and the only ways out
were a hand-made hash (refused as `stale-baseline`) or a packet the maintainer cannot answer.

## Decision

The hash is **internal to compute, published to quote** — the reviewer never derives it:

1. **`resolve` publishes it.** The blocking `awaiting-scope-decision` payload carries
   `scopeBaselineHash` next to the `scopeChanges` it is computed over, so the dispatch that asks
   for a packet already hands over the value the packet must quote.
2. **`cycle-state.mjs scope-baseline --dir <run dir>` is the standalone producer.** The
   scope-decision packet is PR-scoped on purpose (a later cycle re-edits the one comment), so the
   value must be obtainable from a run directory alone, without a `resolve` round. Read-only: no
   PR read, no `gh`.
3. **One union, one hash.** `pendingScopeOf` is the single place the proposals a cycle has seen are
   unioned (latest status wins); the producer and the consumer (`apply-scope-decisions` /
   `discoverScopeDecisions`) both read it, so the baseline a packet quotes and the baseline it is
   checked against cannot be computed two different ways.
4. **The prose names the producer.** Step 5.4b now points at `resolve`'s field and at the
   `scope-baseline` command, and forbids a hand-computed value.

## Alternatives Considered

- **Declare the hash internal and drop it from the packet**: rejected — the consumer *requires* it
  (`scopeBaselineHash-missing` is a hard refusal) and the staleness check is the whole point: a
  decision on `{sc-1}` must not silently cover a packet that grew to `{sc-1, sc-2}`. Removing it
  from the prose would have left the maintainer's reply unusable.
- **Have the reviewer recompute it from the proposal set**: rejected — a hash the model computes by
  hand is a hash it can get wrong, and it would be a second implementation of an identity rule that
  already moved once (ADL 2026-09-13, scope-decision identity is the proposal id).

## Consequences

- `awaiting-scope-decision` payloads gain one field; the coordinator passes `next` through verbatim,
  so no engine change was needed.
- A conformance test pins all three sides together: `resolve`'s field, the CLI command (named in the
  vocabulary line and flag-checked), and the SKILL prose in both the installed and dataset copies —
  a drift in any one of them fails.

## References

- `.claude/skills/pair-workflow-*/scripts/cycle-state.mjs` (`pendingScopeOf`, `pendingScopeBaseline`, `scope-baseline`)
- `.claude/skills/pair-workflow-review-phase/SKILL.md` § Step 5.4b
- `.claude/workflows/pair-contracts/cycle-state.test.mjs` (t9d-8)
- ADL 2026-09-13 `scope-decision-identity-is-the-proposal-id`; ADL 2026-09-10 `scope-proposals-are-a-human-decision`
