---
name: implement-phase
description: "Phase A of the delivery workflow: implements one refined story inside its own persistent worktree — creates or reuses the worktree on the declared base (stacked stories included), follows the project's implement process test-first, verifies the tier-resolved quality gate, records decisions, and writes the story checkpoint so a fresh instance can open the PR with zero prior context. Never opens the PR, never reviews, never merges. Dispatched by the batch engine (pair-implement-batch)."
version: 0.1.0
author: Foomakers
---

# /implement-phase — Build the Story, Stop Before the PR

Turn one refined story into verified commits plus a checkpoint. The PR, the review and the fixes are other phases with other actors; this phase only builds.

## Arguments

| Argument          | Required | Description                                                                                                            |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `$run`            | Yes      | Run id. Handoffs go under `.pair/working/runs/$run/$story/` in the MAIN checkout the coordinator was started in (the working directory the coordinator was started in, before any `cd`) — never inside a story or review worktree, which may be pruned. |
| `$story`          | Yes      | Story id (issue ref).                                                                                                  |
| `$title`          | Yes      | Story title.                                                                                                           |
| `$branch`         | Yes      | Story branch. ONE branch, ONE PR per story.                                                                            |
| `$worktree`       | Yes      | The persistent authoring worktree path (`<worktreeRoot>/<story>`).                                                     |
| `$base`           | Yes      | The ref the branch is cut from: the configured base (`origin/main`) or, for a STACKED story, another story's branch.    |
| `$stacked`        | Yes      | `true` when `$base` is another story's branch.                                                                         |
| `$implementSkill` | Yes      | The project's implement process skill (default `/implement`).                                                          |
| `$verifyQuality`  | Yes      | The tier-resolved quality-gate skill (default `/verify-quality`).                                                       |
| `$recordDecision` | Yes      | The decision-recording skill (default `/record-decision`).                                                             |
| `$checkpoint`     | Yes      | The checkpoint skill (default `/checkpoint`).                                                                          |
| `$notes`          | No       | Scope directive from the card; it overrides the issue body where they conflict.                                        |

## Algorithm

### Step 1: Isolation (mandatory)

Do ALL git and file work inside `$worktree` — create or reuse it: `git worktree add $worktree -B $branch $base` on first setup, or `git worktree add $worktree $branch` if the branch already has commits; if the path already exists, just `cd` into it. NEVER modify the repository's main working tree and NEVER switch its branch. With `$stacked=true`: `$base` is another story's branch — its commits are already in your history and must NOT be reverted, duplicated or re-implemented; only ADD your own work on top.

### Step 2: Implement, test-first

1. Follow `$implementSkill` as the process of record — its task cycle, its TDD discipline, the task/commit templates. `$notes`, when present, is a SCOPE DIRECTIVE that overrides the issue body where they conflict.
2. **Finite-state completeness** (mandatory when the change parses, selects, snapshots or branches on a finite protocol/state domain): identify the authoritative grammar or producer, make the complete decision table of supported states and invalid/boundary cases, then write and run a real test for every row before editing the canonical source. Do not implement one newly discovered row at a time and wait for review to name the next ordinary variant.
3. **Empirical evidence**: before asserting a measured or factual claim in source comments, test names, ADR/ADL, PR body or a diagnostic, record claim | authoritative oracle | exact command/fixture/revision | observed output; absent evidence, remove or qualify the claim. **Interaction/collision completeness**: after individual decision-table rows, add the minimal cross-product rows wherever one rule's output can be another's input, and test the actual collision resolver. **Lossless diagnostics**: an error that reports user input keeps actual, expected and candidate values distinguishable. **Authoritative boundary proof**: an external command, format or runtime claim is proven at its real producer/consumer in an isolated probe — a unit test of the changed function cannot establish external semantics.
4. Commit only the files you changed — stage explicit paths, never `git add -A`. Commit after every task: an uncommitted worktree loses everything if the supervisor kills the agent.
5. Never run a single command that can stay silent for more than ~2 minutes (a cold full-repo gate qualifies): scope it, and narrate between steps.

### Step 3: Verify and record

1. Verify the gates with `$verifyQuality`: it resolves the story's `risk:*` tier and runs exactly the checks CI would run for that tier — do not improvise a gate command and do not run the whole monorepo.
2. Record any architectural or project decision with `$recordDecision`, never only in a commit message.

### Step 4: Checkpoint and persist

1. Write the story checkpoint via `$checkpoint $mode=write` (it lives in the worktree) so a fresh instance can open the PR with zero prior context.
2. Write `.pair/working/runs/$run/$story/implement-phase.json` (`status`, `branch`, `outputHead`, `tasks`, `gatesPassed`, `checkpointPath`).

## Output Format

`{ gatesPassed, branch, checkpointPath, summary }`.

## Notes

- Do NOT open the PR. Do NOT review. Do NOT merge.
- Read nothing under `.pair/working/` except the checkpoint and the run directory.
