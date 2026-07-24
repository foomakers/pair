# `tech/coverage-baseline.md` — pair coverage guardrail config

pair's own coverage guardrail config (dogfood of story #282). This file exists because pair opted into the guardrail (`Coverage guardrail: enabled` in [way-of-working.md](./way-of-working.md)). The [`Coverage guardrail` step](../../../.github/workflows/ci.yml) reads this file with the shipped [`coverage-gate.sh`](../../knowledge/assets/coverage-gate.sh); it blocks a PR whose line coverage drops below a `baseline.<type>` here, at every tier — maintaining or improving always passes.

Format documented in the KB [config example](../../knowledge/assets/coverage-config-example.md): a single `key=value` block; the surrounding markdown fence/headings are ignored (lines matched with a plain `^key=`).

## Types measured

Only the two packages that emit an istanbul `coverage-summary.json` (`reporter: ['json-summary', …]`) and already run in CI via `turbo test:coverage` feed the gate. The type is the touched package's nature:

| Package         | Type       | Nature                                                     |
| --------------- | ---------- | ---------------------------------------------------------- |
| `@pair/website` | `frontend` | Next.js app — UI validated primarily by Playwright e2e.    |
| `@pair/brand`   | `shared`   | Reusable design-system component library, consumed widely. |

The other packages (`knowledge-hub`, `content-ops`, `dev-tools`, `pair-cli`) have `test:coverage` but emit only `text`/`html`/`lcov` (no `json-summary`) and are not run in the CI coverage step, so they are not fed to the guardrail yet. Wiring them in is a follow-up (extend the CI coverage run to include them + add `json-summary` to their vitest config).

## Baseline (measured current state)

The metric is **line coverage** (`total.lines.pct` from `coverage-summary.json`). Baselines below were **measured on the current `main`/branch state** and set **~1pp below** the measured value, to absorb per-run float jitter and legitimate line churn (so the gate passes today and blocks only a genuine regression, not run-to-run noise):

| Type       | Measured lines % | `baseline` (~1pp margin) | `target` (gradual goal) |
| ---------- | ---------------- | ---------- | ----------------------- |
| `shared`   | 85.04 (`@pair/brand`)   | 84 | 90 |
| `frontend` | 20.16 (`@pair/website`) | 19 | 25 |

`target.frontend` is deliberately modest: the website is e2e-covered by design (see the website vitest ADL 2026-07-12), so unit line coverage is intentionally low; below-target-but-above-baseline only warns.

## Config

```ini
# pair coverage guardrail — per-type gradual targets + committed baselines.
# Metric: line coverage (total.lines.pct from istanbul coverage-summary.json).
target.default=70
target.shared=90
target.frontend=25

# Committed baselines — the guardrail blocks a drop below these (every tier).
# Set ~1pp below the measured current state to absorb float jitter + legitimate
# line churn (blocks only a genuine regression, not run-to-run noise).
baseline.shared=84
baseline.frontend=19
```

## Notes

- **Baseline-relative, not an absolute wall.** A drop below `baseline.<type>` blocks; below the gradual `target` but at/above baseline only warns (R7.3: incremental improvement).
- **Human-committed.** The gate never persists a baseline itself; raise a baseline here by committing a new value once coverage improves.
- **Fail-safe.** If a coverage report is missing, the CI step runs the gate at a conservative fixed `red` tier, so a missing report blocks rather than silently passes.
