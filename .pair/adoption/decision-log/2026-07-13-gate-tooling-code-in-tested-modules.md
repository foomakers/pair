# Decision: Gate/tooling code lives in tested modules; scripts are thin entrypoints, never unit-tested

## Date

2026-07-13

## Status

Active

## Category

Convention Adoption

## Context

Several repository quality gates started life as standalone scripts under `scripts/` with their logic inline, then grew a sibling vitest test that reached into the script to exercise that logic. Two anti-patterns emerged:

- `scripts/docs-staleness-check.js` held all the docs-integrity logic (skill/guide count checks, catalog sync, dead-link scan) and its test (`apps/website/lib/docs-staleness-check.test.ts`) black-box **spawned the script** via `spawnSync` against fixture trees — testing an opaque process, not importable logic, and duplicating a real build artifact's behavior from outside.
- The same shape had already been corrected once for the skills-conformance gate (#313/#324): logic moved into a module, script deleted.

This is orthogonal to the existing co-location ADL, [2026-07-08-test-file-colocation-multi-module.md](./2026-07-08-test-file-colocation-multi-module.md), which governs **where** a test file sits (root-of-call-chain co-location; one file per entry point for e2e). It does not say **what** should be a testable module versus a script, nor how scripts themselves may be verified. This ADL fills that gap; the two are complementary and non-overlapping.

The repository owner stated the rule directly: "tested functionality lives in production code and is tested there; do NOT unit-test scripts" and, on how to verify a script/CLI when desired, "use a smoke test, not a unit test."

## Decision

**Functionality worth testing lives in a production module** — an importable module in the package that owns the concern, unit-tested white-box (tests import the module's exported functions and assert on them directly).

**Scripts/CLIs are thin entrypoints** that call those modules. A repo-root gate delegates to the owning package rather than holding logic itself:

```json
"docs:staleness": "pnpm --filter @pair/website docs:staleness"
```

and the package script runs the module through a TS runner (`ts-node`/`tsx`) behind a main-guard, e.g. `"docs:staleness": "tsx lib/docs-staleness-check.ts"`.

**Scripts are never unit-tested.** No importing a script's functions into a test, and no black-box `spawnSync`/`exec` of a script inside a vitest unit test. Unit tests target the module's exported logic. When script/CLI-level (end-to-end) verification is wanted, it uses the **smoke-test suite** (`scripts/smoke-tests/`, `pnpm smoke-tests`), not vitest.

Rationale: a gate is testable logic, not an opaque script; keeping the logic in an importable module removes duplication and orphan tests that reach into root `scripts/`; unit tests then cover module logic while smoke tests cover CLI wiring end-to-end. The module's public functions are the single tested surface; the CLI wrapper is a trivial, unit-test-exempt shell.

## Alternatives Considered

- **Keep logic in the script, test it via `spawnSync`/`exec`**: Rejected. Tests an opaque process instead of logic, is slow, forces fixture-tree scaffolding for cases a pure function test expresses in one line, and leaves the logic un-importable and un-refactorable. This is the exact pattern being removed.
- **Keep logic in the script, `require()`/`import` its functions into a unit test**: Rejected. Makes `scripts/` a de-facto source tree with orphan tests reaching across the repo into it, contradicting package ownership and the co-location ADL; a script is meant to be a thin entrypoint, not a module.
- **Move logic to a module but skip a runnable CLI (call only from tests/CI code)**: Rejected. The gate must stay runnable locally and in CI as a single command; a thin main-guarded CLI wrapper delegating to the module keeps that ergonomics without holding logic.

## Consequences

- Quality/integrity gates are authored as owning-package modules with white-box unit tests; the repo-root gate script becomes a one-line delegation (`pnpm --filter <pkg> <gate>`), and CI's step is unchanged because it already calls the root script.
- Reviewers can reject a new gate that puts logic in `scripts/` or that tests a script by spawning it; the fix is "extract to a module + white-box test, delegate the script."
- Script/CLI end-to-end coverage, when needed, is added to `scripts/smoke-tests/` (surfaced as gate `pnpm smoke-tests`), keeping vitest free of script spawning.
- Applied on landing: docs-staleness → `apps/website/lib/docs-staleness-check.ts` + white-box test, `scripts/docs-staleness-check.js` deleted, root gate delegates (PR #315). Prior exemplar: skills-conformance → module in `packages/knowledge-hub/src/tools/` + sibling test, script deleted (#313/#324). Pre-existing exemplars that already followed this shape: knowledge-hub `check-broken-links.ts` and `transfer-dataset.ts` (package modules run via package scripts).

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): Quality Gates section gains a short "Gate & tooling code" bullet pointing to this ADL (surfacing).
- No knowledge-base/dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records; the dataset (`packages/knowledge-hub/dataset/`) is a curated sample, not an auto-mirror of adoption, so this decision is not copied there.
- Complements (does not amend) [2026-07-08-test-file-colocation-multi-module.md](./2026-07-08-test-file-colocation-multi-module.md): that ADL owns test-file placement; this ADL owns module-vs-script boundaries and the no-unit-test-on-scripts rule.
