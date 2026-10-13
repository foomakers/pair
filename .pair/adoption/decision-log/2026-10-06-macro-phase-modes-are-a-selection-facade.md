# Decision: macro-phase modes are a row-filter facade on `/pair-next`, not loop state and not skills

## Date

2026-10-06

## Status

Active

## Category

Process Decision

## Context

Story #252 (R2.11): users who do not want the granular steps need 2–3 named phases (analysis / implementation / review) on `/pair-next`. ADR-017 §1 froze `/pair-next` as a selection atom with no loop state (`--steps`/`--until` rejected: context burn, atomicity). D24: no new process steps or skills.

## Decision

- `--mode <analysis|implementation|review>` is a **row filter** over the existing cascade, composed with scope (intersection) and the process profile (disabled step = skipped). It is not an autonomy key and adds no `--steps`/`--until`.
- A mode **runs** the selected step (invokes the granular skill) and re-selects against the current board; selection stays stateless and re-evaluated every step. The only loop is "select → run → select", over **one work unit per invocation**; many units stay with `/pair-loop` (ADR-017 §3 unchanged).
- Phase exit is selection-derived (the unit leaves the mode's rows) plus one guard: a step that leaves the unit's state unchanged is not repeated (ends `review`).
- The mode ↔ step table lives only in KB `macro-phase-modes.md`, bound to the step catalogue and `/pair-next` rows 1–11 by `macro-phase-modes.ts` (`skills:conformance` drift gate); docs page asserted equal to it. Granular skills carry no mode knowledge.
- HALTs surface as-is; wrong context reports what is missing and suggests the matching mode; rows 12–16 (non-step capabilities) are never surfaced in a mode.

## Alternatives Considered

- `--steps/--until` on `/pair-next`: rejected by ADR-017 §1 (loop state on the selector).
- Mode as new skills (`/analysis`, …): rejected, D24 and duplicated logic.
- Mapping restated in SKILL.md and docs: rejected, drift (the story's own risk); one table, checked.
- Mode loops over all units in context: rejected, ADR-017 §3.

## Consequences

- ADR-017 §1 clarified, not amended: selection remains pure; execution of the chosen step is the invoking session's, as with plain `/pair-next` + "Shall I run?".
- Adding a step or cascade row requires placing it in the mode table (gate fails otherwise).
- Session transcripts per mode are modelled in `macro-phase-modes.test.ts` (reference model, not a live engine).
