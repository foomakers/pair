# Fast Tests: Measuring and Cutting Test and Pre-Push Time

## Principle

Cut time only from what was measured. A guess is `not measured`, never an estimate. Never remove a test to save time: removal is a prune decision ([behavior-first-tests.md](behavior-first-tests.md): U1–U8 taxonomy, cleanup procedure, G1–G8 gates, not restated here).

Adoption files (`.pair/adoption/tech/`) override this guide: limits and tools are the project's. The `test-audit` commands below are this project's tooling; other stacks use their runner's equivalent.

## Measurement path

1. Quiet machine, build done first (some tests need built artifacts). A run on a busy machine is discarded and the report says so.
2. Three seeded runs per suite, one suite at a time, median wall time (`pnpm test-audit:baseline`). A first run without the build, or with a visible outlier, is discarded.
3. Pre-push: one pass of the gate steps in gate order, each timed (`pnpm test-audit:prepush`). A failing step is recorded, not fatal.
4. Compare before and after with the same tool, same machine state, stages interleaved per seed. Report tests count next to time: fewer tests with the same wall time is not a gain.

## Bottleneck ranking

Rank by wall time that is removable, not by size: (1) pre-push steps by seconds, (2) suites by median, (3) files by duration, (4) tests by duration. A suite's wall time is its longest file when files run in parallel: only that file's cost moves the wall. Serial steps add; concurrent steps cost the longest.

## Cause classes

Each class carries a measured example from card #625 (before, on `29baf585`).

| Class | Signal | Measured example | Fix |
| --- | --- | --- | --- |
| Serial runs | steps chained with `&&` that do not depend on each other | `turbo test` 78.5 s then `workflows:test` 69.1 s of 166.3 s | run concurrently (`quality-gate` now parallel; warm 44 s, cold about 130 s) |
| Subprocess / real build | one test starts a build or a process | `regenerate-mirrors.test.ts`: one test runs a real build, 30.4 s | stub the build, reuse the built output |
| Real git / fs | tests spawn git or node, many per file | `red-snapshot.test.mjs`: 99 tests at about 0.5 s, 58.7 s sequential | run tests of the file concurrently, share one fixture repo |
| Sleeps / real time | real waits or timeouts | `cards-review-progress.test.ts`: two tests wait 8.1 s and 8.0 s | fake timers, injected clock |
| Setup | heavy per-test setup, huge files | `cards-lifecycle.test.ts`: 347 tests, 64 s | split files, share setup |

Result of applying them (#625, sum of suite wall, serial): 242.0 s to 192.3 s (-21%), tests 14277 to 14279. `.claude/workflows` 68.9 s to 28.9 s.

An optimization that is not adopted is recorded as a decision: affected-only pre-push was rejected (turbo already caches per package; false-green risk).

## Rules per stack

- **vitest**: no real `setTimeout` waits (`vi.useFakeTimers`); split files above about 30 s; keep CPU-bound parallelism at the runner level; `isolate: false` only for pure tests, run 3 times.
- **`node:test`**: run tests of a file concurrently (`{ concurrency: true }`) only when each owns its fixture; share one fixture repo instead of one `git init` per test; real `sleep` becomes a shorter injected delay.
- **Playwright**: measure with the runner's reporter (per-file times); reuse the built app; cut `waitForTimeout` for explicit waits; overlap with component tests is a prune question, not a speed one.

## Edge cases

- Missing signal (stage not measurable by the tool): `not measured`; extend the tool, never estimate.
- Noisy run: discard it and say so; repeat.
- Cold vs warm: report both when a cache exists (turbo); a warm number alone hides the cold cost.
