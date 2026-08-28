# Decision: tier 1's `$approval` posture is unconditional, and tier 1 has no declaring composition site yet

## Date

2026-08-28

## Status

Active

## Category

Technical Decision

## Context

US-464 wires the seam #451 (the `pair run` driver, tier 2) and #410 (`$approval` itself, ADR-021) each shipped one side of: an unattended driver must thread `$approval=auto` into any composed skill that declares an approval round, on both tiers.

Tier 2 was as the story described it. Tier 1 (`.claude/workflows/pair-loop.js`) was not, on two counts found by reading its actual composition:

1. **The story named the wrong posture source.** Its AC4 says tier 1 threads the signal "under its own autonomous/`## Auto-Advance` posture". `## Auto-Advance` is not an attendance signal — it decides whether a **review-approved card is merged** unattended. A project with `## Auto-Advance: (none)` (this repository's own policy) still runs `pair-loop` fully unattended through implement and review; it parks cards awaiting a human merge instead of merging them.
2. **The story assumed a live composition site.** `pair-loop.js` names exactly two skills — `/pair-next` (Select phase) and `/pair-capability-verify-quality` (Advance phase) — and **neither declares `$approval`**. The other composition is `workflow('pair-implement-batch', …)`, a workflow delegate, not a skill invocation. Tier 1's exposure to the declaring family is therefore **transitive**: `pair-loop.js` → `pair-implement-batch` → `/pair-process-implement` → `/pair-capability-assess-stack` (a declaring member).

The story's T-1 examples were also wrong about the family: it named `/pair-process-refine-story` and `/pair-process-bootstrap` as declarers. Neither declares `$approval` — bootstrap's quick depth **passes** it to the family, and refine-story is the "untracked residual" ADR-021 records in its own Trade-offs. The real family is the eleven skills ADR-021 converted: nine `assess-*` members with an approval round plus both `map-*`.

## Decision

1. **Tier 1's posture is unconditional `auto`, not gated on anything.** `pair-loop.js` is the unattended fan-out path itself (ADR-017 §4) — it is loaded only when a fan-out runner exists, and the `pair-loop` skill's degraded one-card path never touches the file. Nobody is present for any of it, so there is no posture to read. This is a **deliberate asymmetry** with tier 2, which gates on `--autonomous` because `pair run` genuinely has an attended mode.
2. **`## Auto-Advance` is explicitly rejected as the gate**, per the Context above. Gating approval on it would leave the modal configuration (`(none)`) asking questions nobody can answer — this story's whole defect, reintroduced through the fix.
3. **Tier 1 lands the mechanism and its guard, not a live thread.** The family list and `approvalArgsFor()` live in the workflow's pure-helpers half and are applied at both real call sites, where they correctly contribute nothing today. Threading the signal through `pair-implement-batch`/`/pair-process-implement` was **rejected**: neither declares `$approval`, so passing it would be exactly the invented argument AC3/D18 forbids. Converting those two intermediaries is a corpus change to non-declaring skills, out of this story's scope.
4. **The signal is spelled `--approval auto` on both tiers**, not `$approval=auto` on tier 1 as AC4's prose suggests. `$approval` is the *documentation* form used in Arguments tables; the *invocation* form in this corpus is a flag, and tier 1's own prompts already spell borrowed values that way (`Run /pair-next --filter "…"`). One signal, one spelling, no divergence for a reader to hold.

## Consequences

- The family list is duplicated by construction (TS in `apps/pair-cli/src/commands/run/invocation.ts`, JS in `.claude/workflows/pair-loop.js` + its dataset mirror), exactly as `tech/automation.md`'s grammar already is. `tier-parity.test.ts` fails if the two lists disagree, and `invocation.test.ts` checks the list against the skills' own `## Arguments` tables — fail-closed, so a list about someone else's declaration cannot go stale silently.
- The asymmetry in item 1 is **asserted** in the parity corpus rather than left to be read as drift, in the same shape the corpus already uses for its other declared divergences.
- Item 3 is asserted too: a test enumerates the skills `pair-loop.js` composes and requires each to receive nothing. When tier 1 grows a declaring composition site, that test is what tells the next reader the situation moved, instead of a silent no-op.
- **Residual, unowned**: `/pair-process-implement` and `pair-implement-batch` still do not declare or forward `$approval`, so a card driven by tier 1 that reaches `/pair-capability-assess-stack` through them still hits an interactive round. This is the same class of residual ADR-021 recorded for `/pair-process-refine-story`, now with a second instance and still no card. Whoever picks it up files it; nothing here claims it exists.
