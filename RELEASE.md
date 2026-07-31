# Release Process

How releases are built, versioned, and published. The process is fully automated via GitHub Actions and [Changesets](https://github.com/changesets/changesets).

For development setup see [DEVELOPMENT.md](DEVELOPMENT.md). For changelog see [CHANGELOG.md](CHANGELOG.md).

## Overview

```text
Developer        CI (version.yml)      CI (tag.yml)          CI (release.yml)
    │                   │                    │                       │
    │  pnpm changeset   │                    │                       │
    │  add + push       │                    │                       │
    │──────────────────▶│                    │                       │
    │                   │  changeset version │                       │
    │                   │  + create PR       │                       │
    │                   │───────────────────▶│                       │
    │                   │                    │  merge PR → tag vX.Y.Z│
    │                   │                    │──────────────────────▶│
    │                   │                    │                       │  build + package
    │                   │                    │                       │  + publish release
```

**Build once, verify, publish.** Changesets manages versions, CI builds artifacts, GitHub Releases distributes them.

## Creating a Release

### 1. Create a changeset

```bash
pnpm exec changeset add
```

Select the affected package(s) and bump type (patch/minor/major). Commit the `.changeset/*.md` file with your PR.

### 2. Merge to main

When your PR merges, the **Version workflow** (`version.yml`) detects the changeset and creates a version PR that bumps `package.json` versions and updates `CHANGELOG.md`.

### 3. Merge the version PR

Merging the version PR triggers the **Tag workflow** (`tag-on-changeset-merge.yml`) which creates a `v{X.Y.Z}` git tag.

### 4. Tag triggers release

The tag push triggers the **Release workflow** (`release.yml`) which:

1. Runs `pnpm quality-gate`
2. Builds all packages (`pnpm build`)
3. Packages the CLI bundle (`scripts/package-manual.sh`)
4. Creates a GitHub Release with artifacts

## Release Checklist: Skill Marketplace Manifest

`.claude-plugin/marketplace.json` + `packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json` are the **native Claude Code install channel** (`/plugin marketplace add foomakers/pair`). The plugin ships the **bootstrap corpus only** — the distributed catalog travels through the CLI — so a skill added to `dataset/.skills/` needs no manifest edit at all. They are still hand-maintained, not generated:

- [ ] `packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json` `skills` lists one `./skills/<name>` entry per directory under that manifest's `skills/`, and nothing stale
- [ ] the marketplace entry's `source` still points at the plugin root (`./packages/knowledge-hub/dataset/plugin`) — pointing it at `./` would put pair's own `.pair/adoption/` back in every user's plugin cache
- [ ] `claude plugin validate .` passes (the pinned-version warning is expected — see the [marketplace-plugin-packaging ADL](.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md)). Do **not** add `--strict`: it turns that expected warning into a failure, and the no-version-pin is a deliberate decision (ADL Decision 4)
- [ ] Skills only, on all three hand-edited surfaces — `plugin.json` carries metadata + `skills` and nothing else; the marketplace entry carries metadata + `source`/`category`/`tags`/`strict` and **no `skills`** (an entry-level `skills` silently REPLACES the plugin's catalog); `marketplace.json`'s own top level carries marketplace metadata + `owner`/`plugins` and none of `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `metadata.pluginRoot`
- [ ] No root-level component directory named after a manifest component key (`agents/`, `commands/`, `hooks/`, `skills/`, `monitors/`, …) and no root `.mcp.json` — with `source: "./"` the repo IS the plugin payload, so Claude Code auto-discovers those regardless of the manifest

The catalog guard (`packages/knowledge-hub/src/tools/claude-plugin-manifest.test.ts`, run by `pnpm test`) fails the build when the manifest drifts from `packages/knowledge-hub/dataset/.skills/`, naming the exact entry to add or remove. It also enforces the skills-only rule automatically — an **allowlist** per surface (so `settings`, `dependencies`, `monitors`, `commands` and anything a future schema adds fail closed too), plus a root-payload check whose path list is *derived* from the schema's component keys, so both halves of the rule extend together. Those two lines are checklist reminders, not the only backstop.

## Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Version | `version.yml` | Push to `main` with `.changeset/**` | Bump versions, create version PR |
| Tag | `tag-on-changeset-merge.yml` | Version PR merged | Create `vX.Y.Z` tag |
| Release | `release.yml` | Tag `v*` pushed | Build, package, publish |

### Manual dispatch

```bash
gh workflow run "Version (Changesets)" --ref main
gh workflow run "Release" --ref main -f version="v1.0.0"
```

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
- **`GH_RELEASE_TOKEN`** (optional PAT): only needed if org policy prevents `GITHUB_TOKEN` from creating tags/releases. Add as repository secret with `repo` scope.
- Workflow permissions: "Read and write permissions" required.

### Branch protection for `main`

- Require PR reviews (1+ approver)
- Require status checks: `Version (Changesets) / version`, `Tag on Changeset PR Merge / tag`, `Release / release`
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
2. Revert the version commit from the changeset PR merge
3. Create a new changeset with the fix
4. The pipeline re-runs automatically (new version PR → tag → release)

## Manual Installation

For offline/air-gapped environments:

1. Download `pair-cli-manual-vX.Y.Z.zip` from [GitHub Releases](https://github.com/foomakers/pair/releases)
2. Extract to desired location
3. Run `./pair-cli` (Unix) or `pair-cli.cmd` (Windows) — no `npm install` needed
