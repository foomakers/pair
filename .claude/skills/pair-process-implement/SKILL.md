---
name: pair-process-implement
description: "Implements a user story by iterating through its tasks one at a time, following a structured 5-step cycle per task. Composes /pair-capability-verify-quality and /pair-capability-record-decision. Reads adoption files for project-specific decisions. Creates a PR at story completion."
---

# /pair-process-implement — Task Implementation

Implement a user story by processing its tasks sequentially. Each task follows a 5-step cycle: context → branch → implementation → quality → commit. The story-level process has 5 phases (0–4): analysis, setup, implementation, PR creation, and post-review merge. Creates a single PR when all tasks are done.

## Composed Skills

| Skill              | Type       | Required                                                                                            |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------- |
| `/pair-capability-verify-quality`  | Capability | Yes — invoked at quality validation phase                                                           |
| `/pair-capability-record-decision` | Capability | Yes — invoked when a decision needs recording                                                       |
| `/pair-capability-assess-stack`    | Capability | Optional — invoked when a new dependency is detected. If not installed, warn and continue.          |
| `/verify-adoption` | Capability | Optional — invoked before commit to check adoption compliance. If not installed, warn and continue. |

## Phase 0: Story & Task Analysis (BLOCKING)

#### No implementation without complete understanding.

### Step 0.1: Load Story

1. **Check**: Is the user story already loaded in this session?
2. **Skip**: If yes, confirm story ID and move to Step 0.2.
3. **Act**: Read the story from the PM tool (per [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)).
   - Understand business value and acceptance criteria.
   - Confirm epic context.
4. **Act**: Ensure the story is assigned and active in the PM tool:
   - **Assign** the story to the current developer (if not already assigned).
   - **Set status to "In Progress"** in the PM tool board/project.
5. **Verify**: Story is fully loaded, assigned, and In Progress. If not → **HALT**.

### Step 0.2: Analyze Tasks

1. **Check**: Are all tasks in the story readable and complete?
2. **Act**: Read ALL tasks. For each task, validate it has:
   - Complete task information (ID, parent story, priority, status)
   - Implementation approach (technical design, files, dependencies)
   - Acceptance criteria (deliverable, quality standards, verification)
   - Development workflow (TDD approach if development task, implementation steps)
3. **Verify**: All tasks are complete and follow the task template. If any task is incomplete → **HALT** and propose specific task updates.

### Step 0.3: Confirm with Developer

Present analysis:

```text
IMPLEMENTATION STATE:
├── Story: [#ID: Title]
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
4. **Verify**: Technical context loaded. If adoption files missing, warn and proceed with guideline defaults.

### Step 1.2: Create or Switch to Feature Branch

1. **Check**: Does a branch for this story already exist? (`git branch --list 'feature/#<story-id>-*'`)
2. **Skip**: If branch exists, switch to it (`git checkout <branch>`) and move to Step 1.3.
3. **Act**: Create branch from main:

   ```bash
   git checkout main && git pull origin main
   git checkout -b feature/#<story-id>-<brief-description>
   ```

4. **Verify**: On the correct feature branch.

### Step 1.3: Choose Commit Strategy

1. **Check**: Is this a single-task story?
2. **Skip**: If single task, set strategy to `commit-per-story` (one task = one commit). Move to Phase 2.
3. **Act**: Ask the developer:

   > **Commit strategy for this story:**
   > 1. **Commit per task** (recommended) — develop one task, ask dev, commit, update checkbox, next task. Single PR at end.
   > 2. **Commit per story** — develop all tasks continuously, then ask dev, commit all, update all checkboxes, single PR.

4. **Verify**: Strategy is set. Apply consistently for the entire story.

## Phase 2: Task-by-Task Implementation

Process tasks **sequentially**, one at a time. For each task:

### Step 2.1: Select Next Task

1. **Check**: Scan all tasks in dependency order. Find the first task that is not yet completed.
   - A task is "completed" if its checklist item is marked ✅ in the story AND (if commit-per-task) the commit exists on the branch.
2. **Skip**: If all tasks are completed, move to Phase 3.
3. **Act**: Set the active task. Update session state:

   ```text
   ACTIVE TASK:
   ├── Task: [T-N: Title]
   ├── Type: [Development | Documentation | Configuration | Research]
   ├── Mode: [TDD | Direct Implementation]
   └── Phase: [Starting]
   ```

### Step 2.2: Validate Task Completeness

1. **Check**: Does the active task have all required fields per the task template?
2. **Skip**: If complete, proceed to Step 2.3.
3. **Act**: If incomplete → **HALT**. Report missing fields and propose specific updates.

### Step 2.3: Execute Implementation

#### For Development Tasks (TDD Required):

Follow the TDD discipline rules strictly:

#### TDD Discipline Rules:

1. **New features → add tests autonomously.** Write unit tests without asking. Every new module file MUST have a corresponding unit test file (1:1 mapping).
2. **Modifying existing tests → ask developer with evidence.** Show what changes and why, get approval before modifying any existing test.
3. **No code+test changes in the same session.** When changing production code, do NOT modify tests until all existing tests pass. Separate RED, GREEN, and REFACTOR into distinct sessions:
   - **RED session**: Write or modify ONLY test code. Tests MUST fail. No implementation code changes.
   - **GREEN session**: Write or modify ONLY implementation code. Write minimal code to make tests pass. No test code changes.
   - **REFACTOR session**: Improve structure without changing behavior. Both test and production code may be cleaned up. All tests must remain green.
4. **Every module file must have a corresponding unit test file.** 1:1 mapping between source modules and test files.
5. **Avoid mocks — prefer in-memory test doubles.** Use dependency injection with in-memory implementations (e.g., `InMemoryFileSystemService` instead of mocking `fs`).

#### For Non-Development Tasks (Direct Implementation):

- **Documentation**: Implement directly following documentation standards.
- **Configuration**: Apply infrastructure guidelines.
- **Research**: Document findings and recommendations.

### Step 2.4: Check for New Dependencies

1. **Check**: Did the implementation introduce any new dependency not listed in [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md)?
2. **Skip**: If no new dependencies, move to Step 2.5.
3. **Act**: Is `/pair-capability-assess-stack` installed?
   - **Yes**: Compose `/pair-capability-assess-stack` to validate and register the dependency. If `/pair-capability-assess-stack` rejects (incompatible) → **HALT**.
   - **No**: Warn the developer:

     > New dependency detected: `[package@version]`. `/pair-capability-assess-stack` is not installed — please manually verify against the tech stack and update [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md).

4. **Verify**: Dependency is either validated by `/pair-capability-assess-stack` or acknowledged by developer.

### Step 2.5: Check for Decisions

1. **Check**: Did the implementation introduce any decision not covered by existing ADRs or ADLs?
2. **Skip**: If no new decisions needed, move to Step 2.6.
3. **Act**: Ask the developer if a decision record is needed. If yes, compose `/pair-capability-record-decision` with the appropriate `$type` (`architectural` or `non-architectural`) and `$topic`.
4. **Verify**: Decision recorded and adoption files updated.

### Step 2.6: Verify Adoption Compliance

1. **Check**: Is `/verify-adoption` installed?
2. **Skip**: If not installed, warn:

   > `/verify-adoption` is not installed — skipping adoption compliance check. Please manually verify code against adoption files.
   Move to Step 2.7.

3. **Act**: Compose `/verify-adoption` with `$scope` appropriate to the task.
   - Non-conformities reported → resolve via `/pair-capability-assess-stack` (tech-stack issues) or `/pair-capability-record-decision` (architectural gaps).
4. **Verify**: Adoption compliance confirmed or all non-conformities resolved.

### Step 2.7: Verify Quality

1. **Act**: Compose `/pair-capability-verify-quality` with `$scope = all`.
2. **Verify**: All quality gates pass. If any gate fails → **HALT**. Developer must fix before proceeding.

### Step 2.8: Task Completion

1. **Check**: Is the commit strategy `commit-per-task`?
2. **Skip**: If `commit-per-story`, continue to next task — return to Step 2.1. No inter-task confirmation.
3. **Act** (BLOCKING): Present task summary and **ask developer for confirmation BEFORE committing**:

   ```text
   TASK DONE:
   ├── Task:   T-N — [title]
   ├── Files:  [N added, N modified]
   └── Next:   T-N+1 — [title] (or "PR" if last task)
   ```

   Ask: _"Task T-N done. OK to commit or changes needed?"_

   **This confirmation is required for EVERY task.** The purpose of commit-per-task is precisely to give the developer a checkpoint between tasks.

4. **Verify**: Developer confirms. If changes needed → apply changes, re-run quality (Step 2.7), ask again.
5. **Act**: Stage and commit following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md):

   ```text
   [#<story-id>] <type>: <task-description>

   - <specific changes>
   - Task: T-N — <task title>

   Refs: #<story-id>
   ```

6. **Verify**: Commit created.
7. **Act**: Update the PM tool story issue body:
   - Mark the completed task checkbox (`- [x] **T-N**`) in the **Task Breakdown** section.
   - Mark any **Definition of Done** checkboxes that are now factually satisfied by this task's work (e.g., "SKILL.md created", "template validated"). Leave unchecked items that require reviewer confirmation (e.g., "Code reviewed and merged").
8. **Check**: Is this the last task?
   - **Yes**: Move to Phase 3 (PR).
   - **No**: Return to Step 2.1.

## Phase 3: Commit (if per-story), Push & PR

### Step 3.1: Final Commit (if commit-per-story)

1. **Check**: Is the commit strategy `commit-per-story`?
2. **Skip**: If `commit-per-task`, all commits already exist. Move to Step 3.2.
3. **Act** (BLOCKING): Present summary and **ask developer for confirmation BEFORE committing**:

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
7. **Act**: Update the PM tool story issue body:
   - Mark ALL task checkboxes (`- [x] **T-N**`) in the **Task Breakdown** section.
   - Mark all **Definition of Done** checkboxes that are factually satisfied by the implementation. Leave unchecked items that require reviewer confirmation (e.g., "Code reviewed and merged").

### Step 3.2: Push Branch

1. **Check**: Is the branch already pushed and up to date with remote?
2. **Skip**: If up to date, move to Step 3.3.
3. **Act**: Push the branch:

   ```bash
   git push -u origin feature/#<story-id>-<description>
   ```

4. **Verify**: Branch pushed to remote.

### Step 3.3: Confirm PR with Developer

1. **Act**: Present a summary before creating the PR:

   ```text
   PR READY:
   ├── Branch:  [feature/#story-id-description]
   ├── Tasks:   [N/N completed]
   ├── Commits: [N commits on branch]
   ├── Quality: [All gates passing]
   └── Title:   [#<story-id>] <type>: <brief description>
   ```

2. **Ask**: _"Ready to create the PR?"_
3. **Verify**: Developer confirms. If not → wait for developer instructions.

### Step 3.4: Create or Update PR

1. **Check**: Does a PR already exist for this branch?
2. **Skip**: If PR exists, update its description and move to output.
3. **Act**: Read the [PR template](../../../.pair/knowledge/guidelines/collaboration/templates/pr-template.md) and fill ALL its sections:
   - **Title**: `[#<story-id>] <type>: <brief description>`
   - **Body**: Use the PR template structure exactly. Fill each section:
     - **Summary** (What Changed + Why): from story statement and implementation
     - **Story Context**: link to user story issue, list AC coverage
     - **Changes Made**: list all completed tasks, files added/modified/deleted
     - **Testing**: test coverage, quality gate results (from /pair-capability-verify-quality output)
   - Omit template sections that do not apply (e.g., Database Changes, API Changes for KB-only PRs) — do not leave unfilled placeholders.
   - **Link**: Reference the user story issue (`Closes #<story-id>`)
   - **Labels**: Apply appropriate labels
4. **Act**: Mark the PR as **ready for review** — ensure it is not in draft state. If the PM tool supports review request (e.g., GitHub `gh pr ready`), mark it explicitly.
5. **Verify**: PR created, description follows template, PR is ready for review.

## Phase 4: Post-Review Merge

After code review approval (typically via `/pair-process-review`), re-invoke `/pair-process-implement` to merge and close.

### Step 4.1: Verify Review Approval

1. **Check**: Is the PR approved by the reviewer?
2. **Skip**: If not approved → **HALT**. Wait for review completion.
3. **Verify**: PR has at least one approval.

### Step 4.2: Prepare Merge Commit Message

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) for merge strategy (squash, merge, rebase).
2. **Act**: Draft the final commit message:
   - **If squash**: combine all commits into a single message following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md).
   - **If merge or rebase**: use the default merge/rebase message.
3. **Act** (BLOCKING): Present the commit message to the developer for confirmation:

   > **Merge commit message:**
   >
   > ```text
   > [#<story-id>] feat: <story description>
   >
   > - <summary of changes>
   > - Tasks: T-1, T-2, ..., T-N
   >
   > Refs: #<story-id>
   > ```
   >
   > Confirm or edit?

4. **Verify**: Developer confirms the commit message.

### Step 4.3: Merge PR

1. **Act**: Merge the PR with the confirmed commit message and the configured merge strategy.
2. **Verify**: PR merged and closed.

### Step 4.4: Update Story & Parents

1. **Act**: Update user story status to "Done" in the PM tool.
2. **Act**: Check parent epic — if ALL stories in the epic are Done, update epic status to "Done".
3. **Act**: Check parent initiative — if ALL epics in the initiative are Done, update initiative status to "Done".
4. **Verify**: Story and parent hierarchy updated recursively.

## Output Format

At PR creation (Phase 3):

```text
IMPLEMENTATION COMPLETE:
├── Story:    [#ID: Title]
├── Branch:   [feature/#ID-description]
├── Strategy: [commit-per-task | commit-per-story]
├── Tasks:    [N/N completed]
├── Commits:  [N commits on branch]
├── PR:       [#PR-number — URL]
└── Quality:  [All gates passing]
```

At merge (Phase 4):

```text
STORY DONE:
├── Story:      [#ID: Title]
├── PR:         [#PR-number — merged]
├── Merge:      [squash | merge | rebase]
├── Story:      Done
├── Epic:       [#ID — Done | In Progress (X/Y stories done)]
└── Initiative: [#ID — Done | In Progress (X/Y epics done)]
```

## HALT Conditions

Implementation stops immediately when:

- **Story not loaded or incomplete** (Phase 0)
- **Task specifications incomplete** (Step 2.2)
- **Quality gate failure** (Step 2.7) — developer must fix
- **New dependency rejected by /assess-stack** (Step 2.4)
- **PR template not found** (Step 3.4) — cannot create PR without template
- **Commit template not found** (Step 2.8 / Step 3.1) — cannot commit without template
- **PR not approved** (Step 4.1) — cannot merge without review approval

On HALT: report the blocker clearly, propose resolution, wait for developer.

## Idempotent Re-invocation

Re-invoking `/pair-process-implement` on a partially completed story is safe and expected:

1. **Branch**: detects existing branch, switches to it.
2. **Commit strategy**: if commits already exist on branch, infer strategy from history.
3. **Tasks**: scans task checklist and git log to identify completed tasks. Skips them.
4. **PR**: detects existing PR, updates instead of creating duplicate.
5. **Quality gates**: re-runs all gates (fast if already passing).
6. **Merge**: if PR exists and is approved, proceeds directly to Phase 4 (merge).

The skill resumes from the first incomplete step — never re-does completed work.

## Graceful Degradation

- **PM tool not accessible**: Ask developer to manually provide story details and task list.
- **Missing adoption files**: Warn and proceed with guideline defaults.
- **/assess-stack not installed**: Warn on new dependency, continue without validation.
- **/verify-adoption not installed**: Warn, skip adoption compliance check.
- **No quality gate command**: Fall back to individual checks (lint, test, type check).

## Notes

- This skill **modifies files and creates git artifacts** (branches, commits, PRs).
- Task iteration is sequential — each task completes its full cycle before the next begins.
- The developer can stop between tasks. Re-invoke to resume (idempotency ensures correct state).
- Single PR per story regardless of commit strategy.
- **Squash happens at merge** (Phase 4), not before PR creation. Individual commits are preserved on the branch during review.
- Commit messages follow the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md).
- PR description follows the [PR template](../../../.pair/knowledge/guidelines/collaboration/templates/pr-template.md).
- **Phase 4 is invoked separately** after code review approval — re-invoke `/pair-process-implement` to merge and update status.
