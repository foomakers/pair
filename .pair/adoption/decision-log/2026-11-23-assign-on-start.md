# Decision: Cards are assigned when development starts, not at creation

## Date

2026-11-23

## Status

Amended by [2026-11-25 preserve assignment on card update](2026-11-25-preserve-assignment-on-card-update.md).

## Category

Process Decision

## Context

`/pair-capability-write-issue` applied `default-assignee` on create, so every filed card carried the maintainer before anyone worked on it. The assignee-filtered board then showed filed work, not work in progress.

## Decision

A create never applies `default-assignee`; an explicit `$assignee` still does. A card is assigned when development is taken in charge (#723). `default-assignee` stays: it still assigns on item update and on pull requests (`/pair-capability-publish-pr`), and it is the maintainer identity that `cycle-state.mjs` reads for decision comments.

## Alternatives Considered

- **Rename the key to `maintainer`**: clearer, but touches skills, `cycle-state.mjs` and mirrors.
- **Rule text only**: skills would keep assigning on create.

## Consequences

Filed cards are unassigned and no warning is raised on create. Assigning at start is #723.

## Adoption Impact

- `adoption/tech/way-of-working.md`: Assignment rule and `## Assignment` say assign at start of development.
- `write-issue` Step 6b and the assignee-resolution convention: create skips the default.
