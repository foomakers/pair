# Decision: US-506 — the validator proves it executed; one pre-seal guard

## Date

2026-09-23

## Status

Active

## Category

Analysis

## Context

US-487 sealed two defects in its own `a0` tests (carried as #487 T-8/T-9): an unused local
that made `quality-gate` red for any implementation, and a `toHaveReturnedWith` on an async
mock that passes for anything (GAP-487-2). Both were byte-identical to the seal. They cost two
implement attempts and the `greenRetries` budget. US-506 T-6 asks first for a recorded finding:
does the validator execute its witnesses?

## Finding (reproducible evidence)

- **What the engine checked before US-506: nothing about execution.** `red-verify`'s handoff
  carried `reproduced: [{ rowId, command, observed }]` as free text. `envelopeErrors` never read
  it: no exit code, no required presence, no link between a row's baseline and its outcome.
  `red-snapshot.mjs seal` never ran a witness either. So "the validator reproduced every row"
  was an assertion the engine could not tell apart from a fabricated one.
- **The deliberately non-discriminating witness.** Witness test `US-506 T-6 w6` in
  `cycle-state.test.mjs` publishes a verified handoff for a witness that exits 0 at the unfixed
  base (`1 passed (toHaveReturnedWith on an async mock)`). That is GAP-487-2's shape. Before
  this change the handoff was accepted. After it, it is refused with
  `witness-cannot-fail:row-1`. The command that reproduces it:
  `cd .claude/workflows && node --test --test-name-pattern "US-506 T-6" pair-contracts/cycle-state.test.mjs`.
- **What the engine still cannot prove.** Whether an LLM validator really ran the command it
  reports cannot be proven from a handoff it writes itself. The engine can prove two things.
  First, the reported outcome is consistent with the row's claim (fails for a witness, passes
  for a control). Second, the seal re-runs every witness command itself during the hermetic
  probe below, so a witness that cannot run at all surfaces there.

## Decision

1. **Execution evidence is required on a verified contract (AC10).** Each row gets
   `reproduced: [{ rowId, baseline, command, exitCode, observed }]`. `publish` refuses the
   handoff in these cases:
   - `reproduced-missing`: the evidence is absent;
   - `reproduced-invalid:<row>`: a malformed row;
   - `reproduced-command-unsafe:<row>`: shell syntax in the command;
   - `witness-cannot-fail:<row>`: no failing run for a witness;
   - `control-cannot-pass:<row>`: no passing run for a control.

   Several runs per row are allowed, so a `mode: test` guard can record its injected-regression
   failure beside its passing run on the current source. A rejection may carry its audited rows,
   held to the same shape.
2. **One pre-seal guard in `red-snapshot.mjs seal` (AC9).** It runs before anything is
   committed. Each refusal names the file:
   - `static-gate-failed`: the repo's static gates run over the listed tests. They are passed
     as `--static-gates`, which is required on the CLI; `[]` is an explicit "none".
   - `test-spawns-gh` / `test-reaches-network`: every witness command is run once, with a
     `gh` trap first on PATH and a Node preload that refuses non-loopback sockets.
   - `predecessor-hash-unmatched`: checked against the canonical contract hash of every sealed
     manifest in history.
   - `changed-rows-omit-witness` / `changed-rows-omit-row`: a revision's `changedRows` checked
     against the witness files its diff modifies and the matrix rows it adds or edits.

   The seal format and `verifyChain` are unchanged.

## Consequences

- A clean contract seals exactly as before, and the guard reports what it ran (`preSeal`).
- The function-level `seal()` runs the hermetic probe only when asked (`hermetic: true`). The
  CLI, which the skill runs, always asks.
- Contracts that were already sealed are never re-checked: the guard applies at seal time only.
