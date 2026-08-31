#!/usr/bin/env bash
set -euo pipefail

# Smoke test: the reference GitHub trigger adapter, proven end to end against the
# REAL published CLI — producer -> published identity -> consumer.
#
# Why this is a smoke test and not a unit test (story #217, round 5 finding):
# the conformance suite could assert every string in `github-automation.md` and still
# ship a dead workflow. It did: the adapter installed `@foomakers/pair-cli` and then
# invoked `pair run`, while the package publishes exactly one bin — `pair-cli`
# (ADL 2026-08-25-cli-invocation-canonical-name-is-pair-cli). The unit test that
# "covered" this stubbed a binary called `pair` onto the PATH, so it proved the stub,
# not the install. The only thing that catches a wrong bin name is running the real
# packaging scripts, installing the real tarball into a clean prefix, and executing the
# step the guideline ships with nothing but that prefix on PATH.
#
# Nothing here is stubbed, aliased or faked at the boundary under test — required by
# ADL 2026-08-31-review-baseline-and-provisioned-artifact-contract.
#
# Offline: the published manifest declares zero runtime dependencies, so the install
# resolves entirely from the local tarball.

OFFLINE_SAFE=true

source "$(dirname "$0")/../lib/utils.sh"

TEST_NAME="GitHub Dispatch Adapter (real install)"
echo "=== Running $TEST_NAME ==="

if [ -z "${REPO_ROOT:-}" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
fi
ensure_tmp_dir

PACKAGE_SCRIPT="$REPO_ROOT/scripts/workflows/release/package-manual.sh"
REGISTRY_SCRIPT="$REPO_ROOT/scripts/workflows/release/create-registry-tgz.sh"
ADAPTER_DOC="$REPO_ROOT/.pair/knowledge/guidelines/collaboration/automation/github-automation.md"
DATASET_DOC="$REPO_ROOT/packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/github-automation.md"

# A version of its own, so a parallel packaging scenario cannot collide with this one.
VERSION="dispatch-adapter-check"
RELEASE_DIR="$REPO_ROOT/release/pair-cli-manual-$VERSION"
ZIP_PATH="$REPO_ROOT/release/pair-cli-manual-$VERSION.zip"
TGZ_PATH="$REPO_ROOT/release/pair-cli-$VERSION.tgz"

cleanup_release() {
  rm -rf "$RELEASE_DIR" "$ZIP_PATH" "${ZIP_PATH}.sha256" \
    "$TGZ_PATH" "${TGZ_PATH}.sha256" "$REPO_ROOT/release/pair-cli-$VERSION.meta.json"
}
cleanup_release

WORK="$(setup_workspace "github-dispatch-adapter")"
PREFIX="$WORK/npm-prefix"
mkdir -p "$PREFIX"

# ── 1. Producer: the real packaging scripts ────────────────────────────────
log_info "Test 1: build the real publishable artifact"

if ! "$PACKAGE_SCRIPT" "$VERSION"; then
  log_fail "package-manual.sh failed — nothing below could run"
  cleanup_release
  exit 1
fi
assert_file "$ZIP_PATH" || { cleanup_release; exit 1; }

if ! "$REGISTRY_SCRIPT" "$VERSION" "$ZIP_PATH"; then
  log_fail "create-registry-tgz.sh failed — nothing below could run"
  cleanup_release
  exit 1
fi
assert_file "$TGZ_PATH" || { cleanup_release; exit 1; }

# ── 2. Published identity: install the tarball into a clean prefix ─────────
log_info "Test 2: install the tarball into a clean prefix"

if ! npm install --global --prefix "$PREFIX" --no-audit --no-fund "$TGZ_PATH" >"$WORK/npm-install.log" 2>&1; then
  log_fail "npm install of the published tarball failed"
  cat "$WORK/npm-install.log"
  cleanup_release
  exit 1
fi

# The ONE name the package publishes. Asserted positively and negatively: the defect this
# scenario exists for is a consumer calling a name the producer never created, and a
# future `pair` alias appearing here would silently re-open it (ADL 2026-08-25 forbids it).
assert_file "$PREFIX/bin/pair-cli" || { cleanup_release; exit 1; }
assert_no_file "$PREFIX/bin/pair" || { cleanup_release; exit 1; }

# ── 3. Consumer: the step the guideline ships, on a PATH holding only that install ──
log_info "Test 3: run the shipped dispatch step against the installed CLI"

extract_dispatch_step() {
  node \
    -e "
    const fs = require('node:fs')
    const { parse } = require(require.resolve('yaml', { paths: ['$REPO_ROOT/packages/knowledge-hub'] }))
    const content = fs.readFileSync(process.argv[1], 'utf-8')
    const section = content.slice(content.indexOf('## Tag-Driven Dispatch'))
    const block = /\`\`\`yaml\n([\s\S]*?)\`\`\`/.exec(section)
    if (block === null) throw new Error('the adapter section ships no yaml workflow')
    const steps = parse(block[1]).jobs.dispatch.steps
    const step = steps.find(candidate => candidate.name === 'Dispatch the card')
    if (step === undefined) throw new Error('no step named \"Dispatch the card\"')
    process.stdout.write(step.run)
  " "$1"
}

# `bash` and `node` come from the system; the CLI comes ONLY from the prefix installed
# above. Nothing on this PATH is named `pair`, which is precisely the state of a hosted
# runner after `npm install -g @foomakers/pair-cli`.
NODE_BIN_DIR="$(dirname "$(command -v node)")"
STEP_PATH="$PREFIX/bin:$NODE_BIN_DIR:/usr/bin:/bin"

run_shipped_step() {
  local doc="$1"
  local label="$2"
  local step_dir="$WORK/step-$label"

  rm -rf "$step_dir" && mkdir -p "$step_dir"
  extract_dispatch_step "$doc" >"$step_dir/step.sh"

  local status=0
  # The interpreter by ABSOLUTE path and the flags GitHub declares for `shell: bash`
  # (`--noprofile --norc -eo pipefail`), so the pipeline's status is the CLI's.
  (
    cd "$step_dir"
    env -i "PATH=$STEP_PATH" "HOME=$step_dir" CARD=217 CARD_TAGS=auto-dev \
      /bin/bash --noprofile --norc -eo pipefail step.sh
  ) >"$step_dir/out.log" 2>&1 || status=$?

  if [ "$status" -eq 127 ]; then
    log_fail "$label: the shipped step invokes a command the installed package does not publish"
    cat "$step_dir/out.log"
    return 1
  fi
  if grep -qi 'command not found' "$step_dir/out.log"; then
    log_fail "$label: 'command not found' — the step calls a name nothing on PATH provides"
    cat "$step_dir/out.log"
    return 1
  fi
  if [ "$status" -ne 0 ]; then
    log_fail "$label: the shipped step exited $status on an unmapped card (expected a clean skip)"
    cat "$step_dir/out.log"
    return 1
  fi
  # Proof the REAL CLI ran, not merely that some command resolved: the dispatcher's own
  # unmapped-card line, on a workspace with no `tech/automation.md` at all.
  if ! grep -q 'no mapping declared' "$step_dir/out.log"; then
    log_fail "$label: the installed CLI never reported the dispatch — the step did not reach it"
    cat "$step_dir/out.log"
    return 1
  fi
  # ...and that the adapter's own contract holds on that path: an unmapped card posts nothing.
  if grep -q '^DISPATCH-RECORD:' "$step_dir/dispatch.log"; then
    log_fail "$label: an unmapped card emitted a DISPATCH-RECORD line"
    cat "$step_dir/dispatch.log"
    return 1
  fi
  log_succ "$label: the shipped step reached the installed CLI and skipped cleanly"
}

# Both distributed copies of the adapter: the dataset is what an adopter installs, the
# root mirror is what this repo dogfoods. A fix applied to one only is the same defect.
run_shipped_step "$DATASET_DOC" "dataset" || { cleanup_release; exit 1; }
run_shipped_step "$ADAPTER_DOC" "mirror" || { cleanup_release; exit 1; }

cleanup_release
echo "=== $TEST_NAME Completed ==="
