---
name: fix
description: "Fixes the findings of a pull request review: for each finding in scope, a failing regression test first when it is a bug, then the minimal fix, committed per the commit template; then the named gates, then the push. Invoke to resolve review findings ('fix the findings of PR 42'); run by the `fix` step kind of a workflow. Never decides which gates run, never re-reviews, never merges."
version: 0.1.0
author: Foomakers
---

# /fix — Resolve Review Findings

Resolve the findings of a review on one pull request, inside the story's worktree, and push the result. Fixes only the findings in scope: nothing else changes.

**Headless execution (single owner: `.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/headless-stage-execution.md`)** — this step runs headless: never leave a command in the background and never end your turn while a command runs (a gate, a push with a pre-push hook): use the maximum tool timeout, poll to completion in the same turn, and ALWAYS end with the structured result below.

## Process Profile

<!-- process-step: id=fix -->

Executable form of the **`fix`** step. No how-to guide: the step exists only as a skill. A **direct** invocation while a step is disabled by the project's profile warns and asks for confirmation; a **composed** one never prompts — it degrades exactly as a step that is not installed. No section ⇒ no-op. See [process-profile gate](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md).

## Inputs and options

| Name       | Required | Meaning                                                                                                                  |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pr`       | Yes      | The pull request.                                                                                                        |
| `head`     | Yes      | The head the review is about.                                                                                            |
| `findings` | Yes      | The review findings: `id`, `severity`, `title`, `blocking`.                                                              |
| `severity` | No       | Lowest severity to fix: `Critical`, `Major` or `Minor` (the code-review template's severities). Default `Minor`.         |
| `ids`      | No       | Finding ids to fix (`with.findings` of the step). When present only these are fixed and `severity` is ignored.           |
| `gates`    | No       | Gate commands, in order. Absent or empty: none runs. The skill never chooses a gate and never adds one.                  |

## Algorithm

### Step 1: Scope

1. Check out the PR branch at `head`.
2. Scope = `ids` when given, else the findings whose severity is at or above `severity`. A finding outside the scope is left alone.
3. **Empty scope** → return `ok`, `head` = the input head, `resolutions: []`. No commit, no push.

### Step 2: Fix each finding in scope

For each finding, in order:

1. Read the finding on the PR review (body, file, line).
2. **Escalate** when the fix needs a product decision or contradicts an acceptance criterion of the story → stop, return `needs-human`, name the finding id in `reason`. Nothing is pushed.
3. **Bug** → write a failing regression test first and run it to see it fail; commit it (`test:`) before the fix. Then make the minimal fix and see the test pass. Not a bug (docs, naming, structure) → fix directly.
4. Change nothing outside the finding. Commit per the [commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md), one commit per finding, naming the finding id.
5. Record the resolution: `resolved`, or `not-resolved` with the technical `reason`.

### Step 3: Gates, push

1. Run each gate of `gates` in order. A red gate → stop, return `failed` with the command output as `reason`. **Nothing is pushed.**
2. Push the branch. `head` = the sha after the push (`git rev-parse HEAD`, 40 hex).

## Result

End the turn with one JSON object in a fenced `json` block:

- `status`: `ok` | `failed` | `needs-human`
- `summary`: string
- `reason`: string, when not `ok`
- `head`: 40-hex sha after the push, or the input head when nothing changed
- `resolutions`: `[{ id, status: "resolved" | "not-resolved", reason }]`

Status: `ok` when every finding in scope is `resolved`; `failed` when a gate is red or a finding is `not-resolved` for a technical reason; `needs-human` per Step 2.2.

## Never

- Change anything outside the findings in scope.
- Re-run the review or merge.
- Choose, skip or add a gate.
