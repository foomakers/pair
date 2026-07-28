# Decision: Periodic reports in the working area are period-keyed panels, defined once in working-area.md

## Date

2026-07-28

## Status

Active

## Category

Convention Adoption

## Context

Two stories in the classification/assessment epic write **recurring, period-scoped** reports into `.pair/working/reports/`: #281 (`assess-cost` report mode — predicted-vs-real cost monitoring, the quality model's **R6.3/R6.4**) and #222 (AI/delivery metrics & retro reports). Both story bodies require the same mechanics — a reporting period, idempotent regeneration for the same period, headline-first rendering (D22), an output-path override — and both explicitly state the convention must be shared ("one reports-area pattern, not two"; "whichever lands first defines it, the other reuses").

The working area already existed (D14, #257) with a path/protection contract, but nothing said how a *recurring* report is named or how re-running for the same period behaves. The two report writers already in-tree (`assess-security` audit, `assess-coupling` full scope) are **one-shot audits** keyed by run date (`<YYYY-MM-DD>-audit.md`) — a run-date key duplicates a file on every re-run, which is exactly what a periodic panel must not do. #281 landed first.

## Decision

Periodic reports are **panels**, and the convention is **authoritative in one place**: a "Report Panels — Period Key and Idempotent Update" section of the KB guideline `guidelines/collaboration/working-area.md`. Skills **apply** it and may **summarize** the mechanics a given step acts on; the guideline wins on any conflict (three-layer principle: rules in the doc, application in the skill).

- **Path**: `reports/<category>/<period-key>-<panel-name>.md`.
- **Period key**: `YYYY-MM` | `YYYY-Wnn` | `YYYY-MM-DD_YYYY-MM-DD` — the *period*, not the run date, identifies the file. A range spanning exactly a month/ISO week **normalizes** to the shorter form, so one window has exactly one key (and one panel).
- **Idempotent by period**: same period ⇒ that file is updated **in place**; one file per period, no second copy, no appended duplicate.
- **Headline-first (D22)**: headline at top, breakdowns in collapsed `<details>`.
- **Output override**: `$output` argument, defaulting to `<working>/reports/<category>/` with `working_path` resolved.
- **Empty period**: the panel is still written, stating "no data for the period" and why — never a silent skip, never a failure.
- **Not writable**: degrade to presenting the panel inline with a save hint; the run still succeeds.

Panels stay read-only over their sources: a panel writer writes its own panel file and nothing else — never adoption, never backlog items.

One-shot audits keep their existing run-date convention; the panel convention names the distinction explicitly so the two never get conflated.

## Alternatives Considered

- **Define the convention inside `assess-cost`'s SKILL.md**: Rejected. #222 would then either duplicate it or import a rule from an unrelated skill — the exact "two patterns" outcome both stories forbid, and a violation of the three-layer principle (criteria belong in the doc layer).
- **A new dedicated KB guideline for reporting**: Rejected as premature. The convention is ~8 bullets about *where and how files in the working area are named/updated* — it belongs next to the working-area contract it extends, not in a new page nobody would find (D13: no new taxonomy page per theme).
- **Reuse the audit run-date key (`<YYYY-MM-DD>-cost.md`)**: Rejected. A run-date filename makes the same period accumulate one file per run, breaking the in-place idempotency both stories require.

## Consequences

- #222 (AI metrics) implements its panel against this section instead of inventing its own naming/idempotency; a future third panel writer does the same.
- The mechanics are asserted on the **guideline** (`assess-cost.test.ts`'s working-area block) so dropping them fails a gate rather than drifting quietly; a panel-writing skill is separately asserted to *apply* the convention (period key, in-place update, headline-first). Two assertion sites are the deliberate cost of that: changing the convention means updating the guideline **and** each applying skill's summary in the same commit — which is the intended coupling (a skill that stops applying the convention should go red), not accidental duplication.
- `assess-cost` becomes the third `assess-*` skill that writes an operational report (after `assess-security`'s audit and `assess-coupling`'s full scope) — the docs-site catalog note about `assess-*` writing no files was corrected to "no **adoption** files", and ADR-009 (`adr-009-assess-output-only`), which the docs site cites, carries the matching amendment naming the three D14 operational-report exceptions.

## Adoption Impact

- KB (dataset + root mirror): `guidelines/collaboration/working-area.md` gains the "Report Panels" section.
- Docs site: `reference/kb-structure` (working-area section) documents the audit-vs-panel distinction; `reference/quality-model` documents cost monitoring as its consumer.
- No `adoption/tech/` file changes: this is a KB convention, not a project-specific override.
