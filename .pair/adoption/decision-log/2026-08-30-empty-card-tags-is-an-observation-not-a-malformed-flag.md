# Decision: an empty `--card-tags` means "this card carries no labels", not a malformed flag

## Date

2026-08-30

## Status

Active

## Category

Convention Adoption

## Context

`pair run` refuses every flag passed with an empty value — `--root ""`, `--filter ""`, `--skill ""` all fail at parse time, deliberately: a flag named with nothing behind it is a caller bug, and accepting it silently is how an unattended run ends up doing something nobody asked for.

Story #217's `--card-tags` inherited that rule, and the end-to-end test on a populated board (T5) showed it was the wrong rule for this one flag. The dispatch entry point is called by a **host trigger**, and the reference GitHub adapter renders the labels it observed as `join(github.event.issue.labels.*.name, ',')`. On an issue with **no labels** that expression renders `""`. So the very state AC2 is about — "an issue with no mapped tag runs nothing" — arrived at the parser as an empty value and was rejected with `--card-tags was passed with an empty value`, exit 1.

Two consequences, both bad, and neither visible from inside the module suites (they pass tag lists, not the empty string a host renders):

- the opt-in boundary of the whole feature — untagged ⇒ skipped, reported, exit 0 — became **unreachable through the entry point**;
- the commonest card on any board turned every trigger firing on it into a **failed CI job**, which is the noise that gets a trigger disabled.

## Decision

For `--card-tags`, and only for it, an **empty or whitespace-only value is data**: it is read as the observation "the trigger saw no labels on this card", producing an empty tag list. The dispatcher then does what it does for any card with no mapped tag — skips it, reports the reason, appends the skip to the audit trail, exits `0`.

A **hole inside a list** stays an error: `auto-dev,,risk:green` still HALTs. The two cases are genuinely different. An empty value is a complete observation of an empty set; a hole is an incomplete rendering of a non-empty one — the caller built a list and lost an item, which is exactly the string-interpolation bug worth failing on.

The general rule this instantiates: **a flag that carries an observation from an external system is empty-valid when the empty case is a real state of that system; a flag that carries an operator's intent is not.** `--root`, `--filter` and `--skill` are intent — nobody means "" by them. `--card-tags` is an observation, and "no labels" is a state of every board.

## Alternatives Considered

- **Keep the refusal, make the adapter skip the call when the label list is empty**: pushes an authorization-relevant decision — "should this card run?" — into every per-host adapter, where it is untested, duplicated per host, and free to drift. ADR-024 puts that decision in the routing core precisely so no adapter can widen or narrow it.
- **Keep the refusal, have the adapter pass a sentinel** (`--card-tags "(none)"`): invents a label that could collide with a real one and makes the trail lie about what the trigger saw.
- **Accept empty values on every flag**: loses the guard where it earns its keep — an empty `--root` or `--skill` is a caller bug with no legitimate reading.

## Consequences

- `apps/pair-cli/src/commands/run/parser.ts` reads an empty/whitespace `--card-tags` as an empty tag list; the empty-entry HALT for a hole inside a list is unchanged.
- An unlabelled card now produces the documented skip and exit `0` end-to-end, so a host adapter needs no pre-filter and no conditional call.
- The asymmetry between this flag and its neighbours is deliberate and must stay documented where a reader meets it: the parser module, the CLI reference, and the reference adapter in the KB.

## Adoption Impact

- `adoption/tech/way-of-working.md` — CLI conventions: records that flags carrying an external observation are empty-valid when the empty case is a real state of the observed system, while flags carrying operator intent are not.
