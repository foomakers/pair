# Smoke Tests Suite

This test suite is designed to verify the correct behavior of the `pair` CLI in simulated end-to-end scenarios. Unlike unit tests, these scripts execute the compiled binary (or entry point script) interacting with the real filesystem.

## Structure

- **`run-all.sh`**: Main runner script. It handles environment setup, discovering available tests, and executing them sequentially.
- **`lib/`**: Contains shared utility functions (`utils.sh`) for assertions, logging, and workspace management, plus **`ci-tests.sh`** — the CI-safe list and the recorded reason for every exclusion.
- **`scenarios/`**: Contains scripts for individual use cases. Every `.sh` file here is automatically executed by the runner.

### Outcomes (story #400)

Each scenario ends in exactly one of four states, and the last three all fail the run:

| Outcome            | Meaning                                            | What to do                                                                       |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| ✅ `PASS`          | The scenario ran and its assertions held           | —                                                                                |
| ❌ `FAIL`          | The scenario ran and an assertion failed           | Read its log in the run's temp dir                                               |
| 🚫 `NOT EXECUTABLE` | The file exists but has no `+x` bit — it never ran | `chmod +x <file> && git update-index --chmod=+x <file>` (fix the **tracked** mode) |
| ⚠️ `MISSING`       | Listed for the run, absent from `scenarios/`       | Fix the list in `lib/ci-tests.sh`, or restore the file                           |

`NOT EXECUTABLE` exists because collapsing it into `FAIL` is what hid `coverage-gate.sh` for weeks: it was committed mode `644`, so every run reported `Permission denied` as an assertion failure. The **tracked** mode of every scenario is guarded independently by `packages/dev-tools/src/quality-gates/smoke-scenario-modes.ts`, run as `pnpm smoke-modes:check` from the root `quality-gate` chain (pre-push) and from its own CI step — not left to its unit test, which lives behind a cacheable turbo task. It reads the **git index** (`git ls-files -s -z`), not the filesystem — so it asserts the mode that is staged, i.e. the one about to be committed and the one `HEAD` carries afterwards. Neither the runner nor CI ever repairs a mode — they report it (see the check-only ADL, `2026-07-31-pre-push-gate-is-check-only.md`).

### Which scenarios run in CI

`run-all.sh --ci` runs the list in **`lib/ci-tests.sh`**, and that list is the one the `smoke` job of `.github/workflows/ci.yml` executes on every pull request.

The rule, stated as enforced: **a scenario runs in CI unless it declares `OFFLINE_SAFE=false` on its own line.** The declaration is opt-**out** — `is_offline_safe` (in `run-all.sh`) and `runner-outcomes.sh` both match `^OFFLINE_SAFE=`, so a scenario that declares nothing, or declares it inside a comment, counts as offline-safe and is in scope. The exception in the other direction — pulling an offline-safe scenario out — needs a tracking issue in its reason, recorded in `CI_EXCLUDED` next to the list. `scenarios/runner-outcomes.sh` fails if a scenario is in neither array, so a new scenario cannot join the suite and quietly never run in CI.

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

1. **Dev Env**: Install base KB (v1).
2. **Package v1**: Create v1 zip package.
3. **Client Install**: A "user" installs v1 from the zip package.
4. **Dev Update**: Update contents to v2 in Dev Env.
5. **Package v2**: Create v2 zip package.
6. **Client Update**: The user updates their installation using the v2 package.
7. **Verification**: Check that files were updated correctly.

### 6. KB Validation (`scenarios/kb-validate.sh`)

Verifies the `pair kb-validate` command:

- **Source Layout**: Fully validates the real KB dataset with `--layout source` — structure,
  links and metadata, no `--ignore-config` escape hatch (dogfoods the shipped KB).
- **Target Layout**: Installs KB then validates with `--layout target` (default).
- **Skip Registries**: Validates with `--skip-registries` to exclude specific registries.
- **Ignore Config**: `--ignore-config` consults no config, so no registry resolves and nothing
  is collected — asserted by the absence of a `Link Validation:` section plus the explicit
  "nothing validated" notice, since the exit code alone would be green either way.
- **Failure Detection**: Verifies validation fails on a workspace with missing registry paths.
- **Optional Link Patterns**: a missing out-of-tree link is an error by default, a warning via
  `--optional-link-patterns` or the `link_validation` config, and an error again under `--strict`;
  the KB-root-anchored spelling `/apps/**` is the same rule as `apps/**`. Also pins that a
  non-http URI scheme (`mailto:`, `tel:`) is not a filesystem path and never reported broken.

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
