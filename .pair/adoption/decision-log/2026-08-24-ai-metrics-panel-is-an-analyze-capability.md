# Decision: the AI/retro metrics panel is an `analyze-*` capability, and its definitions live in a Delivery-pillar guideline

## Date

2026-08-24

## Status

Active

## Category

Convention Adoption

## Context

Story #222 ships the R9.5 metrics/retro report (bug resolution time, PR lead time, process adoption). Two naming questions had to be answered before the file existed, and both are conventions, not one-off choices.

**Which verb.** The verb taxonomy (ADL `2026-07-13-skill-naming-verb-taxonomy.md`) reserves `verify-*` for conformance pass/fail, `assess-*` for "evaluate options and propose an adoption decision", and `analyze-*` for "analyze and report only, no decision, never blocks". This capability reports and blocks nothing — but it also **writes a file**, while the two existing `analyze-*` skills write nothing at all, and the website prose said so ("output-only report producers"). The nearest sibling by *behavior* is `assess-cost $mode: report`, which is an `assess-*` skill only because classification is its other mode.

**Where the definitions live.** The quality model's §7 taxonomy row for *AI metrics / retro* pointed at `collaboration/project-tracking/README.md` — a legacy framework page with no metric definitions in it — and D13 forbids new taxonomy pages. The Cost pillar already had the answer in shape: `quality-assurance/cost-assessment.md` is a pillar-scoped catalog guideline that the skill applies (D17/D21).

## Decision

**`analyze-delivery-metrics`**, a capability under the `analyze-*` verb: report-only, proposes no adoption decision, never blocks. Writing its own period panel under `.pair/working/reports/metrics/` is the **D14 operational-artifact exception** — the same one `assess-security`'s audit and `assess-coupling`'s full scope already use — not a departure from the verb. The three catalogs state it that way (skills-guide, `next`, docs site), and the docs-site sentence claiming all `analyze-*` skills write nothing was corrected rather than left to contradict the corpus.

The definitions live in **`guidelines/quality-assurance/delivery-metrics.md`**, the Delivery pillar's sibling of `cost-assessment.md`: metric set, clocks, median/p75 aggregation, the `N < 5` low-sample rule, the adoption-declared bug mapping, the per-tool field mapping. The quality-model §7 row now points there. The panel form itself is **not** redefined — it follows the one report-panel convention in `collaboration/working-area.md`, shared with the cost panel.

Adoption delta for a project: an optional `## Delivery Metrics` section in `tech/way-of-working.md` (`bug-label`, `bug-type`, `exclude-authors`, `adoption-signals`), delta-only.

## Alternatives Considered

- **A second mode on an existing `assess-*` skill** (e.g. `assess-cost`-style `$mode: report` on a delivery skill): rejected — no `assess-delivery` exists, and creating one would claim this skill proposes an adoption decision, which it does not. It would also have put #222 inside the `assess-*` file set another story is actively editing.
- **`report-*` as a new verb family**: rejected — a fourth verb for one skill, when `analyze-*` already means "analyze and report" and the only difference is where the report lands (a file rather than the transcript). The D14 exception carries that difference without a taxonomy change.
- **The definitions inside the SKILL.md**: rejected — the three-layer principle (quality model §1) puts rules in guidelines and application in skills, and a definition inside the skill cannot be shared with a panel or a second reader.
- **A new `quality-monitoring/` page or a new taxonomy page**: rejected — D13 forbids the second, and the first would split the Delivery pillar's metrics away from the pillar-guideline pattern the Cost pillar established.

## Consequences

- `analyze-*` now means "reports, decides nothing, blocks nothing" — **not** "writes nothing". Anyone reading the family must take the file-writing exception from D14, which every catalog entry states.
- Adding a metric family or a tracker is a guideline/adoption change, never a change to the skill (R2.12) — the per-tool mapping table is the extension point.
- Corpus counts moved 43 → 44 (32 capability), which is a cross-file sweep: `next`, skills-guide, way-of-working, getting-started, nine docs-site pages, and the count literals inside four test files. That coupling is a known cost of stating the count in prose; nothing here changes it.

## Adoption Impact

- No `adoption/tech/*` change in this repo: the optional `## Delivery Metrics` section stays absent, so the per-tool defaults apply (GitHub `bug` label / native `Bug` type).
- KB: new `guidelines/quality-assurance/delivery-metrics.md`, quality-model §7 row repointed, QA README + `.pair/llms.txt` indexed, working-area Integration row extended.
