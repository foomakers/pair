# Decision: T-8 is reduced — the paired 2.0.0 vs 4.0.0 measurement is not run, and the full-cycle canary evidence stands in its place

## Date

2026-09-13

## Status

Active

## Category

Process Decision

## Context

Story #479's T-8 ("Live canary recovery, fresh path and paired measurement") requires, in step 3, a
frozen `2.0.0` baseline and a frozen `4.0.0` candidate run over six paired scenarios, with
DT-35/36 and AC-10/14 as its acceptance. That paired half was never run, and two things make it
unrunnable as specified from this environment:

- There is **no session for a `2.0.0` baseline** — the engine at that version is not driven from
  here, and T-8 step 3 requires the baseline to run its own engine from its own checkout in its own
  session (ADR-024, Amendment 2026-09-11 (h)).
- **Token usage is not observable** for that side, so every baseline figure would be `unknown`.
  ADR-024's Amendment 2026-09-11 (i), F4 already states the harder half plainly: with transcripts
  alone this engine measures cost, not duration — "AC-14 cannot be argued from a span".

Meanwhile the engine's improvement is no longer in question: a full cycle now reaches `done` with an
APPROVED review, and a later cycle does it without a human in the loop. The maintainer took the
decision in a chat conversation, which is exactly the defect finding **t9d-25** names — no
requirement living only in a comment — and the story card's T-8 line has no source to cite. This
entry is that source.

## Decision

1. **T-8 is reduced.** The paired `2.0.0` versus `4.0.0` measurement will **NOT** be run. A
   `2.0.0` baseline is not worth a dedicated session when the full engine cycle already
   demonstrates a clear improvement, and it cannot be measured from the current environment
   (no session for it, token usage not observable).
2. **Evidence accepted in its place**, as the demonstration T-8 exists for:
   - **Canary v3** (`canary-479-481-v3`, PR #481) — the first delivery cycle to reach `done` on a
     real PR, with an APPROVED review and all four judgment stages exercised live, including
     remediation.
   - **Canary v9** (`canary-479-481-v9`, PR #481, 2026-09-13) — the first fully autonomous cycle:
     review, RED contract, seal, GREEN fix and a re-review **APPROVED** on `b733e06c`.
3. **The gap is recorded, not hidden.** DT-36 and the matched-cost half of AC-14 are **unevidenced
   by decision, not by omission**. Neither is claimed as met, and no speed or cost claim is made
   from unpaired runs.
4. **A paired baseline, if ever wanted, becomes a separate story** — with its own baseline session
   and an observable usage source as entry conditions, never a re-opening of #479.

## Alternatives Considered

- **Run the six paired scenarios anyway**: rejected — the baseline side has no session and no
  observable usage, so the comparison would be `unknown` against measured, which is the false
  equivalence DT-36 exists to forbid (retain all runs/costs, same corpus, no cherry-picked
  successes).
- **Argue AC-14 from wall-clock spans of the completed cycles**: rejected — ADR-024 (i)/F4 already
  settled that a message span is not an execution duration.
- **Leave T-8 open and block #479**: rejected — the measurement is not a prerequisite of the
  delivered behaviour, and an indefinitely open acceptance gate hides the real state instead of
  stating it.
- **Leave the decision in the chat conversation**: rejected — t9d-25 is exactly that.

## Consequences

- T-8's live-canary half is evidenced (canary v3, canary v9); its paired-measurement half is
  closed as reduced, with this entry as the card's citable source.
- **DT-36** (fixed six-scenario paired pilot) and the matched-cost half of **AC-14** (equal-quality
  measured efficiency) stay unevidenced by decision. No metric in #480's summary may be read as a
  paired result.
- T-9 (independent final review) inherits a T-8 that is reduced, not skipped: it verifies this
  record and the two canary runs, not a paired dataset.
- No engine, script or guideline behaviour changes with this decision.

## References

- Story #479, PR #480 — T-8 step 3 and its acceptance (DT-35/36, AC-10/14); DT-36 row; AC-14
- ADR-024 — Amendment 2026-09-11 (h) (paired-measurement methodology), Amendment 2026-09-11 (i) F4
  (cost, not duration — AC-14 cannot be argued from a span), Amendment 2026-09-13 (v) (canary v9)
- `.pair/working/canary/us-479/runs-archive/canary-479-481-v3/AC-10-EVIDENCE.md` — canary v3, `done`
  with an APPROVED review
- `b733e06c` (PR #481) — canary v9's re-review APPROVED head
- Review finding **t9d-25** — no requirement living only in a comment
