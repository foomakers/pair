# Decision: US-487 — outcome classes of `pair-cli run --card`'s no-mapping fallback

## Date

2026-09-23

## Status

Active (amended 2026-09-23 after review round r0 — items 2 and 6–10 below; the class list of
item 2 is replaced by item 6, and the code moved out of `handler.ts`, see Consequences)

## Category

Convention Adoption

## Context

US-487 AC14 turns an `unmapped` / `no-mapping-declared` dispatch skip into a Definition-of-Ready
fallback (Draft → `pair-process-refine-story`, Refined without breakdown → `pair-process-plan-tasks`,
Ready → the delivery cycle). The DoD also requires the github-dispatch-adapter smoke to stay
unchanged: shipped default (no `automation.md`), a runner with no tracker access, clean exit.
The sealed a0 contract (snapshot `d117568a`) and the maintainer decision of 2026-09-22 (1) fix
where the two meet. AC15 bounds unattended runs with `## Eligibility`. `cycle-state.mjs resolve`
answers `incompatible` / `invalid` / `other-run` with no `next`.

## Decision

1. A fallback that routes is reported as a route: the dispatch reason (`unmapped` / `no mapping
   declared`) plus the card's DoR state. Never "Nothing was spawned.", never audited `event=skip`.
   Fallback routes write no `start`/`end` dispatch-audit line (no AC decides it; the delivery cycle
   keeps its own handoff trail under `.pair/working/runs/`).
2. The ONE clean-skip class: `no-mapping-declared` AND the tracker unreachable — a typed
   `CardUnreadableError` from `readCardViaGh` (`gh` absent or unauthenticated). Exit 0, the
   `card-unreadable` reason printed, the skip audited, no `DISPATCH-RECORD`. Holds in every
   eligibility state that lets the fallback read the card.
   - `unmapped` (a mapping declared) + unreadable card still fails closed (throws).
   - ~~A readable card with no `**Status**:` line (`card-status-unreadable`) still throws.~~
     Superseded by item 6: a card with no board state is out of scope, a clean skip.
3. `--autonomous`, `## Eligibility` declared, no `## Workflows`, card without the label ⇒ skipped,
   printed and audited `reason=ineligible`, card never read. `--approve-ineligible` lets that one
   run through, announced; nothing persisted (policy file and card untouched).
4. `resolve` without `next` is a typed stop: the outcome carries `status` and resolve's own
   `reason` verbatim; `incompatible` adds the `cycle-state.mjs migrate-acknowledge` recovery. The
   production driver adopts an `other-run` run id once and resolves again (the in-session
   coordinator's rule), never restarting the cycle under the requested id.
5. A `--rounds`-bounded stop prints the `next` step, phase and round it stopped before (AC8).

Amendment, review round r0 (2026-09-23):

6. **Readiness through the adopted `## State Mapping`** (r0-1). The board state is the card's
   project-item status, else its `**Status**:` line; it is resolved through `way-of-working.md`'s
   `## State Mapping` (case-insensitive), then the canonical names (`canonical-states.md` Reading
   rules). `Ready`/`In Progress` + task breakdown ⇒ cycle; `Ready`/`In Progress` without ⇒
   `pair-process-plan-tasks`; `Review` ⇒ cycle (its handoffs decide the step); `Draft` ⇒
   `pair-process-refine-story`, except on a board with no state mapped to `Ready`, where the six DoR
   criteria decide (the breakdown covers 3–5 only). Clean skips (exit 0, reason printed, skip
   audited): an unmapped board state, no board state, `Done`. A malformed mapping HALTs.
7. **Unattended runs never start a preparation skill** (r0-5, AC14 as amended): `--autonomous` on
   a prep route ⇒ clean skip, "needs a human", nothing spawned, skip audited.
8. **`--pr` bypasses preparation routing** (r0-2, AC2): the card's readiness is not read; the entry
   goes to the cycle, whose first stage is `verify`.
9. **Every fallback route that spawns takes the per-card lock** (r0-4), the same helper as a mapped
   route: held ⇒ `run-in-progress` skip, audited; acquired ⇒ released on every exit.
10. **`resolve` always carries the freshness evidence** (r0-3): `--inputs` (the script's `inputs
    --story` digest over the dispatched card object) and `--acHash` (`ac-hash`) once per run,
    `--head` (`git ls-remote`) on every call when the branch exists on the remote.

## Alternatives Considered

- **Clean skip on every `no-mapping-declared` card, never read**: withdrawn by the maintainer —
  AC14 routes a readable card on the shipped default too.
- **Throw `card-unreadable` whenever `## Eligibility` is declared**: breaks the smoke's class on
  this repository's own shape (Eligibility, no Workflows); rejected by contract row AC14-G1.
- **Keep auditing the skip before the fallback routes**: the trail would call a run that started
  something a skip (AC14-G2).

## Consequences

- `card-entry.ts` (extracted from `handler.ts`, r0-13): `handleSkipDecision`, `readReadiness`,
  `reportFallbackEntry`, `ineligibleSkip`, `underCardLock`, `skipUnattendedPreparation`;
  `cycle-entry.ts`: `enterCycleCoordinator`, `describeNextStep`; `card-readiness.ts`: the State
  Mapping reader and the DoR evaluation; `cycle.ts`: `CycleResolveStop`, `stoppedWithoutNext`;
  `cycle-wiring.ts`: `CardUnreadableError`, `adoptOtherRun`, `createCardReadinessProbe`.
- Operators reading the audit trail no longer see `event=skip` for cards the fallback ran.

## Adoption Impact

None: behavior of `pair-cli` itself; no adoption file states these outcome classes. The prior
analysis entry `2026-09-21-us-487-cycle-coordinator-contract-compromises.md` is partially
superseded (its items 2–4); its Status says which.
