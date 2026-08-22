# Decision: the `tech/automation.md` schema lives in a `collaboration/automation/` guideline, not in `quality-model.md`

## Date

2026-08-20

## Status

Active

## Category

Convention Adoption

## Context

Story #216 ships the schema for `tech/automation.md`'s `## Eligibility` declaration — which cards an unattended run may pick up. Two homes were plausible. `quality-model.md` already owns §5 (tag projection) and §6 (the `tech/risk-matrix.md` adoption delta), so a §7 there would have kept every adoption-file schema on one page. ADR-017 §6 already sketches the REST of `tech/automation.md` (gates for auto-advance, stop predicate, step defaults, `max_parallelism`, audit location), all of which land with the automation loop (#250) — none of them a quality-model concern.

## Decision

The schema lives in a new KB guideline, `guidelines/collaboration/automation/automation-policy.md` (dataset + installed mirror), indexed by the automation framework README and `.pair/llms.txt`. `quality-model.md` §5 keeps ONE sentence — the single-literal-label rule — and cross-links the guideline; it does not restate the schema. Sections of `tech/automation.md` are owned one story at a time, stated in the guideline itself, so #250 extends the same file without renegotiating its home.

## Alternatives Considered

- **`quality-model.md` §7**: rejected — #250's sections (stop predicate, `max_parallelism`, audit) are automation-loop concerns; pulling them into the quality model would make that document the owner of unattended-execution policy, which it is not. It would also put two stories on the same page's adjacent sections.
- **An `adoption/tech/` README instead of a KB guideline**: rejected — adoption files are the PROJECT's, the schema is the FRAMEWORK's; the schema ships with the KB so an adopting project gets it from `pair install`.

## Consequences

- `collaboration/automation/` is now the home for unattended-development policy; its README Scope says so.
- `quality-model.md` stays the single source for classification/tiers/gates, and eligibility explicitly selects *which cards*, never which gates (both documents say it).
- #250 extends `automation-policy.md` rather than opening a second schema page.

## Adoption Impact

None beyond this log and the KB guideline itself — no `adoption/tech/*` file changes; `tech/automation.md` remains optional and absent in this repo.
