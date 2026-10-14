# Decision: closed-not-planned items move to an unmapped `Not planned` board column, never `Done`

## Date

2026-10-14

## Status

Active

## Category

Process Change

## Context

The board had four Status columns (`Todo`, `Refined`, `In Progress`, `Done`). The built-in
"item closed → Done" automation filed every closed item under `Done`, including items closed
as **not planned**: 37 such items (e.g. the frozen Knowledge Service initiative #64 and its
epics #66/#67/#68) read as delivered, inflating rollups — exactly the misreading
[canonical-states.md § Closure Without Completion](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md#closure-without-completion)
forbids.

## Decision

**The board carries a `Not planned` Status column (option id `1d5cee95`), deliberately left
unmapped in the State Mapping.**

- It is not a sixth macrostate: skills ignore it, exactly as they ignore `Removed`.
- Whoever closes an item as not planned (human or skill) also sets its board Status to
  `Not planned` — never `Done`. The built-in close automation cannot tell the two closure
  reasons apart, so the closer sets it.
- The reason stays in the closing comment, per Closure Without Completion.

## Alternatives Considered

- **Remove the item from the board** (the KB default). Rejected: the maintainer wants
  not-planned work visible on the board, just never as delivered.
- **Map `Not planned` to a macrostate.** Rejected: there is none by design — an item closed
  without completion asks nothing of any skill.

## Consequences

- `Done` means delivered again; the 37 existing not-planned items were moved on 2026-10-14.
- Closing as not planned is a two-step act (close + Status), until a skill automates it.

## Adoption Impact

- `tech/way-of-working.md` § State Mapping — one bullet: `Not planned` is an unmapped board
  column, with the move-on-close rule.
