# Decision: use native GitHub issue references in commits

## Date

2026-11-06

## Status

Active

## Category

Process Decision

## Context

The KB commit template uses synthetic story codes such as `[US-123]`.
This repository uses GitHub issue references such as `[#604]`.

## Decision

Use `[#123] type: description` for issue-linked commits and squash merges.
The project overrides the KB template through
[`tech/templates/commit-template.md`](../tech/templates/commit-template.md).
Work without an issue keeps `type: description`.

## Consequences

New runs read the committed adoption override. Existing #590 and #603 squash
subjects are corrected at the maintainer's request after #593 merges.
Changing those published subjects changes their hashes and descendant hashes.
