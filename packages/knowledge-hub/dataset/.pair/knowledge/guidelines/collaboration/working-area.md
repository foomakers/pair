# Working Area Convention

## Overview

`.pair/working/` is the **operational area**: where AI capabilities persist state produced *during* execution — checkpoints and reports. It is operational data, not knowledge, so it stays outside every KB asset registry by design (D14). `pair-cli install` and `pair-cli update` never create, modify, or delete anything under it.

This is distinct from the other two `.pair/` areas:

| Area | Contents | Owner | Touched by `pair-cli update`? |
| --- | --- | --- | --- |
| `.pair/knowledge/` | Upstream guidelines and how-to | pair KB | Yes (mirror) |
| `.pair/adoption/` | Project decisions | Project | Add-only (new files) |
| `.pair/working/` | Checkpoints, reports | Skills, at runtime | Never |

## Structure

```text
.pair/working/
├── checkpoints/           # Resumable state for multi-task flows (e.g. /implement)
└── reports/
    └── <category>/        # Generated reports, grouped by category (e.g. quality, monitoring)
```

Both subdirectories are created **on demand** by the skill that first needs them — a checkpoint capability creates `checkpoints/` the first time it writes state, a reporting capability creates `reports/<category>/` the first time it writes a report. `pair-cli install` does not scaffold this structure.

## Report Panels — Period Key and Idempotent Update

A **panel** is a *recurring, period-scoped* report (cost monitoring, delivery/AI metrics, any periodic aggregate), as opposed to a **one-shot audit**, which is keyed by its run date (e.g. `reports/security/<YYYY-MM-DD>-audit.md`). Every panel writer follows the same convention, so periodic reporting stays one pattern instead of one per skill:

- **Path**: `reports/<category>/<period-key>-<panel-name>.md` — e.g. `reports/cost/2026-07-cost-panel.md`. The category is the reporting area (`cost`, `metrics`, …); the panel name identifies the panel inside it.
- **Period key**: the reporting window normalized to a filename-safe token — `YYYY-MM` (calendar month), `YYYY-Wnn` (ISO week), or `YYYY-MM-DD_YYYY-MM-DD` (explicit range). The **period**, not the run date, identifies the file.
- **Key normalization — one window, one key**: an explicit range that spans *exactly* a calendar month or an ISO week **normalizes to the shorter form before the filename is derived** (`2026-07-01_2026-07-31` → `2026-07`; `2026-07-06_2026-07-12` → `2026-W28`). Without this, the same window asked two ways (`"July"` vs `"1–31 July"`) would produce two panels and break the one-file-per-period guarantee below. The explicit-range form is for windows that are neither a whole month nor a whole ISO week.
- **Idempotent by period**: re-running for the same period **updates that panel in place** — *one file per period*, never a second copy and never an appended duplicate. A different period writes a new file alongside it. Same inputs ⇒ same content (coverage is part of "same inputs" — see *No coverage regression* below).
- **Headline-first (D22)**: headline figures (and the verdict, if the panel has one) at the top, readable in about one screen; per-item and per-category breakdowns in collapsed `<details>` sections.
- **Input provenance in the headline**: the headline records the **resolved revision of the inputs the figures were derived through** (e.g. the commit/version of the catalog and adoption files a panel re-derives values from). A panel is updated in place, so without this a panel regenerated after those inputs changed is indistinguishable in provenance from the pre-change one, and any "values are computed against the current rules" caveat it carries is unfalsifiable from the artifact. An **input** revision is compatible with the idempotency above; a wall-clock *"generated at"* line is not — it would make the same inputs produce different content — so panels never carry one.
- **Output override**: a panel writer takes an `$output` argument for the target directory, defaulting to `<working>/reports/<category>/`, where `<working>` itself resolves the `working_path` override (see [Overriding the Path](#overriding-the-path)) — one knob, not two.
- **Empty period**: the panel is still rendered and written, stating **"no data for the period"** and why the inputs are absent — an explicit empty panel, never a silent skip and never a failed run.
- **Not writable** (read-only checkout, permissions): degrade to presenting the panel **inline** in the skill output, telling the human where to save it. A panel writer never fails a run over an unwritable reports area.
- **Partial coverage** (the run could not process every item of the period): the panel is still written, with the shortfall **stated in the headline** (`Coverage: N of M ... processed` + reason + the items left out, all in that one line — the items left out get no per-item row, since no processed data exists to fill one). A large period is never a reason to refuse a panel — process the period in batches, retaining per item only what the panel renders — but a partial panel must never look complete. The headline figures count the **processed** items; the found count appears only in the `Coverage` line that qualifies them.
- **No coverage regression**: the in-place update is **not unconditional**. Before overwriting, read the panel already at that path and compare **how many items each panel actually processed** — the headline's processed count on both sides — for the same period and the same input revision. **Completeness is not the comparison basis**: while a period is still open its denominator grows, so a panel that was complete when written can cover fewer items than a later partial one, and keeping the "complete" one would discard the strictly better result. If the panel on disk processed **more** items, **keep it** — either merge in the rows this run adds where they are separable **and recompute the headline over the union of processed items** (every figure recounted, every merged-in id struck from the items-left-out list, so the table can never contradict the line above it), or leave the file untouched — and report the shortfall in the **run output** instead of the file. Without this, a context-tight partial re-run silently destroys a fuller panel's figures (a `40 of 73` run overwriting a `73 of 73` one), a reader comparing periods reads the resulting drop as real movement rather than a run artifact, and "same inputs ⇒ same content" would depend on how far a run happened to get.

Panels are read-only over their sources: a panel writer aggregates data other capabilities produced, and writes nothing outside its own panel file — never adoption, never backlog items.

## How It Is Protected (D14)

`pair-cli install`/`pair-cli update` only ever touch paths **inside a configured registry's target** — the mirror cleanup deletes only entries within a registry `target` that are absent from that registry's `source`. A directory that is not a registry `source` or `target` is therefore never created, modified, or deleted. The working area is protected by exactly this: **it is never a registry target.**

There is no runtime "hard-exclusion" carve-out. The only way the working area could be touched is a *misconfigured* registry whose `target` equals or is an ancestor/descendant of it (e.g. a registry mirroring the whole `.pair/` root). That is prevented at config-validation time — `pair-cli validate-config`, and the same check run inside `pair-cli install`/`pair-cli update`, **reject** any such config before a single file is copied (see [Validation](#validation)). Fail-closed: a bad config errors out; it does not silently proceed with a carve-out.

The working area is the first member of a small set of **reserved project-side paths** that no registry target may overlap. The set is extensible — future meta/config files (e.g. the KB version marker) join the same guard.

## Overriding the Path

The default path is `.pair/working`. A project can override it by declaring `working_path` at the top level of `pair.config.json` (sibling to `asset_registries`, not inside it):

```json
{
  "working_path": ".pair/scratch",
  "asset_registries": { "...": "..." }
}
```

When overridden:

- The override — not the default — is the reserved path that no registry target may overlap.
- Skills reading or writing checkpoints/reports must resolve the same override (read `working_path` from `pair.config.json`; fall back to `.pair/working` when absent) so the two sides never disagree on where the working area lives.
- The override must be **project-relative**. An absolute `working_path` is rejected by `pair-cli validate-config` — it cannot be compared against the project-relative registry targets, so it would defeat the overlap guard.

## Validation

`pair-cli validate-config` (and the identical check inside `pair-cli install`/`pair-cli update`) **rejects** the config in these cases:

- **A registry overlaps a reserved path**: a registry's `target` path equals, contains, or is contained by the (default or overridden) working path. This catches both directions — a registry accidentally covering the working area, and a working-area override that lands inside a registry-managed directory.
- **A non-project-relative `working_path`**: an absolute path (or one escaping the project root) is rejected.

Because the working area is simply not a registry target, a valid config guarantees `pair-cli install`/`pair-cli update` never touch it — no runtime carve-out is needed.

## Convention for External KBs

This guarantee is not specific to the `foomakers/pair` KB — any KB dataset consumed by `pair-cli` inherits it, because the reserved-path validation is enforced by `pair-cli` itself (`validateAllRegistries` → `detectReservedPathOverlap`), not by anything the dataset declares. A custom or organization-specific KB does not need to do anything special: it only needs to avoid declaring a registry whose `target` overlaps the working area, which `pair-cli validate-config` rejects.

## Not Ambient Context

The working area is operational handoff state, not shared knowledge, so it is **never loaded as ambient context**. This is an existing project-wide rule (see the "`.pair/working/` is not ambient context" Quick Rule in `AGENTS.md`, recorded in ADL `2026-07-11-working-artifacts-task-scoped.md`): content under `.pair/working/` is read or written only by the specific capability that owns a given file (e.g. the checkpoint capability owns `checkpoints/<story-id>.md`), and only on explicit invocation (write/resume/save/load) — never swept in by a broad glob or a "read everything under `.pair/`" exploration step. Skill authors: do not add `.pair/working/` to a generic context-gathering step.

## Integration with Skills

| Skill / Area | Interaction |
| --- | --- |
| Checkpoint capability (e.g. `pair-capability-checkpoint`) | Writes/reads `.pair/working/checkpoints/` |
| Reporting capabilities (e.g. quality, monitoring) | Write `.pair/working/reports/<category>/` |
| One-shot audit writers (e.g. `pair-capability-assess-security` audit, `pair-capability-assess-coupling` full) | Write `reports/<category>/<YYYY-MM-DD>-<audit-name>.md` (run-date keyed) |
| Panel writers (e.g. `pair-capability-assess-cost` report mode → `reports/cost/<period-key>-cost-panel.md`; `pair-capability-analyze-delivery-metrics` → `reports/metrics/<period-key>-delivery-metrics.md`) | Apply [Report Panels — Period Key and Idempotent Update](#report-panels--period-key-and-idempotent-update) |
| `pair-cli install` | Never scaffolds or touches the working area |
| `pair-cli update` | Never modifies or deletes anything under the working area |
| `pair-cli validate-config` | Errors on any registry/working-area overlap |
