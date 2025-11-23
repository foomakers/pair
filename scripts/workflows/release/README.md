# Release Workflow Scripts

This directory contains the extracted scripts from the `release.yml` GitHub Actions workflow. These scripts implement the core logic for the release process, making it testable and maintainable.

## Overview

The release workflow handles the complete process of building, packaging, testing, and publishing releases of the pair CLI tool. The workflow is divided into two jobs:

1. **`release` job**: Builds artifacts, creates releases, and uploads to GitHub
2. **`publish-gh-packages` job**: Publishes to GitHub Packages registry

## Scripts

### 1. `package-manual.sh`

**Purpose**: Creates the manual release artifacts (ZIP file with bundled CLI)

**Parameters**:

- `VERSION`: Release version (e.g., `v1.0.0`)

**Outputs**:

- `release/pair-cli-manual-{VERSION}.zip`: Bundled CLI archive
- `release/pair-cli-manual-{VERSION}.zip.sha256`: Checksum file

**Usage**:

```bash
./package-manual.sh v1.0.0
```

### 2. `determine-version.sh`

**Purpose**: Determines the version to use for the release based on GitHub event triggers

**Parameters**:

- `--input-version VERSION`: Version from workflow_dispatch input
- `--release-tag TAG`: Tag name from release event
- `--github-ref REF`: GITHUB_REF environment variable
- `--output-file FILE`: File to write version output (default: stdout)
- `--env-file FILE`: File to write VERSION env var (default: stdout)

**Outputs**:

- `version=VERSION` in GITHUB_OUTPUT format
- `VERSION=VERSION` in GITHUB_ENV format

**Usage**:

```bash
# In workflow context
./determine-version.sh \
  --input-version "${{ github.event.inputs.version }}" \
  --release-tag "${{ github.event.release.tag_name }}" \
  --github-ref "$GITHUB_REF" \
  --output-file $GITHUB_OUTPUT \
  --env-file $GITHUB_ENV

# Local testing
./determine-version.sh --input-version "v1.0.0"
```

### 3. `create-registry-tgz.sh`

**Purpose**: Creates a TGZ package suitable for npm registry publishing from the manual release ZIP

**Parameters**:

- `VERSION`: Release version
- `ZIP_PATH`: Path to the manual release ZIP file

**Outputs**:

- `release/pair-cli-{VERSION}.tgz`: NPM package archive
- `release/pair-cli-{VERSION}.tgz.sha256`: Checksum file
- `release/pair-cli-{VERSION}.tgz.meta.json`: Package metadata

**Usage**:

```bash
./create-registry-tgz.sh v1.0.0 release/pair-cli-manual-v1.0.0.zip
```

### Smoke tests: manual and npm artifact verifications

There are two smoke-test scripts that exercise the packaged release artifacts in different distribution modes:

- `smoke-test-manual-artifact.sh` — smoke-test the manual ZIP artifact (unzip, run the bundled CLI `--version`, and run `pair install` against the sample project).
- `smoke-test-npm-artifact.sh` — smoke-test the registry/TGZ artifact by extracting the TGZ, installing the extracted package into the sample project, and running `npm run pair:install`.

Both scripts accept a `VERSION` or the direct path to the artifact file as the first parameter. They also support two optional flags after the first parameter:

- `--cleanup` or `-c`: force removal of temporary folders at the end of the test. Default is to KEEP debug folders so they can be inspected after a run.
- `--persist-logs` or `-p`: persist diagnostic logs under `./.tmp/smoke-logs/` (when not provided the scripts print diagnostics to stdout only and do not write persistent log files).

Environment variables:

- `PAIR_DIAG=1` — additional diagnostic information can be enabled (the scripts respect this env var; note that `--cleanup` overrides `PAIR_DIAG` if you request removal explicitly).

Usage examples:

```bash
# Manual ZIP (pass version or zip path). Default: keep tmpdir, do not persist logs
PAIR_DIAG=1 ./smoke-test-manual-artifact.sh v1.0.0

# NPM TGZ (pass version or tgz path). Force cleanup and persist logs
./smoke-test-npm-artifact.sh v1.0.0 --persist-logs --cleanup
```

### 5. `package-kb-dataset.sh`

**Purpose**: Packages knowledge-hub dataset into ZIP with manifest and checksum for GitHub releases

**Parameters**:

- `VERSION`: Release version (e.g., `1.0.0` or `v1.0.0`)
- `--clean`: Remove previous KB dataset artifacts before packaging (optional)

**Outputs**:

- `release/knowledge-base-{VERSION}.zip`: Dataset ZIP with preserved directory structure
- `release/knowledge-base-{VERSION}.zip.sha256`: Checksum file for integrity verification
- `manifest.json` (inside ZIP): Version, file list, SHA256 checksums, timestamp

**Usage**:

```bash
# Production packaging
./package-kb-dataset.sh 1.0.0

# Clean previous artifacts then package
./package-kb-dataset.sh --clean 1.0.0

# Clean-only mode (no packaging)
./package-kb-dataset.sh --clean
```

**Features**:

- Preserves complete directory structure from `packages/knowledge-hub/dataset/`
- Generates manifest with recursive file scanning and per-file SHA256 checksums
- Dataset size validation (warns if >50MB)
- Follows same `--clean` pattern as `package-manual.sh`

### 6. `create-github-release.sh`

**Purpose**: Creates a GitHub release and uploads all release assets

**Parameters**:

- `VERSION`: Release version
- `GH_TOKEN`: GitHub token for authentication (optional)
- `--dry-run`: Show what would be done without making changes

**Outputs**:

- GitHub release URL
- Success/failure status

**Usage**:

```bash
# Production
./create-github-release.sh v1.0.0 $GH_TOKEN

# Dry run for testing
./create-github-release.sh --dry-run v1.0.0
```

### 6. `create-github-release.sh`

**Purpose**: Creates a GitHub release and uploads all release assets (CLI binaries + KB dataset)

**Parameters**:

- `VERSION`: Release version
- `GH_TOKEN`: GitHub token for authentication (optional)
- `--dry-run`: Show what would be done without making changes

**Outputs**:

- GitHub release URL
- Success/failure status

**Assets Uploaded**:

- CLI artifacts: `pair-cli-manual-{VERSION}.zip`, `pair-cli-{VERSION}.tgz`, checksums, metadata
- KB artifacts: `knowledge-base-{VERSION}.zip`, `knowledge-base-{VERSION}.zip.sha256`

**Usage**:

```bash
# Production
./create-github-release.sh v1.0.0 $GH_TOKEN

# Dry run for testing
./create-github-release.sh --dry-run v1.0.0
```

## Release Process Overview

### Complete Workflow Sequence

The release workflow creates **dual artifacts** (CLI + KB dataset) in a single GitHub release:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. TRIGGER                                                      │
│    - Tag push (v*)                                              │
│    - Workflow dispatch                                          │
│    - Changeset release                                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. BUILD & QUALITY (release job)                                │
│    - Install dependencies (pnpm install)                        │
│    - Run quality gate (lint, typecheck)                         │
│    - Build all packages (turbo build)                           │
│    - Determine version (determine-version.sh)                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. CLI PACKAGING (release job)                                  │
│    - package-manual.sh → pair-cli-manual-{VERSION}.zip          │
│    - KB EXCLUDED from bundle (downloads on first run)           │
│    - Upload workflow artifact (manual ZIP + checksum)           │
│    - create-registry-tgz.sh → pair-cli-{VERSION}.tgz            │
│    - Upload workflow artifact (TGZ + checksum + metadata)       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. KB PACKAGING (release job)                                   │
│    - package-kb-dataset.sh → knowledge-base-{VERSION}.zip       │
│    - Generate manifest.json (version, files, checksums)         │
│    - Generate checksum file                                     │
│    - Upload workflow artifact (KB ZIP + checksum)               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. SMOKE TESTS (release job)                                    │
│    - smoke-test-manual-artifact.sh (ZIP integrity + install)    │
│    - smoke-test-npm-artifact.sh (TGZ install in sample project) │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. GITHUB RELEASE (release job)                                 │
│    - create-github-release.sh                                   │
│    - Upload CLI artifacts (5 files):                            │
│      • pair-cli-manual-{VERSION}.zip                            │
│      • pair-cli-manual-{VERSION}.zip.sha256                     │
│      • pair-cli-{VERSION}.tgz                                   │
│      • pair-cli-{VERSION}.tgz.sha256                            │
│      • pair-cli-{VERSION}.meta.json                             │
│    - Upload KB artifacts (2 files):                             │
│      • knowledge-base-{VERSION}.zip                             │
│      • knowledge-base-{VERSION}.zip.sha256                      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. NPM PUBLISH (publish-gh-packages job, gated)                 │
│    - Publish pair-cli-{VERSION}.tgz to GitHub Packages          │
│    - Only runs if: workflow_dispatch with publish=true OR       │
│                    tag push (v*)                                │
└─────────────────────────────────────────────────────────────────┘
```

### KB Manager & Auto-Download Behavior

**First Run Experience**:

1. User installs CLI (npm or manual)
2. CLI bundle **does NOT include KB dataset** (size reduced from 6M to ~300KB)
3. On first CLI execution:
   - CLI checks for KB at `~/.pair/kb/{version}/`
   - If not cached, auto-downloads from GitHub release
   - Downloads `knowledge-base-{version}.zip`
   - Extracts to `~/.pair/kb/{version}/`
   - Uses extracted KB for operations

**Subsequent Runs**:

- CLI finds cached KB at `~/.pair/kb/{version}/`
- Reuses cached KB (no re-download)
- Version isolation: different CLI versions use different KB caches

**Error Handling**:

- Network failure: Clear error with GitHub release URL for manual download
- 404 not found: Indicates missing KB release artifact
- Extraction failure: Error logged with extraction details
- No bundled fallback: KB must be downloaded (epic requirement)

**Development Mode**:

- In repo: CLI uses local `packages/knowledge-hub/dataset/` if available
- Fallback chain: local dataset → KB cache → download

### Artifact Lifecycle

**CLI Artifacts**:

- **Manual ZIP**: Self-contained CLI binary (KB excluded, downloads on first run)
- **Registry TGZ**: NPM-compatible package for GitHub Packages
- **Metadata**: Package info for validation and publishing

**KB Dataset Artifacts**:

- **Dataset ZIP**: Complete knowledge-hub dataset with preserved structure
- **Manifest**: Version tracking, file list, integrity checksums
- **Checksum**: ZIP integrity verification

### Version Coordination

- **Single version** for both CLI and KB (coordinated via changeset)
- Version normalized (strips 'v' prefix) for consistent artifact naming
- Both artifact types use same version in filename: `{name}-{VERSION}.{ext}`
- KB cache path includes version: `~/.pair/kb/{VERSION}/`

### Atomic Workflow Behavior

- **If CLI packaging fails** → Workflow stops, no release created
- **If KB packaging fails** → Workflow stops, no release created
- **If smoke tests fail** → Workflow stops, no release created
- **If GitHub upload fails** → Partial uploads possible, investigate manually
- **Guarantee**: Both CLI and KB artifacts present in release OR no release at all

### Integration Points

1. **determine-version.sh** → Provides VERSION to all packaging scripts
2. **package-manual.sh** → Creates CLI ZIP (independent of KB)
3. **create-registry-tgz.sh** → Derives TGZ from CLI ZIP
4. **package-kb-dataset.sh** → Creates KB ZIP (independent of CLI)
5. **create-github-release.sh** → Uploads both artifact types to single release
6. **Release folder** (`release/`) → Shared staging directory for all artifacts

### Troubleshooting

**KB Packaging Failures**:

- Check `packages/knowledge-hub/dataset/` exists and is readable
- Verify dataset size (warning if >50MB)
- Review manifest generation logs for file scanning errors
- Check available disk space for ZIP creation

**KB Auto-Download Failures**:

- **Network error**: Check internet connectivity, GitHub API availability
- **404 Not Found**: Verify KB artifact uploaded to GitHub release
- **Extraction error**: Check ZIP integrity with checksum verification
- **Cache permission error**: Verify `~/.pair/kb/` directory is writable

**Release Upload Failures**:

- Verify GitHub token permissions (needs `contents: write`)
- Check network connectivity for artifact uploads
- Review GitHub API rate limits
- Verify release doesn't already exist (create-github-release.sh checks first)

**Artifact Missing**:

- Check workflow logs for packaging step failures
- Verify `release/` directory contents after packaging steps
- Ensure version normalization consistent across all scripts
- Check artifact naming follows pattern: `{name}-{VERSION_NO_V}.{ext}`

**CLI Bundle Size Issues**:

- Verify KB dataset excluded from `package-manual.sh` (lines 201-208 commented)
- Expected CLI bundle size: ~300KB (vs 6M with bundled KB)
- If bundle large, check dataset copy section not re-enabled

## Workflow Execution Sequence

The scripts are called in the following order within the `release.yml` workflow:

```
1. determine-version.sh        → Determines VERSION
2. package-manual.sh           → Creates CLI ZIP artifact
3. create-registry-tgz.sh      → Creates CLI TGZ from ZIP
4. package-kb-dataset.sh       → Creates KB ZIP artifact (NEW)
5. smoke-test-manual-artifact.sh  → Tests CLI ZIP
6. smoke-test-npm-artifact.sh     → Tests CLI TGZ
7. create-github-release.sh    → Creates release + uploads all assets (CLI + KB)
```

**Note**: Steps 2-4 can run in parallel (independent artifact creation). Steps 5-6 require artifacts from steps 2-3.

## Testing

All scripts can be tested locally without running the full workflow:

### Prerequisites

- Node.js and npm installed
- GitHub CLI (`gh`) installed (for release creation)
- Proper permissions/tokens for GitHub operations

### Test Commands

```bash
# Test version determination
./determine-version.sh --input-version "v1.0.0-test"

# Test CLI artifact creation (requires existing build)
./package-manual.sh v1.0.0-test

# Test CLI TGZ creation (requires ZIP artifact)
./create-registry-tgz.sh v1.0.0-test release/pair-cli-manual-v1.0.0-test.zip

# Test KB dataset packaging (NEW)
./package-kb-dataset.sh 1.0.0-test

# Test KB packaging with cleanup
./package-kb-dataset.sh --clean 1.0.0-test

# Test smoke testing (requires artifacts)
PAIR_DIAG=1 ./smoke-test-manual-artifact.sh v1.0.0-test
PAIR_DIAG=1 ./smoke-test-npm-artifact.sh v1.0.0-test

# Test release creation (dry run)
./create-github-release.sh --dry-run v1.0.0-test
```

## Error Handling

All scripts use `set -euo pipefail` for robust error handling:

- Exit on any command failure
- Treat unset variables as errors
- Propagate pipeline failures

Scripts provide clear error messages and exit codes for CI/CD integration.

## Security Notes

- Scripts handle GitHub tokens securely
- No secrets are logged in output
- Checksum verification prevents tampering
- Dry-run mode available for safe testing

## Maintenance

When modifying these scripts:

1. Test locally first
2. Update this README if interfaces change
3. Ensure backward compatibility
4. Update workflow if script signatures change

## Related Files

- `.github/workflows/release.yml`: Main workflow file
- `release/`: Directory containing generated artifacts
- `TODO.md`: Project documentation and status
