# Decision: legacy `## Eligibility` filter bounds unattended runs only; explicit `--root` is never filtered out

## Date

2026-10-13

## Status

Active

## Category

Process Decision

## Context

`/pair-next` Step 0 resolves selection via `autonomy-policy.mjs`, which translates legacy `## Eligibility` into `filter: risk:green`. An interactive `/pair-next` (and `--mode analysis --root 262`) therefore exited "no matching issues" on a repo whose only open story and PR were `risk:red`; row 6 (review of the open PR) was never reached and an explicit root was intersected with the unattended-loop eligibility.

## Decision

- `autonomy-policy.mjs resolve` gains `--surface interactive|unattended` (default `unattended`, behaviour unchanged for `pair-cli run`, `/pair-loop`, `pair-implement-batch`). `/pair-next` passes `interactive`.
- Interactive: a `filter` sourced ONLY from the legacy `## Eligibility` translation is set aside; `lines` say so. An explicit `## Autonomy` `filter:` or `--filter` argument still applies.
- Interactive only: an explicit `--root` is never excluded by an inherited (adoption) filter; `lines` say so. Unattended (`/pair-loop --root` passes no `--surface`): the inherited filter still applies with the root (intersection), so unattended runs never pick ineligible cards. An explicit `--filter` argument still narrows.
- Unattended callers keep their bound because `/pair-loop` passes its resolved filter to `/pair-next` as `--filter` (argument).

## Alternatives Considered

- Drop legacy `## Eligibility` translation: breaks unattended runs of legacy-only projects.
- Per-caller filtering in `/pair-next`: re-derives the autonomy model outside its one owner (ADR-027).

## Consequences

One script flag, 6 byte-identical script copies; tests in `autonomy-policy.test.mjs`.

## Related

ADR-027, ADR-017 §1, decision `2026-10-06-macro-phase-modes-are-a-selection-facade`.
