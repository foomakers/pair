# `tech/risk-matrix.md` — Example

Illustrative adoption delta for a fictitious e-commerce project. Copy the sections you need — this file is only committed as a reference; a real project's `tech/risk-matrix.md` normally has just a few rows. See the schema and resolution rules in the [quality model](../guidelines/quality-assurance/quality-model.md), §6.

## Criticality Table

| Service/Domain | Criticality |
| --- | --- |
| payments | High |
| checkout | High |
| catalog | Medium |
| marketing-site | Low |
| internal-admin-tool | Low |

Any service/domain not listed here is treated as unclassified and resolves to High (conservative) for the service-criticality dimension — not to the file-absent Medium default.

## Overrides

Optional threshold tweaks for the change-risk dimension (§3.1 of the quality model). Omit entirely if the KB defaults are fine.

- `change-risk.shared-paths`: `["packages/billing/**", "packages/checkout-core/**"]` — diffs touching these paths are always classified `yellow` or higher for change/diff risk, even if the diff is small.
