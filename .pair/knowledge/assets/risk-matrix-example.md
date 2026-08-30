# `tech/risk-matrix.md` — Example

Illustrative adoption delta for a fictitious e-commerce project. Copy the sections you need — this file is only committed as a reference; a real project's `tech/risk-matrix.md` normally has just a few rows. See the schema and resolution rules in the [quality model](../guidelines/quality-assurance/quality-model.md), §5–§6.

## Tag Projection

Active: risk, cost

`risk` is the only tag family the KB proposes by default — `classify` writes this section itself the first time it runs, once the proposal to activate it is confirmed (§5). This project also added `cost` to the list, since it tracks cloud spend closely.

## Criticality Table

| Service/Domain | Criticality |
| --- | --- |
| payments | High |
| checkout | High |
| catalog | Medium |
| marketing-site | Low |
| internal-admin-tool | Low |

Rows are keyed by what a diff resolves to — the deployable that owns the touched files (workspace package, app, or top-level path scope); the names below are this fictitious project's services. Any service/domain not listed here is treated as unclassified and resolves to High (conservative) for the service-criticality dimension — not to the file-absent Medium default. A change touching **several** of these takes the **highest** of their criticalities (an unlisted one contributes that conservative High), so the dimension does not depend on which key the reader picks.

## Overrides

Optional deltas for the dimensions of §3.1 of the quality model — threshold tweaks, and dimension-resolution keys that change how a dimension resolves rather than where its threshold sits. Omit entirely if the KB defaults are fine — every key here is opt-in.

- `change-risk.shared-paths`: `["packages/billing/**", "packages/checkout-core/**"]` — diffs touching these paths are always classified `yellow` or higher for change/diff risk, even if the diff is small.
- `business-impact.trivial-diff`: `green` — an objectively trivial change (every changed file is **non-executable** `.md`/`.mdx`, **or** no changed hunk alters an executable or declarative statement — comment-only, whitespace-only, formatter-output-only and, in executable markdown, prose-only changes all qualify) resolves Business impact to `green` whatever subdomain it touches, so a doc typo fix in `checkout` is not tiered as if it changed checkout. Agent skill/workflow/agent files (`**/SKILL.md`, `.claude/skills|workflows|agents/**` and the sources they are generated from) are **excluded** from the `.md` branch — that markdown *is* the procedure, so branch (b) decides for it and a hunk altering an instruction is not trivial. All-or-nothing: one non-trivial file or hunk and the dimension falls back to the subdomain class. Full definition and edge cases in [quality-model.md §6](../guidelines/quality-assurance/quality-model.md).
