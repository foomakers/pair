# Decision Log: Tier 2 is realized at the STAGE level, and `next.context: reuse` degrades to `fresh` under a process realization

## Date

2026-09-22

## Status

Active — amends [ADR-021](../tech/adr/adr-021-fan-out-three-realizations.md) (Decision §1, the tier
table) without superseding it.

## Category

Architectural Decision Amendment

## Context

ADR-021 named three realizations of ONE fan-out capability and put the **external driver** at tier 2:
*"`pair run` (#451): a headless process per iteration on a chosen engine, re-invoking on the
continue-token."* When that was written, the unit of a tier-2 iteration was **one skill invocation** —
the driver handed a skill to a process, the process ran it to completion, and the driver re-invoked.

US-487 changes what an iteration IS, not how many tiers there are. `pair-cli run --card <id>` drives
the *delivery cycle* — `resolve → spawn one engine process for the due stage → resolve → …` — so the
unit is now **one cycle stage** (`prepare`, `validate`, `implement`, `green`, `verify`), not one
skill. The rules still live in one place (`cycle-state.mjs` / `cycle-dispatch.mjs`, shipped inside
`pair-workflow-cycle`, located through the installed-skills registry — never a second copy inside
`pair-cli`), exactly as the epic's "one rule authority, N realizations" invariant requires.

This amendment records two consequences ADR-021's text does not yet state.

## Decision

**1. Tier 2 is realized at the stage level.** ADR-021's tier table should be read as: *a headless
process per **unit of work**, where the unit is one loop iteration for `run --skill` and one delivery-cycle
stage for `run --card`*. Both are the same tier and the same trade-off; only the granularity differs.
Nothing about the preference order, the perimeter, the autonomy opt-ins or the merge gate changes.

**2. `next.context: reuse` degrades to `fresh`, and the run says so once.** The in-session
coordinator (`pair-workflow-cycle`, tier 1) can honour a `reuse` transition by resuming the SAME
subagent, so consecutive stages share a session. A process realization cannot: there is no session to
resume once the process has exited. `pair-cli` therefore treats `reuse` as `fresh` and prints that
fact once per run, rather than pretending to honour it or failing on it.

**This makes tier 2's isolation stricter than tier 1's, never weaker** — the same asymmetry ADR-021
§2 already states ("Tier 2 is not a lesser tier 1 … it respects §3's context-isolation invariant
*more strongly*"). What is lost is not safety but continuity: a stage that would have inherited its
predecessor's working context re-reads it from the handoff on disk instead. Since the handoff is the
authority for every stage outcome anyway (a process's own terminal event decides only the *process*
outcome), nothing that decides the cycle travels through the session — which is why the degradation
is sound rather than merely tolerable.

**3. The operator is told, once, not per stage.** A per-stage notice would be noise on a
forty-dispatch cap; a silent degradation would leave someone comparing tier 1 and tier 2 runs unable
to explain why the same card behaved differently. One line, in the transparency block that already
prints engine, skills path, run directory, worktree root, `runId`, the `--rounds` bound and the
dispatch cap before anything spawns.

## Consequences

**Benefits**

- `pi` and `opencode` complete the whole delivery cycle, not only the fix-and-review half — the
  portable baseline ADR-021 claims is now true at the stage level, which is where the cycle lives.
- The tier-1 vs tier-2 choice keeps a stated trade-off instead of a hidden one: continuity of session
  against strictness of isolation.

**Trade-offs and limitations**

- A stage that genuinely needs its predecessor's in-session context costs more under tier 2: it pays
  a fresh process and re-reads the handoff. Measured against a stage's own wall-clock, this is small;
  stated here so nobody discovers it as a surprise.
- ADR-021 §2's note that **tier 2 has no per-run card exclusion** is unaffected by this amendment and
  still holds. `run --card` is single-card by construction, so the gap has no bearing here — but it
  does not go away for `run --skill`.

## Related

- [ADR-021](../tech/adr/adr-021-fan-out-three-realizations.md) — the tier table this amends.
- [ADR-024 (b)](../tech/adr/) — PR entry goes straight to `verify`, no `prepare` before it.
- US-486 — the tier-1 in-session coordinator whose rules this realization reuses unchanged.
- US-488 — per-stage engine/model/effort profiles; until it lands, every stage of a `run --card`
  invocation runs on the one resolved engine.
