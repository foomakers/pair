# Decision: The breakdown-to-task feedback loop is one mechanism owned by /pair-process-implement, batched per invocation

## Date

2026-08-28

## Status

Active

## Category

Process Decision

## Context

Story #220 asked for progress visibility at task granularity during autonomous runs: as the AI advances through a story's inline task breakdown, the checklist item should be ticked and a progress comment posted (R4.6, spec G10). Two shapes were open, and both are load-bearing enough to record.

**Where the mechanism lives.** The story names three surfaces — `/pair-process-implement` (#256, the insertion point), the supervisor loop (#219/#250), and `/pair-capability-write-issue` (the PM write patterns). The acceptance criteria require the manual and the supervised path to behave *identically* ("one mechanism"). A loop-side implementation would satisfy the supervised half and leave a human-invoked `/pair-process-implement` silent; two implementations would satisfy both and then drift.

**How often it speaks.** A comment per task honours "task granularity" and produces exactly the comment feed D22's reading budget exists to prevent — on a 4-task story, four notifications that each say one line. A comment only at the end is quiet but says nothing while the run is in flight.

**How the tick is written.** `/pair-capability-write-issue`'s write mode is a **full-body overwrite**; there is no partial-body write in the corpus. Ticking through it means the caller passes the current body with one line patched — the same read-merge contract `/pair-process-plan-tasks` is already held to. The alternative was a new tick-only mode on `/pair-capability-write-issue`.

## Decision

**One mechanism, owned by `/pair-process-implement`, specified once in the KB, flushed once per invocation.**

1. **The mechanism is a guideline**, `knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md`: the task-ID locator, the tick-only diff-checked patch, the batch format, the outcome vocabulary and the fallbacks. The skills point at it and never restate it (D18 — one owner per rule).
2. **`/pair-process-implement` is the only caller.** A supervised run reaches the same code path through `/pair-loop` → `/implement-batch` → `/pair-process-implement`, so the two paths are identical *by construction*, not by two implementations kept in agreement. `/pair-loop` carries an explicit boundary forbidding a second per-task writer.
3. **The batch unit is one `/pair-process-implement` invocation over one story** — a manual session is one iteration; a supervised run contributes one per card per pass. The queue is flushed exactly once, at Step 3.1b, including on the way out of a HALT. An empty queue posts nothing.
4. **The transport is `/pair-capability-write-issue`**, declared an **Optional** composed skill: write mode for the tick (caller-patched full body, diff-checked before the call, **`$on-failure: report`**), `$mode: comment` for the batch. Optional is the point — a missing writer degrades the feedback and never blocks the story — and `$on-failure: report` is what makes a *present but failing* writer degrade the same way instead of HALTing the run through it.

## Alternatives Considered

- **Implement it in the supervisor loop (#219/#250)**: Rejected. It satisfies the supervised path only, and a human-invoked `/pair-process-implement` — the majority of runs today — stays silent. It also puts a merit-free orchestrator (D18) in the business of reading task outcomes.
- **A dedicated `/report-progress` capability skill**: Rejected. The whole mechanism is ~2 call sites and a document; a skill would add an invocation surface, a version and a degradation contract for logic that has exactly one caller. If a second caller ever appears, the guideline is already the shared owner and promoting it is mechanical.
- **One comment per task**: Rejected on D22. Four tasks become four notifications for the same story; the batched form carries the same four lines in one read.
- **One comment per story, at merge**: Rejected. It reports after the fact and says nothing while an unattended run is in flight, which is the visibility the story asked for.
- **A new tick-only mode on `/pair-capability-write-issue`**: Rejected for now. It duplicates the read-merge contract `/pair-process-plan-tasks` already lives under, and it would make `/pair-capability-write-issue` aware of the checklist grammar — a second owner of the locator rule. The caller-side diff check gives the same safety with no new mode. What the tick *does* need from the transport is not a mode but a **failure policy** — `$on-failure: report` (see Consequences), which changes who raises and nothing about what is written.
- **Persisting the progress queue across invocations** (writing it beside the checkpoint at Step 2.8 and letting a resumed invocation flush its predecessor's lines): Rejected for now. It closes a real gap (see Consequences) but re-opens the accretion the invocation scoping was introduced to close — the resumed run would post a catch-up comment for work a human may already have acted on — and it obliges every resumed invocation to reconcile a queue against work it may have redone. The window it would cover is bounded by one invocation and loses no state, only narrative.

## Consequences

- `/pair-process-implement` gains one optional composition and one closing step; its 5-step task cycle is unchanged.
- The tick's safety rests on a caller-side diff check (exactly one checkbox-only line changed, or the write is abandoned), because the transport cannot enforce it. This is stated in the guideline and in `/pair-capability-write-issue`'s composition interface, and asserted in conformance tests.
- Feedback failures are never blocking: a locator mismatch, a body edit race or a tracker error degrades to *comment-only* and the run continues. A story can therefore be complete with an unticked item — the comment names the ID so a human can tick it.
- **The transport must not HALT for the tick, and now does not.** `/pair-capability-write-issue` write mode HALTs on an unresolvable id (Step 7), a board membership its re-read cannot confirm (Step 7b beat 4 — which runs on *every* write-mode write on an explicit-membership tool, so every tick and every DoD box passes through it) and any tracker error (Step 8); a HALT in a composed skill propagates to its caller. Unaddressed, one 5xx while ticking task 1 of 4 would end the run — no T2/T3/T4, no PR — over a checkbox. The tick therefore passes **`$on-failure: report`**, added to that skill (Step 8b): those three become the returned outcomes `not-found`, `membership-unconfirmed`, `write-failed`. The exemption is deliberately narrow — an unsupported `$type`, a missing template and a malformed `state-mapping` still HALT for every caller, because they are deterministic caller/configuration bugs a report would only invite the caller to re-trigger.
- **A batch lost with its session is not recovered.** The queue is invocation-scoped (that is what makes a re-run silent), and it lives in session memory while the checkpoint is persisted after every task. An invocation that ticks T1/T2 and dies before the flush leaves those two lines — including any `write-failed`/`not-found` diagnostic a human would need in order to tick by hand — unposted on any invocation. **The ticks stand; the lines do not.** Accepted, not overlooked: the alternative is under Alternatives Considered.
- Cadence and verbosity are defaults, not law: a project that wants different ones declares them in its own adoption.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): no change required — the loop introduces no new gate, no new board state and no new PM tool obligation; the existing Assignment and PM-tool sections already cover the writes it makes.
- No dataset mirror for this ADL: sibling entries in `adoption/decision-log/` are adoption-only records, per the convention recorded in [2026-07-18-conformance-test-per-file-not-per-story.md](./2026-07-18-conformance-test-per-file-not-per-story.md).
- The *mechanism* is KB content and therefore ships: `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md` plus its generated `.pair/knowledge/**` mirror.
