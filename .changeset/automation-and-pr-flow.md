---
'@pair/pair-cli': minor
---

Supervised automation and the PR state flow:

- `/pair-loop` advances the backlog unattended inside a project policy (`tech/automation.md`: `## Eligibility`, `## Auto-Advance`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location`), and every setting fails closed (#443, #458).
- The batch engine `pair-implement-batch` ships as a product artifact: configurable pipeline, bounded fan-out, frozen contract (#432).
- PR state flow separates mechanical gates from judgment review. `pair-review` and `pair-explicit-approval` are required checks, so a PR merges only when gates are green, the review approves and, at 🔴, a human approves (#390).
- Solo-maintainer `/approve <head-sha>` token for 🔴 PRs. The loop auto-merges only for tiers listed in `## Auto-Advance`, on signals it re-verifies (#472, #495).
- Dedicated review identity (GitHub App or bot) plus optional auto-approval for light PRs, gated by adoption (#466).
- `$approval: interactive | auto` lets `assess-*`/`map-*` run non-interactively when composed by a loop (#462).
- `/implement` ticks the inline task checklist and posts one batched progress comment per run (#468).
- `/pair-capability-setup-harness` configures pi, opencode, Claude Code or Codex as a pair environment, with a guide per harness (#457, #512, #516).
