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

### 5. `create-github-release.sh`

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

## Workflow Execution Sequence

The scripts are called in the following order within the `release.yml` workflow:

```
1. determine-version.sh     → Determines VERSION
2. package-manual.sh        → Creates ZIP artifact
3. create-registry-tgz.sh   → Creates TGZ from ZIP
4. smoke-test-artifact.sh   → Tests the artifacts
5. create-github-release.sh → Creates release + uploads assets
```

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

# Test artifact creation (requires existing build)
./package-manual.sh v1.0.0-test

# Test TGZ creation (requires ZIP artifact)
./create-registry-tgz.sh v1.0.0-test release/pair-cli-manual-v1.0.0-test.zip

# Test smoke testing (requires artifacts)
PAIR_DIAG=1 ./smoke-test-artifact.sh v1.0.0-test

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
