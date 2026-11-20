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
  - `gates`: `array of string` — Keys of the Custom Gate Registry, run before the push. Absent or `[]` = none.
- **Returns `needs-human` when**
  - A task is incomplete or needs a decision the card does not record.
  - A quality gate stays red and the fix is outside the card.

## review

- **Default skill**: `pair-process-review`
- **Inputs**
  - `card`: `string` — The card the pull request delivers.
  - `pr`: `integer` — The pull request to review.
  - `head`: `string` — The head to review.
- **Outputs**, required when `status` is `ok`
  - `verdict`: `"approved" | "changes-requested"`
  - `reviewedHead`: `string matching ^[0-9a-f]{40}$` — The head the verdict is about, a 40-hex sha.
  - `findings`: `array of { id: string, severity: string, title: string, blocking: boolean }` — Every finding. The step is `failed` when at least one is blocking.
- **Options** (`with`)
  - `blocking`: `"Critical" | "Major" | "Minor"` — The lowest severity that makes a finding blocking. Default: the review template's blocking floor.
- **Returns `needs-human` when**
  - The verdict needs a decision only a person can take.
  - The pull request head moved while it was under review.

## generic

- **Default skill**: none: `uses` is required
- **Inputs**
  - Whatever the launch and the earlier steps produced.
- **Outputs**, required when `status` is `ok`
  - The common fields only.
- **Options** (`with`)
  - A free object, passed to the skill as written.
- **Returns `needs-human` when**
  - Whatever the skill named by `uses` documents.
