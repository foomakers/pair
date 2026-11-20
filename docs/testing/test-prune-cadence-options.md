# Test prune cadence — proposal for #627

**Status:** proposed; no cadence adopted until the maintainer chooses an option. **Comparison revision:** `23d1fecb93526a10d903c80369df28d0d37add80` (`origin/main`, 2026-11-20). A fresh baseline was run at that revision in a disposable worktree; no mutation run was made. No production code or tests were changed, and the repository's `test-audit/baseline.json` was not rewritten.

## Evidence and limits

- [#626's prune report](https://github.com/foomakers/pair/issues/626#issuecomment-6850935287): `packages/content-ops` mutation took **20m38s** at `21f14940`; 457 candidate signals in 49 files (451 with zero unique kills, 6 that never killed), two Stryker worker crashes, one mutant error. A previous run was interrupted. These are review signals, not removal verdicts. No candidate received the protection review for owner-approved behavior, cited regressions, or contract/spec tests.
- Fresh baseline, **measured** at `23d1fecb`: see [Fresh baseline](#fresh-baseline). It times plain test runs only. Mutation wall time per module, per round or per night stays **not measured** apart from the #626 sample.
- The checked-in `test-audit/baseline.json` (`base_rev=f07990841f590ae43edcc75e59bfdd0ed26bfa78`) is **stale (base_rev f0799084)**: it holds six Vitest suites only and is not used for any cell below.
- `redundancy.ts` selects modules via `--modules`; `mutation.ts` selects one via `--module`; `analyze-test-prune` takes `$module`. There is **no changed-test selector**. The redundancy tool's `MODULES` lists six Vitest packages; its mutation results do not measure `workflows:test` or `dev-scripts:test` (`node:test`). Playwright fingerprint candidates are separate static signals, not Stryker results.
- [#625's pre-push decision](../../.pair/adoption/decision-log/2026-11-11-prepush-affected-only-not-adopted.md) keeps the full pre-push gate. Its measured 166 s push and warm 44 s / cold ~130 s do not measure any prune option.

## Fresh baseline

Command, per suite and seed, from `packages/dev-tools` of a disposable detached worktree at `23d1fecb` after `pnpm install --frozen-lockfile && pnpm build`: `ts-node -T src/test-audit/baseline.ts run <suite> <seed>` (seeds 101, 102, 103; `--coverage` on the first Vitest run), then `baseline.ts finalize`. Same runs as `test-audit:baseline`, split so each command stays time-bounded. Node v24.15.0, Apple M5, 10 cores, 2026-11-20.

| Suite | Runner | Wall ms, 3 runs | Median | Tests | Reached by mutation audit |
| --- | --- | --- | --- | --- | --- |
| `apps/pair-cli` | Vitest | 262351, 237857, 238232 | 238232 | 9851 | yes (`MODULES`) |
| `apps/website` | Vitest | 7251, 4422, 4705 | 4705 | 182 | yes (`MODULES`) |
| `packages/brand` | Vitest | 3016, 2030, 2416 | 2416 | 78 | yes (`MODULES`) |
| `packages/content-ops` | Vitest | 3856, 3558, 3863 | 3856 | 696 | yes (`MODULES`) |
| `packages/dev-tools` | Vitest | 67844, 56514, 57657 | 57657 | 951 | yes (`MODULES`) |
| `packages/knowledge-hub` | Vitest | 16224, 15295, 15094 | 15295 | 6884 | yes (`MODULES`) |
| `.claude/workflows` | `node:test` | 161799, 162291, 156970 | 161799 | 3171 | **not measured** |
| `scripts` | `node:test` | 20331, 20759, 20518 | 20518 | 96 | **not measured** |
| `qa` | `node:test` | 139, 139, 137 | 139 | 6 | **not measured** |
| `playwright:brand-ct` | Playwright | 5048, 3475, 3462 | 3475 | 43 | **not measured** (static fingerprint only) |
| `playwright:website-ct` | Playwright | 4174, 3249, 3320 | 3320 | 26 | **not measured** (static fingerprint only) |
| `playwright:website-e2e` | Playwright | 26889, 25651, 25833 | 25833 | 41 | **not measured** (static fingerprint only) |

Sum of medians: 322161 ms for the six Vitest `MODULES`, 537245 ms for all twelve suites (derived from the rows above, sequential, one plain pass).

Caveats, kept with the numbers:

- Baseline suites are not the gate commands. `.claude/workflows` runs `node --test` over the directory that `workflows:test` runs through its sharded runner; `scripts` is the whole `scripts` directory, a superset of `dev-scripts:test` (`scripts/dev/*.test.mjs`). Wall time of the two gate commands themselves is **not measured** here.

- Load was not controlled. Other processes ran on the machine: load average was 11–12 during the `apps/website`, `packages/brand`, `packages/content-ops`, `packages/knowledge-hub` runs and the first `apps/pair-cli` run, and 2.7–4.4 for the rest.
- `apps/pair-cli`: one test failed in runs 1 and 2 and passed in run 3 (`card-entry-r2.test.ts`, `R22-W1`).
- `scripts`: two tests in `scripts/smoke-tests/lib/run-card-omission.test.js` failed in all three runs. Wall time of that suite includes those failures.
- `packages/knowledge-hub` skipped 2 tests and `packages/dev-tools` skipped 1.
- Three runs per suite; a median of three is a sample, not a distribution.

## Options

All time and effort predictions below are **extrapolated** unless marked otherwise. "Elapsed time" is mutation-audit time: the fresh baseline measures plain test runs and bounds it from below only. Suite reach describes the proposed selector or trigger, not a completed audit.

| Option             | Trigger and placement                                             | Scope / suites reached                                                                                                                                                                                                                              | Elapsed time                                                                                                 | Cost                                                                                                                     | Risk                                                                                                     | Touched files if chosen                                                                                   | Effort                                                      |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Changed-tests-only | Per delivery round, **in-cycle**                                  | Reuse #648 AC-17's `turbo --filter=...[<round base>]` affected-package scope; then run module audit for affected Vitest `MODULES`. Changed _individual_ tests have no selector. `workflows:test`, `dev-scripts:test`: **not measured** by mutation. | **Not measured**; 20m38s is one content-ops module at another revision, not a round estimate.                | **Extrapolated:** adds audit work to every qualifying round; counts in #650 AC-19 active ≤100 min and wall ≤4 h targets. | High: broad mutation and worker failures can stall delivery; gate identity and reuse may change.         | #652 step schema/validator, cycle skills, #648 gate selector/identity, audit invocation, tests, adoption. | High, **extrapolated**; blocked by #648 and #652 if chosen. |
| Release            | Before a release, **outside-cycle**                               | Chosen Vitest modules from `MODULES`; Playwright static fingerprint optional. `workflows:test`, `dev-scripts:test`: **not measured** by mutation.                                                                                                   | **Not measured** for all modules; content-ops 20m38s **measured** at `21f14940`, with failures.              | **Extrapolated:** periodic maintainer/release time; outside #650 in-run targets.                                         | Medium: release delay; noisy candidates still need protection review.                                    | Release checklist or workflow, audit invocation, tests if automated, adoption.                            | Medium, **extrapolated**.                                   |
| Manual-only        | Maintainer requests an audit, **outside-cycle**                   | Explicit module in Vitest `MODULES`; optional Playwright static pass. `workflows:test`, `dev-scripts:test`: **not measured** by mutation.                                                                                                           | **Not measured** for a future run; content-ops 20m38s **measured** at `21f14940`, with failures.             | **Extrapolated:** on-demand maintainer time; no recurring gate cost, outside #650 targets.                               | Low scheduling risk; candidate judgment and protection review remain human work.                         | Decision log and adoption guidance only; no production/tests.                                             | Low, **extrapolated**.                                      |
| Nightly/CI         | Scheduled post-merge job, **outside-cycle**; no pull-request gate | Selected Vitest `MODULES`; Playwright static pass optional. `workflows:test`, `dev-scripts:test`: **not measured** by mutation.                                                                                                                     | **Not measured** for all modules/nightly wall; content-ops 20m38s **measured** at `21f14940`, with failures. | **Extrapolated:** recurring CI compute/storage and triage; outside #650 in-run targets.                                  | Medium: worker failures/noise can obscure signals; never make candidate output a deletion or merge gate. | Scheduled CI workflow, audit invocation, artifact retention, tests, adoption.                             | Medium, **extrapolated**.                                   |

## Recommendation and decision boundary

**Recommend manual-only initially.** The only measured mutation run is a noisy, 20m38s single-module sample; 457 signals in 49 files have not passed protection review. A recurring in-cycle run would consume time against #650 AC-19 without a measured payoff. A release or nightly cadence remains possible after a fresh, fixed-revision baseline and protected candidate review. This recommendation does not adopt a policy.

The maintainer chooses one option, including manual-only, before an ADL and adoption delta are recorded. Revisit after a clean mutation run with reviewed protections and measured module/suite wall time, or when repeated manual audits show a stable benefit. Any candidate wave requires human approval and a protection check. Mutation runs use a disposable worktree; this analysis never deletes tests automatically.

An **in-cycle** option needs #652's closed step set extended before dispatch; an unknown step cannot be added by profile alone. It must reuse #648's affected-package selector without invalidating `testIdentity` gate reuse, and account for its time in #650 AC-19. An unattended choice wait uses #646's existing `escalated` stop; any new stop needs its own `STOP_CATALOG` row. Release, manual and scheduled post-merge options stay outside the cycle and need no new cycle step or stop.
