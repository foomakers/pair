---
name: implement
description: "Implements a refined user story task-by-task, via a 5-step cycle per task (context, branch, implementation, quality, commit). At the closing phase it writes a checkpoint and publishes the PR through a handoff-only subagent (clean context), resuming from the checkpoint when re-invoked on an interrupted story. Composes /verify-quality, /record-decision, /checkpoint, /publish-pr."
version: 0.7.5
author: Foomakers
---

# /implement — Task Implementation

Implement a user story by processing its tasks sequentially. Each task follows a 5-step cycle: context → branch → implementation → quality → commit. The story-level process has 5 phases (0–4): analysis, setup, implementation, **closing (checkpoint + PR)**, and post-review merge. When all tasks are done the closing phase writes a checkpoint (the handoff artifact) and composes `/publish-pr` — inside a **handoff-only subagent** so the PR is always built on a guaranteed-clean context — to produce a single ready-for-review PR.

**Two AI macro-phases (R4.2):** refinement → implementation. The boundary artifact between them is a **checkpoint**: it is written at the closing phase and re-read at the opening phase so an interrupted story resumes exactly where it stopped, never repeating completed tasks.

**implement composes, it never re-does gate/PR logic.** The gate → PR → board sequence lives entirely in `/publish-pr`; this skill composes it (never re-implements PR creation). Task iteration and the checkpoint boundary are what `/implement` owns.

**One PR per story:** the story lands on ONE branch with ONE PR; subsequent work on the story (further tasks/features) updates that same PR, never a new one unless a human explicitly requests it.

## Process Profile

<!-- process-step: id=implement -->

Executable form of the **`implement`** step. A **direct** invocation while a step is disabled by the project's profile warns and asks for confirmation; a **composed** one never prompts — it degrades exactly as a step that is not installed. No section ⇒ no-op. See [process-profile gate](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md).

## Composed Skills

| Skill              | Type       | Required                                                                                            |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------- |
| `/verify-quality`  | Capability | Yes — invoked at quality validation phase                                                           |
| `/record-decision` | Capability | Yes — invoked when a decision needs recording                                                       |
| `/checkpoint`      | Capability | Yes — `$mode=resume` at the opening phase (resume probe), `$mode=write` at the closing phase (handoff artifact). If not installed, degrade to git+PM-tool resume (see Graceful Degradation). |
| `/publish-pr`      | Capability | Yes — the closing phase composes it (gate → PR → board) inside a handoff-only subagent. If not installed → **HALT** (implement never re-implements PR creation). |
| `/write-issue`     | Capability | Optional — the task-progress feedback writer ([task-progress-feedback.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md)): write mode for the tick (Step 2.8, composed with **`$on-failure: report`** so a tracker error returns an outcome instead of a propagating HALT), `$mode: comment` for the batched progress comment (Step 3.1b). If not installed, warn and continue **without** ticks or comment — missing feedback never blocks the story. |
| `/assess-stack`    | Capability | Optional — invoked when a new dependency is detected. If not installed, warn and continue.          |
| `/verify-adoption` | Capability | Optional — invoked before commit to check adoption compliance. If not installed, warn and continue. |

## Arguments

| Argument | Required | Description                                                                                                                                                                                                                             |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$story` | No       | Story ID to implement, supplied by the invocation (e.g. `/implement #256`). If omitted, detected from session context or the current branch (`feature/US-<id>-*`). This is the id the resume probe (Step 0.0) uses and the closing phase forwards to `/checkpoint` and `/publish-pr`. If it cannot be resolved when a checkpoint operation needs it → **HALT**. |
| `$gates` | No       | `none` = run no quality gate of this skill's own (Step 2.7 and the closing `/publish-pr`): the caller runs them. Default: run them. |
| `$assignee` | No | `<login>` or `@me` explicitly assigns that user at work start. `none` leaves assignment unchanged. Omit to claim the card as the authenticated runner. |
| `$boundary` | No | `published-pr` (also supplied as `Handoff: published-pr.`) returns the published PR, branch and current head to the caller. Omitted for the standalone lifecycle. |

## Phase 0: Story & Task Analysis (BLOCKING)

#### No implementation without complete understanding.

### Step 0.0: Resume Probe (checkpoint) — NEVER SKIP

The opening phase re-reads the checkpoint so an interrupted story resumes exactly where it stopped. This runs first, before loading the story, so completed tasks are never re-done.

1. **Check**: Is `/checkpoint` installed AND does a checkpoint exist for this story (`.pair/working/checkpoints/<story-id>.md`)?
2. **Skip**: If no checkpoint exists → this is a fresh start. Proceed to Step 0.1 (normal one-shot flow — no regression).
3. **Act**: Compose `/checkpoint $mode=resume` (pass `$story` — the story id from the invocation, see [Arguments](#arguments); if absent it is detected from the branch). Use the parsed state — branch, tasks done, key decisions, remaining todos — to skip re-analysis. After the checkpoint checks below, run Step 0.1b before entering the **first pending task** in Phase 2. Completed tasks stay complete.
4. **Act — edge cases** (resolve before continuing):
   - **Checkpoint exists but its branch is missing** (checkpoint says branch X, repo has none): **HALT** and report the divergence. Do not guess a branch.
   - **Stale checkpoint (story already Done)**: warn that the story is already Done and **require explicit developer confirmation** before reusing the checkpoint. Never silently resume a finished story.
   - **Corrupted/incomplete checkpoint**: `/checkpoint` reports what parsed and what is missing — confirm the gaps with the developer before proceeding (never guess).
5. **Verify**: Either a fresh start is confirmed, or a valid checkpoint is resumed with the first pending task identified. If `/checkpoint` is not installed, fall back to the git+PM-tool resume (Idempotent Re-invocation) and continue.

**Verified RED handoff.** If the checkpoint carries a valid TDD Handoff, confirm the story, current branch, task and test file match. Run Step 0.1b before resuming its active task at Step 2.3 in GREEN. Re-run the recorded command and confirm the recorded test ran. The expected failure authorizes GREEN on that task. A passing test means GREEN already landed in the worktree, so proceed to verification. If the evidence differs, stop and report the mismatch. Do not start another RED session for that task.

### Step 0.1: Load Story

1. **Check**: Is the user story already loaded in this session?
2. **Skip**: If yes, confirm story ID and move to Step 0.1b.
3. **Act**: Read the story from the PM tool — resolution: see [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).
   - Understand business value and acceptance criteria.
   - Confirm epic context.
4. **Verify**: Story is fully loaded. If not → **HALT**.

### Step 0.1b: Activate Story in PM Tool (NEVER SKIP)

1. **Assign before board writes**, even when the story is already `In Progress`. Use the installed `pair-workflow-cycle` skill's script from the story repository: `node "<cycle-skill-dir>"/scripts/workflow-facts.mjs assign-card <card>`.
   - Omit the JSON argument when `$assignee` is omitted to claim an unassigned card for the authenticated runner.
   - Pass the explicit `<login>` or `@me` as an override, for example `'{"assign":"@me"}'` as the last argument. The adapter posts a comment naming the previous owners when it takes over.
   - Pass `'{"assign":"none"}'` to leave the current assignment untouched.
2. **Read the assignment result**:
   - `assigned`: report the assignment confirmed by the adapter's read-back.
   - `unchanged`: continue without an assignment write.
   - `held`: warn with the returned `owners` and any `reason`. Halt before board, work, or git writes. For a structured or unattended handoff, return `{ status: "failed", reason: "card-held", summary }` with the owners named in `summary`.
   - `warning`: report the reason and continue without reporting a confirmed assignment. If the script is unavailable or gives no usable result, report that as an assignment warning and continue.
3. **Check the board**: If a read confirms membership and the `In Progress` macrostate, continue without a board write. Otherwise **set the board state to the `In Progress` macrostate**, in the order the item writer states once and this step applies unchanged — **membership, then a read that confirms it, then the state field** (`/write-issue` Step 7b): a state field cannot be written on an item the tracked view does not hold, and the add that puts it there can exit 0 having done nothing. Composing `/write-issue` is not the route for a state-only change — its write mode is a **full-body overwrite** and would replace the story's AC/DoD/task breakdown — so the invariant is applied here **by reference**, never re-derived.
4. **Verify**: Read the item to confirm `In Progress` and report **what the read observed**. The assignment result comes from item 2. If the PM tool is inaccessible, warn and continue.

### Step 0.2: Analyze Tasks

1. **Check**: Are all tasks in the story readable and complete?
2. **Act**: Read ALL tasks. For each task, validate it has:
   - Complete task information (ID, parent story, priority, status)
   - Implementation approach (technical design, files, dependencies)
   - Acceptance criteria (deliverable, quality standards, verification)
   - Development workflow (TDD approach if development task, implementation steps)
   - **Inline checklist shape (what `/plan-tasks` writes into the story body)**: a task that is only a checklist line `- [ ] **T-N**: <title>` is **complete** when the story's `## Task Breakdown` also carries the **AC Coverage** row(s) mapping it to ≥1 AC and the **Dependency Graph** places it. Its implementation approach, steps and verification are then **derived** from the story's Technical Analysis + the covered ACs and stated at Step 0.3 for confirmation — never a HALT. In an **autonomous/unattended run** (no human to confirm at Step 0.3) the derived approach is not silently adopted: it is recorded in the checkpoint and the PR body (under the task, marked `derived from Technical Analysis`) so the reviewer sees what was assumed. A task with a `### T-N` detailed block is validated against the fields above as before.
3. **Verify**: All tasks are complete (full template fields, or the inline checklist shape above). Only a task with **no AC mapping / no place in the graph**, or a detailed block with missing fields, is incomplete → **HALT** and propose specific task updates.

### Step 0.3: Confirm with Developer

Present analysis:

```text
IMPLEMENTATION STATE:
├── Story: [#ID: Title]
├── PM Status: [In Progress ✓ | ⚠️ Not updated — reason]
├── Tasks: [N total — list each with type and status]
├── Task Types: [Development: N, Documentation: N, Configuration: N]
├── Dependencies: [prerequisite stories and their status]
└── Ready: [Yes | No — reason]
```

Ask: _"Ready to proceed with implementation?"_

## Phase 1: Setup

### Step 1.1: Load Technical Context

1. **Check**: Are adoption files already loaded in this session?
2. **Skip**: If yes, move to Step 1.2.
3. **Act**: Read:
   - [architecture.md](../../../.pair/adoption/tech/architecture.md) — architectural patterns
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) — approved libraries and versions
   - [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — development process
   - [Design Rules](../../../.pair/knowledge/guidelines/code-design/design-principles/design-rules.md) — evidence-based do/don't patterns to avoid generating (constraints, not suggestions)
4. **Verify**: Technical context loaded. If adoption files missing, warn and proceed with guideline defaults.

### Step 1.2: Create or Switch to Feature Branch

1. **Check**: Does a branch for this story already exist? (`git branch --list 'feature/US-<story-id>-*'`)
2. **Skip**: If branch exists, switch to it (`git checkout <branch>`) and move to Step 1.3.
3. **Act**: Create the branch from the adopted base branch — resolved by the convention's **`base-branch` resolution** order (`## Git Workflow` → legacy `## Merge Strategy` → default `main`), never re-derived here, so this skill and `/publish-pr` (the other reader of the key) cannot disagree on the branch — on the **code host**: branches and PRs are code-host operations, story/state writes (Step 0.1b, Step 2.8) are PM-tool operations; see the [routing table + `base-branch` resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). Absent `code-host` ⇒ the same tool as the PM tool, so nothing changes for a single-tool project:

   ```bash
   # <base-branch> is the resolved adopted value, NOT a literal
   git checkout <base-branch> && git pull origin <base-branch>
   # name per branch-template.md: feature/US-<id>-<slug> (slug = first 6 words of the title, kebab-case) — never `#` (the SAFE_REF validators and adapter assertBranchName refuse it); the cycle derives the same name via `cycle-dispatch.mjs branch`
   git checkout -b feature/US-<story-id>-<brief-description>
   ```

4. **Verify**: On the correct feature branch.

### Step 1.3: Choose Commit Strategy

1. **Check**: Is this a single-task story?
2. **Skip**: If single task, set strategy to `commit-per-story` (one task = one commit). Move to Phase 2.
3. **Act**: Ask the developer:

   > **Commit strategy for this story:**
   > 1. **Commit per task** (recommended) — develop one task, ask dev, commit, update checkbox, next task. Single PR at end.
   > 2. **Commit per story** — develop all tasks continuously, ticking each checkbox as it completes, then ask dev, commit all, single PR.

4. **Verify**: Strategy is set. Apply consistently for the entire story.

## Phase 2: Task-by-Task Implementation

Process tasks **sequentially**, one at a time. For each task:

### Step 2.1: Select Next Task

1. **Check**: Scan all tasks in dependency order. Find the first task that is not yet completed.
   - A task is "completed" if its checklist item is marked ✅ in the story **AND the work it claims is still where this run can see it**: under `commit-per-task`, its commit exists on the branch; under `commit-per-story`, either the story's single commit exists (Step 3.1 already ran) **or** the working tree still carries that task's change. A ✅ with neither is **not** completion evidence — treat the task as **pending and re-attempt it** (re-ticking is a no-op: the patch never unticks).
   - **Why the `commit-per-story` half is load-bearing.** On that strategy Step 2.8 item 7 ticks _before_ any commit exists, so the tick can outrun the work: 4-task story, `commit-per-story` (Step 1.3 auto-selects it for every single-task story). T1–T3 complete ⇒ three `[x]` on the body and a current checkpoint; the run then HALTs on T4's red gate (Step 2.7) and the worktree is discarded. The next attempt starts from the branch head, which under this strategy carries **zero** commits. Trusting the ✅ alone, this step declares T1–T3 completed and never re-implements them, Step 3.1 commits a T4-only (or empty) tree, and Step 3.3 opens a PR missing three tasks' work over a body showing them done — "reports work that was not done and nothing later contradicts it", the failure [task-progress-feedback.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md) forbids for guess-ticks.
   - A task that **cannot be attempted this iteration** — an unmet dependency, an external blocker, work the developer defers or puts out of scope — is neither a HALT nor a failure: **queue it as `skipped`** with its one-line reason (the vocabulary is [task-progress-feedback.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md)'s), leave its checklist item unticked, and continue the scan to the next task. `failed` is for a task that was attempted and did not land: a deliberate deferral reported as `failed` misnames it, and one left silent shrinks the iteration's headline count without saying why.
   - **At most once per invocation.** This scan restarts from the top after every task (item 1 is re-entered from Step 2.8 item 9), so a task that cannot be attempted is reached again on every later pass: a task **already queued as `skipped` this invocation** is passed over **silently** — no second queue entry, no second line. Otherwise a 5-task story blocked on T3 queues it after T2 _and_ after T4, and the one comment carries six lines for five tasks — `Task progress — 4 done, 2 skipped of 5 tasks this iteration` — with T3 listed twice.
2. **Skip**: If no task remains that this iteration can attempt — all completed, or the rest queued as `skipped` — move to Phase 3.
3. **Act**: Set the active task. Update session state:

   ```text
   ACTIVE TASK:
   ├── Task: [T-N: Title]
   ├── Type: [Development | Documentation | Configuration | Research]
   ├── Mode: [TDD | Direct Implementation]
   └── Phase: [Starting]
   ```

### Step 2.2: Validate Task Completeness

1. **Check**: Does the active task have all required fields per the task template — or, for an inline checklist task (Step 0.2), its AC Coverage mapping, with the approach/steps derived from the story's Technical Analysis?
2. **Skip**: If complete, proceed to Step 2.3.
3. **Act**: If incomplete → **HALT**. Report missing fields and propose specific updates.

### Step 2.3: Execute Implementation

#### For Development Tasks (TDD Required):

Follow the TDD discipline rules strictly, and the [Design Rules](../../../.pair/knowledge/guidelines/code-design/design-principles/design-rules.md) loaded in Step 1.1 — do not generate a new instance of a known do/don't pattern (e.g. god module, static-only namespace class, optional-bag dispatch instead of a discriminated union).

#### TDD Discipline Rules:

1. **New features → add tests autonomously.** Write unit tests without asking.
2. **Changing an existing test's behavior contract → ask with evidence** when the approved story and adopted policy do not authorize the change. Preserve existing controls, and keep diagnostic expectations in sync with explicitly approved contract changes.
3. **No code+test changes in the same session.** When changing production code, do NOT modify tests until all existing tests pass. Separate RED, GREEN, and REFACTOR into distinct sessions:
   - **RED session**: Write or modify ONLY test code. Reproduce the expected failure for missing behavior and retain passing controls. If the behavior already works, verify it and continue without a GREEN phase for that behavior.
   - **GREEN session**: Write or modify ONLY implementation code. Write minimal code to make tests pass. No test code changes.
   - **REFACTOR session**: Improve structure without changing behavior. Both test and production code may be cleaned up. All tests must remain green.
4. **Every module file must have a corresponding unit test file.** 1:1 mapping between source modules and test files.
5. **Avoid mocks — prefer in-memory test doubles.** Use dependency injection with in-memory implementations (e.g., `InMemoryFileSystemService` instead of mocking `fs`).

**Before ending RED:** Run the regression test and confirm that it fails for the expected reason. Compose `/checkpoint $mode=write $task-map=true` with `$tdd-handoff` containing the active task ID, next phase GREEN, test file, exact command and observed failure. Leave the task pending. Verify the checkpoint was persisted, then continue through a fresh session below. If persistence fails, report the failure and return the checkpoint text for recovery.

**After GREEN:** Verify the recorded test passes. If more work needs a separate RED or REFACTOR session, clear the handoff with `/checkpoint $tdd-handoff=clear` and record the next phase, task and action in Remaining Todos. If the task is ready for verification and completion, continue at Step 2.4 and clear the handoff at Step 2.8.

**Fresh TDD sessions:** The caller of this skill coordinates the task and keeps the invocation open across phase boundaries. When the next phase must run in a fresh session, use the harness's fresh-session or subagent tool from this caller, with no inherited conversation. Pass only the story, worktree, checkpoint path and the requested phase. Direct the worker to run this skill's rules for that phase only, record the outcome and next action in the checkpoint, and return to the caller without starting another session. Wait for the worker, verify the checkpoint and its test evidence, then continue verification or launch the next phase in a sibling session. Use the same split when moving from a completed GREEN task to RED for the next task.

If the harness cannot launch a fresh session, preserve the checkpoint and report `fresh-session-unavailable` (structured `failed` where requested). Stop if the checkpoint and evidence fail to advance. Use `needs-human` only for a specific action or decision that the project requires a person to perform. A phase transition with a verified checkpoint is handled within this skill.

#### For Non-Development Tasks (Direct Implementation):

- **Documentation**: Implement directly following documentation standards.
- **Configuration**: Apply infrastructure guidelines.
- **Research**: Document findings and recommendations.

### Step 2.4: Check for New Dependencies

1. **Check**: Did the implementation introduce any new dependency not listed in [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md)?
2. **Skip**: If no new dependencies, move to Step 2.5.
3. **Act**: Is `/assess-stack` installed?
   - **Yes**: Compose `/assess-stack` to validate and register the dependency. If `/assess-stack` rejects (incompatible) → **HALT**.
   - **No**: Warn the developer:

     > New dependency detected: `[package@version]`. `/assess-stack` is not installed — please manually verify against the tech stack and update [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md).

4. **Verify**: Dependency is either validated by `/assess-stack` or acknowledged by developer.

### Step 2.5: Check for Decisions

1. **Check**: Did the implementation introduce any decision not covered by existing ADRs or ADLs?
2. **Skip**: If no new decisions needed, move to Step 2.6.
3. **Act**: Ask the developer if a decision record is needed. If yes, compose `/record-decision` with the appropriate `$type` (`architectural` or `non-architectural`) and `$topic`.
4. **Verify**: Decision recorded and adoption files updated.

### Step 2.6: Verify Adoption Compliance

1. **Check**: Is `/verify-adoption` installed?
2. **Skip**: If not installed, warn:

   > `/verify-adoption` is not installed — skipping adoption compliance check. Please manually verify code against adoption files.
   Move to Step 2.7.

3. **Act**: Compose `/verify-adoption` with `$scope` appropriate to the task.
   - Non-conformities reported → resolve via `/assess-stack` (tech-stack issues) or `/record-decision` (architectural gaps).
4. **Verify**: Adoption compliance confirmed or all non-conformities resolved.

### Step 2.7: Verify Quality

1. **Skip**: `$gates: none` — the caller runs the gates; go to the commit step.
2. **Act**: Compose `/verify-quality` with `$target: increment`, `$caller: implement` and `$scope` set to the packages the task touched — the gates of that target, never those of the pull request: they run once at closing, inside `/publish-pr` (Phase 1). Which command each target runs is the adoption's, never this skill's.
3. **Verify**: All quality gates pass. A failure caused by this card's work (the task's own code, or a test of a task not yet implemented) is yours to fix: continue the cycle until green, never a stop. **HALT** only when the cause lies outside the card. A red test of a pending task is the RED phase, not a failed gate.

### Step 2.8: Task Completion

1. **Check**: Is the commit strategy `commit-per-task`?
2. **Skip**: If `commit-per-story`, there is no inter-task confirmation and no commit here — but **still apply item 7 (tick and queue) and item 8** for the task just completed, then go to item 9. The tick-and-queue is not a property of the commit strategy: a 4-task `commit-per-story` story whose gate goes red on T3 (Step 2.7 → HALT) would otherwise queue only the failure, and the body would still show `- [ ] T1`, `- [ ] T2` over finished work — the state where "on task 3 of 4" and "failed on task 2" look identical, which is what this loop exists to end. Step 1.3 auto-selects this strategy for every single-task story, so it is the common path, not an exotic one. (The tick records the task's **work** as done, not a commit: on this strategy the single commit lands at Step 3.1. What the tick does **not** become is standalone completion evidence — Step 2.1 accepts a `commit-per-story` ✅ only while the commit or the working-tree change backs it, so a tick that survives a discarded worktree is re-attempted, not trusted.)
3. **Act**: Present the task summary. If the adopted commit policy or an explicit developer authorization permits this commit, go to item 5. Otherwise, ask the developer for confirmation:

   ```text
   TASK DONE:
   ├── Task:   T-N — [title]
   ├── Files:  [N added, N modified]
   └── Next:   T-N+1 — [title] (or "PR" if last task)
   ```

   Ask: _"Task T-N done. OK to commit or changes needed?"_

4. **Verify**: Developer confirms. If changes needed → apply changes, re-run quality (Step 2.7), ask again.
5. **Act**: Stage and commit following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)):

   ```text
   [#<story-id>] <type>: <task-description>

   - <specific changes>
   - Task: T-N — <task title>

   Refs: #<story-id>
   ```

6. **Verify**: Commit created.
7. **Act — tick and queue** (**every strategy** — item 2 routes `commit-per-story` through here too; the task-progress feedback loop, per [task-progress-feedback.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md); the mechanism is **not** restated here):
   - Locate the task's checklist item in the **Task Breakdown** section by its **task ID**, and tick it (`- [ ]` → `- [x]`) with the tick-only, diff-checked patch the guideline defines. Mark any **Definition of Done** checkbox now factually satisfied by this task's work (e.g., "SKILL.md created", "template validated") by the same rule — **one write per checkbox**, each with its own read and its own one-line diff check, never two boxes in one body; leave the ones needing reviewer confirmation (e.g., "Code reviewed and merged").
   - **Queue** the task's outcome line for this invocation's batched comment — `ticked`, or the outcome the guideline's vocabulary gives when the tick did not land. The queue is flushed once, at Step 3.1b.
   - **Never blocking**: a locator mismatch, a rejected patch or a failed write is queued and the run continues. A missing tick is a reporting defect, never a reason to stop implementing. The transport is held to it: the tick composes `/write-issue` write mode with **`$on-failure: report`**, so an unresolvable id, a tracker error and an unconfirmed board membership come back as `not-found` / `write-failed` / `membership-unconfirmed` (its Step 8b) instead of a **HALT that would propagate here** and end the story on the task it only annotates. `membership-unconfirmed` says nothing about the tick — the body write landed — so it goes in the batch's `<details>`, not on the task's outcome line.
8. **Act — persist progress**: If `/checkpoint` is installed, compose `/checkpoint $mode=write` to update `.pair/working/checkpoints/<story-id>.md` with the tasks now done. Pass `$tdd-handoff=clear` once the task named in that handoff is verified and complete. This keeps the checkpoint current so an interruption after this task resumes from the next pending one (Step 0.0). If `/checkpoint` is not installed, skip — git+PM state still supports the git-based resume.
9. **Check**: Is this the last task?
   - **Yes**: Move to Phase 3 (Closing: checkpoint + PR).
   - **No**: Return to Step 2.1.

## Phase 3: Closing — Checkpoint + Publish PR

The task cycle is done. The closing phase writes the checkpoint (handoff artifact) and composes `/publish-pr` inside a handoff-only subagent, so the PR is built on a guaranteed-clean context. implement never re-does the gate/PR/board logic here — it composes `/publish-pr` only.

### Step 3.1: Final Commit (if commit-per-story)

1. **Check**: Is the commit strategy `commit-per-story`?
2. **Skip**: If `commit-per-task`, all commits already exist. Move to **Step 3.1b** — the batch still has to be flushed; the recommended strategy is not the one that reports nothing.
3. **Act**: Present the summary. If the adopted commit policy or an explicit developer authorization permits this commit, go to item 5. Otherwise, ask the developer for confirmation:

   ```text
   ALL TASKS DONE:
   ├── Tasks:  [list all T-N with titles]
   ├── Files:  [N added, N modified]
   └── Action: Commit all changes
   ```

   Ask: _"All tasks done. Ready to commit or changes needed?"_

4. **Verify**: Developer confirms. If changes needed → apply changes, re-run quality, ask again.
5. **Act**: Stage all changes and commit:

   ```text
   [#<story-id>] feat: <story-description>

   - <summary of all completed tasks>
   - Tasks: T-1, T-2, ..., T-N

   Refs: #<story-id>
   ```

6. **Verify**: Commit created with all changes.
7. **Act — tick and queue (catch-up only)**: every task completed **in this invocation** was already ticked and queued at Step 2.8 item 7, on either strategy. Apply that item here only to a task completed **in this invocation** that did not reach it (an interrupted pass) — same locator, same tick-only patch, same queued outcome line. A task this invocation never attempted — already `[x]` from an earlier one — is **neither re-written nor queued**: a re-invocation that found everything done must reach Step 3.1b with an empty queue and post nothing, instead of accreting one identical progress comment per attempt. Leave Definition-of-Done boxes that require reviewer confirmation unchecked.

### Step 3.1b: Flush the Task-Progress Comment

The batch queued across this invocation is posted **exactly once**, here, before the hand-off — so the story carries its progress narrative whether or not the PR pipeline that follows succeeds.

1. **Check**: Is the queue empty — nothing queued this invocation, or **already flushed** by an earlier pass through this step? If so, post nothing and move to Step 3.2: an empty batch never becomes a "nothing to report" comment, and a flushed one never becomes a second comment.
2. **Act**: Render the batch in the D22 shape [task-progress-feedback.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/task-progress-feedback.md) defines (headline, one line per task, everything longer collapsed in `<details>`) and post it with `/write-issue` `$mode: comment`, `$id` = the story id. One comment per run iteration — never a second one, whatever the batch holds.
3. **Act — degradation**: `/write-issue` not installed, or the comment warns instead of posting ⇒ report the queued lines in this skill's own output and continue. The PR is not held for a comment.
4. **Act — drain**: Whatever the outcome (posted, or degraded to this skill's output), the queue is now **empty and marked flushed for this invocation**. A later HALT reports its blocker without re-posting the batch it already sent.
5. **Verify**: Either the comment is confirmed by a read of the item's comments, or the warning plus the queued lines were surfaced. In both cases the story body, labels and board state are unchanged by this step.

### Step 3.2: Write the Checkpoint (handoff artifact)

The checkpoint is the boundary artifact (R4.2) and the **input contract for `/publish-pr`** — the handoff document the subagent runs on.

1. **Act**: Compose `/checkpoint $mode=write` (pass `$story`). This creates/updates `.pair/working/checkpoints/<story-id>.md` with the five sections: story, branch, tasks done, key decisions, remaining todos.
2. **Verify**: The checkpoint file exists and captures the completed story state (all tasks done, branch, decisions). This file — not this session's memory — is what the PR is built from.
3. **Act — if `/checkpoint` is not installed**: synthesize the handoff inline (branch, tasks done, decisions, ACs) and pass it directly to `/publish-pr` as `$handoff`; note the absence in the output.

### Step 3.3: Publish the PR via a Handoff-Only Subagent

The PR is produced on a **guaranteed-clean context**: a fresh subagent whose entire prompt is the handoff, nothing from this session. This is mechanical isolation (D23) — an **anonymous** subagent, **no named role**. A skill cannot `/clear` its own context (D7), so the reset is achieved by delegating to a subagent.

For `published-pr`, pass `$boundary=published-pr` to the publisher on both paths, including every publication retry. After verified publication, return the PR, branch and pushed head before dispatching review. The workflow selects the subsequent step.

1. **Check**: Is subagent spawning available in this tool/environment?
2. **Act — primary path (subagent)**: Spawn an **anonymous subagent** whose prompt is the **handoff document only** — the checkpoint contents (or the path `.pair/working/checkpoints/<story-id>.md`) plus a single instruction: run `/publish-pr $story=<story-id> $handoff=.pair/working/checkpoints/<story-id>.md`. Pass **no other session context** — the subagent's context is the handoff and nothing else (clean context / fresh context reset within one execution, R4.1). The subagent runs `/publish-pr` (gate → PR → tags → ready-for-review → board) and returns the PR number/URL and board result.
3. **Act — degraded inline path**: If subagent spawning is **unavailable** (tool/environment cannot spawn one — subagent spawning unavailable), do NOT skip the split: the checkpoint is already written (Step 3.2), then compose `/publish-pr` **inline** in the current session (`$story`, `$handoff` = the checkpoint). **Note the degradation in the output** (`Context: degraded — inline publish, no subagent reset`). Behavior is otherwise equivalent to the primary path.
4. **Act — dispatch the review (this session is the actor)**: `/publish-pr` Phase 5 registers the `pair-review` check as **pending** (merge blocked from t0) but cannot spawn the review subagent from inside the handoff subagent — nested dispatch is commonly forbidden — so it returns **`Review: review-dispatch-required — /review $pr=<n>`**. When that signal comes back, **this top-level session** spawns the anonymous review subagent (a sibling of the publish subagent, not a nested one), prompt = the PR reference plus the bounded instruction:

   ```text
   Run /review $pr=<number> $dispatched=true.
   Phases 1–5 only: verdict, `pair-review` check, PR-state synthesis.
   NEVER run Phase 6 and NEVER merge, whatever the verdict — the merge is a human act.
   ```

   Pass no authoring context (D23 isolation: the reviewer must not inherit the author's assumptions). If `/publish-pr` returns `Review: dispatched` instead (it ran at top level), there is nothing to do here. If this session cannot spawn the reviewer either, record `Review: pending — dispatch unavailable, run /review <pr> in a fresh session`: the merge stays blocked, so the review is deferred, never skipped.
5. **Act — recover a publication failure**: Collect the failed command and actionable diagnostics from `/publish-pr`. If the branch causes the failure and the repair is within the approved story, correct it using Steps 2.3–2.8 as applicable. Verify the failing check, commit the repair under the adopted commit policy, and refresh the checkpoint with the new evidence. Reinvoke the same publisher in this invocation to rerun the full gate. Continue while each repair resolves a reported failure. Stop with the failed command and evidence if the attempt makes no progress or the blocker is outside the story. Return `needs-human` only for an action or decision that requires a person. Keep the checkpoint usable for any later resume.
6. **Verify**: A single ready-for-review PR exists (created or updated), its number/URL is captured for the output, and the review is either dispatched or explicitly recorded as deferred. The publisher owns all PR writes. Its gate must pass before publication, and a retry updates an existing PR in place.

Note: the checkpoint is **not** removed here — it must survive the review/fix loop so a re-review or fix round can resume from it. Cleanup happens at merge (Phase 4).

## Phase 4: Post-Review Merge

This phase belongs to standalone invocations. A `published-pr` invocation ends at the verified publication handoff.

After code review approval (typically via `/pair-process-review`), re-invoke `/implement` to merge and close — see [post-review-merge.md](post-review-merge.md) for the merge-precondition, merge-commit, merge, parent-cascade, and checkpoint-cleanup steps (Steps 4.1–4.5) plus the completion output.

This is one of the flow's **two** merge paths (the other is `/pair-process-review` Phase 6), and both carry the **same** blocking precondition: the PR-state synthesis must be `ready-to-merge` (`merge_allowed` from [`pr-state.sh`](../../../.pair/knowledge/assets/pr-state.sh)), re-evaluated on the current head — an approving review alone is not the condition. See [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md).

On story completion (Done, at merge), the checkpoint is no longer needed — `post-review-merge.md` Step 4.5 removes `.pair/working/checkpoints/<story-id>.md` so finished-story state never lingers (checkpoint lifecycle: written at the closing phase, cleaned up at merge).

## Output Format

At the closing phase (Phase 3):

```text
IMPLEMENTATION COMPLETE:
├── Story:      [#ID: Title]
├── Branch:     [feature/US-ID-description]
├── Strategy:   [commit-per-task | commit-per-story]
├── Tasks:      [N/N completed]
├── Commits:    [N commits on branch]
├── Progress:   [N ticked, N failed/skipped — 1 comment posted | queue empty, no comment | comment warned — lines below]
├── Checkpoint: [.pair/working/checkpoints/<id>.md — written]
├── Context:    [clean — subagent handoff-only | degraded — inline publish, no subagent reset]
├── PR:         [#PR-number — URL — Created | Updated (from /publish-pr)]
├── Review:     [dispatched — subagent (clean context) | pending — dispatch unavailable, run /review <pr>]
└── Quality:    [All gates passing]
```

At merge (Phase 4): see [post-review-merge.md](post-review-merge.md).

## HALT Conditions

Implementation stops immediately when:

- **Checkpoint/branch divergence** (Step 0.0) — checkpoint names a branch the repo does not have; report and stop, do not guess a branch
- **Story not loaded or incomplete** (Phase 0)
- **Card held by someone else** (Step 0.1b) — report owners and stop before writes. The task-progress batch is still empty.
- **Task specifications incomplete** (Step 2.2)
- **Quality gate failure** (Step 2.7) — only when the cause lies outside the card; otherwise fix it and continue
- **New dependency rejected by /assess-stack** (Step 2.4)
- **Commit template not found** (Step 2.8 / Step 3.1) — cannot commit without template
- **`/publish-pr` not installed** (Step 3.3) — implement composes the PR sequence, never re-implements it
- **Quality gate red inside `/publish-pr`** (Step 3.3) — propagates as implement's HALT; no PR side effects (the PR-template-not-found and gate HALTs live in `/publish-pr`)
- **PR state is not `ready-to-merge`** (Step 4.1) — `merge_allowed` fails: red gate, review not approved/still pending, or 🔴 without an explicit non-author human approval on the current head. Never bypass a required check to merge

On HALT: **flush the task-progress batch first — unless Step 3.1b already flushed it this invocation** (Step 3.1b's rendering, posting and drain rules, unchanged — the run that stopped is the one with the most to report, and a flush reached only on the success path would leave exactly the failed iteration silent; but the Step 3.3 HALTs fire _after_ Step 3.1b has posted, and re-flushing there is the second comment per iteration the guideline forbids), then report the blocker clearly. A HALT after the flush therefore leaves the item's comment reading all-✅ with **nothing on it saying no PR was produced** — by design, not by omission: the batch is a per-task narrative and the run's outcome belongs to the PR's own state and to this skill's output block (see the guideline's batching rules). Do not append a run-outcome comment to compensate, propose resolution, wait for developer. The failing task is queued as `failed` with its reason, so its checklist item stays unticked.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invoking `/implement` on a partially completed story is safe and expected — per-step:

1. **Checkpoint**: the opening-phase resume probe (Step 0.0) reads the checkpoint and runs Step 0.1b before the first pending task — never repeating completed tasks. When `/checkpoint` is absent, the git+PM resume below applies.
2. **Branch**: detects existing branch, switches to it.
3. **Commit strategy**: if commits already exist on branch, infer strategy from history.
4. **Tasks**: scans task checklist and git log to identify completed tasks, and does **not re-run them** — this is **not the `skipped` outcome** (Step 2.1): a task an earlier invocation completed is neither re-written nor queued, so a re-invocation that finds everything done reaches Step 3.1b with an empty queue and posts nothing.
5. **PR**: the closing phase re-composes `/publish-pr`, which detects an existing PR and updates it in place — never a duplicate. A subagent that failed mid-PR is recovered this way (the checkpoint stays valid, the rerun is idempotent).
6. **Quality gates**: re-runs all gates (fast if already passing).
7. **Merge**: With `published-pr` and a completed implementation, verify the existing PR and return its PR number, branch and current head even when it is `ready-to-merge`. With the standalone boundary, if a PR exists and its state synthesizes to `ready-to-merge`, proceed to Phase 4 (merge). If all implementation tasks are complete and the PR is published but review is pending or requests changes, implementation is complete: return the PR, branch and current head; do not enter Phase 4. Review and remediation remain separate work. For other unmet merge conditions, Phase 4's Step 4.1 HALTs with the unmet condition.

The skill resumes from the first incomplete step — never re-does completed work.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (PM tool not accessible → ask the developer directly; adoption file missing → proceed with guideline defaults) for the standard scenarios. Additional cases:

- **Subagent spawning unavailable**: take the degraded inline path (Step 3.3) — checkpoint still written, `/publish-pr` composed inline, degradation noted in the output. Never skip the checkpoint/PR split. The review dispatch degrades the same way: `pair-review` stays pending (merge blocked) and the re-run instruction is recorded, never an inline self-review.
- **`/checkpoint` not installed**: skip the resume probe and the write step; resume from git+PM state (Idempotent Re-invocation) and synthesize the handoff inline for `/publish-pr`.
- **`/publish-pr` not installed**: **HALT** — implement composes the gate/PR/board sequence, it never re-implements it. Report the missing dependency.
- **`/assess-stack` not installed**: Warn on new dependency, continue without validation.
- **`/verify-adoption` not installed**: Warn, skip adoption compliance check.
- **No quality gate command**: Fall back to individual checks (lint, test, type check).

## Notes

- This skill **modifies files and creates git artifacts** (branches, commits) and **writes the checkpoint**. The PR itself is created/updated by the composed `/publish-pr` (in the subagent, or inline when degraded) — implement never re-implements PR creation.
- The **subagent's prompt is the handoff only** — the checkpoint, nothing from this session. Anonymous, no named role (mechanical isolation, D23); a skill cannot `/clear` its own context (D7), so the subagent provides the clean-context reset.
- Task iteration is sequential — each task completes its full cycle before the next begins.
- The developer can stop between tasks; re-invoke to resume — the opening-phase resume probe (Step 0.0) reads the checkpoint (see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md)).
- Single PR per story regardless of commit strategy.
- **Squash happens at merge** (Phase 4), not before PR creation. Individual commits are preserved on the branch during review.
