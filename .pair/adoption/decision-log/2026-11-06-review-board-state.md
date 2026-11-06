# Decision: expose the canonical Review state on the project board

## Date

2026-11-06

## Status

Active

## Category

Process Decision

## Context

The GitHub project `foomakers` / `pair digital development` (#3) had no Status
option mapped to `Review`. Stories stayed in `In Progress` while their PRs were
being reviewed. The maintainer chose to make that phase visible on the board.

## Decision

Add `Review` to the existing Status field between `In Progress` and `Done`, and
map it to Pair's canonical `Review` macrostate in `tech/way-of-working.md`.
Existing option IDs are preserved; the new Review option is `8ac1f6ed`.

The PR publisher moves a story to Review when its PR is ready for review,
following its existing membership/read-back/state-write procedure. PR states
`to-be-reviewed`, `not-approved` and `ready-to-merge` all remain within Review;
merge alone produces Done. These are the existing
[canonical states](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)
and [PR state semantics](../../knowledge/guidelines/collaboration/project-management-tool/pr-states.md).

## Alternatives Considered

- **Keep review visible only on PRs:** leaves implementation and review in the
  same board column, which does not meet the maintainer's visibility need.
- **Mirror each PR state as a board state:** duplicates the PR synthesis instead
  of using the existing canonical Review macrostate.

## Consequences

- Stories with an existing non-draft PR are reconciled to Review after checking
  the PR and the story's board membership.
- New publication steps must read the updated adoption in their checkout.
- `Not planned` remains unmapped. This changes no classification or merge gate.

## Adoption Impact

- `tech/way-of-working.md` — add `Review | Review` and replace the previous
  no-Review exception with the adopted publication-to-merge lifecycle.
- GitHub project #3 — add the Review Status option, preserving existing options.
