# Testing policy

Goal: verify specified behavior, never raise coverage. Thresholds: [`test-policy.config.json`](test-policy.config.json) (single source for audit and gates).

## Taxonomy

| ID | Class | Signal | Default action |
| --- | --- | --- | --- |
| U1 | Tautological | Expected value derived from code under test | Rewrite or remove |
| U2 | No assertions | Zero or trivial assertions | Remove |
| U3 | Redundant | Unique kills = 0 and unique coverage = 0 | Remove or parametrize |
| U4 | Change-detector | Mock/assertion ratio above config, private verify | Rewrite on public interface |
| U5 | Trivial | Complexity 1, no non-equivalent mutant | Remove |
| U6 | Flaky | Differing result across random-order runs | Quarantine |
| U7 | Disproportionate | Over level budget, low unique kills | Move level or reduce |
| U8 | Dead code | Covered symbol unreferenced outside tests | Remove test and code, separate PR |

Protected, never auto-removed: regression tests (issue reference), public-contract, security, tests documenting a requirement.
Unavailable signal ⇒ `not measured`; never estimated; never grounds for removal.

## Audit

`pnpm --filter @pair/dev-tools test-audit:inventory` → `test-audit/inventory.json`: stable id (`file::describe > name`), module, level, assertions, mocks, skip/only, parametrized. Runner-dependent fields (duration, coverage, mutation, flakiness) are `not measured` until F0/F2–F5 tooling lands.

## Gates

G1 assertions, G2 forbidden patterns: static signals implemented in the inventory (`gateViolations`). G3–G8 pending; rollout report-only → block cheap gates → full blocking.
