# Decision: The smoke suite's CI-safe list runs pre-merge, and "cannot run" is its own outcome

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

`scripts/smoke-tests/run-all.sh --ci` was invoked by **no** GitHub workflow. `ci.yml` ran `ts:check`, `build`, `lint`, `hygiene:check`, `docs:staleness`, `skills:conformance`, `dup:check`, `test`, the coverage guardrail and the website E2E; `release.yml` ran the two release-artifact smoke scripts, not the suite. The `CI_TESTS` array read as if a pipeline consumed it — it did not.

Every real-CLI guarantee the suite encodes therefore fired only when a human typed `pnpm smoke-tests`, including `assert_pinned_bug` (#391), whose entire value is failing loudly when a pinned upstream bug is fixed. Three facts made the cost of that silence measurable:

1. **`scenarios/coverage-gate.sh` was committed mode `100644`** in PR #368 (story #282) and had been **unexecutable since it was added**. The runner reported the resulting `Permission denied` as a plain `FAIL`, indistinguishable from an assertion failure — and nothing executed the list, so nobody read the line.
2. **Running it for the first time found two stale assertions inside it**: it demanded `git config --add remote.origin.fetch …` while the coverage ratchet (#372, PR #405) had moved to the transient `git -c remote.origin.fetch=…` — whose unit tests assert `config --add` is *not* used — and it refuted the bare substring `git checkout`, which also matches the restore step's `git checkout -- <path>`. The scenario asserted the opposite of the decided behaviour, undetected, because it could not run.
3. **`default-resolution.sh` declared `OFFLINE_SAFE=false` while sitting in `CI_TESTS`** — a second unchecked claim of the same shape.

Cost was the only argument for deferring the suite to a nightly. Measured **in CI, on the job itself** (run [31538360697](https://github.com/foomakers/pair/actions/runs/31538360697), job 93934813269, 2026-08-11): **1m53s** end-to-end for the 18-scenario list — install 10s, CLI+deps build 6s, suite 1m28s — against **3m59s** for `build` in the same run. (67s was the refinement-time figure for 16 scenarios, before this story added two scenarios, removed the network-dependent one, and made `coverage-gate.sh` actually run.)

## Decision

**The CI-safe list runs on every pull request, in a parallel `smoke` job, and a scenario that cannot run says so.**

- **Pre-merge, not nightly.** A parallel `smoke` job in `ci.yml` builds the CLI and its workspace deps (`pnpm turbo build --filter=@pair/pair-cli...` — the filtered `pnpm build` bypasses turbo's `dependsOn` graph and leaves `@pair/content-ops` unbuilt) and runs `run-all.sh --ci --cleanup` as its own status check. At **1m53s measured against a 3m59s `build`** — ~47% of the critical-path job — the suite adds runner time and **zero wall-clock**. Nightly was rejected on the same data: it reports a pinned-bug flip up to 24h late, on `main`, instead of on the PR that caused it. The measured duration and the **revisit threshold** — smoke exceeding ~75% of `build` in the same run, i.e. ~3m00s today, roughly +1m05s of headroom ⇒ scope the list or move to a schedule, deliberately — are recorded next to the job, in the workflow.
- **Four outcomes, not two.** `PASS` / `FAIL` / `NOT EXECUTABLE` / `MISSING`. `NOT EXECUTABLE` and `MISSING` both mean *the scenario never ran*, they have different remedies, and neither is an assertion failure. The state is decided by `scenario_state` (`lib/utils.sh`) **before** execution, so one function answers the question for the runner and for the tests that assert this behaviour. The `NOT EXECUTABLE` line names the file, its mode, and the **commit-level** fix.
- **The mode guard reads the git INDEX, not the filesystem.** `packages/dev-tools/src/quality-gates/smoke-scenario-modes.ts` asserts that every `*.sh` file directly in `scenarios/` — the runner's own glob — and the runner itself is **staged** `100755`, from `git ls-files -s -z` (`-z`, so a non-ASCII path is not C-quoted into a remedy that matches no file). Index, not `HEAD`, deliberately: it catches a `chmod +x` that was never `git add`-ed one push earlier, and on a clean CI checkout index and `HEAD` are the same tree. A `test -x` on the working tree instead passes on a checkout that carries the bit locally while the tracked mode stays `644` — which is exactly the regression to catch. Per the gate-tooling ADL (2026-07-13) the logic is a tested module with a thin CLI.
- **Its enforcement point is the gate chain, not its own unit test.** `smoke-modes:check` (package) → `pnpm smoke-modes:check` (root) → the root `quality-gate` the pre-push hook runs, plus a dedicated step in the CI `build` job. Leaving enforcement to the unit test inside `pnpm test` was **wrong and is corrected here**: `test` is a cacheable turbo task whose input set is entirely inside `@pair/dev-tools` (verified with `turbo test --filter=@pair/dev-tools --dry=json` — 15 files, all in-package; `globalDependencies` covers only `.gitignore` and the two formatter tool dirs). A contributor adding `scenarios/new-thing.sh` mode 644 and touching nothing in that package leaves the task hash unchanged, turbo replays a cached PASS, and the pre-push gate goes green with the guard never executing. CI was not exposed (no remote cache is configured, so every runner starts cold — which is why the deliberate-red run did go red), but a *documented* guarantee that depends on the absence of a cache token is not a guarantee. The general rule now lives in way-of-working's Quality Gates section: a guard over repo-wide state needs a root gate step, exactly as `hygiene:check` / `docs:staleness` / `skills:conformance` already do.
- **Nothing is auto-corrected.** No `chmod` in the runner, none in the workflow, no commit from CI — consistent with the check-only pre-push ADL (2026-07-31). A gate that repairs the tree it is judging stops being evidence about the commit.
- **`CI_TESTS` is a rule with recorded exceptions.** The list moves to `scripts/smoke-tests/lib/ci-tests.sh`, one copy, sourced by the runner. The rule is stated as **enforced**, opt-**out**: **a scenario runs in CI unless it declares `OFFLINE_SAFE=false` on its own line** — `is_offline_safe` and `runner-outcomes.sh` both match `^OFFLINE_SAFE=`, so no declaration (or a commented one) means offline-safe. The inverse phrasing ("CI runs every scenario that declares `OFFLINE_SAFE=true`") would describe a stricter rule than the code, on a suite where several scenarios declare nothing. Pulling an offline-safe scenario out needs a tracking issue in its reason (the flakiness escape hatch — removal is allowed, silent removal is not). `scenarios/runner-outcomes.sh` enforces it: every scenario is in `CI_TESTS` or in `CI_EXCLUDED` **with a reason**, no listed name is a phantom, no offline-unsafe scenario is in the CI list, and CI never chmods.

Membership changes that follow from the rule: `registry-exclude.sh` (measured 0.8s) and `no-dataset-in-artifacts.sh` (measured 12s) join the CI list — both offline-safe and both previously excluded for no recorded reason; `default-resolution.sh` leaves it, since it clears the KB cache to force a download from GitHub releases (it still runs in the full local suite). `runner-outcomes.sh` is new.

## Consequences

- A pinned-bug flip in a CI-listed scenario now turns the **PR** red, with `PINNED BUG APPEARS FIXED` in the job log. `assert_pinned_bug`'s reach note in `lib/utils.sh` is updated accordingly: it is a CI guarantee inside the list, a manual gate outside it.
- A scenario staged without `+x` fails the pre-push gate and the `build` job's `smoke-modes:check` step (both uncacheable), and is reported as `NOT EXECUTABLE` rather than `FAIL` if it reaches the runner. Both messages name the same `chmod +x <path> && git update-index --chmod=+x <path>` remedy, on one repo-relative path.
- The `smoke` status **context is declared, not required**: like `pair-review`, `pair-explicit-approval` and #413's `format`, it blocks nothing until branch protection is written — a human step needing admin scope. The set of declared-but-unenforced contexts keeps growing faster than the enforcement; that is a known, deliberate gap, not an oversight of this decision.
- Scenarios excluded from CI (the three download-dependent ones) keep their guarantees **manual**, and the recorded reason says exactly that. `release.yml` exercises the download path post-release through `smoke-test-npm-artifact.sh`, whose "Test B" runs `pair install` with no `--source` against the real published artifact — but it **warns** instead of failing when that install does not succeed, so it is evidence rather than a gate. The no-`--source` resolution fallback that `default-resolution.sh` asserts therefore remains a manual guarantee (`pnpm smoke-tests`) until Test B is made fatal in the post-release run.
- Ordering: #414 rewrites the ignore mechanism `format-ignore-delegation.sh` (a CI-listed scenario) asserts. With this story merged first, that breakage shows as a red check on #414's own PR.
- Cost is now a declared, revisitable number **observed in CI** instead of an assumption extrapolated from a warm local tree. Adding an expensive scenario to the list has a visible price and a written threshold with arithmetic against a measured `build`.

## Alternatives Considered

- **Nightly / scheduled run.** Rejected on measurement: the only argument was cost (1m53s, parallel, zero wall-clock), and it trades that for reporting a failure up to 24h late, on `main`, detached from the change that caused it.
- **A filesystem `test -x` guard.** Rejected: it passes on a checkout that carries the bit while the tracked mode does not, and on platforms whose filesystem does not carry the bit at all. The mode is a property of what git tracks, so `git ls-files -s` is the only place the assertion is meaningful.
- **Auto-`chmod` in CI (or in the runner).** Rejected: it turns a broken commit into a green run on one machine, and contradicts the check-only pre-push ADL. Reporting the mode plus the exact command keeps the fix a deliberate, reviewable commit.
- **Just `chmod +x coverage-gate.sh`.** Rejected as the whole fix: without the distinct outcome and the commit-level guard, the next scenario added without `+x` repeats the story. The one-line mode fix is the smallest part of this decision.
- **Keeping `CI_TESTS` inline in `run-all.sh`.** Rejected: it is the shape that let membership drift without reasons. One sourced list, audited by a scenario, makes "excluded" a recorded decision instead of an accident.

## References

- Story #400 · related: #391 / #279 (`assert_pinned_bug`), #282 / PR #368 (where `coverage-gate.sh` arrived unexecutable), #372 / PR #405 (the ratchet command plan the stale assertions predated), #414 (ordering)
- ADL [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md) — gate logic in a tested module; script/CLI surfaces verified by smoke test
- ADL [2026-07-31-pre-push-gate-is-check-only.md](./2026-07-31-pre-push-gate-is-check-only.md) — a gate reports, it never writes
- `.github/workflows/ci.yml` (`smoke` job) · `scripts/smoke-tests/lib/ci-tests.sh` · `scripts/smoke-tests/scenarios/runner-outcomes.sh` · `packages/dev-tools/src/quality-gates/smoke-scenario-modes.ts`
