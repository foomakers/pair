# Phase 4: Post-Review Merge — Detail

Disclosed from [SKILL.md](./SKILL.md) Phase 4 — only reached when `/pair-process-implement` is re-invoked after code review approval (typically via `/pair-process-review`), to merge and close the story.

### Step 4.1: Verify Review Approval

1. **Check**: Is the PR approved by the reviewer?
2. **Skip**: If not approved → **HALT**. Wait for review completion.
3. **Verify**: PR has at least one approval.

### Step 4.2: Prepare Merge Commit Message

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) for merge strategy (squash, merge, rebase).
2. **Act**: Draft the final commit message:
   - **If squash**: combine all commits into a single message following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/skill-conventions/template-resolution.md)).
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

### Step 4.5: Clean Up the Checkpoint

The checkpoint's lifecycle ends at merge — it exists only to survive context resets and the review/fix loop, both of which are over once the story is Done.

1. **Check**: Does `.pair/working/checkpoints/<story-id>.md` exist?
2. **Skip**: If no checkpoint file exists (e.g. `/pair-capability-checkpoint` was not installed), nothing to clean up.
3. **Act**: Remove `.pair/working/checkpoints/<story-id>.md` so finished-story state never lingers.
4. **Verify**: The checkpoint file is gone (checkpoint lifecycle: written at the closing phase — Step 3.2 — cleaned up here at merge).

## Output Format (merge)

```text
STORY DONE:
├── Story:      [#ID: Title]
├── PR:         [#PR-number — merged]
├── Merge:      [squash | merge | rebase]
├── Story:      Done
├── Epic:       [#ID — Done | In Progress (X/Y stories done)]
└── Initiative: [#ID — Done | In Progress (X/Y epics done)]
```
