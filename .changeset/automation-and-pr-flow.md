---
'@pair/pair-cli': minor
---

Supervised automation, autonomy and the PR state flow:

- `/pair-loop` advances the backlog unattended inside a project policy (`tech/automation.md`: `## Eligibility`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location`), and every setting fails closed. Auto-development eligibility is an adoption tag set by classification (#250, #216, #443, #458).
- Autonomy model, with one syntax for adoption (`## Autonomy`), `pair-cli run` flags and skill arguments. Selection: `filter` (labels, any-of), `assignee`, `status`, optional `root`. Target: `until: ready | pr | merged`. Two gates, `prepare` and `merge`, written `always | never | when; has: <labels>; lacks: <labels>`. Escalation is checked at every stage boundary and parks the card as `escalated`. Precedence is argument > adoption > KB default, and every effective value is printed with its source. Defaults are unchanged: nothing is prepared or merged without a declared gate. Legacy `## Auto-Advance`/`## Eligibility` still work and are translated (#521, #525).
- Autonomous prepare: refinement and task breakdown run as one phase under the prepare gate. `until: ready` stops after it. An open question escalates the card with `needs-review` and leaves it in Draft (#523, #529).
- Batch = cycle on N cards. `pair-implement-batch` follows the same rules and arguments as `/pair-workflow-cycle` and merges a card only when the merge gate allows it. Without the Workflow tool it falls back to the cycle, one card at a time. `pair-loop` only selects and has no merge of its own. The cycle, the batch (sequential or parallel) and `pair-cli run` are parity-tested (#524, #527).
- The batch engine `pair-implement-batch` and its sibling `pair-refine-batch` (classify, refine or triage) ship as product artifacts with a configurable pipeline, bounded fan-out and a frozen contract (#219, #432). Fix: a batch launched with invalid args now fails loudly instead of reporting an empty success (#401).
- PR state flow separates mechanical gates from judgment review. `pair-review` and `pair-explicit-approval` are required checks, so a PR merges only when gates are green, the review approves and, at 🔴, a human approves (#234, #390).
- Solo-maintainer `/approve <head-sha>` token for 🔴 PRs. Auto-merge re-verifies its signals first. Below 🔴 the explicit-approval check passes on its own, and the merge gate reads the PR's risk tier (#398, #472, #495, #530).
- Dedicated review identity (GitHub App or bot) plus optional auto-approval for light PRs, gated by adoption (#218, #466).
- `$approval: interactive | auto` lets `assess-*`/`map-*` run non-interactively when composed by a loop (#410, #462).
- `/implement` ticks the inline task checklist and posts one batched progress comment per run (#220, #468).
