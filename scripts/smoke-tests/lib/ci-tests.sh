#!/usr/bin/env bash
#
# The CI-safe smoke set — sourced by run-all.sh (`--ci`) and by
# scenarios/runner-outcomes.sh, which asserts the invariants below.
#
# THE RULE (story #400): CI runs every scenario that declares `OFFLINE_SAFE=true`.
# A scenario stays out only if it declares `OFFLINE_SAFE=false`, or — when an
# offline-safe one has to be pulled — with a tracking issue in its reason. Either
# way the reason is recorded HERE, next to the list, and `runner-outcomes.sh`
# fails if a scenario is in neither array: a new scenario cannot join the suite
# and quietly never run in CI. That silence is what let `coverage-gate.sh` sit
# unexecutable for weeks.
#
# Measured cost (2026-08-11, this list, cold pnpm store excluded): the suite
# packages the CLI once and runs the scenarios sequentially. See the `smoke` job in
# .github/workflows/ci.yml for the recorded duration and the revisit threshold —
# if it grows past the `build` job it gets scoped or moved to a schedule, rather
# than being tolerated silently.
#
# Order matters only for the first entry: 00-create-install-package.sh produces the
# packaged CLI the offline/lifecycle scenarios reuse.

CI_TESTS=(
  "00-create-install-package.sh"
  "install-basic.sh"
  "package.sh"
  "bundle-content.sh"
  "links.sh"
  "lifecycle-kb.sh"
  "validate-config.sh"
  "kb-validate.sh"
  "source-resolution.sh"
  "install-preconditions.sh"
  "scaffold-kb.sh"
  "tier-aware-gate.sh"
  "coverage-gate.sh"
  "pr-state-flow.sh"
  "format-ignore-delegation.sh"
  "registry-exclude.sh"
  "no-dataset-in-artifacts.sh"
  "runner-outcomes.sh"
)

# Scenarios deliberately NOT run in CI, each as "<file>: <reason>".
#
# All three declare OFFLINE_SAFE=false: they resolve the dataset by downloading the
# published GitHub release matching the CLI version. On a pull request that version
# is frequently unreleased, so a red would report the release calendar rather than
# the diff, and every run would depend on network reachability the rest of this set
# does not need. The download path is covered where it is meaningful: release.yml's
# artifact smoke tests, against the real published artifacts.
#
# default-resolution.sh was IN the CI list until #400 while declaring itself
# offline-unsafe — the same kind of unchecked claim as the 644 mode. It still runs
# in the full local suite (pnpm smoke-tests).
CI_EXCLUDED=(
  "auto-download-install.sh: OFFLINE_SAFE=false — 'pair install' with no --source auto-downloads the release asset matching the CLI version; unreleased on a PR branch"
  "auto-download-update.sh: OFFLINE_SAFE=false — same download path on 'pair update'; covered by release.yml against the real artifact"
  "default-resolution.sh: OFFLINE_SAFE=false — clears the KB cache to force a fresh download from GitHub releases (same dependency, install + update)"
)
