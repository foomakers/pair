---
name: pr-phase
description: "Phase B of the delivery workflow: turns an implemented story into exactly one review-ready pull request — resumes from the checkpoint, pushes the branch, and publishes through the project's publish-pr skill (gate, PR body from the template, classification tags, ready-for-review, pr-state label, story back-link, board state). Never hand-rolls a PR, never dispatches or runs a review, never merges. Dispatched by the batch engine (pair-implement-batch)."
version: 0.1.0
author: Foomakers
---

# /pr-phase — One Story, One PR, Published by the Skill That Owns It

Project a verified implementation onto one pull request. A fresh instance runs this: it resumes from the checkpoint, never from memory.

## Arguments

| Argument      | Required | Description                                                                                          |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `$run`        | Yes      | Run id. Handoffs go under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started in (the working directory the coordinator was started in, before any `cd`) — never inside a story or review worktree, which may be pruned. |
| `$story`      | Yes      | Story id.                                                                                            |
| `$branch`     | Yes      | Story branch.                                                                                        |
| `$worktree`   | Yes      | The persistent authoring worktree (holds the checkpoint).                                           |
| `$base`       | Yes      | The PR base branch: the configured base, or the base story's branch when `$stacked=true`.            |
| `$stacked`    | Yes      | `true` when this story stacks on another story's branch — target `$base`, not `main`, so the diff shows only this story's change. |
| `$checkpoint` | Yes      | The checkpoint skill (default `/checkpoint`).                                                        |
| `$publishPr`  | Yes      | The project's PR-publishing skill (default `/publish-pr`).                                           |
| `$notes`      | No       | Scope directive from the card.                                                                       |

## Algorithm

### Step 1: Resume

Work inside `$worktree`; never switch the main checkout's branch. Read the checkpoint (`$checkpoint $mode=resume`) — do not re-derive.

### Step 2: Publish

1. Push the branch.
2. Publish the PR by invoking `$publishPr`. Do NOT hand-roll the PR: that skill owns the whole sequence and a hand-rolled PR silently skips most of it — the tier-resolved quality gate, the PR body composed from `pr-template.md` with only the pertinent conditional sections, the story's classification tags copied onto the PR, ready-for-review, the `pr-state:*` label and the PR state flow, the PR-URL back-link on the story, and the story's board state moved to Review. If a PR already exists for the branch it is UPDATED, never duplicated.
3. Put everything a reviewer needs (rationale, decisions, ADR links) in the PR description — the reviewer cannot see the checkpoint.
4. **TEXT SHAPE (mandatory)**: a PR body is re-read by every reviewer and every fix round of the cycle, so its length is paid many times over — schematic, one decision per line, no narration of the diff, no preamble.
5. **ONE EXPECTED SIGNAL**: you are running INSIDE a subagent, so when the publish skill reaches its review-dispatch step it emits `Review: review-dispatch-required` instead of nesting a second subagent. That is CORRECT — the coordinator dispatches the independent review itself the moment you return. Do NOT dispatch or run a review yourself.

### Step 3: Persist

Write `.pair/working/runs/$run/$story/pr-phase.json` (`status`, `prNumber`, `url`, `head`).

## Output Format

`{ prNumber, url }`.

## Notes

- Never merge. Never open a second PR for the same story.
