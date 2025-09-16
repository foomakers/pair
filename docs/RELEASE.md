# Release & Manual Install Guide

This document describes the bundled manual-install packaging used by the release pipeline (issue #19).

## Overview

- **Build once**: CI runs changesets to version packages, builds the monorepo, and produces artifacts.
- **Bundled artifact**: `pair-cli-manual-vX.Y.Z.zip` contains a self-contained JavaScript bundle created with ncc, along with metadata, TypeScript definitions, and cross-platform executables.
- **Checksum**: For each artifact a SHA256 checksum file is produced (`*.sha256`).

## Packaging (local)

**Script**: `scripts/package-manual.sh <version>`

This script creates a completely self-contained bundled artifact using [ncc](https://github.com/vercel/ncc) bundler. It produces:

1. **JavaScript bundle**: Single self-contained file with all dependencies
2. **TypeScript definitions**: Generated `.d.ts` files for type safety
3. **Cross-platform executables**: Bin wrappers for Unix/Linux/macOS and Windows
4. **Metadata files**: `package.json`, `README.md`, `LICENSE`, `config.json`
5. **Dataset inclusion**: Copies knowledge base dataset if present
6. **ZIP archive**: Compressed artifact with SHA256 checksum

## Artifact Structure

```
pair-cli-manual-vX.Y.Z/
├── bundle-cli/           # Self-contained JavaScript bundle
│   ├── index.js         # Main bundled application
│   ├── index.d.ts       # TypeScript definitions
│   └── dataset/         # Knowledge base data (if present)
├── bin/                 # Executable wrappers
│   └── pair-cli        # Unix/Linux/macOS executable
├── pair-cli            # Top-level executable (Unix/Linux/macOS)
├── pair-cli.cmd        # Windows executable
├── package.json        # Clean package.json for bundled artifact
├── README.md           # CLI documentation
├── LICENSE             # License file
└── config.json         # Default configuration
```

## CI Integration

CI should run the following high-level jobs:

1. **version** (changesets): Update package versions
2. **build** (`pnpm -w build`): Build all packages including TypeScript compilation
3. **package** (`scripts/package-manual.sh $VERSION`): Create bundled artifact using ncc
4. **release**: Create GitHub Release v$VERSION and upload artifacts

### Prerequisites

Before running the packaging script, ensure:

- All packages are built (`pnpm -w build`)
- Node.js and npm/npx are available in CI environment
- `ncc` bundler is accessible via npx (auto-installs if needed)
- `dts-bundle-generator` is available for TypeScript definitions
- `@changesets/cli` is available (we recommend using the workspace-installed CLI via `pnpm exec changeset`).
  - Adopted version: `2.29.7`

### Creating and applying a changeset (local E2E)

1. Create a changeset describing the change (from the repo root):

```bash
# interactive: select package and change type (patch/minor/major)
pnpm exec changeset add
```

2. Generate version bumps and changelogs locally (this will update package.json files and create version commits/tags when configured):

```bash
pnpm exec changeset version
```

Note: `changeset version` may create commits and tags locally depending on configuration. Run these commands on a clean working tree or in a temporary branch if you want to keep the workspace tidy.

### Build Dependencies

The packaging process requires these tools:

- **ncc** (`@vercel/ncc`): Node.js bundler for creating self-contained artifacts
- **dts-bundle-generator**: Generates TypeScript definition files
- **zip**: Archive creation utility
- **sha256sum/shasum**: Checksum generation

## Notes

- **Bundling approach**: Uses ncc to create a single self-contained JavaScript file with all dependencies, eliminating the need for `node_modules` in the final artifact
- **Cross-platform support**: Generates executables for Unix/Linux/macOS and Windows automatically
- **TypeScript support**: Includes generated `.d.ts` files for type safety when used as a library
- **Dataset inclusion**: Automatically includes the knowledge base dataset if present in the repository
- **Clean package.json**: Creates a minimal `package.json` suitable for the bundled artifact
- **Source maps**: Includes source maps in the bundle for debugging purposes

## Installation from Manual Artifact

Users can install the manual artifact by:

1. **Download**: Get `pair-cli-manual-vX.Y.Z.zip` from GitHub releases
2. **Extract**: Unzip to desired location
3. **Execute**: Run `./pair-cli` (Unix/Linux/macOS) or `pair-cli.cmd` (Windows)

No additional dependencies or `npm install` required - the bundle is completely self-contained.

## Next steps

- ✅ **Packaging script**: Implemented and tested with ncc bundling
- ✅ **CI workflow**: Created `.github/workflows/release.yml` to automate the release process
- ⏳ **Release testing**: Test manual installation process on different platforms
- ⏳ **Documentation**: Update installation guides to reference manual artifacts

## Automated Release Process

The release process is now fully automated through GitHub Actions. The `.github/workflows/release.yml` workflow handles the complete release pipeline:

### Trigger Conditions

The release workflow is triggered by:

- **Tag push**: When a tag matching `v*` is pushed to the repository
- **Release creation**: When a GitHub release is published
- **Manual dispatch**: Can be triggered manually with a specific version

### Workflow Steps

1. **Environment Setup**

   - Checkout code
   - Install pnpm and Node.js
   - Install dependencies
   - Load environment variables

2. **Quality Assurance**

   - Run `pnpm quality-gate` (type checking, tests, linting)
   - Build all packages with `pnpm build`

3. **Artifact Creation**

   - Execute `scripts/package-manual.sh` with the release version
   - Generate bundled artifacts using ncc
   - Create cross-platform executables and ZIP archive

4. **Release Publication**
   - Upload artifacts to GitHub Actions artifacts
   - Create/update GitHub release with artifacts attached
   - Generate release notes with installation instructions

### Release Artifacts

The workflow produces:

- `pair-cli-manual-{version}.zip` - Complete bundled artifact
- `pair-cli-manual-{version}.zip.sha256` - SHA256 checksum for verification
- GitHub release with download links and installation instructions

### Manual Workflow Dispatch

You can manually trigger a release by:

1. Going to GitHub Actions → Release workflow
2. Click "Run workflow"
3. Enter the version (e.g., `v1.0.0`)
4. The workflow will create a release with that version tag

### Environment Variables

The workflow uses:

- `GITHUB_TOKEN` - Automatically provided for release creation

This automated process ensures consistent, reproducible releases with bundled artifacts ready for manual installation in any environment.

## Repository configuration

This section documents the repository-level settings needed to fully automate releases. The repository currently uses the built-in `GITHUB_TOKEN` for Actions; the checklist below assumes that token will be used. If your organization requires a dedicated PAT, see the notes under "Alternative token (PAT)".

Checklist (actions for repo admin)

- [ ] Actions → Settings → Workflow permissions: set to "Read and write permissions" (required for workflows that push tags/commits).
- [ ] If your org policy requires a PAT instead of `GITHUB_TOKEN`, add a repository secret named `GH_RELEASE_TOKEN` (or `RELEASE_TOKEN`) with scope `repo` and update your workflows to use it. See note below.
- [ ] Branch protection for `main`:
  - Require pull request reviews before merge (1+ approver).
  - Require status checks to pass before merging. Recommended checks (use exact names as displayed in the Checks UI):
    - `Version (Changesets) / version` (the changesets versioning job in `.github/workflows/version.yml`)
    - `Release / release` (the release workflow job in `.github/workflows/release.yml`)
    - Any other CI checks you consider mandatory (unit tests, lint, typecheck). Add them using the exact check names after a run.
  - Require branches to be up-to-date before merging (prevents merges when the base has new commits).
  - (Optional) Enforce signed commits or linear history if your org requires them.
- [ ] Confirm repository Actions settings allow the workflows you rely on (no blocked third-party actions if release uses `softprops/action-gh-release` or others).

Verification steps (how to confirm everything works end-to-end)

1. Confirm `Workflow permissions` is set to Read & write.
2. Create a test changeset locally:

```bash
pnpm exec changeset add --empty
git add .changeset && git commit -m "test(changeset): test versioning"
git push origin HEAD:refs/heads/test-changeset
# Open a PR to merge to main and merge it (or merge directly in a test repo)
```

3. Observe GitHub Actions for the push/merge: ensure the `Version (Changesets)` workflow runs and creates a version commit/tag. Check the Checks UI for the `Version (Changesets) / version` job.
4. Verify `release` workflow runs (on tag) and that artifacts are produced and uploaded. Confirm the Check named `Release / release` completes successfully.
5. If any check is missing from branch protection, run a workflow to populate the check name and then add it to protection settings.

Notes on tokens and scopes

- `GITHUB_TOKEN` (recommended): automatically available to Actions and usually sufficient for creating commits/tags and creating releases. Preferred for simplicity and security.
- Alternative (PAT): create a `GH_RELEASE_TOKEN` repository or organization secret with `repo` scope if your org policies prevent `GITHUB_TOKEN` from creating tags/releases. To use it, update workflows where `GITHUB_TOKEN` is referenced and set `env: GITHUB_TOKEN: ${{ secrets.GH_RELEASE_TOKEN }}` (or similar).

Rollback and emergency process (short)

- To revert a bad release: revert the version commit (created by the `version` job) and push a new commit that contains a corrected changeset (or create a patch changeset). If a release tag was created and published, delete the release and tag from GitHub and re-run the corrected pipeline.
- Document the exact rollback steps and responsible contacts in your internal ops notes if you need stricter SLAs.

When this checklist is complete and a test changeset produces the expected version commit, tag and release artifacts, Task-006 can be marked as done.
