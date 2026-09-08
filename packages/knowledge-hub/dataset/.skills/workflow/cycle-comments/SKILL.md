---
name: cycle-comments
description: "The PR-comment policy of one review ↔ fix cycle, in three modes: probe (read-only: is the working log present, does the PR already carry the first-review marker), flush (escalation: one comment summarizing the rounds and the still-open findings, superseding any prior flush, log kept), synthesize (convergence: ONE remediation table across every run of the cycle, intermediate comments minimized, log deleted). A PR shows at most one first review and one final remediation. Dispatched by the batch engine (pair-implement-batch)."
version: 0.1.0
author: Foomakers
---

# /cycle-comments — At Most Two Visible Comments Per Cycle

The whole cycle of a PR — every run, escalation and manual round it takes to converge — is ONE logical cycle and leaves exactly two visible artifacts: the first review and the final remediation. Everything in between lives in the working log.

## Arguments

| Argument              | Required | Description                                                                                                             |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `$run`                | Yes      | Run id.                                                                                                                 |
| `$story`              | Yes      | Story id.                                                                                                               |
| `$pr`                 | Yes      | PR number.                                                                                                              |
| `$worktree`           | Yes      | The persistent authoring worktree (the working log is an UNTRACKED file living only there).                            |
| `$reviewLog`          | Yes      | Path of the cycle's working log, e.g. `.pair/working/reviews/<story>.md`.                                                |
| `$marker`             | Yes      | The hidden first-review marker (`<!-- pair:first-review #<story> PR#<n> -->`).                                            |
| `$mode`               | Yes      | `probe` \| `flush` \| `synthesize`.                                                                                     |
| `$findings`           | flush    | JSON array: the still-open actionable findings.                                                                         |
| `$hasLog`             | flush    | `true` when a working log exists (a continuing cycle); `false` on a resumed PR whose log was never written or pruned.   |
| `$accepted`           | synthesize | JSON array: accepted / non-actionable findings with their dispositions, accumulated over every round.                  |

## Algorithm

### `probe` (read-only)

1. `logExists`: is `$reviewLog` present in `$worktree`?
2. `firstReviewPosted`: fetch the PR comments via `gh`; report whether ANY comment's raw body contains the EXACT substring `$marker`. A minimized/outdated comment still counts — its raw body still carries the marker. This is a plain substring match, DETERMINISTICALLY — never infer from a comment's structure, tone or template headings.
3. Do NOT create, modify or delete the log; do NOT post or minimize any comment; do NOT review. Return `{ logExists, firstReviewPosted }`.

### `flush` (escalation to a human)

1. **Supersede**: minimize / mark-outdated any prior escalate-flush comment on `#$pr` — each flush summarizes the rounds so far, so a new one supersedes the last; only the newest stays visible. ALSO minimize any final-remediation/synthesis comment left by an EARLIER convergence of this same cycle (a converged-but-unmerged PR re-run into new findings): a "review clean" verdict must not stay visible beside an active escalation. NEVER minimize the first-review comment.
2. If `$hasLog`: read `$reviewLog`. Post ONE fresh comment on `#$pr`, written as a response to the first code-review comment, summarizing the rounds so far (per finding: what was attempted, current state) and the still-open findings `$findings`. State the CONVENTION: any further rework or re-review — manual out-of-band rounds included — is funneled into THIS same working log (append), not posted as standalone PR comments; the next orchestrated run continues the cycle and its convergence synthesizes ONE final remediation and minimizes these intermediates. Note that the log is an UNTRACKED file living only in `$worktree`, which must be PRESERVED until merge — if it is pruned or recreated the audit log is lost (this flush and the first review still remain on the PR, and the first-review marker still prevents a duplicate first review).
3. If not `$hasLog`: escalate from `$findings` directly in ONE fresh comment.
4. Do NOT delete the log. Do NOT merge. Return `{ posted: true }`.

### `synthesize` (convergence)

1. Read `$reviewLog` — it may span MULTIPLE runs, escalations and manual rounds of this ONE cycle.
2. Post ONE remediation comment on `#$pr`, written as a direct RESPONSE to the first code-review comment: render EVERY finding recorded across ALL runs in the log (plus any surfaced during remediation) as ONE MARKDOWN TABLE — columns `round | severity | location | resolution | commit`, one row per finding, one line per row — then a second short table for `$accepted` with dispositions, then the final verdict (review clean) as a single line. Schematic, no narration. This comment is the merge-gate reader's entire view of the cycle: COMPLETE, no finding dropped, no silent truncation — a finding that does not fit a row gets a single line beneath the table.
3. Minimize / mark-outdated every prior intermediate comment on `#$pr` — escalate-flush comments, manual out-of-band rework/re-review comments, and any earlier final-remediation comment left by a prior convergence of this same cycle — so that ONLY the first review and this one remediation remain visible. Do NOT minimize the first review comment. No-op if there is nothing to minimize.
4. DELETE `$reviewLog`. Do NOT merge. Return `{ posted: true }`.

## Output Format

`probe` → `{ logExists, firstReviewPosted }`. `flush` / `synthesize` → `{ posted }`.

## Notes

- Comments are projections of the cycle, never its state: the log (while the cycle is open) and the handoffs under `.pair/working/runs/$run/$story/` are.
- Read nothing under `.pair/working/` except `$reviewLog` and the run directory.
