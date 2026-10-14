# Decision: every PR carries its changeset; releases are dispatched, never merge-triggered

## Date

2026-10-14

## Status

Active — supersedes [2026-08-20 a changeset is added when a release is scheduled](2026-08-20-a-changeset-is-added-when-a-release-is-scheduled.md) and [2026-08-20 a user-facing CLI fix carries its changeset](2026-08-20-a-user-facing-cli-fix-carries-its-changeset.md)

## Category

Convention Adoption

## Context

Both 2026-08-20 ADLs exist because a push-triggered `version.yml` opened a release PR for any file under `.changeset/`. Story #366 makes release dispatch-only, which removes that cause.

## Decision

- **Every PR carries `.changeset/<story-id>.md`** mirroring its description, bump stated and reviewed in the diff. CI fails without it unless the PR is labelled `no-changeset`.
- **A merge never releases.** `version.yml` and `release.yml` are `workflow_dispatch`-only; `pnpm release <pre|rc|final> [--version X.Y.Z] [--dry-run]` (or an Actions dispatch) plans, then `version.yml` re-validates and dispatches `release.yml` — two runs.
- **0.x rule**: below 1.0, a breaking change is bumped `minor`.
- pre/rc: ephemeral commit, tag-only push, GitHub Packages, prerelease GitHub Release, no website deploy. final: version commit + changelog on `main`, tag, npm, website deploy.
- Cleanup (previous same-channel pre/rc; on final or base change all pre/rc of that base) runs only after a successful publish.
- `tag-on-changeset-merge.yml` and `GH_RELEASE_TOKEN` are removed.

## Alternatives Considered

- **Keep changeset-at-release-time**: rejected — release author reconstructs history by hand; omissions go unnoticed.
- **Release on merge of the Changesets PR**: rejected — releases must be deliberate and optionally staged.

## Consequences

- Changesets accumulate on `main` until a final release consumes them (pre/rc leave them in place).
- Future `main` protection needs a bot bypass for the final version commit.
- Users on a deleted prerelease lose its KB download; accepted for unstable channels.

## Adoption Impact

- `RELEASE.md`, `tech-stack.md`, `infrastructure.md`, ADR-008 updated; `.changeset/config.json` uses `@changesets/changelog-github`.
