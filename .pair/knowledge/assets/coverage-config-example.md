# `tech/coverage-baseline.md` — Example

Illustrative coverage config for a project's `tech/coverage-baseline.md` adoption file. Copy the fenced block into your own adoption file and adjust the numbers — this example is committed only as a reference. The [coverage guardrail](../guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-regression-gate-consumed-by-this-pipeline) reads this config with the shipped [`coverage-gate.sh`](coverage-gate.sh) helper.

## What lives here

Two kinds of value, in one parseable `key=value` block (order-independent; lines are read with a plain `^key=` match, so the surrounding markdown fence and headings are ignored):

- **`target.<type>`** — the *gradual* per-type coverage goal (human-set). Below the target but not below the baseline only **warns** — it is not a hard wall (R7.3: incremental improvement, not "must hit X% on day one").
- **`baseline.<type>`** — the *established* coverage the guardrail protects (machine-maintained). A drop below the baseline **blocks the merge**, at every tier. Leave it unset to have the gate **bootstrap** it from the current coverage on first run.
- **`target.default`** — the fallback target for any type without its own `target.<type>` line.
- **`exclude`** — glob(s) handed to the adopted coverage tool for genuinely untestable surface (generated files, config). This is passed to the test tooling, not a blanket override of the guardrail.

The `<type>` is the touched code's type — `backend`, `frontend`, `shared`, or whatever your stack distinguishes; the pipeline passes the type matching the code under test so per-type targets apply (AC5).

## KB-sensible defaults

The guardrail is baseline-relative, so absolute targets are advisory. These are sensible starting goals; tune per project:

| Type       | Target | Rationale                                              |
| ---------- | ------ | ------------------------------------------------------ |
| `backend`  | 80     | Business logic / services — the highest test priority. |
| `frontend` | 60     | UI — some surface is exercised by E2E, not unit.       |
| `shared`   | 90     | Reused libraries — a regression here blasts widely.    |
| `default`  | 70     | Anything without a more specific type.                 |

## Example

```ini
# Coverage config — per-type gradual targets (human-set) + established baseline
# (bootstrapped on first run; leave a baseline.<type> unset to auto-establish it).
target.default=70
target.backend=80
target.frontend=60
target.shared=90

# Glob(s) excluded from measurement by the adopted coverage tool (generated/config).
exclude=**/*.generated.ts,**/*.config.ts

# Established baseline — the guardrail blocks a drop below these. Machine-maintained:
# absent/empty => the gate bootstraps it from the current run rather than blocking at 0.
baseline.backend=82.5
baseline.frontend=61
# baseline.shared=   (unset => established on first coverage run)
```

## Notes

- **No coverage tool is mandated.** The gate consumes a coverage percentage the pipeline extracts from whatever the adopted test framework emits (istanbul `coverage-summary.json`, LCOV, Cobertura, …). See the guideline's [coverage guardrail](../guidelines/infrastructure/cicd-strategy/tier-aware-pipeline.md#coverage-guardrail-regression-gate-consumed-by-this-pipeline) section for the extraction snippet per stack.
- **Missing/corrupt baseline** re-establishes from the current coverage with a warning — it never blocks everything.
- **No coverage measured** (test tooling emitted nothing / tests did not run) fails safe: it blocks at the red tier and warns at lower tiers, never a silent pass.
