# Behavior-First Tests: Choosing, Writing, Auditing and Cleaning

## Principle

A test exists to verify specified behavior within a budget. Coverage is never a target: a measure that becomes a target stops measuring (Goodhart), and an agent satisfies the metric (coverage, green CI) instead of the intent (protecting behavior). A test's value is observable: mutants only it kills, specified behavior it verifies, stability, time cost.

Adoption files (`.pair/adoption/tech/`) override this guideline: thresholds, budgets and tools are the project's. An adopted policy file (for example `docs/testing/TESTING_POLICY.md` with one `test-policy.config.json`) is the single source for audit and gates.

## Before writing a test

1. State the behavior it verifies, citing the acceptance criterion or requirement. No citation, no test.
2. Derive the expected value from the specification or a hand calculation, never by running the code under test.
3. Check whether a test already verifies the behavior; extend it instead of adding one.

Card authors fill a **Test plan** (behavior, acceptance criterion, level, equivalence classes, and what is out of test scope) before implementation: the closed list of behaviors makes test count a consequence of behaviors, not of effort.

## While writing

- One equivalence class, one case; many inputs of the same case go in a parameterized test (distinct identities, counted once per case).
- Public interface only; mock external boundaries (network, filesystem, time, third parties), not internal collaborators.
- No sleep, print, whole-object snapshots, or left-in skip/only.
- Every test has an assertion that fails if the behavior is wrong; include null/empty, boundaries and expected errors.
- Do not test getters, setters, constants, logic-free constructors, frameworks or libraries.
- Bug fix: reproducing test first, marked as regression with the issue reference.

## Discovery: taxonomy U1–U8

A test gets zero or more classes. Every class needs a written signal; a signal the stack cannot compute is `not measured` and never justifies removal.

| ID | Class | Signal | Default action |
| --- | --- | --- | --- |
| U1 | Tautological | Expected value derived from the code under test; 0 mutants killed on covered lines | Rewrite from the spec, else remove |
| U2 | No assertions | AST assertion count 0 (assertions inside called helpers count) or only trivial assertions | Add the real assertion, else remove |
| U3 | Redundant | Unique kills = 0 and unique coverage = 0 in the mutant × test matrix | Remove or parametrize |
| U4 | Change-detector | Mock/assertion ratio above threshold, spies on private members, oversize snapshots; confirmed only when an internal collaborator is mocked | Rewrite on the public interface |
| U5 | Trivial | Complexity 1 and no non-equivalent mutant | Remove |
| U6 | Flaky | Differing result across seeded random-order runs | Quarantine, then fix or remove |
| U7 | Disproportionate | Over level budget and unique kills below threshold | Move level or reduce |
| U8 | On dead code | Covered symbol unreferenced outside tests | Remove test and code in a separate PR |

Protected, never auto-removed: regression tests (issue reference), public-contract, security, accessibility and tests documenting a requirement. Protected tests are reported, not deleted.

Stack tools (use what the stack has; otherwise report `not measured`): JS/TS — AST via the TypeScript compiler, runner JSON report (Vitest/Jest), Stryker with `killedBy`; Python — coverage.py dynamic contexts, mutmut, a custom AST check, pytest-randomly; PHP — PHPUnit `failOnRisky`, Infection; Java — PIT with `fullMutationMatrix`, tsDetect.

## Cleanup procedure

1. Baseline: three full runs (random order, recorded seed): count by level, median duration, coverage, mutation score per module.
2. Inventory every test by stable id (`file::suite > name`), module and level; parameterized identities are distinct, overlaps counted once.
3. Compute signals, apply the rules above, protect before classifying.
4. Remove in class order, safest first: U2, U3, U8, U5, U1, U4, U7; U6 is quarantined (one tracking issue per case), never removed.
5. After each class: re-run affected modules. Invariants — mutation score of an affected module does not fall (only dead-code removal may), branch coverage falls only on lines classified U5/U8 and listed, no protected test removed, every removed test has a report row with class and signal.
6. Report counts by module and level that reconcile: before, audited, unnecessary, protected, removed, rewritten, remaining, unmeasured. Repeated quality-gate runs on the same head are repeat execution, not duplicate cases; a gate result is reusable only under the same evidence identity and custody.

## Gates

Deterministic checks, ordered by cost, thresholds from one config file: G1 assertions present, G2 forbidden patterns, G3 duration budget and ≤5% level growth, G4 mutation score on the diff, G5 new-test unique kills ≥ 1, G6 new tests green in N random-order runs, G7 test/code ratio, G8 audit with no new U2/U3 (manual workflow). Roll out report-only, then block the cheap gates (G1, G2, G3, G6), then everything. A gate above 10% false positives does not become blocking until its rule is fixed; every bypass carries a label with a reason and is counted.
