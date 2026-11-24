# Workflow step kinds

<!-- Generated from packages/workflows/src/kinds by `pnpm --filter @pair/workflows kinds:reference`. Do not edit by hand. -->

A step of a [workflow file](workflow-grammar.md) has a `kind`. The kind says which skill runs by default, what the step receives, which options it accepts under `with`, and what it must return.

## The result every step returns

The agent ends its turn with one JSON object in a fenced `json` block. Whatever the kind, it carries:

- `status`: `"ok" | "failed" | "needs-human"`
- `summary`: `string` — One line: what the step did.
- `reason`: `string`, optional — Why, when the status is not `ok`.

A result that is missing, is not JSON or breaks the contract of its kind makes the step `failed` with reason `invalid-result`.

An input is satisfied by a launch argument (`--card`) or by an output of an earlier step with the same name.

## implement

- **Default skill**: `pair-process-implement`
- **Inputs**
  - `card`: `string` — The card to implement.
- **Outputs**, required when `status` is `ok`
  - `branch`: `string matching ^[A-Za-z0-9][A-Za-z0-9._/-]*$` — The branch the work is on.
  - `pr`: `integer` — The number of the pull request.
  - `head`: `string matching ^[0-9a-f]{40}$` — The pushed head, a 40-hex sha.
- **Options** (`with`)
  - None.
- **Returns `needs-human` when**
  - A decision the card does not record blocks every remaining task.
  - A quality gate stays red and the fix is outside the card.

## review

- **Default skill**: `pair-process-review`
- **Inputs**
  - `card`: `string` — The card the pull request delivers.
  - `pr`: `integer` — The pull request to review.
  - `head`: `string` — The head to review.
- **Outputs**, required when `status` is `ok` or `failed`
  - `verdict`: `"approved" | "changes-requested"`
  - `reviewedHead`: `string matching ^[0-9a-f]{40}$` — The head the verdict is about, a 40-hex sha.
  - `findings`: `array of { id: string, severity: string, title: string, blocking: boolean }` — Every finding. The step is `failed` when at least one is blocking.
- **Rule**: The status is "failed", never "ok", when at least one finding is blocking or the verdict is "changes-requested".
- **Options** (`with`)
  - `blocking`: `"Critical" | "Major" | "Minor"` — The lowest severity that makes a finding blocking. Default: the review template's blocking floor.
- **Returns `needs-human` when**
  - The verdict needs a decision only a person can take.
  - The pull request head moved while it was under review.

## fix

- **Default skill**: `pair-process-fix`
- **Inputs**
  - `card`: `string` — The card the pull request delivers.
  - `pr`: `integer` — The pull request to fix.
  - `head`: `string` — The head the findings are about.
  - `findings`: `array of object` — The review findings: `id`, `severity`, `title`, `blocking`.
- **Outputs**, required when `status` is `ok` or `failed`
  - `head`: `string matching ^[0-9a-f]{40}$` — The head after the push, or the input head when nothing changed.
  - `resolutions`: `array of { id: string, status: "resolved" | "not-resolved", reason: string }` — One per finding in scope.
  - `gateFailures`: `array of { gate: string, reason: string }` — Failed gates reported when continuation is enabled.
- **Rule**: The status is "failed", never "ok", when at least one resolution is "not-resolved".
- **Options** (`with`)
  - `severity`: `"Critical" | "Major" | "Minor"` — The lowest severity to fix. Default `Minor`, the review's blocking floor. Ignored when `findings` is given.
  - `findings`: `array of string` — Finding ids. When present only these are fixed.
  - `gates`: `array of string` — Keys of the Custom Gate Registry, run in order before the push. Absent or `[]` = none.
  - `continue-on-gate-failure`: `boolean` — Report failed gates and continue to the normal push. Default: false.
- **Returns `needs-human` when**
  - A remaining finding needs a human decision or action.
  - A finding contradicts an acceptance criterion of the card.

## generic

- **Default skill**: none: `skill` is required
- **Inputs**
  - Whatever the launch and the earlier steps produced.
- **Outputs**, required when `status` is `ok`
  - The common fields only.
- **Options** (`with`)
  - A free object, passed to the skill as written.
- **Returns `needs-human` when**
  - Whatever the skill named by `skill` documents.

## gate

- **Default skill**: none: the host runs it, no agent
- **Inputs**
  - `card`: `string` — The card.
  - `pr`: `integer` — The pull request, for the checks that read it.
  - `head`: `string` — The head the earlier steps produced.
  - `reviewedHead`: `string` — The head verified by the review step.
- **Outputs**, required when `status` is `ok`
  - `gatedHead`: `string matching ^[0-9a-f]{40}$` — Head verified by a passing head-unchanged check, when present.
- **Options** (`with`)
  - `gates`: `array of string` — Entries run in the card worktree, in order: a key of the Custom Gate Registry, `target:<name>` (the registry rows of that target) or `command:<shell line>`.
  - `checks`: `array of "ci-green" | "head-unchanged" | "review-approved" | "prerequisites-done"` — Ready-made checks: ci-green, head-unchanged, review-approved, prerequisites-done.
  - `timeout-minutes`: `integer` — How long `ci-green` waits. Default 30.
- **Returns `needs-human` when**

## approval

- **Default skill**: none: the host runs it, no agent
- **Inputs**
  - `card`: `string` — The card.
  - `pr`: `integer` — The pull request, whose native reviews count.
- **Outputs**, required when `status` is `ok`
  - `approvedBy`: `string` — The login that approved.
  - `approvedHead`: `string matching ^[0-9a-f]{40}$` — The head that was approved.
  - `approvedPr`: `integer` — The PR that was approved.
- **Options** (`with`)
  - `question`: `string` — What is asked of the approver.
- **Returns `needs-human` when**
  - Always, until an authorized login approves or rejects.

## merge

- **Default skill**: none: the host runs it, no agent
- **Inputs**
  - `card`: `string` — The card, closed after the merge.
  - `pr`: `integer` — The pull request to merge.
  - `head`: `string` — The head the PR must still have.
  - `reviewedHead`: `string` — The head verified by the review step.
  - `gatedHead`: `string` — The head that passed the gate.
  - `approvedHead`: `string` — The head authorized by the approval step.
  - `approvedPr`: `integer` — The PR authorized by the approval step.
  - `approvedBy`: `string` — The authorized approver.
- **Outputs**, required when `status` is `ok`
  - `merged`: `boolean` — Whether the PR is merged.
  - `mergeCommit`: `string` — The merge commit sha.
- **Options** (`with`)
  - `method`: `"squash" | "merge" | "rebase"` — Merge method. Default `squash`.
- **Returns `needs-human` when**
