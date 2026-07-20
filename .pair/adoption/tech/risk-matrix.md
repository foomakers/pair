# `tech/risk-matrix.md`

Pair's classification adoption delta. Schema and resolution rules live in the [quality model](../../knowledge/guidelines/quality-assurance/quality-model.md), §5–§6. Sections omitted here fall back to KB defaults (D21): no `## Criticality Table` and no `## Overrides` means change-risk and service-criticality resolve entirely from the KB defaults.

## Tag Projection

Active: risk

Projects only the `risk:green|yellow|red` tag family (the KB default). The full classification matrix is still computed and written to every card/PR body; `cost` (via `assess-cost`) is computed but **not** projected as a tag for now — add `cost` to the `Active:` list to start emitting `cost:*`.
