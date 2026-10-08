# Decision: The loop re-drives escalated and failed cards; only terminal outcomes end a card's drive

## Date

2026-10-06

## Status

Active (supersedes the "every outcome ends the card's drive / never retried" rule of #524 BR-4 and the `already driven` exclusion of #522)

## Category

Process Decision

## Context

Card 524 made every batch outcome (merged, parked, escalated, failed, halted) end a card's drive for the whole run, and #522's `pair-cli run --watch` excluded any card "already driven in this run". Live runs showed the cost: a card escalated for a fixable reason, or a stage that failed once for a transient reason, stayed dead for the rest of a long `--watch` run.

## Decision

Maintainer decision (2026-10-06), applied to BOTH realizations (`pair-cli run --parallel/--watch` and the `pair-loop` workflow), parity-tested:

- Only TERMINAL outcomes — merged, awaiting-human park, PR-ready (ready-for-merge), target reached — end a card's drive for the run.
- An ESCALATED card is skipped while the selection reports it escalated (`escalated: true` or the `needs-review` label) and is re-picked once the selection reports it cleared. The escalation itself never burns the retry budget. In the workflow, a card that escalated stays skipped until the selection says `escalated: false` explicitly (fail-safe).
- `escalate` (the review/fix budget is spent, a human decision is owed) is DURABLE — reported and excluded — while `escalated` (an autonomy gate fired) re-enters once cleared; the transient-only retry rule of the companion ADL decides which failures are retried. A failed card that is TRANSIENT is retried within a per-run budget (default 1, printed in the loop header and audited per retry), then excluded as `retry budget exhausted`.
- Each skip and retry is reported with its reason (iteration line, audit, workflow log).

## Alternatives Considered

- Keep "never retried": rejected by the maintainer — a long unattended run should recover from transient failures and cleared escalations.
- A larger default budget: rejected, each retry spends a full delivery cycle; configurable later.

## Consequences

- Reverses #524 BR-4 ("every outcome ends the card's drive") and the pair-loop tests that pinned it; those tests now pin the terminal set and the retry budget.
- The in-session workflow stops when nothing is workable in an iteration (it has no wait), so an escalation is re-picked only while other cards keep the loop running.
