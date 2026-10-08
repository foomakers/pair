# Macro-Phase Modes

Three **modes** of `/pair-next` — `analysis`, `implementation`, `review` — that run one branch of the process end to end, so a user who does not want to know the granular steps names a phase instead. This file is the **only** place the mode ↔ step mapping is written: `/pair-next` links here, the docs site is asserted equal to the table below, and the granular skills do not know modes exist.

## What a mode is

A mode is a **facade**, never a skill (D24: no new process steps). It adds one thing to `/pair-next`'s selection — a **row filter** — and one behaviour — it **runs** the selected step instead of only recommending it, then re-selects:

- `/pair-next --mode <mode>` evaluates the same cascade, scope and [process profile](process-profiles.md) as plain `/pair-next`, restricted to the **rows** of the mode's line in the table.
- A step runs exactly as if the user had invoked the granular skill (`/pair-process-refine-story`, `/pair-process-implement`, …): same arguments, same approval gates, same HALTs. Invoking a granular skill directly is unchanged by this file.
- The mode owns **no criteria**: which row matches is `/pair-next`'s predicate; which rows a mode may run is the table; when the phase is over is the table's **Exit** cell.

## The Mode Table

`Rows` are the cascade rows of `/pair-next` (Steps 2–3) the mode may select, evaluated in cascade order. `Steps` are the catalogue ids those rows propose — row 7 proposes `/pair-capability-checkpoint`, a capability that is not a step, and is the first link of the `implementation` chain. `Fallback-only` steps have no cascade row: the mode **runs** them once, only when no enabled row of any mode holds and `/pair-next`'s Step 5 rule 2 reaches them, and never invents them.

| Mode             | Rows        | Steps                                                                                                       | Fallback-only | Exit                                                                                                                                                  |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analysis`       | 1–5, 10, 11 | `specify-prd`, `bootstrap`, `plan-initiatives`, `plan-epics`, `plan-stories`, `refine-story`, `plan-tasks`  | `brainstorm`  | no analysis row selects the unit: the planning gap is filled, or the story is Ready with a task breakdown                                            |
| `implementation` | 7, 8, 9     | `implement`                                                                                                 | —             | no implementation row selects the unit: the story reached `Review` (its PR is open)                                                                  |
| `review`         | 6           | `review`                                                                                                    | —             | `/pair-process-review` published its verdict on the unit's PR — the PR is never re-selected in the same run, merge belongs to the delivery policy     |

## Outside the modes

Steps in the [step catalogue](step-catalogue.md) that no mode runs, because they are composed inside another step and never selected by a cascade row.

| Step                      | Why it is outside                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `define-subdomains`       | A capability composed by `analysis` steps (`plan-initiatives`, `plan-epics`, `refine-story`, …)  |
| `define-bounded-contexts` | A capability composed by `analysis` steps (`refine-story`, `plan-tasks`, …)                      |

Cascade rows 12–16 (`/pair-capability-setup-gates`, `/pair-capability-assess-stack`, `/pair-capability-analyze-debt`, `/pair-capability-estimate`, `/pair-capability-grill`) are capabilities, not steps, and belong to no mode: a mode never surfaces them.

## How a session runs

1. **Resolve** the scope (`--root`, `--filter`, `--assignee`, `--status`) and the process profile exactly as `/pair-next` does, then the mode's row set from the table. An unknown mode **HALTs** listing the valid ones (`analysis`, `implementation`, `review`) — never a quiet fallback to plain `/pair-next`.
2. **Select the work unit**: the first item (or, for the structural rows 3–5, planning gap) the mode's rows select. When no row selects and the mode lists a fallback-only step, run it once: invoke the step `/pair-next`'s Step 5 rule 2 names (`brainstorm` for `analysis`, on a backlog with no epics whose producing rows the profile disables), under its own gates. The fallback-only step is run only when the cascade run once without the mode filter also reaches Step 5 (no enabled row of any mode holds for the board) and the backlog has no epics. When a row of another mode holds, the fallback-only step is not run: the session is a wrong-context report suggesting that mode. A wrong-context report outranks the profile report, so it holds even if the profile skipped the mode's own rows. A mode drives **one unit per invocation** — context isolation is an invariant (ADR-017 §3); when more units remain in scope, say so and point to `/pair-loop` (many cards) or a re-invocation.
3. **Run the selected step** by invoking the granular skill for the unit, then **re-evaluate** selection against the current board state — never reuse the previous selection. Row 7 and row 8 hand over: after the row 7 `/pair-capability-checkpoint` resume has run for the unit in this session, the same unit continues with row 8's step `/pair-process-implement`, because the resume leaves the checkpoint file in place and row 8's own predicate (no checkpoint file) would never hold. The resume is read-only and leaves the unit unchanged, so the unchanged-unit stop of the next item does not apply to it.
4. **Repeat** until the table's Exit holds, a step HALTs, or the selected step would run again on a unit whose state did not change (a step that leaves the state as it was is not repeated — this is how `review` ends).
5. **Report** at phase level: what the phase did to the unit and why it stopped, plus the mode that continues the process (`analysis` → `implementation` → `review`).

A mode never makes the unit skip a gate. Selection inside a mode is the cascade's: a story reaches `implementation` rows only as macrostate `Ready` with a task breakdown or `In Progress`, and the Definition of Ready / Readiness Fallback still decides `Draft` versus `Ready`.

## Profile — disabled steps are skipped inside the phase

The [process profile](process-profiles.md) is re-read every run. A row whose step is disabled is **skipped**, not an error, and the enabled steps still chain across the gap — `analysis` on a profile without `plan-tasks` stops at `Ready`; `implementation` on a profile without `implement` has nothing to run. When every row that selects the unit is disabled, the mode reports the skipped steps and the profile that disabled them and stops; it never falls through to another mode's steps. Profile HALTs (unknown name or id, malformed section) surface unchanged.

## Wrong context

When a row of another mode holds, the fallback-only step is not run: the report is a wrong-context report that names that mode, and it outranks the profile report. When the mode's rows select nothing for the scope and no fallback-only step runs, report **what is missing**, then run the unmoded cascade once and **suggest the mode whose rows match** the action it would have proposed — for example `review` with no open PR and a `Ready` story reports "no open PR or item in `Review` in scope" and suggests `/pair-next --mode implementation`. When the unmoded cascade proposes nothing either, report `no matching issues` / the Step 5 fallback. A wrong-context report is a clean exit, not an error.

## HALTs surface as-is

A HALT raised by a step (a skill's own gate, a profile error, an unresolvable root) ends the session and is shown unchanged — named step, original message. The mode does not retry, reinterpret or continue with the next row.

## Narration

Speak at phase level — "Analysis: refining story #252, then breaking it into tasks" — and name granular steps only when the user asks what is running (and always when a step HALTs). Phase-level narration is a presentation rule, not a behaviour change: every step still does exactly what it does today.

## Keeping the table in step

The table is bound to its two sources by `skills:conformance` (`macro-phase-modes.ts`): every step in the [step catalogue](step-catalogue.md) is in exactly one mode or under "Outside the modes", and every `/pair-next` cascade row 1–11 is in exactly one mode whose Steps list the row's step. Adding a step or a cascade row without placing it fails the gate — the facade cannot silently drift from the process it fronts.
