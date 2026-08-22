# Decision: a changeset is added when a release is scheduled, not on every user-facing PR

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

`RELEASE.md` step 1 reads "Commit the `.changeset/*.md` file with your PR", and
`tech/tech-stack.md` adopts Changesets for version management. Practice diverged from that
sentence months ago and the divergence was never written down, so every review of a
CLI-behaviour PR re-litigates it (#447 raised it again).

The divergence is deliberate and has a cause on record: **any** file under `.changeset/`
makes `version.yml` open — and keep re-opening — the Changesets release PR, which
regenerates `CHANGELOG.md` and stands ready to publish. `dd1ff524 chore: drop the pending
changeset — no release now` deleted a pending changeset and closed release PR #417 for
exactly that reason: the maintainer was not releasing yet, and a permanently open,
continuously rebased release PR is noise that eventually gets merged by accident.

Since then, CLI-behaviour PRs (#420, #424, #432, #437, #440) have merged without a
changeset, and releases are cut deliberately by adding the accumulated changeset(s) at the
moment the maintainer decides to publish.

## Decision

**A changeset is added when a release is being scheduled, not automatically with the PR
that changes behaviour.**

- A PR that changes published behaviour states the user-visible change in its description
  (and in an ADR/ADL when it is a decision), so the release author has the material.
- The release author adds the changeset(s) covering everything merged since the last
  release, as the first step of cutting that release.
- Nothing under `.changeset/` sits on `main` between releases, so the Changesets release PR
  exists only while a release is actually intended.

## Alternatives Considered

- **A changeset per PR, as `RELEASE.md` literally says.** Rejected for now: it keeps the
  release PR permanently open on a repository that releases in deliberate batches, which is
  what `dd1ff524` reverted. Worth revisiting the day releases become continuous — then the
  standing release PR is the feature, not the noise.
- **Leave it undocumented and settle it per PR.** Rejected: that is the current cost. An
  undocumented convention is indistinguishable from an omission to a reviewer, and it has
  been flagged as an omission more than once.

## Consequences

- `RELEASE.md` states this at step 1, so the document and the practice agree.
- A reviewer asking "where is the changeset?" gets an answer from the repository instead of
  from the PR author's memory.
- The release author carries one obligation: reading the merged PRs since the last release
  to write the changeset(s). The PR descriptions and the decision log are the source.

## Adoption Impact

- `RELEASE.md` — step 1 amended.
- No `tech/tech-stack.md` change: Changesets is still the adopted tool; only the moment the
  file is created moves.
