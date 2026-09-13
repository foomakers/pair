# Decision: a scope decision is keyed by the proposal's id and type — never its wording — and the cycle discovers it on the PR before asking again

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

Canary v9 (PR #481, run `canary-479-481-v9`): the maintainer had answered the scope packet of a
previous cycle with `action: ignore` for `sc-1`. The next cycle, in a fresh run directory, found
the same proposal again, re-authored its text, computed the baseline hash over `id + proposal`
(`scopeBaselineHashOf`) and refused the standing decision as `stale-baseline`. The cycle then
declared `awaiting-scope-decision` and posted the same question a second time. Nothing in the
engine ever called `apply-scope-decisions` on its own: the Workflow sandbox cannot run it, and
the reviewer was not told to.

Two defects with one root: the decision's identity was the wording, and the decision's storage
(the PR) was never consulted by the cycle that needed it.

## Decision

1. **The baseline hash is the identity of the pending set, not its prose.** `scopeBaselineHashOf`
   hashes `{ id, type }` per pending proposal, sorted. `sc-<n>` ids are assigned once and stable
   across rounds and cycles; the text is re-authored by every reviewer. The SET remains the
   baseline: a decision on `{sc-1}` does not cover a packet that grew to `{sc-1, sc-2}` —
   the maintainer must read the new proposal.
2. **The cycle discovers an existing decision before asking.** `cycle-state.mjs
   apply-scope-decisions` with no `--decision-ref` lists the PR's comments through `gh`, keeps the
   ones that parse as a decision comment and hands each, oldest first, to the unchanged
   `applyScopeDecisions` — author authentication, baseline check, payload validation and the
   `recordType: decision` handoff are the same code path. The review-phase skill runs it in two
   places: Step 0, when `resolve` returns `awaiting-scope-decision` on entry, and Step 5.4b,
   before it would post the packet. It reports what it found (`discovered[]` with the reason each
   candidate was refused) and never infers a decision from prose.

## Alternatives Considered

- **Per-decision matching instead of a set hash** (honour `sc-1: ignore` whatever else is
  pending): rejected — the packet is the unit the maintainer read; silently applying part of an
  older answer to a larger question hides the new proposal from them.
- **Have the coordinator call `apply-scope-decisions`**: impossible — the Workflow sandbox has no
  shell; the reviewer already runs `cycle-state.mjs` and is the step that declares the status.
- **Keep the hash over the text and make reviewers copy the previous cycle's wording**: rejected —
  it asks an independent reviewer to reproduce another reviewer's prose byte for byte to keep a
  decision alive, which is the kind of author context the review stage is built not to carry.

## Consequences

- Decisions posted under `4.0.0` carry a text-based hash and are `stale-baseline` under `4.0.1`;
  the maintainer re-posts once against the new packet. Documented here rather than shimmed.
- A decision comment on another PR, from a bot, from an unauthorized login, or with a stale set is
  listed in `discovered[]` with its reason and never applied — the refusal surface is unchanged.
- The scope-decision packet marker stays PR-scoped (`<!-- pair:scope-decision #<story> PR#<n> -->`,
  no run id) so a later cycle edits the one standing question instead of posting a second.

## References

- [ADL 2026-09-10 — scope proposals are a human decision](2026-09-10-scope-proposals-are-a-human-decision.md)
- [ADR-024](../tech/adr/adr-024-delivery-phases-are-skills.md), amendment 2026-09-13
- `cycle-state.mjs` `scopeBaselineHashOf`, `discoverScopeDecisions`; tests `pair-contracts/cycle-state.test.mjs` ("canary v9 (B)")
