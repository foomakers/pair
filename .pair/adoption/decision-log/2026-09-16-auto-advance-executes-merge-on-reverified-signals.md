# Decision: auto-advance executes the merge on re-verified signals (loop closes the loop)

**Date:** 2026-09-16
**Status:** Adopted
**Category:** Adoption Delta

## Context

`pair-loop` / `pair run` exist to run unattended, and `## Auto-Advance` names which tiers may push/merge without a human. But every stage of the pipeline refused to merge in unattended mode (`/pair-process-review` dispatched contract: "pair never auto-merges"; `implement-batch`: "NEVER merges"; `review-phase`: "a human presses it"), and the loop's own advance step verified only the local gate set — never the published checks, never head freshness. Result: with `## Auto-Advance: risk:green` declared, the loop drove cards to review-approved PRs and stopped; nothing ever merged. The unattended loop could never finish, incoherent with the adoption-gated light row that already declares pull requests "mergeable with no human action" below 🔴.

## Decision

When a review-approved card's tier is in `## Auto-Advance`, `pair-loop` executes the merge ONLY on freshly re-read signals whose conjunction IS `merge_allowed`: tier re-read (mid-run raise parks), remote head identical to the reviewed head, `pair-review` and `pair-explicit-approval` conclusions `success` on that head (D10 falls out: at 🔴 without a recorded human approval the latter cannot be success), tier gate set green. Anything unreadable, moved, or not `success` parks the card naming the failing item. The merge follows merge-and-cascade (adopted strategy, commit-template message, story close + parent cascade with read-back, branch deletion, checkpoint removal).

The reviewer still never merges its own verdict (self-dealing guard unchanged — the merge is the orchestrator's act on re-verified state, not the reviewer's). `pr-states.md` "pair never auto-merges" becomes the adoption-gated exception. This project's own `## Auto-Advance` stays `(none)` — the mechanism ships, the opt-in remains one line.

## Consequences

- `pair-loop.js` advance block gains the PR SIGNALS re-read + four code gates + merge-contract prompt; 5 new dry-run tests, 2 stubs updated.
- `/pair-loop` one-card path, `automation-policy.md` (new "Merge execution" subsection), `pr-states.md` (state table + who-does-what), `/pair-process-review` dispatched contract updated coherently.
- Below-🔴 auto-merge needs no human touch; at 🔴 the explicit-approval conclusion gates execution exactly as D10 requires.
