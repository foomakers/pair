# Phase 6: Merge & Close — Detail

Disclosed from [SKILL.md](SKILL.md) Phase 6 — only reached when the reviewer picked "Merge now" in Step 5.4.

### Step 6.1: Read Merge Strategy

1. **Check**: Is merge strategy specified in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md)?
2. **Skip**: If not specified, default to `squash`.
3. **Act**: Read the adopted merge strategy (`squash`, `merge`, or `rebase`).
4. **Verify**: Strategy determined.

### Step 6.2: Prepare Merge Commit

1. **Act**: Draft the merge commit message following the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)):

   ```text
   [#<story-id>] feat: <story description>

   - <summary of changes>
   - Tasks: T-1, T-2, ..., T-N

   Refs: #<story-id>
   ```

2. **Act** (BLOCKING): Present to reviewer for confirmation:

   > **Merge commit message:**
   >
   > ```text
   > [commit message]
   > ```
   >
   > Confirm or edit?

3. **Verify**: Reviewer confirms message.

### Step 6.3: Merge PR

1. **Act**: Merge the PR using the adopted strategy (per [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md)):
   - MCP-first: use `merge_pull_request` with `merge_method` and `commit_title` + `commit_message`.
   - CLI fallback: `gh pr merge <number> --squash --subject "<title>" --body "<body>"`.
2. **Verify**: PR merged and closed.

### Step 6.4: Update Story & Parent Cascade

1. **Act**: Close the user story issue in the PM tool:
   - MCP: `issue_write` with `method = update`, `state = closed`, `state_reason = completed`.
   - CLI: `gh issue close <story-number> --reason completed`.
2. **Act**: Check parent epic — read sub-issues to determine if ALL stories are Done:
   - MCP: `issue_read` with `method = get_sub_issues` on the epic.
   - If all sub-issues closed → close the epic with `state_reason = completed`.
   - If not all closed → leave epic open.
3. **Act**: Check parent initiative — same cascade logic:
   - If all epics closed → close the initiative.
   - If not all closed → leave initiative open.
4. **Verify**: Story closed. Epic and initiative updated if applicable.

### Step 6.5: Branch Cleanup

1. **Act**: Delete the feature branch (remote):
   - CLI: `git push origin --delete <branch>`.
2. **Act**: Remove the story's checkpoint if one exists — `.pair/working/checkpoints/<story-id>.md` — so completed-story state does not linger as stale context (per the task-scoped cleanup rule; see `/checkpoint`).
3. **Verify**: Feature branch deleted and story checkpoint removed (if any existed).

### Step 6.6: Post-Merge Manual Test Validation (Optional)

1. **Check**: Is `/execute-manual-tests` installed? Does the project have a manual test suite (`qa/` directory)?
2. **Skip**: If skill not installed or no test suite found → skip. Log: "Manual test validation skipped — no suite or skill not installed."
3. **Act**: Compose `/execute-manual-tests` with `$scope = all`, `$priority = P0` (blockers only for fast validation).
4. **Verify**: If PASS → note in review output. If FAIL → do NOT revert the merge. Instead:
   - Create a GitHub issue for each Critical/Major failure.
   - Append manual test results as addendum to the review report (PR comment).
   - Warn: "Post-merge manual tests found failures. Issues created."

## Output Format (merge)

```text
STORY DONE:
├── Story:        [#ID: Title]
├── PR:           [#PR-number — merged]
├── Merge:        [squash | merge | rebase]
├── Story:        Done
├── Epic:         [#ID — Done | In Progress (X/Y stories done)]
├── Initiative:   [#ID — Done | In Progress (X/Y epics done)]
└── Manual Tests: [PASS | FAIL — N issues created | SKIPPED — no suite]
```
