# Decision: A git-backed KB publishes its current version through `manifest.json` only

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

`pair kb-info --source <git url>` (story #291) resolves the "current" version of a git-backed KB by shallow-cloning it into a throwaway temp directory and reading a version out of the clone's root. The first implementation read `manifest.json`, then fell back to the repository's own root `package.json`, and the docs advertised both.

The install side cannot mirror that second read, and the two must agree or the feature dead-ends. Reproduced on the branch with a probe against a git KB whose root carries `package.json {version:'3.0.0'}` and **no** `manifest.json`:

1. `pair kb-info --source https://host/org/kb.git` → `{"sourceKind":"git","stable":true,"version":"3.0.0","available":true}`.
2. `pair install --url <same git url>` → `resolveDatasetRoot`'s `git` case returns the cache slot (`~/.pair/kb/external/git-<hash>`), so `recordInstalledVersion` reads `readVersionFromDirectory(<slot>)` = `<slot>/manifest.json` (absent) ?? `~/.pair/kb/external/package.json` (never created) → `null` → **no marker is written**. Probe output verbatim: `INSTALL would record: null`.
3. Every later `pair kb-info --source <git>` → `installed.version` `null` → `compareVersions` returns `unknown-installed`.

The user is shown "installed version unknown" against a known current `3.0.0` **forever** — never up-to-date, never drift — with nothing in the output pointing at the cure. The story's whole goal (drift visibility for git-backed KBs) is silently unmet for a repository shape the docs called supported.

Making the install side agree instead would mean teaching `recordInstalledVersion` repo-root semantics whenever `datasetRoot` is a git cache slot — i.e. threading the source kind into a helper that is deliberately source-kind-agnostic and shared by registry, local, zip and git installs.

## Decision

**For a git source, only the repository root `manifest.json` is read. A root `package.json` is never consulted, even when present.**

- `readVersionFromRepoRoot` (`apps/pair-cli/src/commands/kb-info/version-resolver.ts`) is manifest-only. It also never looks at the PARENT directory — for a clone that parent is a throwaway temp root, so the sibling fallback would report `<temp-root>/package.json`.
- A git repository with no root `manifest.json` reports `available: false` with a reason that **names the cure**: `No KB version found at git source <url> (no manifest.json at the repository root — add one so install and kb-info report the same version)`. That is a reported, actionable "current version unavailable" instead of a silently permanent "unknown installed version".
- `readVersionFromDirectory` keeps its sibling `../package.json` fallback for the local/registry kinds, where `..` really is the owning KB package (the monorepo `packages/knowledge-hub/dataset` layout). The two readers are separate functions precisely because the layouts differ, and each says so.

The rule generalizes beyond this call site: **a read path may only report a version the write path can record.** Any future source kind must satisfy both halves before its resolution is widened.

## Alternatives Considered

- **Keep the `package.json` fallback and make `recordInstalledVersion` use repo-root semantics for a git cache slot.** Rejected for this story: it changes a helper shared by every install kind, on the write path (which is what a wrong version marker corrupts), to serve a KB shape that has a one-line fix of its own — adding a `manifest.json`. It stays available if adopters report git KBs that genuinely cannot ship a manifest.
- **Report the `package.json` version and warn.** Rejected: the warning would appear on the read command, while the loss happens on a later, separate `install`; the two are not correlated in the user's session, and the check would still never say "up-to-date".
- **Derive the version from the pinned `#ref`** (the `remote` kind already regex-matches a version out of the URL). Not decided here — it is an open question on PR #444, orthogonal to this one: a `#ref` fallback would still have to be recordable by `install` to be worth reporting.

## Consequences

- A git KB with only a root `package.json` moves from "reports 3.0.0, drift never resolvable" to "reports current version unavailable, with the reason". No user gains a false version; the affected shape gains a message it can act on.
- The canonical git-hosted KB layout must ship a root `manifest.json` to get drift visibility. Stated in `apps/website/content/docs/reference/cli/commands.mdx` (kb-info → Sources).
- The `install`/`kb-info` pair is consistent for every source kind: both read `manifest.json` first, and neither reports a version the other cannot record.

## Adoption Impact

No `adoption/tech/*` file changes: this is a CLI behavior contract, not a stack, architecture or process change. The user-facing statement of it lives in `apps/website/content/docs/reference/cli/commands.mdx` (kb-info → Version Check Mode → Sources), which is updated in the same commit.
