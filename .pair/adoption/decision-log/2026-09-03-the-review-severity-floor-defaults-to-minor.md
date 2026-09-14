# Decision: the review severity floor defaults to Minor — Questions are carried, never fixed

- **Status**: Active
- **Date**: 2026-09-03
- **Category**: Process
- **Deciders**: maintainer

## Context

`pair-implement-batch` drives a card through a review<->fix loop that closes when the
independent review returns zero ACTIONABLE findings. `severityFloor` names the lowest
severity that blocks; findings below it are carried to the merge gate in `acceptedFindings`
with `disposition: 'Below severity floor'`. The parameter was optional and **defaulted to
no floor**, i.e. every finding the reviewer returned — Questions included — entered the set
the fixer must resolve.

Measured on PR #477 (story #413), three times in one cycle:

| head | review verdict | what the next round did | re-review |
| --- | --- | --- | --- |
| `b518ba6b` | APPROVED, 0 actionable, 2 Questions | implemented both Questions | 3 new Minor, all inside the added code |
| `88f852ab` | APPROVED, 0 actionable, 3 Questions | implemented them | 2 new Minor, again inside the added code |
| `0f804485` | CHANGES-REQUESTED | reverted wholesale to `88f852ab` | — |

The pattern is not a fixer defect. The review template defines Questions as questions **for
the human** — items the reviewer explicitly marks "No change requested". Feeding them to an
agent whose instruction is "resolve EVERY finding, including minor/nit, do not defer any"
contradicts what they are, and each answer enlarges the diff, creating fresh surface for the
next review. Convergence becomes a moving target: the loop can only end by exhausting
`maxFixRounds`.

## Decision

The floor **defaults to `Minor`**. Work on a card is complete when Critical, Major and Minor
are closed. Questions are carried to the merge gate for the human, and are acted on only if
the maintainer asks.

An explicitly passed `severityFloor` still wins, including a lower one that restores the
previous block-everything behaviour.

The default is applied **softly**, unlike a caller-passed floor: a review template whose
vocabulary does not declare `Minor`, or whose contract carries no usable ranking, falls back
to no floor instead of throwing. A default must never break a run that never asked for it —
while a floor the caller spelled wrong still throws, because that is their configuration
error.

## Consequences

- The fix loop terminates on a bounded set. Sub-floor findings are neither discarded nor
  silently accepted: they accumulate across every round and reach the human with their
  disposition.
- Adopters whose template lacks `Minor` see no behaviour change.
- A caller who wants the old semantics passes the lowest severity their template declares.

## Adoption Impact

None beyond this record: `severityFloor` was already documented as caller-configurable, and
its meaning is unchanged — only the default moves.
