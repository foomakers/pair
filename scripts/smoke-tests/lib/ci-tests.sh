#!/usr/bin/env bash
#
# The CI-safe smoke set — sourced by run-all.sh (`--ci`) and by
# scenarios/runner-outcomes.sh, which asserts the invariants below.
#
# THE RULE (story #400), stated as ENFORCED: a scenario runs in CI **unless it
# declares `OFFLINE_SAFE=false` on its own line**. The declaration is opt-OUT —
# `is_offline_safe` (run-all.sh) and `runner-outcomes.sh` both match
# `^OFFLINE_SAFE=`, so no declaration, or a commented one, means offline-safe and
# therefore in scope. Stating it the other way round ("CI runs every scenario that
# declares OFFLINE_SAFE=true") would describe a stricter rule than the code, on a
# suite where several scenarios declare nothing.
#
# An offline-SAFE scenario may be pulled out only with a tracking issue in its
# reason. Either way the reason is recorded HERE, next to the list, and
# `runner-outcomes.sh` fails if a scenario is in neither array: a new scenario
# cannot join the suite and quietly never run in CI. That silence is what let
# `coverage-gate.sh` sit unexecutable for weeks.
#
# Measured cost (2026-08-11, this list, cold pnpm store excluded): the suite
# packages the CLI once and runs the scenarios sequentially. See the `smoke` job in
# .github/workflows/ci.yml for the recorded duration and the revisit threshold —
# if it grows past the `build` job it gets scoped or moved to a schedule, rather
# than being tolerated silently.
#
# Order is irrelevant: the runner's packaging preflight produces the packaged CLI
# before the loop starts, and 00-create-install-package.sh short-circuits to an
# assertion on that artifact when it runs again as a listed scenario (packaging
# twice was pure duplicated cost on a job whose duration is a governed number).

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
  "pr-tree-resolve.sh"
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
# does not need.
#
# Where the download path IS exercised, precisely: release.yml runs
# scripts/workflows/release/smoke-test-npm-artifact.sh, whose "Test B" invokes
# `pair install` with no --source against the real published artifact. It WARNS
# rather than fails when that install does not succeed ("may require published
# GitHub release"), so it is evidence, not a gate — the no---source fallback stays
# a MANUAL guarantee (`pnpm smoke-tests`) until someone makes Test B fatal in the
# post-release run. Saying otherwise would overstate the coverage this exclusion
# leans on.
#
# default-resolution.sh was IN the CI list until #400 while declaring itself
# offline-unsafe — the same kind of unchecked claim as the 644 mode. It still runs
# in the full local suite (pnpm smoke-tests).
CI_EXCLUDED=(
  "auto-download-install.sh: OFFLINE_SAFE=false — 'pair install' with no --source auto-downloads the release asset matching the CLI version; unreleased on a PR branch"
  "auto-download-update.sh: OFFLINE_SAFE=false — same download path on 'pair update'; exercised post-release by release.yml (smoke-test-npm-artifact.sh) against the real artifact"
  "default-resolution.sh: OFFLINE_SAFE=false — clears the KB cache to force a fresh download from GitHub releases (same dependency, install + update); the fallback it asserts stays a manual guarantee, see the note above"
)
