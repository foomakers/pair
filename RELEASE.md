# Release Process

How releases are built, versioned, and published. The process is fully automated via GitHub Actions and [Changesets](https://github.com/changesets/changesets).

For development setup see [DEVELOPMENT.md](DEVELOPMENT.md). For changelog see [CHANGELOG.md](CHANGELOG.md).

## Overview

```text
Maintainer          version.yml (run 1)            release.yml (run 2)
    │                      │                              │
    │ pnpm release <ch>    │                              │
    │ (plan printed)       │                              │
    │─────────────────────▶│ re-validate (same state      │
    │                      │ module), version, tag        │
    │                      │─────────────────────────────▶│ build from tag,
    │                      │                              │ publish, cleanup
```

**Dispatched, never merge-triggered.** A merge never releases. Changesets manages versions, CI builds artifacts from the tag, GitHub Releases distributes them. Decision: [`2026-10-14-release-is-dispatched-with-a-changeset-per-pr`](.pair/adoption/decision-log/2026-10-14-release-is-dispatched-with-a-changeset-per-pr.md).

## Every PR carries a changeset

`.changeset/<story-id>.md` mirrors the PR description, with the bump stated. CI (`ci.yml` → `changeset`) fails a PR without one unless it is labelled `no-changeset`. Below 1.0 a breaking change is bumped `minor`. Cycle skills (`implement-phase`, `green-fix`, `publish-pr`) keep the file in sync with the PR description; review checks they match.

## Creating a Release

```bash
pnpm release <pre|rc|final> [--version X.Y.Z] [--dry-run]
```

Or dispatch `version.yml` from Actions (`channel`, optional `version`). The command prints the plan (version, tag, what cleanup will delete) and dispatches `version.yml`; CI re-validates with the same state module (`packages/dev-tools/src/release/release-state.ts`) and is authoritative over stale local tags. Two runs per release: `version.yml`, then `release.yml`.

### Version rules

- Base = `changeset version` result, or `--version` (must be > last final and untagged).
- Suffix `-<channel>.N` is derived from existing tags. Channels are forward-only (`pre` → `rc` → `final`) and skippable.
- Re-releasing the same channel needs new commits on `main`. Duplicate or backward requests are refused.

### Channels

| Channel | Version | Git | Registry | GitHub Release | Website |
|---------|---------|-----|----------|----------------|---------|
| `pre` / `rc` | `X.Y.Z-pre.N` / `-rc.N` | ephemeral commit, tag-only push (`main` untouched) | GitHub Packages | prerelease, not latest | not deployed |
| `final` | `X.Y.Z` | version commit + CHANGELOG on `main`, tag | npmjs.org | latest | deployed |

### Cleanup

The last `release.yml` job runs only after a successful publish and deletes (GitHub Release, assets, tag, package version): the previous same-channel pre/rc; on `final` or a base change, every pre/rc of that base. A failed publish deletes nothing. Users on a deleted prerelease lose its KB download (accepted for unstable channels).

### Installing a prerelease

`pre`/`rc` packages on GitHub Packages are private to the `foomakers` org by design (release testing, short window): you need org membership and a token with `read:packages`. Then:

```bash
npm config set @foomakers:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken <token>
npm install -g @foomakers/pair-cli@<version>
```

## Release Checklist: Skill Marketplace Manifest

`.claude-plugin/marketplace.json` + `packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json` are the **native Claude Code install channel** (`/plugin marketplace add foomakers/pair`). The plugin ships the **bootstrap corpus only** — the distributed catalog travels through the CLI — so a skill added to `dataset/.skills/` needs no manifest edit at all. They are still hand-maintained, not generated:

- [ ] `packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json` `skills` lists one `./skills/<name>` entry per directory under that manifest's `skills/`, and nothing stale
- [ ] the marketplace entry's `source` still points at the plugin root (`./packages/knowledge-hub/dataset/plugin`) — pointing it at `./` would put pair's own `.pair/adoption/` back in every user's plugin cache
- [ ] `claude plugin validate .` passes (the pinned-version warning is expected — see the [marketplace-plugin-packaging ADL](.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md)). Do **not** add `--strict`: it turns that expected warning into a failure, and the no-version-pin is a deliberate decision (ADL Decision 4)
- [ ] Skills only, on all three hand-edited surfaces — `plugin.json` carries metadata + `skills` and nothing else; the marketplace entry carries metadata + `source`/`category`/`tags`/`strict` and **no `skills`** (an entry-level `skills` silently REPLACES the plugin's catalog); `marketplace.json`'s own top level carries marketplace metadata + `owner`/`plugins` and none of `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `metadata.pluginRoot`
- [ ] At the **plugin root** (`packages/knowledge-hub/dataset/plugin`), no component directory named after a manifest component key (`agents/`, `commands/`, `hooks/`, `monitors/`, …) and no `.mcp.json`. `skills/` is the one exception — there it IS the declared payload, so auto-discovery and the manifest coincide. The repository root is no longer the payload, so its own `.claude/` and `.github/` are irrelevant here

The catalog guard (`packages/knowledge-hub/src/tools/claude-plugin-manifest.test.ts`, run by `pnpm test`) fails the build when the manifest drifts from the bootstrap corpus (`packages/knowledge-hub/dataset/plugin/skills/`), naming the exact entry to add or remove. It also enforces the skills-only rule automatically — an **allowlist** per surface (so `settings`, `dependencies`, `monitors`, `commands` and anything a future schema adds fail closed too), plus a root-payload check whose path list is *derived* from the schema's component keys, so both halves of the rule extend together. Those two lines are checklist reminders, not the only backstop.

## Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Version | `version.yml` | `workflow_dispatch` (`channel`, `version`) | Validate, version, tag, dispatch `release.yml` |
| Release | `release.yml` | `workflow_dispatch` (tag, from `version.yml`) | Build from tag, publish, cleanup |

Both share a `release` concurrency group. `GITHUB_TOKEN` only: the old `tag-on-changeset-merge.yml` and its PAT secret are gone.

If `main` gets branch protection, the final version commit needs a bot bypass.

## Release Artifacts

### CLI

| Artifact | Description |
|----------|-------------|
| `pair-cli-manual-{version}.zip` | Self-contained CLI bundle (ncc, no node_modules) |
| `pair-cli-manual-{version}.zip.sha256` | SHA256 checksum |
| `pair-cli-{version}.tgz` | npm package for GitHub Packages |
| `pair-cli-{version}.tgz.sha256` | TGZ checksum |

### Knowledge Base

| Artifact | Description |
|----------|-------------|
| `knowledge-base-{version}.zip` | KB dataset with manifest |
| `knowledge-base-{version}.zip.sha256` | SHA256 checksum |

The CLI auto-downloads KB on first run from GitHub Releases and caches it at `~/.pair/kb/{version}/`.

## CLI Bundle Structure

The manual artifact is built with [ncc](https://github.com/vercel/ncc) — a single self-contained JS file with all dependencies bundled.

```text
pair-cli-manual-vX.Y.Z/
├── bundle-cli/
│   ├── index.js          # Bundled application
│   └── index.d.ts        # TypeScript definitions
├── bin/
│   └── pair-cli           # Unix executable
├── pair-cli               # Top-level Unix executable
├── pair-cli.cmd           # Windows executable
├── package.json
├── README.md
├── LICENSE
└── config.json
```

KB dataset is **not** included in the bundle — it's downloaded on first run (~300KB bundle vs ~6MB with KB).

### Local packaging

```bash
scripts/package-manual.sh <version>
```

Requires: `ncc` (`@vercel/ncc`), `dts-bundle-generator`, `zip`, `sha256sum`/`shasum`.

## npmjs.org

The release produces a `.tgz` for publishing to npmjs.org. The package is public — no authentication required for consumers.

### CI authentication (publishing)

Publishing uses an `NPM_TOKEN` secret (granular access token from npmjs.org):

```yaml
env:
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
run: ./scripts/workflows/release/publish-npm.sh "$TGZ"
```

### Consumer installation

No `.npmrc` or token needed — the package is public on the default npm registry:

```bash
npx @foomakers/pair-cli install
# or
npm install -g @foomakers/pair-cli
```

## Repository Configuration

### Token and permissions

- **`GITHUB_TOKEN`** (default): sufficient for creating tags, releases, and uploading release assets.
- **`NPM_TOKEN`**: required for publishing to npmjs.org. Granular access token scoped to `@foomakers`.
- Workflow permissions: "Read and write permissions" required.

### Branch protection for `main`

- Require PR reviews (1+ approver)
- Require status checks: `CI / changeset`, `CI / build`
- Require branches to be up-to-date before merging

### Actions used

| Action | Version | Type |
|--------|---------|------|
| `actions/checkout` | v4 | Official |
| `actions/setup-node` | v4 | Official |
| `actions/github-script` | v7 | Official |
| `actions/create-release` | v1 | Official |
| `actions/upload-release-asset` | v1 | Official |
| `pnpm/action-setup` | v4 | Third-party (official pnpm) |

All actions pinned to specific versions.

## Rollback

1. Delete the GitHub Release and tag from the GitHub UI
2. Revert the final version commit on `main`
3. Add a changeset with the fix
4. The pipeline re-runs automatically (new version PR → tag → release)

## Manual Installation

For offline/air-gapped environments:

1. Download `pair-cli-manual-vX.Y.Z.zip` from [GitHub Releases](https://github.com/foomakers/pair/releases)
2. Extract to desired location
3. Run `./pair-cli` (Unix) or `pair-cli.cmd` (Windows) — no `npm install` needed
