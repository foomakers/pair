# Decision: Delivery state past Refined is read from the PR and its analysis, not from a board column

## Date

2026-08-13

## Status

Active

## Category

Process Decision

## Context

Board columns proved unreliable as a source of delivery truth for `/pair-next`'s cascade and `/pair-process-review`'s state synthesis: items sat in stale columns while their PRs were approved (or vice versa), and boards without a dedicated Ready column cannot distinguish Draft from Ready at all.

## Decision

For any macrostate past **Refined** (`In Progress`, `Review`, `Done`-readiness), the authoritative signal is the **PR and its recorded analysis** — gates on the head commit, review verdict, `pr-state:*` synthesis (`pr-states.md`) — never the board column alone. The board remains the tracking view; the code host is the delivery truth. Below Refined (Draft/Ready), board state plus the Definition of Ready fallback govern ([canonical-states.md](../../knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)).

## Consequences

- Review/merge automation reads `gh pr checks` / review verdicts / `pr-state.sh` synthesis instead of trusting column names.
- A stale column never promotes or blocks an item; the closure pass (story close + board write) remains the only sanctioned way the column reaches `Done`.
