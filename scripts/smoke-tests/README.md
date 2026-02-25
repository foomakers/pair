# Smoke Tests Suite

This test suite is designed to verify the correct behavior of the `pair` CLI in simulated end-to-end scenarios. Unlike unit tests, these scripts execute the compiled binary (or entry point script) interacting with the real filesystem.

## Structure

- **`run-all.sh`**: Main runner script. It handles environment setup, discovering available tests, and executing them sequentially.
- **`lib/`**: Contains shared utility functions (`utils.sh`) for assertions, logging, and workspace management.
- **`scenarios/`**: Contains scripts for individual use cases. Every `.sh` file here is automatically executed by the runner.

> **Note:** The runner sanitizes some `npm_config_*` environment variables (e.g. `npm_config_cleanup_unused_catalogs`, `npm_config_catalog`) before executing scenarios. These keys can surface from pnpm workspace config entries and may trigger noisy "Unknown env config" warnings from `npm`. Clearing them ensures consistent and quiet smoke-test runs across CI and local environments.

Note: The runner creates a per-run temporary directory using the naming convention `smoke-tests.${DATETIME}.${RANDOM_HASH}` which contains logs, extracted artifacts, and the `packaged-cli` marker file written by the packaging preflight script.

## Covered Test Scenarios

The tests cover the following functional areas, mapped to the official documentation (`docs/cli/commands.md`):

### 1. Preliminary Packaging (`scenarios/00-create-install-package.sh`)

This scenario performs the _initial_ packaging preflight and **is executed first** by the runner to guarantee a packaged CLI is available for the offline/lifecycle scenarios. It:

- Runs the release packaging flow (no bundled dataset — KB is auto-downloaded at runtime),
- Extracts and copies the produced artifact into `$TMP_DIR/artifacts/pair-cli-manual-<version>` so the artifact is self-contained for the duration of the test run,
- Writes the absolute path of the packaged CLI wrapper into `$TMP_DIR/packaged-cli` (the runner and `ensure_packaged_cli` will use this), and
- Runs `scenarios/lifecycle-kb.sh` once using the packaged CLI as a sanity check.

When you run an individual scenario that requires the packaged CLI (for example `lifecycle-kb.sh`) it will call `ensure_packaged_cli` which executes this preflight automatically when necessary.

### 2. Installation (`scenarios/install-basic.sh`)

Verifies the `pair install` command:

- **Default**: Standard installation in the current directory.
- **Custom Target**: Installation to a specific folder (`pair install ./target`).
- **List Targets**: Verifies `pair install --list-targets` output.
- **Selective Registry**: Installation of a single registry (e.g., `knowledge:.kb`).
- **Offline Mode**: (If configured) verifies `--offline` installation using `--source`.

### 3. Packaging (`scenarios/package.sh`)

Verifies the `pair package` command:

- **Basic**: Creating a zip file from a source directory.
- **Manifest**: Verifies that `manifest.json` contains metadata passed via CLI (`--name`, `--version`, etc.).
- **Validation**: Verifies that the command fails correctly if run on an invalid directory.

### 4. Link Updates (`scenarios/links.sh`)

Verifies the `pair update-link` command:

- **Detection**: Execution in `--dry-run` to detect broken links.
- **Fix**: Automatic repair of relative links (e.g., moving from folder A to B).
- **Verbose**: Verifies detailed output.

### 5. Full Lifecycle (`scenarios/lifecycle-kb.sh`)

Simulates a real KB release and update flow in an **Offline** environment:

1.  **Dev Env**: Install base KB (v1).
2.  **Package v1**: Create v1 zip package.
3.  **Client Install**: A "user" installs v1 from the zip package.
4.  **Dev Update**: Update contents to v2 in Dev Env.
5.  **Package v2**: Create v2 zip package.
6.  **Client Update**: The user updates their installation using the v2 package.
7.  **Verification**: Check that files were updated correctly.

### 6. KB Validation (`scenarios/kb-validate.sh`)

Verifies the `pair kb-validate` command:

- **Source Layout**: Validates real KB dataset with `--layout source`.
- **Target Layout**: Installs KB then validates with `--layout target` (default).
- **Skip Registries**: Validates with `--skip-registries` to exclude specific registries.
- **Ignore Config**: Validates with `--ignore-config` to skip structure checks.
- **Failure Detection**: Verifies validation fails on a workspace with missing registry paths.

### 7. Configuration Validation (`scenarios/validate-config.sh`)

Verifies the `pair validate-config` command:

- **Valid**: Correct configuration.
- **Schema Error**: Missing fields.
- **Enum Error**: Invalid values for `behavior`.

## How to Run

The `run-all.sh` script requires at least the path to the executable to be tested.

```bash
./scripts/smoke-tests/run-all.sh --binary <path-to-pair-executable>
```

### Options

- `--binary <path>`: (Required) Path to the `pair` executable or node entry point.
- `--kb-source <path>`: (Optional but recommended) Local path to the Knowledge Hub `dataset` folder. If omitted, offline/lifecycle tests may fail or be skipped if they cannot infer it.
- `--cleanup`: Removes the temporary test directory upon success. Useful for CI.

### Local Execution Example (Dev)

To test the current development version (e.g., compiled `packages/content-ops` or `apps/pair-cli`):

```bash
# Example using ts-node/entrypoint dev (if supported) or after build
cd apps/pair-cli
pnpm build
cd ../..

./scripts/smoke-tests/run-all.sh \
  --binary "./apps/pair-cli/dist/index.js" \
  --kb-source "./packages/knowledge-hub/dataset"
```

### CI Integration

In release workflows, the script is invoked after unpacking the artifact (npm tgz or manual zip) by passing the path of the extracted executable.
