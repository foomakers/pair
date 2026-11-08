# Testing policy

Goal: verify specified behavior, never raise coverage. Thresholds live in one file, [`test-policy.config.json`](test-policy.config.json), read by the audit and the gates so policy, audit and CI cannot diverge. Reusable guidance: `.pair/knowledge/guidelines/testing/test-strategy/behavior-first-tests.md`; agent rules: `AGENTS.md` / `CLAUDE.md` (Testing); card authors: the **Test plan** section of the user-story template.

## Taxonomy

| ID | Class | Signal | Default action |
| --- | --- | --- | --- |
| U1 | Tautological | Expected value derived from code under test | Rewrite or remove |
| U2 | No assertions | Zero assertions (assertions in called helpers count) | Add assertion, else remove |
| U3 | Redundant | Unique kills = 0 and unique coverage = 0 | Remove or parametrize |
| U4 | Change-detector | Mock/assertion ratio above config; confirmed only with an internal collaborator mocked | Rewrite on public interface |
| U5 | Trivial | Complexity 1, no non-equivalent mutant | Remove |
| U6 | Flaky | Differing result across seeded random-order runs | Quarantine |
| U7 | Disproportionate | Over level budget, low unique kills | Move level or reduce |
| U8 | Dead code | Covered symbol unreferenced outside tests | Remove test and code, separate PR |

Protected, never auto-removed: regression tests (issue reference), public-contract, security, accessibility, tests documenting a requirement.
Unavailable signal ⇒ `not measured`; never estimated; never grounds for removal.

## Budgets

| Level | Per test | Level total | Runs |
| --- | --- | --- | --- |
| unit | 100 ms | 60 s | every commit |
| integration | 2 s | 5 min | every PR |
| e2e | 30 s | 15 min | main and the manual audit workflow |

Level growth per PR ≤ `maxLevelGrowthPct` (5%); beyond it, remove/speed up other tests or use a bypass label.

## Audit

```bash
pnpm --filter @pair/dev-tools test-audit:all        # ONE command: re-runs the baseline, then regenerates the four files (minutes)
pnpm --filter @pair/dev-tools test-audit            # regenerates test-audit/report.json, report.md, removal-plan.md from baseline.json
pnpm --filter @pair/dev-tools test-audit:baseline   # re-runs F0 (3 seeded runs per package, minutes) → baseline.json
pnpm --filter @pair/dev-tools test-audit:inventory  # static inventory only → test-audit/inventory.json
```

Capabilities on this stack (TypeScript/Vitest): per-test duration, status and package coverage are measured from the runner; per-test coverage and mutation (U1, U3, U5, U7 unique kills, U8) are `not measured` — no supported tool is installed (Stryker is not a dependency). The trivial-assertion list (`expect(true)`) is not implemented: U2 is zero assertions only. Counts reconcile per module and level: before − removed + added = remaining (the tool refuses otherwise).

## Quarantine (U6)

A test failing in at least one seeded random-order run is quarantined: `it.skip` with a `QUARANTINE U6` comment and an entry in `quarantine` of the config (G2 exempts listed ids only), one tracking issue per case. Quarantine ends by fixing the order dependence or removing the test.

## Gates

`pnpm --filter @pair/dev-tools test-audit:gates [--base origin/main] [--labels a,b] [--durations run.json] [--stryker report.json] [--g6] [--g8-from prev-report.json]`

| ID | Check | Supported here |
| --- | --- | --- |
| G1 | ≥1 assertion per non-skipped test | yes (AST) |
| G2 | no skip/only, sleep, print, spy on private members, inline snapshot > `maxSnapshotLines` | yes (AST); whole-object file snapshots and `verify` calls on private methods: not detectable |
| G3 | per-test/per-level budget, level growth ≤ 5% | yes (runner JSON via `--durations`) |
| G4 | mutation score on diff ≥ `minMutationScoreOnDiffPct` | logic tested on Stryker JSON; **unsupported** until a mutation tool is installed |
| G5 | each added test has unique kills ≥ `minUniqueKillsPerNewTest`; scope = `criticalModules` (`*` = all, including runs above 10 min; reassess after measuring in report-only) | same as G4 |
| G6 | added/changed tests green in `flakyRuns.pr` random-order runs | yes (`--g6`) |
| G7 | test:prod changed lines ≤ `maxTestToCodeRatio` | yes |
| G8 | no new U2/U3 vs previous audit | yes (manual workflow) |

An unsupported gate is reported `unsupported`, never green, never blocking. A bypass is the PR label `gate-bypass:<ID>: <reason>` (reason required); bypasses are counted in the output.

### Rollout (`rollout` in the config)

1. `report-only` (default, weeks 1–2): all gates run, none blocks; measure false positives and G5 cost.
2. `block-cheap` (weeks 3–4): G1, G2, G3, G6 block.
3. `block-full` (from week 5): all supported gates block.

A gate above 10% false positives in report-only is not promoted until its rule is corrected.
CI: PR step "Test gates" (G1, G2, G7) and the manual-only `test-audit-nightly.yml` workflow (`workflow_dispatch`, no schedule): audit + G8, plus an optional Stryker mutation report.

### Redundancy report (manual)

`pnpm test-audit:redundancy [--out file] [--modules a,b] [--concurrency n] [--skip-mutation] [--skip-playwright] [--full]`

One command, one JSON report (default `test-audit/redundancy/report.json`, git-ignored; `--out` is configurable). It runs, for the six vitest packages, a Stryker mutation pass (vitest runner, per-test coverage, bail disabled, incremental) and, for Playwright e2e and component tests, a static fingerprint overlap (pages visited, components mounted, actions, assertions; no browser). The file holds per-module scores, Playwright totals and a flat `candidates` list: mutation `never-kills` (covers mutants, kills none) and `redundant` (every mutant it kills is also killed by another test), and Playwright tests whose fingerprint is contained in another test's. Candidates feed a cleanup card, never an automatic deletion: `redundant` is a weak signal in unit suites and the fingerprint cannot see data-driven loops or helper-side checks, so each row needs a human read. `apps/pair-cli` is cut into slices and runs only the first (registry, kb-manager, config, ui) by default: the `commands` slices take hours and run with `--full`. Tests that only visit or mount get no verdict. `.claude/workflows` and `scripts/dev` (`node:test`) and the bash smoke scenarios are not covered. Not part of `quality-gate`; the single-module runner stays available as `pnpm test-audit:mutation --module <dir>`.
