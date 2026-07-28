# Working Area Convention

## Overview

`.pair/working/` is the **operational area**: where AI capabilities persist state produced *during* execution — checkpoints and reports. It is operational data, not knowledge, so it stays outside every KB asset registry by design (D14). `pair install` and `pair update` never create, modify, or delete anything under it.

This is distinct from the other two `.pair/` areas:

| Area | Contents | Owner | Touched by `pair update`? |
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

Both subdirectories are created **on demand** by the skill that first needs them — a checkpoint capability creates `checkpoints/` the first time it writes state, a reporting capability creates `reports/<category>/` the first time it writes a report. `pair install` does not scaffold this structure.

## Report Panels — Period Key and Idempotent Update

A **panel** is a *recurring, period-scoped* report (cost monitoring, delivery/AI metrics, any periodic aggregate), as opposed to a **one-shot audit**, which is keyed by its run date (e.g. `reports/security/<YYYY-MM-DD>-audit.md`). Every panel writer follows the same convention, so periodic reporting stays one pattern instead of one per skill:

- **Path**: `reports/<category>/<period-key>-<panel-name>.md` — e.g. `reports/cost/2026-07-cost-panel.md`. The category is the reporting area (`cost`, `metrics`, …); the panel name identifies the panel inside it.
- **Period key**: the reporting window normalized to a filename-safe token — `YYYY-MM` (calendar month), `YYYY-Wnn` (ISO week), or `YYYY-MM-DD_YYYY-MM-DD` (explicit range). The **period**, not the run date, identifies the file.
- **Key normalization — one window, one key**: an explicit range that spans *exactly* a calendar month or an ISO week **normalizes to the shorter form before the filename is derived** (`2026-07-01_2026-07-31` → `2026-07`; `2026-07-06_2026-07-12` → `2026-W28`). Without this, the same window asked two ways (`"July"` vs `"1–31 July"`) would produce two panels and break the one-file-per-period guarantee below. The explicit-range form is for windows that are neither a whole month nor a whole ISO week.
- **Idempotent by period**: re-running for the same period **updates that panel in place** — *one file per period*, never a second copy and never an appended duplicate. A different period writes a new file alongside it. Same inputs ⇒ same content.
- **Headline-first (D22)**: headline figures (and the verdict, if the panel has one) at the top, readable in about one screen; per-item and per-category breakdowns in collapsed `<details>` sections.
- **Output override**: a panel writer takes an `$output` argument for the target directory, defaulting to `<working>/reports/<category>/`, where `<working>` itself resolves the `working_path` override (see [Overriding the Path](#overriding-the-path)) — one knob, not two.
- **Empty period**: the panel is still rendered and written, stating **"no data for the period"** and why the inputs are absent — an explicit empty panel, never a silent skip and never a failed run.
- **Not writable** (read-only checkout, permissions): degrade to presenting the panel **inline** in the skill output, telling the human where to save it. A panel writer never fails a run over an unwritable reports area.

Panels are read-only over their sources: a panel writer aggregates data other capabilities produced, and writes nothing outside its own panel file — never adoption, never backlog items.

## How It Is Protected (D14)

`pair install`/`pair update` only ever touch paths **inside a configured registry's target** — the mirror cleanup deletes only entries within a registry `target` that are absent from that registry's `source`. A directory that is not a registry `source` or `target` is therefore never created, modified, or deleted. The working area is protected by exactly this: **it is never a registry target.**

There is no runtime "hard-exclusion" carve-out. The only way the working area could be touched is a *misconfigured* registry whose `target` equals or is an ancestor/descendant of it (e.g. a registry mirroring the whole `.pair/` root). That is prevented at config-validation time — `pair validate-config`, and the same check run inside `pair install`/`pair update`, **reject** any such config before a single file is copied (see [Validation](#validation)). Fail-closed: a bad config errors out; it does not silently proceed with a carve-out.

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
- The override must be **project-relative**. An absolute `working_path` is rejected by `pair validate-config` — it cannot be compared against the project-relative registry targets, so it would defeat the overlap guard.

## Validation

`pair validate-config` (and the identical check inside `pair install`/`pair update`) **rejects** the config in these cases:

- **A registry overlaps a reserved path**: a registry's `target` path equals, contains, or is contained by the (default or overridden) working path. This catches both directions — a registry accidentally covering the working area, and a working-area override that lands inside a registry-managed directory.
- **A non-project-relative `working_path`**: an absolute path (or one escaping the project root) is rejected.

Because the working area is simply not a registry target, a valid config guarantees `pair install`/`pair update` never touch it — no runtime carve-out is needed.

## Convention for External KBs

This guarantee is not specific to the `foomakers/pair` KB — any KB dataset consumed by `pair-cli` inherits it, because the reserved-path validation is enforced by `pair-cli` itself (`validateAllRegistries` → `detectReservedPathOverlap`), not by anything the dataset declares. A custom or organization-specific KB does not need to do anything special: it only needs to avoid declaring a registry whose `target` overlaps the working area, which `pair validate-config` rejects.

## Not Ambient Context

The working area is operational handoff state, not shared knowledge, so it is **never loaded as ambient context**. This is an existing project-wide rule (see the "`.pair/working/` is not ambient context" Quick Rule in `AGENTS.md`, recorded in ADL `2026-07-11-working-artifacts-task-scoped.md`): content under `.pair/working/` is read or written only by the specific capability that owns a given file (e.g. the checkpoint capability owns `checkpoints/<story-id>.md`), and only on explicit invocation (write/resume/save/load) — never swept in by a broad glob or a "read everything under `.pair/`" exploration step. Skill authors: do not add `.pair/working/` to a generic context-gathering step.

## Integration with Skills

| Skill / Area | Interaction |
| --- | --- |
| Checkpoint capability (e.g. `pair-capability-checkpoint`) | Writes/reads `.pair/working/checkpoints/` |
| Reporting capabilities (e.g. quality, monitoring) | Write `.pair/working/reports/<category>/` |
| One-shot audit writers (e.g. `pair-capability-assess-security` audit, `pair-capability-assess-coupling` full) | Write `reports/<category>/<YYYY-MM-DD>-<audit-name>.md` (run-date keyed) |
| Panel writers (e.g. `pair-capability-assess-cost` report mode → `reports/cost/<period-key>-cost-panel.md`) | Apply [Report Panels — Period Key and Idempotent Update](#report-panels--period-key-and-idempotent-update) |
| `pair install` | Never scaffolds or touches the working area |
| `pair update` | Never modifies or deletes anything under the working area |
| `pair validate-config` | Errors on any registry/working-area overlap |
