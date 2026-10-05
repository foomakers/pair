# ADR-028: Autonomous prepare is a maintainer-chosen exception to R3.11

## Status

Accepted

## Date

2026-09-30

## Context

- Story #523 (epic #485). R3.11 makes the AI-human alignment sync (`/pair-capability-grill`, refine-story phase 0) a blocking gate before a card goes Draft to Ready. Today no unattended run (`pair-cli run --autonomous`, loop, batch) can take a Draft card to Ready.
- Some cards are already understood (brainstorm with grill and triage). Forcing a human "yes" on them stalls the loop for no information gain.
- ADR-021 gave composed skills one signal, `$approval`, and made a judgement gate HALT under `auto`. Phase 0 is such a gate. ADR-021 also left an untracked residual: `/pair-process-refine-story` and its automated callers still pass nothing and still ask.
- ADR-013 (brainstorm/refine flow) and ADR-024 §8 (tag dispatch refuses refine-story) stay in force.
- Hard to reverse: once callers rely on an autonomous Ready path, R3.11 is no longer absolute.
- Related: #521 (prepare gate syntax and evaluator), #522, grill synthesis `.pair/working/grill-sync-autonomy-20260930.md` (maintainer "si").

## Options Considered

1. **Keep R3.11 absolute.** Rejected: unattended cards never reach Ready; the human gate is paid even when nothing is uncertain.
2. **`$approval: auto` alone lifts phase 0.** Rejected: any caller passing the generic signal would silently bypass R3.11. Contradicts ADR-021 (gates HALT under `auto`).
3. **Chosen: explicit `$prepare: never|when` plus recorded assumptions.** A second, specific signal is the only unlock. `always` (default) keeps R3.11.

## Decision

1. Phase 0 of `/pair-process-refine-story` stays `kind=gate; auto=halt`. It is lifted only when BOTH `$approval: auto` AND `$prepare: never|when` are passed. `$approval: auto` alone, or with `$prepare` absent or `always`, still halts at phase 0.
2. `$prepare` values: `always` (default, R3.11 intact), `never`, `when` (evaluated by the prepare gate from #521). The maintainer declares or passes it; no skill infers it.
3. Under the exception `/pair-capability-grill` is not composed. Each question the sync would have asked is answered by the agent from code, KB and linked context and recorded in the story's `## Assumptions` section (question, answer, evidence, how to overturn), or the explicit line "none: every question settled from repository evidence".
4. Steps 2-4 rounds resolve `confirm` to `accept`, reported. `/pair-process-plan-tasks` honours `$approval` the same way.
5. The Ready status write is held back under the exception; the caller writes it only after the task breakdown (B2).
6. A question needing a product decision is returned as `open-question`; the card stays Draft. Escalation means Draft + `needs-review` label + one idempotent comment.
7. ADR-024 §8 unchanged: tag dispatch still refuses refine-story.

## Consequences

### Benefits

- Understood cards reach Ready unattended; every self-answer is auditable and overturnable.
- R3.11 cannot be bypassed by the generic signal: two signals are required.

### Trade-offs and Limitations

- An agent can self-approve wrong acceptance criteria. Mitigations: mandatory `## Assumptions`, `when; lacks: triaged` as the recommended form, review still gates by risk tier.
- Closes ADR-021's untracked residual for refine-story's gate-driven callers (`pair-cli run --card`, the cycle, the batch, the loop). `refine-batch` is a refine-only tool and keeps its pre-#523 behaviour exactly: it passes no `$prepare` and moves no state through `cycle-prepare.mjs complete` (no prepare gate, no `B1`/`B2`, no breakdown-gated Ready); its residual stays as ADR-021 states it. `map-*` loop callers remain as stated there.

## Adoption Impact

- `architecture.md`: bullet on the prepare exception.
- ADR-021: pointer from its residual paragraph.
- Skills: `refine-story` and `plan-tasks` gain `$approval`; `refine-story` gains `$prepare`.
