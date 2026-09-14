# Phase 4: Post-Review Merge — Detail

Disclosed from [SKILL.md](SKILL.md) Phase 4 — only reached when `/implement` is re-invoked after code review approval (typically via `/review`), to merge and close the story.

### Step 4.1: Merge Precondition — PR state must be `ready-to-merge` (BLOCKING)

This is the author-side merge path, and it carries the **same** precondition as the reviewer-side one (`/pair-process-review` Phase 6, Step 6.0): the merge is permitted by the **synthesis**, never by "a review happened". An approving verdict alone is not the condition — a 🔴 PR with an approved review and no explicit human approval must not merge here either (D10). See [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md).

1. **Act**: Re-read the **current** signals on the PR's head commit — gate checks, the review verdict, the `risk:*` tier, and non-author human approvals (they may have changed since the verdict: a new commit, a tier raise, a dismissed approval).
2. **Act**: Synthesize with the shipped evaluator [`pr-state.sh`](../../../.pair/knowledge/assets/pr-state.sh) — `resolve_pr_state <gates> <review> <tier> <explicit_approval>`, then `merge_allowed <state>`. Tier comes from the label via `resolve_tier`; the human-approval input uses `human_approval_jq_filter` (non-bot, non-author, on the current head), never a raw approval count.
3. **Skip**: Review not submitted yet → **HALT**, wait for review completion.
4. **Verify**: State is `ready-to-merge` → continue to Step 4.2. Any other state → **HALT**, naming the unmet condition (red gate, review not approved / still pending, or 🔴 without an explicit human approval). Never bypass, dismiss, or re-run a required check to get a green merge button.

### Step 4.2: Prepare Merge Commit Message

1. **Check**: Read [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) for merge strategy (squash, merge, rebase).
2. **Act**: Draft the final commit message:
   - **If squash**: combine all commits into a single message following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)).
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

1. **Act**: Merge the PR with the confirmed commit message and the configured merge strategy, **on the code host** (`## Git Workflow` → `code-host`; absent ⇒ the PM tool's own host). The state write in Step 4.4 goes to the **PM tool** — see the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).
2. **Verify**: PR merged and closed on the code host.

### Step 4.4: Update Story & Parents

1. **Act**: Update user story status to "Done" on the **PM tool** — state transitions always happen there, never on the code host (resolve the item id from the PR's `Refs: <issue-id>` cross-link when the two tools differ). Every state write here follows the order the item writer states once and this step applies unchanged — **membership, then a read that confirms it, then the state field** (`/write-issue` Step 7b): a state field cannot be written on an item the tracked view does not hold, and the add that puts it there can exit 0 having done nothing. The invariant is applied **by reference**, never re-derived.
2. **Act**: Check parent epic — if ALL stories in the epic are Done, update epic status to "Done", under the same order.
3. **Act**: Check parent initiative — if ALL epics in the initiative are Done, update initiative status to "Done", under the same order.
4. **Verify**: A **read** of the story — and of each parent this run transitioned — shows `Done`. Report **what the read observed**, never what the calls returned: nobody re-runs the merge phase, so a state this step reports without reading is terminal.

### Step 4.5: Clean Up the Checkpoint

The checkpoint's lifecycle ends at merge — it exists only to survive context resets and the review/fix loop, both of which are over once the story is Done.

1. **Check**: Does `.pair/working/checkpoints/<story-id>.md` exist?
2. **Skip**: If no checkpoint file exists (e.g. `/checkpoint` was not installed), nothing to clean up.
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
