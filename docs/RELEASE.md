## GitHub Packages notes

If you publish to GitHub Packages, the release will include a `.tgz` artifact that can be uploaded to the GitHub Packages registry or published from the CI artifacts. Below are two examples: 1) how CI should authenticate (prefer `GITHUB_TOKEN` wherever possible) and 2) how a consuming developer can configure their local environment using a personal token (PAT) when necessary.

1. CI / GitHub Actions (recommended): use the automatically provided `GITHUB_TOKEN` in Actions. Best practice is to set an environment variable that your CI steps use to populate a runtime `.npmrc` (avoid committing tokens to the repo). Example (in a workflow step):

```yaml
# In your workflow step that publishes or installs from the registry
env:
  NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
run: |
  echo "@foomakers:registry=https://npm.pkg.github.com/" > ~/.npmrc
  echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" >> ~/.npmrc
  # now npm/pnpm commands will authenticate using the GITHUB_TOKEN provided by Actions
  pnpm add -D @foomakers/pair-cli --registry https://npm.pkg.github.com/
```

2. Consumer / local development (PAT): when a developer configures a local machine or CI outside of GitHub Actions, they must use a personal access token (PAT) with package read scope. Store it in the consuming repo's secrets or a user-level `.npmrc`. Example `.npmrc` (do not commit this file with the token in plaintext):

```text
@foomakers:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

2. Install the package as a dev dependency:

```bash
pnpm add -D @foomakers/pair-cli
# or npm i @foomakers/pair-cli
```

3. Run the CLI via pnpm dlx or npx:

```bash
pnpm dlx pair-cli install
# or npx pair-cli install
```

Additional artifacts produced by the release workflow (optional GitHub Packages publishing):

- `pair-cli-{version}.tgz` - npm pack tarball produced from the manual release folder (no node_modules). This artifact is used to publish to GitHub Packages so that registry consumers can install the CLI via npm/pnpm.
- `pair-cli-{version}.tgz.sha256` - SHA256 checksum for the tgz

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
- ✅ **CI workflow**: Created 3-phase automated release pipeline:
  - `version.yml` - Changeset versioning and PR creation
  - `tag-on-changeset-merge.yml` - Tag creation on PR merge
  - `release.yml` - Artifact creation and release publication
- ✅ **Changeset integration**: Full integration with automated version management
- ⏳ **Release testing**: Test manual installation process on different platforms
- ⏳ **Documentation**: Update installation guides to reference manual artifacts

## Automated Release Process

The release process is now fully automated through GitHub Actions using a **3-phase workflow** with Changesets integration:

### Phase 1: Version Management (`.github/workflows/version.yml`)

**Trigger**: Push to `main` branch with changes in `.changeset/**` directory

**Purpose**: Create version commits and automated PR for package updates

**Steps**:

1. **Environment Setup**: Checkout code, install pnpm/Node.js, dependencies
2. **Version Creation**: Use `pnpm changeset version` to update package versions and create commits
3. **PR Creation**: Create automated PR using `gh pr create` with proper versioning

### Phase 2: Tag Creation (`.github/workflows/tag-on-changeset-merge.yml`)

**Trigger**: Merge of changeset-release PR (branches matching `changeset-release*`)

**Purpose**: Create Git tag when changeset PR is merged

**Steps**:

1. **Validation**: Check if PR was merged and branch matches changeset pattern
2. **Tag Creation**: Create `v{X.Y.Z}` tag pointing to merge commit
3. **Push Tag**: Push tag to repository to trigger release workflow

### Phase 3: Release Publication (`.github/workflows/release.yml`)

**Trigger**: Tag push matching `v*` pattern

**Purpose**: Build artifacts and create GitHub release

**Steps**:

1. **Environment Setup**: Checkout code, install dependencies
2. **Quality Assurance**: Run `pnpm quality-gate` (type check, tests, lint)
3. **Build**: Execute `pnpm build` for all packages
4. **Artifact Creation**: Run `scripts/package-manual.sh` to create bundled artifacts
5. **Release Creation**: Create GitHub release with artifacts and installation instructions

### Complete Release Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Developer     │    │   Changeset      │    │   PR Merge      │
│   creates       │───▶│   PR created     │───▶│   triggers      │
│   changeset     │    │   automatically  │    │   tag creation  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Tag pushed    │───▶│   Release        │───▶│   Artifacts     │
│   to repo        │    │   workflow       │    │   published     │
└─────────────────┘    │   triggered      │    │   on GitHub      │
                       └──────────────────┘    └─────────────────┘
```

### Trigger Conditions

#### Version Workflow (version.yml)

- **Push to main**: When `.changeset/**` files are pushed to `main` branch
- **Manual dispatch**: Can be triggered manually for testing

#### Tag Workflow (tag-on-changeset-merge.yml)

- **PR merged**: When a PR with head branch matching `changeset-release*` is merged
- **Supports both**: `changeset-release/` and `changeset-release-smoke/` branches

#### Release Workflow (release.yml)

- **Tag push**: When a tag matching `v*` is pushed to the repository
- **Release creation**: When a GitHub release is published
- **Manual dispatch**: Can be triggered manually with a specific version

### Release Artifacts

The automated process produces:

- `pair-cli-manual-{version}.zip` - Complete bundled artifact
- `pair-cli-manual-{version}.zip.sha256` - SHA256 checksum for verification
- GitHub release with download links and installation instructions
- Cross-platform executables (Linux/macOS/Windows)
- TypeScript definitions and metadata

### Manual Workflow Dispatch

You can manually trigger components of the release process:

#### Version Workflow

```bash
# Trigger version workflow manually
gh workflow run "Version (Changesets)" --ref main
```

#### Release Workflow

```bash
# Trigger release workflow with specific version
gh workflow run "Release" --ref main -f version="v1.0.0"
```

### Environment Variables

The workflows use the following variables. Prefer `GITHUB_TOKEN` in Actions when possible; only fall back to a PAT when org policies require it.

- `GITHUB_TOKEN` - Automatically provided to GitHub Actions and recommended for repo-level operations (create releases, upload assets, and authenticate to GitHub Packages from within Actions). Use it by referencing `secrets.GITHUB_TOKEN` or `github.token` in workflow steps and exporting it to `NODE_AUTH_TOKEN` for npm operations.
- `GH_RELEASE_TOKEN` / PAT (optional) - Use only if your organization policy prevents `GITHUB_TOKEN` from creating tags/releases or publishing packages. If required, add a repository or organization secret (e.g., `GH_RELEASE_TOKEN`) with the appropriate scopes and reference it in the workflow where needed.

### Changeset Integration

The release process is fully integrated with Changesets:

1. **Create changeset**: `pnpm changeset add` (interactive package selection)
2. **Version bump**: Automatic based on changeset type (patch/minor/major)
3. **Changelog**: Automatically generated from changeset descriptions
4. **PR creation**: Automated PR with version details
5. **Tag creation**: Automatic tag creation on PR merge
6. **Release**: Automatic release creation with artifacts

This 3-phase automated process ensures consistent, reproducible releases with full traceability from changeset to published artifacts.

## Repository configuration

This section documents the repository-level settings needed to fully automate releases. The repository currently uses the built-in `GITHUB_TOKEN` for Actions; the checklist below assumes that token will be used. If your organization requires a dedicated PAT, see the notes under "Alternative token (PAT)".

Checklist (actions for repo admin)

- [ ] Actions → Settings → Workflow permissions: set to "Read and write permissions" (required for workflows that push tags/commits).
- [ ] If your org policy requires a PAT instead of `GITHUB_TOKEN`, add a repository secret named `GH_RELEASE_TOKEN` (or `RELEASE_TOKEN`) with scope `repo` and update your workflows to use it. See note below.
- [ ] Branch protection for `main`:
  - Require pull request reviews before merge (1+ approver).
  - Require status checks to pass before merging. Recommended checks (use exact names as displayed in the Checks UI):
    - `Version (Changesets) / version` (the changesets versioning job in `.github/workflows/version.yml`)
    - `Tag on Changeset PR Merge / tag` (the tag creation job in `.github/workflows/tag-on-changeset-merge.yml`)
    - `Release / release` (the release workflow job in `.github/workflows/release.yml`)
    - Any other CI checks you consider mandatory (unit tests, lint, typecheck). Add them using the exact check names after a run.
  - Require branches to be up-to-date before merging (prevents merges when the base has new commits).
  - (Optional) Enforce signed commits or linear history if your org requires them.
- [ ] Confirm repository Actions settings allow the workflows you rely on (no blocked third-party actions if release uses `softprops/action-gh-release` or others).

Verification steps (how to confirm everything works end-to-end)

1. Confirm `Workflow permissions` is set to Read & write.
2. Create a test changeset locally:

```bash
# Create a changeset for a package
pnpm changeset add --empty
git add .changeset && git commit -m "test(changeset): test versioning"
git push origin main
```

3. Observe GitHub Actions: ensure the `Version (Changesets)` workflow runs and creates a version PR. Check the Checks UI for the `Version (Changesets) / version` job.

4. Merge the changeset PR: This should trigger the `Tag on Changeset PR Merge` workflow and create a `v{X.Y.Z}` tag.

5. Verify `Release` workflow runs (on tag creation) and that artifacts are produced and uploaded. Confirm the Check named `Release / release` completes successfully.

6. If any check is missing from branch protection, run a workflow to populate the check name and then add it to protection settings.

Notes on tokens and scopes

- `GITHUB_TOKEN` (recommended): automatically available to Actions and usually sufficient for creating commits/tags and creating releases. Preferred for simplicity and security.
- Alternative (PAT): create a `GH_RELEASE_TOKEN` repository or organization secret with `repo` scope if your org policies prevent `GITHUB_TOKEN` from creating tags/releases. To use it, update workflows where `GITHUB_TOKEN` is referenced and set `env: GITHUB_TOKEN: ${{ secrets.GH_RELEASE_TOKEN }}` (or similar).

Rollback and emergency process (short)

- To revert a bad release:
  1. Delete the GitHub release and tag from GitHub UI
  2. Revert the version commit created by the changeset PR merge
  3. Create a new changeset with corrected changes
  4. The pipeline will automatically create a new version PR, tag, and release
- Document the exact rollback steps and responsible contacts in your internal ops notes if you need stricter SLAs.

When this checklist is complete and a test changeset produces the expected version PR, tag and release artifacts, the automated release pipeline is fully operational.

## Actions Allowlist and Org Policy

This section documents the GitHub Actions used in the release workflows and provides guidance for org policy compliance and allowlisting.

### Actions Used in Workflows

| Workflow File                                  | Action                            | Version | Type        | Justification                                |
| ---------------------------------------------- | --------------------------------- | ------- | ----------- | -------------------------------------------- |
| `.github/workflows/version.yml`                | `actions/checkout@v4`             | v4      | Official    | Standard checkout action for cloning repo    |
| `.github/workflows/version.yml`                | `pnpm/action-setup@v4`            | v4      | Third-party | Official pnpm action for monorepo setup      |
| `.github/workflows/version.yml`                | `actions/setup-node@v4`           | v4      | Official    | Standard Node.js setup action                |
| `.github/workflows/version.yml`                | `actions/github-script@v7`        | v7      | Official    | Official action for GitHub API calls         |
| `.github/workflows/tag-on-changeset-merge.yml` | `actions/checkout@v4`             | v4      | Official    | Standard checkout action for cloning repo    |
| `.github/workflows/tag-on-changeset-merge.yml` | `actions/github-script@v7`        | v7      | Official    | Official action for GitHub API calls         |
| `.github/workflows/release.yml`                | `actions/checkout@v4`             | v4      | Official    | Standard checkout action for cloning repo    |
| `.github/workflows/release.yml`                | `pnpm/action-setup@v4`            | v4      | Third-party | Official pnpm action for monorepo setup      |
| `.github/workflows/release.yml`                | `actions/setup-node@v4`           | v4      | Official    | Standard Node.js setup action                |
| `.github/workflows/release.yml`                | `actions/create-release@v1`       | v1      | Official    | Official action for creating GitHub releases |
| `.github/workflows/release.yml`                | `actions/upload-release-asset@v1` | v1      | Official    | Official action for uploading release assets |

### Org Policy Checklist

- [ ] **Allowlist Actions**: Ensure all third-party actions (`pnpm/action-setup@v4`) are approved in your org's allowlist settings
- [ ] **Token Permissions**: Confirm `GITHUB_TOKEN` has sufficient permissions for repository operations (contents: write, pull-requests: write)
- [ ] **Branch Protection**: Verify that workflow jobs are included in required status checks for `main` branch
- [ ] **Secrets Management**: If using `GH_RELEASE_TOKEN` instead of `GITHUB_TOKEN`, ensure it's configured with `repo` scope
- [ ] **Audit Logging**: Enable audit logs for workflow runs to track action usage and token access

### Security Notes

- All actions are pinned to specific versions to prevent supply chain attacks
- Official GitHub actions are preferred over third-party alternatives where possible
- Token usage is minimized and follows the principle of least privilege
- Workflow permissions are declared at the job level to limit scope

If your organization has additional security requirements or blocks certain actions, contact your org admin to update the allowlist or modify the workflows accordingly.

## Dependency Changes and Lockfile Updates

### pnpm-lock.yaml Changes Justification

The `pnpm-lock.yaml` file has been updated to reflect the current state of dependencies after the following changes:

- **Package removal**: The `tools/monorepo-tests` package was completely removed from the workspace
- **Version updates**: Tool packages (`@pair/eslint-config`, `@pair/prettier-config`) were updated to `0.0.1-wip` versions
- **Dependency cleanup**: Removed unused dependencies related to the deleted monorepo-tests package

This large diff is expected and necessary to:

- Ensure dependency resolution consistency across the monorepo
- Remove references to deleted packages and their dependencies
- Update lockfile entries to match the new package versions
- Maintain reproducible builds and dependency integrity

The lockfile changes are automatically generated by pnpm and should be committed as part of the remediation process to ensure all CI environments use the same dependency versions.

## Tool Changes Documentation

### Changes in tools/ Directory

The following changes were made to the `tools/` directory as part of the remediation process:

#### Removed Package: tools/monorepo-tests

- **Status**: Completely removed
- **Reason**: Package contained outdated test utilities that were no longer maintained or used
- **Impact**: Reduces workspace complexity and removes unused code
- **Files removed**:
  - `tools/monorepo-tests/package.json`
  - `tools/monorepo-tests/tsconfig.json`
  - `tools/monorepo-tests/.env.example`
  - `tools/monorepo-tests/src/` (entire directory with test files)

#### Updated Packages

- **@pair/eslint-config**: Version changed from `1.0.0` to `0.0.1-wip`
- **@pair/prettier-config**: Version changed from `1.0.0` to `0.0.1-wip`
- **Reason**: Version reset to work-in-progress state for ongoing maintenance
- **Impact**: Allows for iterative updates without affecting stable releases

#### Removed Files

- `tools/prettier-config/.prettierignore_workspaces`: Removed as it was no longer needed

These changes streamline the tools directory by removing unused components and updating versions appropriately. The workspace now has a cleaner structure with only actively maintained tool packages.

Next steps

- Release testing: Test manual installation process on different platforms
- Documentation: Update installation guides to reference manual artifacts
- Monitoring: Set up alerts for workflow failures
- Security: Review and update branch protection rules if needed

The 3-phase automated release pipeline with Changesets integration is now fully implemented and documented.
