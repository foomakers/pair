# CP11 — Release Pipeline (pre / rc / final)

**Priority**: P0
**Scope**: `pnpm release` planning, duplicate refusal, dispatch-only workflows, same-channel cleanup, consequence of cleanup for old prereleases ([ADL: release is dispatched, a changeset per PR](../../.pair/adoption/decision-log/2026-10-14-release-is-dispatched-with-a-changeset-per-pr.md))
**Channels**: all. Inspection only — **no real dispatch** is made by this CP; the release under validation is the evidence.
**Preconditions**: clean checkout of `main` with `gh` authenticated (read access); the release under validation (`$VERSION`, `$CHANNEL`) already published. `$WORKDIR` created.

---

## MT-CP1101: `pnpm release <channel> --dry-run` prints a plan, dispatches nothing

**Priority**: P0
**Preconditions**: checkout of `main` with at least one commit newer than the last release of the target channel (otherwise MT-CP1102 applies). Right after a release no changeset is pending: run the dry-runs with `--version <next>` (an X.Y.Z greater than the last final) so a base exists
**Category**: Release

### Steps

1. `pnpm release pre --dry-run` (repeat with `rc`, `final`)
2. `gh run list --workflow version.yml --limit 1` before and after

### Expected Result

- Exit code 0; output names version, tag and cleanup plan
- No new `version.yml` run appears (dry-run never dispatches)

---

## MT-CP1102: duplicate release is refused

**Priority**: P0
**Preconditions**: MT-CP1101 context; no `main` commits since the last release of the channel
**Category**: Release

### Steps

1. Right after a pre: `pnpm release pre --dry-run --version <base of that pre>`
2. Right after a final: `pnpm release final --dry-run` (no `--version`), then `pnpm release final --dry-run --version <last final>`

### Expected Result

- Exit code != 0 in every case
- After a pre, same base: `Refused: no new commits on main since the last pre of <base>` (same channel needs new `main` commits)
- After a final, no changeset pending: `Refused: nothing to release: no pending changeset and no --version`
- After a final, `--version` not above it: `Refused: version <x> not greater than last final <last final>`

---

## MT-CP1103: workflows are dispatch-only

**Priority**: P0
**Preconditions**: none
**Category**: Release

### Steps

1. In `.github/workflows/version.yml` and `release.yml`, list the `on:` triggers
2. Run history since the #366 merge (`19e9c634`, 2026-10-14T16:35:00Z): `gh run list --workflow release.yml --created ">=2026-10-14T16:35:00Z" --json event,createdAt` (same for `version.yml`)

### Expected Result

- Only `workflow_dispatch` in both files (no `push`, `pull_request`, `schedule`); `tag-on-changeset-merge.yml` does not exist
- Every run created after the #366 merge has `event == workflow_dispatch`. Older `push` runs (e.g. 2026-04 v0.4.3 era) predate the dispatch-only pipeline and are out of scope

---

## MT-CP1104: same-channel cleanup after a successful publish

**Priority**: P1
**Preconditions**: at least two releases of the same channel and base exist or existed (e.g. `v0.5.0-pre.1`, `v0.5.0-pre.2`). Executable only after pre.N+1 is published; with a single prerelease this MT is BLOCKED, not failed
**Category**: Release

### Steps

1. `gh release list --limit 20` and `git ls-remote --tags origin 'v$BASE-pre.*'`
2. `gh api /orgs/foomakers/packages/npm/pair-cli/versions --jq '.[].name'` (token with `read:packages`; no token ⇒ BLOCKED for this step only)

### Expected Result

- Only the latest pre (or rc) of the base remains: release, assets, tag and package version of pre.N are gone (`gh release view v$BASE-pre.N` fails, the tag is absent from `ls-remote`, the version is absent from the packages list)
- After a `final`: no pre/rc of that base remains
- Cleanup ran only after the publish succeeded (the cleanup step in the release run is after publish and green)

---

## MT-CP1105: installing from a cleaned-up prerelease needs `--source`

**Priority**: P1
**Preconditions**: pre.N+1 published, so pre.N (`$OLD_VERSION`) was cleaned up. With a single prerelease this MT is BLOCKED, not failed
**Category**: Release

### Steps

1. `mkdir -p $WORKDIR/project-old && cd $WORKDIR/project-old`
2. Install the CLI of `$OLD_VERSION` if it is still in a local cache, then `pair-cli install` with no `--source`
3. `pair-cli install --source <local KB dir or ZIP of the current release>`

### Expected Result

- Step 2: the old prerelease CLI needs `--source` — without it the KB download fails (release asset deleted), accepted for unstable channels
- Step 3: exit 0, KB installed from the local source

---

## Changelog

- #543: new CP for the #366 release pipeline; MT-CP1103 run history scoped to runs after the #366 merge.
